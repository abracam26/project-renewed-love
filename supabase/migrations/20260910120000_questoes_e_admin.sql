-- =====================================================================
-- Simulador ABT (ABRACAM): papéis de administrador, banco de questões,
-- log de importações e sorteio de simulados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Papéis de usuário (admin / user), separados da tabela profiles
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

DROP POLICY IF EXISTS "Usuário vê os próprios papéis" ON public.user_roles;
CREATE POLICY "Usuário vê os próprios papéis" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Primeiros administradores (só surte efeito se a conta já existir em auth.users).
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE lower(u.email) IN ('wallasmonteiro019@gmail.com', 'contato@ustudy.com.br')
ON CONFLICT (user_id, role) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Banco de questões
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.questoes (
  id               text PRIMARY KEY,                       -- ex.: ABT-T1-0001
  tema             smallint NOT NULL CHECK (tema BETWEEN 1 AND 4),
  tema_nome        text NOT NULL,
  subtema          text,
  nivel            text NOT NULL CHECK (nivel IN ('ABT1', 'ABT2', 'AMBOS')),
  dificuldade      text NOT NULL CHECK (dificuldade IN ('facil', 'media', 'dificil')),
  enunciado        text NOT NULL,
  alternativas     jsonb NOT NULL,                         -- [{"letra":"a","texto":"..."}, ...] sempre 4
  gabarito         char(1) NOT NULL CHECK (gabarito IN ('a', 'b', 'c', 'd')),
  explicacao       text,
  fonte_norma      text,
  fonte_artigo     text,
  fonte_pagina     smallint,
  tags             text[] NOT NULL DEFAULT '{}',
  versao_material  text NOT NULL DEFAULT 'junho/2026',
  origem           text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'ia', 'importacao')),
  status           text NOT NULL DEFAULT 'aprovada' CHECK (status IN ('rascunho', 'aprovada')),
  ativa            boolean NOT NULL DEFAULT true,
  importacao_id    uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT questoes_quatro_alternativas CHECK (jsonb_typeof(alternativas) = 'array' AND jsonb_array_length(alternativas) = 4)
);

CREATE INDEX IF NOT EXISTS questoes_tema_idx        ON public.questoes (tema);
CREATE INDEX IF NOT EXISTS questoes_nivel_idx       ON public.questoes (nivel);
CREATE INDEX IF NOT EXISTS questoes_dificuldade_idx ON public.questoes (dificuldade);
CREATE INDEX IF NOT EXISTS questoes_ativa_idx       ON public.questoes (ativa, status);
CREATE INDEX IF NOT EXISTS questoes_tags_idx        ON public.questoes USING gin (tags);

DROP TRIGGER IF EXISTS questoes_set_updated_at ON public.questoes;
CREATE TRIGGER questoes_set_updated_at BEFORE UPDATE ON public.questoes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.questoes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.questoes TO authenticated;
GRANT ALL ON public.questoes TO service_role;

-- Alunos autenticados leem apenas questões ativas e aprovadas.
DROP POLICY IF EXISTS "Alunos leem questões ativas" ON public.questoes;
CREATE POLICY "Alunos leem questões ativas" ON public.questoes
  FOR SELECT TO authenticated
  USING (ativa = true AND status = 'aprovada');

-- Administradores leem tudo (escrita acontece pelo servidor com service_role).
DROP POLICY IF EXISTS "Admins leem todas as questões" ON public.questoes;
CREATE POLICY "Admins leem todas as questões" ON public.questoes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------
-- 3. Log de importações
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.importacoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  arquivo        text NOT NULL,
  formato        text NOT NULL CHECK (formato IN ('json', 'csv')),
  total_lidas    integer NOT NULL DEFAULT 0,
  total_inseridas integer NOT NULL DEFAULT 0,
  total_atualizadas integer NOT NULL DEFAULT 0,
  total_erros    integer NOT NULL DEFAULT 0,
  erros          jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.importacoes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.importacoes TO authenticated;
GRANT ALL ON public.importacoes TO service_role;

DROP POLICY IF EXISTS "Admins leem importações" ON public.importacoes;
CREATE POLICY "Admins leem importações" ON public.importacoes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------
-- 4. Sorteio de simulado na proporção oficial da prova (18 / 14 / 5 / 3)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gerar_simulado(p_nivel text DEFAULT 'ABT1', p_total integer DEFAULT 40)
RETURNS SETOF public.questoes
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  q1 integer := round(p_total * 18.0 / 40);
  q2 integer := round(p_total * 14.0 / 40);
  q3 integer := round(p_total * 5.0 / 40);
  q4 integer;
BEGIN
  q4 := greatest(p_total - q1 - q2 - q3, 0);
  RETURN QUERY
    (SELECT * FROM public.questoes WHERE ativa AND status = 'aprovada' AND tema = 1 AND nivel IN (p_nivel, 'AMBOS') ORDER BY random() LIMIT q1)
    UNION ALL
    (SELECT * FROM public.questoes WHERE ativa AND status = 'aprovada' AND tema = 2 AND nivel IN (p_nivel, 'AMBOS') ORDER BY random() LIMIT q2)
    UNION ALL
    (SELECT * FROM public.questoes WHERE ativa AND status = 'aprovada' AND tema = 3 AND nivel IN (p_nivel, 'AMBOS') ORDER BY random() LIMIT q3)
    UNION ALL
    (SELECT * FROM public.questoes WHERE ativa AND status = 'aprovada' AND tema = 4 AND nivel IN (p_nivel, 'AMBOS') ORDER BY random() LIMIT q4);
END;
$$;
GRANT EXECUTE ON FUNCTION public.gerar_simulado(text, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. Contagem por tema (usada no painel Admin)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contar_questoes_por_tema()
RETURNS TABLE (tema smallint, total bigint, ativas bigint)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT t.tema::smallint,
         count(q.id) AS total,
         count(q.id) FILTER (WHERE q.ativa AND q.status = 'aprovada') AS ativas
  FROM generate_series(1, 4) AS t(tema)
  LEFT JOIN public.questoes q ON q.tema = t.tema
  GROUP BY t.tema
  ORDER BY t.tema;
$$;
GRANT EXECUTE ON FUNCTION public.contar_questoes_por_tema() TO authenticated, service_role;
