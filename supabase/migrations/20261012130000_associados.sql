-- =====================================================================
-- Associados ABRACAM e desconto de associado nos planos.
-- 1. Lista de instituições associadas (CNPJ + domínios de e-mail), mantida
--    pelo admin em Planos e pagamentos.
-- 2. No cadastro, quem marca "Sou associado" só avança se o CNPJ estiver na
--    lista E o e-mail for de um domínio da instituição. O vínculo fica no
--    perfil (associado_id). Quem não marca se cadastra normalmente.
-- 3. Cada plano pode ter um "preço para associados". O pedido do aluno
--    associado sai com esse preço (registrado no pedido).
-- O e-mail precisa ser confirmado (confirmação de e-mail ligada), então só
-- quem tem caixa de e-mail no domínio da instituição consegue o desconto.
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.associados (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 2 AND 150),
  cnpj         text NOT NULL UNIQUE CHECK (cnpj ~ '^[0-9]{14}$'),
  dominios     text[] NOT NULL CHECK (cardinality(dominios) BETWEEN 1 AND 20),
  -- Aceita também as filiais (mesma raiz de 8 dígitos do CNPJ)
  vale_filiais boolean NOT NULL DEFAULT false,
  ativo        boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS associados_raiz_idx ON public.associados (left(cnpj, 8));

-- Normaliza CNPJ (só dígitos) e domínios (minúsculas, sem "@", sem repetição)
CREATE OR REPLACE FUNCTION public.associados_normalizar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  d text;
BEGIN
  NEW.cnpj := regexp_replace(COALESCE(NEW.cnpj, ''), '[^0-9]', '', 'g');
  NEW.nome := btrim(NEW.nome);
  SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), '{}')
    INTO NEW.dominios
    FROM (SELECT lower(btrim(ltrim(btrim(v), '@'))) AS x FROM unnest(NEW.dominios) AS v) s
   WHERE x <> '';
  FOREACH d IN ARRAY NEW.dominios LOOP
    IF d !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' THEN
      RAISE EXCEPTION 'Domínio de e-mail inválido: %', d;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS associados_normalizar ON public.associados;
CREATE TRIGGER associados_normalizar BEFORE INSERT OR UPDATE ON public.associados
FOR EACH ROW EXECUTE FUNCTION public.associados_normalizar();

DROP TRIGGER IF EXISTS associados_set_updated_at ON public.associados;
CREATE TRIGGER associados_set_updated_at BEFORE UPDATE ON public.associados
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.associados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.associados FROM anon, authenticated;
GRANT ALL ON public.associados TO service_role;

