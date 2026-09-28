-- =====================================================================
-- Páginas reais no lugar das fictícias:
-- 1. Materiais em PDF (enviados só pelo admin; arquivos no Storage,
--    bucket "materiais", criado pelo servidor no primeiro envio).
-- 2. Chamados de suporte (aluno abre, admin responde).
-- 3. Ranking opcional: só aparece quem ativar no Perfil.
-- 4. Preços dos planos editáveis pelo admin.
-- 5. Funções de relatório: desempenho por tema/dificuldade e ranking.
-- Idempotente: pode ser aplicada mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Materiais
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.materiais (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        text NOT NULL CHECK (char_length(titulo) BETWEEN 3 AND 150),
  descricao     text CHECK (descricao IS NULL OR char_length(descricao) <= 500),
  categoria     text NOT NULL DEFAULT 'Material de Apoio' CHECK (char_length(categoria) <= 60),
  arquivo_path  text NOT NULL UNIQUE,
  nome_arquivo  text NOT NULL,
  tamanho_bytes bigint NOT NULL CHECK (tamanho_bytes > 0),
  ativo         boolean NOT NULL DEFAULT true,
  ordem         integer NOT NULL DEFAULT 0,
  downloads     integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS materiais_ordem_idx ON public.materiais (ativo, ordem, created_at DESC);

ALTER TABLE public.materiais ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.materiais FROM anon, authenticated;
GRANT ALL ON public.materiais TO service_role;

-- ---------------------------------------------------------------------
-- 2. Chamados de suporte
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chamados_suporte (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  categoria      text NOT NULL CHECK (categoria IN ('plano', 'conteudo', 'acesso', 'tecnico', 'outro')),
  titulo         text NOT NULL CHECK (char_length(titulo) BETWEEN 3 AND 150),
  mensagem       text NOT NULL CHECK (char_length(mensagem) BETWEEN 10 AND 5000),
  status         text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'respondido', 'fechado')),
  resposta       text CHECK (resposta IS NULL OR char_length(resposta) <= 5000),
  respondido_em  timestamptz,
  respondido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chamados_suporte_status_idx
  ON public.chamados_suporte (status, created_at DESC);
CREATE INDEX IF NOT EXISTS chamados_suporte_usuario_idx
  ON public.chamados_suporte (user_id, created_at DESC);

ALTER TABLE public.chamados_suporte ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chamados_suporte FROM anon, authenticated;
GRANT ALL ON public.chamados_suporte TO service_role;

-- ---------------------------------------------------------------------
-- 3. Ranking opcional: ninguém aparece sem ativar no Perfil.
--    O "desligar todos" roda uma única vez (marcador em configuracoes),
--    para não apagar escolhas feitas depois se a migração rodar de novo.
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles ALTER COLUMN show_in_ranking SET DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.configuracoes WHERE chave = 'ranking_opt_in') THEN
    UPDATE public.profiles SET show_in_ranking = false;
    INSERT INTO public.configuracoes (chave, valor) VALUES ('ranking_opt_in', 'desde 2026-09-28');
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4. Preços e descrições dos planos (editáveis no /admin/configuracoes)
-- ---------------------------------------------------------------------
INSERT INTO public.configuracoes (chave, valor)
VALUES (
  'planos_info',
  '{"mensal":{"preco":"","descricao":""},"anual":{"preco":"","descricao":""}}'
)
ON CONFLICT (chave) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5a. Desempenho do aluno por tema e por dificuldade (simulados finalizados)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.desempenho_aluno(p_user_id uuid)
RETURNS TABLE (dimensao text, chave text, total integer, acertos integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH respondidas AS (
    SELECT q.tema, q.dificuldade, sq.correta
    FROM public.simulado_questoes sq
    JOIN public.simulados s ON s.id = sq.simulado_id
    JOIN public.questoes q ON q.id = sq.questao_id
    WHERE s.user_id = p_user_id AND s.status = 'finalizado'
  )
  SELECT 'tema'::text, r.tema::text, count(*)::integer,
         (count(*) FILTER (WHERE r.correta))::integer
  FROM respondidas r
  GROUP BY r.tema
  UNION ALL
  SELECT 'dificuldade'::text, r.dificuldade, count(*)::integer,
         (count(*) FILTER (WHERE r.correta))::integer
  FROM respondidas r
  GROUP BY r.dificuldade;
$$;

REVOKE ALL ON FUNCTION public.desempenho_aluno(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desempenho_aluno(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 5b. Ranking: média nos simulados ABT1/ABT2 finalizados no período,
--     só de quem ativou a participação; administradores ficam de fora.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ranking_alunos(p_dias integer DEFAULT 30)
RETURNS TABLE (
  user_id    uuid,
  nome       text,
  simulados  integer,
  media_pct  numeric,
  melhor_pct numeric,
  posicao    bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      s.user_id AS b_user,
      count(*)::integer AS b_simulados,
      round(avg(100.0 * s.acertos / nullif(s.total_questoes, 0)), 1) AS b_media,
      round(max(100.0 * s.acertos / nullif(s.total_questoes, 0)), 1) AS b_melhor
    FROM public.simulados s
    JOIN public.profiles p ON p.id = s.user_id AND p.show_in_ranking
    WHERE s.status = 'finalizado'
      AND s.tipo IN ('ABT1', 'ABT2')
      AND s.finalizado_em >= now() - make_interval(days => greatest(1, coalesce(p_dias, 30)))
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles r WHERE r.user_id = s.user_id AND r.role = 'admin'
      )
    GROUP BY s.user_id
  )
  SELECT
    b.b_user,
    coalesce(p.nome_completo, p.full_name, p.username, 'Aluno'),
    b.b_simulados,
    b.b_media,
    b.b_melhor,
    rank() OVER (ORDER BY b.b_media DESC, b.b_melhor DESC, b.b_simulados DESC)
  FROM base b
  JOIN public.profiles p ON p.id = b.b_user
  ORDER BY 6, 2;
$$;

REVOKE ALL ON FUNCTION public.ranking_alunos(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ranking_alunos(integer) TO service_role;
