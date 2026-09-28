-- =====================================================================
-- Cadastro completo do aluno, gestão de usuários/planos pelo admin e
-- interruptor global de feedback nos resultados.
--
-- 1. Perfil ganha nome completo, CPF (visível só para admins), CNPJ
--    opcional, instituição e e-mail espelhado de auth.users.
-- 2. O aluno deixa de poder alterar plano, validade e CPF pelo navegador
--    (antes a política de UPDATE liberava todas as colunas do próprio perfil).
-- 3. Configuração global "feedback_resultados".
-- 4. Função de listagem de usuários para o painel admin (só service_role).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Novos campos de cadastro
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nome_completo        text,
  ADD COLUMN IF NOT EXISTS cpf                  text,
  ADD COLUMN IF NOT EXISTS cnpj                 text,
  ADD COLUMN IF NOT EXISTS instituicao          text,
  ADD COLUMN IF NOT EXISTS email                text,
  ADD COLUMN IF NOT EXISTS cadastro_completo_em timestamptz;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_cpf_formato;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_cpf_formato CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_cnpj_formato;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_cnpj_formato CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$');

-- Um CPF por conta
CREATE UNIQUE INDEX IF NOT EXISTS profiles_cpf_unico
  ON public.profiles (cpf) WHERE cpf IS NOT NULL;

-- Perfis que por algum motivo não existam ainda
INSERT INTO public.profiles (id, username, email)
SELECT u.id, split_part(u.email, '@', 1), u.email
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

-- E-mail espelhado (para busca e listagem no painel)
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id AND p.email IS DISTINCT FROM u.email;

-- Novo usuário: perfil já nasce com o e-mail
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, avatar_url, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Troca de e-mail na conta: mantém o espelho atualizado
CREATE OR REPLACE FUNCTION public.handle_user_email_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
AFTER UPDATE OF email ON auth.users
FOR EACH ROW
WHEN (OLD.email IS DISTINCT FROM NEW.email)
EXECUTE FUNCTION public.handle_user_email_change();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_user_email_change() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Segurança: plano, validade, CPF e dados de cadastro só mudam pelo
--    servidor (service_role). O aluno continua lendo o próprio perfil.
-- ---------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
GRANT UPDATE (username, full_name, avatar_url, show_in_ranking) ON public.profiles TO authenticated;

-- ---------------------------------------------------------------------
-- 3. Interruptor global de feedback nos resultados
--    'ativo'  = mostra "Parabéns", "Onde estudar" e explicação (se ligada)
--    'inativo' = esconde essas mensagens; certo/errado e gabarito continuam
-- ---------------------------------------------------------------------
INSERT INTO public.configuracoes (chave, valor)
VALUES ('feedback_resultados', 'ativo')
ON CONFLICT (chave) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. Listagem de usuários para o painel admin
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_listar_usuarios(
  p_busca  text DEFAULT NULL,
  p_filtro text DEFAULT 'todos',
  p_limite integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  user_id           uuid,
  nome              text,
  email             text,
  cpf               text,
  cnpj              text,
  instituicao       text,
  plano             text,
  plano_validade    date,
  acesso_ativo      boolean,
  cadastro_completo boolean,
  is_admin          boolean,
  provedor          text,
  criado_em         timestamptz,
  ultimo_acesso     timestamptz,
  simulados         integer,
  total             bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH hoje AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d
  ),
  termo AS (
    SELECT
      NULLIF(trim(coalesce(p_busca, '')), '') AS texto,
      NULLIF(regexp_replace(coalesce(p_busca, ''), '[^0-9]', '', 'g'), '') AS digitos
  ),
  base AS (
    SELECT
      p.id AS b_id,
      coalesce(p.nome_completo, p.full_name, p.username) AS b_nome,
      coalesce(p.email, u.email) AS b_email,
      p.cpf AS b_cpf,
      p.cnpj AS b_cnpj,
      p.instituicao AS b_instituicao,
      p.plano AS b_plano,
      p.plano_validade AS b_validade,
      (p.plano IN ('mensal', 'anual')
        AND p.plano_validade IS NOT NULL
        AND p.plano_validade >= (SELECT d FROM hoje)) AS b_ativo,
      (p.cadastro_completo_em IS NOT NULL) AS b_completo,
      EXISTS (
        SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'admin'
      ) AS b_admin,
      coalesce(u.raw_app_meta_data->>'provider', 'email') AS b_provedor,
      p.created_at AS b_criado,
      u.last_sign_in_at AS b_ultimo,
      (SELECT count(*)::integer FROM public.simulados s
        WHERE s.user_id = p.id AND s.status = 'finalizado') AS b_simulados
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
  ),
  filtrada AS (
    SELECT b.*
    FROM base b, termo t, hoje h
    WHERE (
        t.texto IS NULL
        OR b.b_nome ILIKE '%' || t.texto || '%'
        OR b.b_email ILIKE '%' || t.texto || '%'
        OR b.b_instituicao ILIKE '%' || t.texto || '%'
        OR (t.digitos IS NOT NULL AND length(t.digitos) >= 3
            AND (b.b_cpf LIKE '%' || t.digitos || '%' OR b.b_cnpj LIKE '%' || t.digitos || '%'))
      )
      AND CASE coalesce(p_filtro, 'todos')
        WHEN 'ativos' THEN b.b_ativo
        WHEN 'vencendo' THEN b.b_ativo AND b.b_validade <= h.d + 7
        WHEN 'vencidos' THEN b.b_plano IN ('mensal', 'anual') AND NOT b.b_ativo
        WHEN 'sem_plano' THEN b.b_plano IN ('gratis', 'inativo')
        WHEN 'incompletos' THEN NOT b.b_completo
        WHEN 'admins' THEN b.b_admin
        ELSE true
      END
  )
  SELECT
    f.b_id, f.b_nome, f.b_email, f.b_cpf, f.b_cnpj, f.b_instituicao, f.b_plano,
    f.b_validade, f.b_ativo, f.b_completo, f.b_admin, f.b_provedor, f.b_criado,
    f.b_ultimo, f.b_simulados,
    count(*) OVER () AS total
  FROM filtrada f
  ORDER BY f.b_criado DESC
  LIMIT greatest(1, least(coalesce(p_limite, 50), 200))
  OFFSET greatest(0, coalesce(p_offset, 0));
$$;

REVOKE ALL ON FUNCTION public.admin_listar_usuarios(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_listar_usuarios(text, text, integer, integer)
  TO service_role;