-- Vínculo do aluno com a instituição associada (só o servidor grava)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS associado_id uuid REFERENCES public.associados(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS associado_em timestamptz,
  ADD COLUMN IF NOT EXISTS associado_origem text
    CHECK (associado_origem IS NULL OR associado_origem IN ('cadastro', 'perfil', 'admin'));

-- Preço para associados (opcional, por plano)
ALTER TABLE public.planos
  ADD COLUMN IF NOT EXISTS preco_associado_centavos integer;
ALTER TABLE public.planos DROP CONSTRAINT IF EXISTS planos_preco_associado;
ALTER TABLE public.planos ADD CONSTRAINT planos_preco_associado CHECK (
  preco_associado_centavos IS NULL
  OR (preco_associado_centavos > 0 AND preco_associado_centavos <= preco_centavos));

-- Registro do desconto no pedido
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS desconto_associado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS associado_id uuid REFERENCES public.associados(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valor_sem_desconto integer
    CHECK (valor_sem_desconto IS NULL OR valor_sem_desconto > 0);

-- ---------------------------------------------------------------------
-- Verificação: o CNPJ está na lista e o e-mail é de um domínio da instituição?
-- motivo: 'ok' | 'cnpj' (CNPJ fora da lista) | 'dominio' (e-mail de outro domínio)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verificar_associado(p_cnpj text, p_email text)
RETURNS TABLE (associado_id uuid, nome text, motivo text)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cnpj  text := regexp_replace(COALESCE(p_cnpj, ''), '[^0-9]', '', 'g');
  v_dom   text := lower(btrim(split_part(btrim(COALESCE(p_email, '')), '@', 2)));
  v_ass   record;
  v_achou boolean := false;
BEGIN
  IF char_length(v_cnpj) <> 14 THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'cnpj'::text;
    RETURN;
  END IF;
  FOR v_ass IN
    SELECT a.id, a.nome, a.dominios
      FROM public.associados a
     WHERE a.ativo
       AND (a.cnpj = v_cnpj OR (a.vale_filiais AND left(a.cnpj, 8) = left(v_cnpj, 8)))
     ORDER BY (a.cnpj = v_cnpj) DESC, a.nome
  LOOP
    v_achou := true;
    IF v_dom <> '' AND v_dom = ANY (v_ass.dominios) THEN
      RETURN QUERY SELECT v_ass.id, v_ass.nome, 'ok'::text;
      RETURN;
    END IF;
  END LOOP;
  RETURN QUERY SELECT NULL::uuid, NULL::text, CASE WHEN v_achou THEN 'dominio' ELSE 'cnpj' END;
END;
$$;

REVOKE ALL ON FUNCTION public.verificar_associado(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_associado(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.associados_normalizar() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- Pedido do aluno associado sai com o preço de associado
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_pedido(
  p_user           uuid,
  p_plano          uuid,
  p_metodo         text,
  p_comprador_tipo text DEFAULT 'cpf',
  p_origem         text DEFAULT 'aluno',
  p_por            uuid DEFAULT NULL,
  p_prazo_dias     integer DEFAULT 3,
  p_valor          integer DEFAULT NULL,
  p_chave          uuid DEFAULT NULL,
  -- O que a página mostrava ao aluno: código do pedido pendente e se ele seria mantido
  p_pendente_esperado text DEFAULT NULL,
  p_manter_esperado   boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_perfil  record;
  v_plano   record;
  v_pend    record;
  v_doc     text;
  v_nome    text;
  v_valor   integer;
  v_valor_cheio integer;
  v_assoc   uuid;
  v_cliente uuid;
  v_pedido  record;
  v_teste   boolean;
  v_tem_pend boolean;
  v_reusar  boolean := false;
BEGIN
  IF p_origem NOT IN ('aluno', 'admin') THEN
    RAISE EXCEPTION 'Origem do pedido inválida.';
  END IF;
  IF p_metodo IS NULL OR p_metodo NOT IN ('pix', 'cartao', 'boleto', 'transferencia', 'outro') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida.';
  END IF;
  IF p_origem = 'aluno' AND p_valor IS NOT NULL THEN
    RAISE EXCEPTION 'O valor do pedido vem do plano.';
  END IF;

  SELECT nome_completo, email, cpf, cnpj, instituicao, plano, plano_validade, cadastro_completo_em,
         associado_id
    INTO v_perfil
    FROM public.profiles WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta não encontrada.';
  END IF;
  IF v_perfil.plano = 'inativo' THEN
    RAISE EXCEPTION 'Esta conta está bloqueada. Fale com a ABRACAM.';
  END IF;
  IF v_perfil.cpf IS NULL OR (p_origem = 'aluno' AND v_perfil.cadastro_completo_em IS NULL) THEN
    RAISE EXCEPTION 'Complete o cadastro (nome e CPF) antes de contratar um plano.';
  END IF;

  IF p_comprador_tipo = 'cnpj' THEN
    IF v_perfil.cnpj IS NULL THEN
      RAISE EXCEPTION 'Não há CNPJ no cadastro desta conta.';
    END IF;
    v_doc := v_perfil.cnpj;
    v_nome := COALESCE(NULLIF(btrim(v_perfil.instituicao), ''), v_perfil.nome_completo);
  ELSIF p_comprador_tipo = 'cpf' THEN
    v_doc := v_perfil.cpf;
    v_nome := v_perfil.nome_completo;
  ELSE
    RAISE EXCEPTION 'Tipo de comprador inválido.';
  END IF;
  IF v_nome IS NULL OR btrim(v_nome) = '' THEN
    RAISE EXCEPTION 'Complete o cadastro (nome) antes de contratar um plano.';
  END IF;

  SELECT * INTO v_plano FROM public.planos WHERE id = p_plano;
  IF NOT FOUND OR (p_origem = 'aluno' AND NOT v_plano.ativo) THEN
    RAISE EXCEPTION 'Este plano não está disponível.';
  END IF;
  v_valor_cheio := COALESCE(p_valor, v_plano.preco_centavos);
  v_valor := v_valor_cheio;
  -- Associado ABRACAM (validado por CNPJ + domínio do e-mail) paga o preço de associado,
  -- quando o plano tiver um. Na venda registrada pelo admin, vale o valor informado por ele.
  IF p_origem = 'aluno' AND v_perfil.associado_id IS NOT NULL
     AND v_plano.preco_associado_centavos IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.associados a WHERE a.id = v_perfil.associado_id AND a.ativo) THEN
    v_valor := v_plano.preco_associado_centavos;
    v_assoc := v_perfil.associado_id;
  END IF;
  IF v_valor IS NULL OR v_valor <= 0 THEN
    RAISE EXCEPTION 'O plano está sem preço definido.';
  END IF;

  -- Pendentes vencidos saem do caminho
  PERFORM public.expirar_pedidos_vencidos(p_user);

  -- Pedido pendente: reaproveita se for o mesmo plano, preço e comprador;
  -- senão, é substituído pelo novo.
  SELECT * INTO v_pend FROM public.pedidos
   WHERE user_id = p_user AND status = 'pendente' FOR UPDATE;
  v_tem_pend := FOUND;
  IF v_tem_pend THEN
    v_reusar := p_origem = 'aluno'
       AND v_pend.plano_id = v_plano.id
       AND v_pend.valor_total = v_valor
       AND v_pend.plano_tipo_acesso = v_plano.tipo_acesso
       AND v_pend.plano_duracao_quantidade = v_plano.duracao_quantidade
       AND v_pend.plano_duracao_unidade = v_plano.duracao_unidade
       AND v_pend.comprador_documento = v_doc;
  END IF;
  -- A página prometeu manter um pedido que o banco não manteria, ou há um pendente que o
  -- aluno não viu (seria cancelado em silêncio): recusa para ele conferir antes de pagar.
  IF p_origem = 'aluno' AND p_manter_esperado IS NOT NULL
     AND ((p_manter_esperado AND NOT v_reusar)
          OR (v_tem_pend AND v_pend.codigo IS DISTINCT FROM p_pendente_esperado)) THEN
    RAISE EXCEPTION 'Seus pedidos mudaram desde que a página foi aberta. Confira em Meus pedidos antes de fazer outro.';
  END IF;
  IF v_tem_pend THEN
    IF v_reusar THEN
      IF v_pend.metodo_pagamento IS DISTINCT FROM p_metodo THEN
        UPDATE public.pedidos SET metodo_pagamento = p_metodo WHERE id = v_pend.id;
        UPDATE public.pagamentos SET metodo_pagamento = p_metodo
         WHERE pedido_id = v_pend.id AND status = 'pendente';
      END IF;
      RETURN jsonb_build_object('pedido_id', v_pend.id, 'codigo', v_pend.codigo,
                                'reaproveitado', true);
    END IF;
    UPDATE public.pagamentos SET status = 'cancelado'
     WHERE pedido_id = v_pend.id AND status = 'pendente';
    UPDATE public.pedidos
       SET status = 'cancelado', cancelado_em = now(), cancelado_por = p_por,
           motivo_cancelamento = CASE WHEN p_origem = 'admin'
                                      THEN 'Substituído por uma venda registrada pela ABRACAM.'
                                      ELSE 'Substituído por um novo pedido.' END
     WHERE id = v_pend.id;
  END IF;

  INSERT INTO public.clientes (user_id, nome, email, cpf_cnpj)
  VALUES (p_user, v_nome, v_perfil.email, v_doc)
  ON CONFLICT (user_id, cpf_cnpj) WHERE user_id IS NOT NULL
  DO UPDATE SET nome = EXCLUDED.nome, email = EXCLUDED.email
  RETURNING id INTO v_cliente;

  v_teste := EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user AND role = 'admin');

  INSERT INTO public.pedidos (
    cliente_id, user_id, plano_id, plano_nome, plano_tipo_acesso, plano_duracao_quantidade,
    plano_duracao_unidade, valor_total, gateway, metodo_pagamento, comprador_nome,
    comprador_email, comprador_documento, comprador_tipo, origem, teste, criado_por, expira_em,
    chave_venda, desconto_associado, associado_id, valor_sem_desconto)
  VALUES (
    v_cliente, p_user, v_plano.id, v_plano.nome, v_plano.tipo_acesso, v_plano.duracao_quantidade,
    v_plano.duracao_unidade, v_valor, 'manual', p_metodo, v_nome,
    v_perfil.email, v_doc, p_comprador_tipo, p_origem, v_teste, COALESCE(p_por, p_user),
    CASE WHEN p_origem = 'aluno' AND COALESCE(p_prazo_dias, 0) > 0
         THEN now() + make_interval(days => p_prazo_dias) END,
    p_chave, v_assoc IS NOT NULL, v_assoc,
    CASE WHEN v_assoc IS NOT NULL THEN v_valor_cheio END)
  RETURNING id, codigo INTO v_pedido;

  -- Tentativa de pagamento aguardando (o aluno paga por fora na Etapa 1)
  IF p_origem = 'aluno' THEN
    INSERT INTO public.pagamentos (pedido_id, gateway, metodo_pagamento, valor, status)
    VALUES (v_pedido.id, 'manual', p_metodo, v_valor, 'pendente');
  END IF;

  RETURN jsonb_build_object('pedido_id', v_pedido.id, 'codigo', v_pedido.codigo,
                            'reaproveitado', false);
END;
$$;

REVOKE ALL ON FUNCTION public.criar_pedido(uuid, uuid, text, text, text, uuid, integer, integer, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
