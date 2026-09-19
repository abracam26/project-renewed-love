-- =====================================================================
-- Motor de simulado: cadastro do aluno (com CPF cifrado), configurações
-- por tipo de prova, tentativas de simulado e questões respondidas,
-- com anti-repetição por usuário.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Perfil do aluno: acrescenta plano, CPF cifrado e limites
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cpf_hash text UNIQUE,
  ADD COLUMN IF NOT EXISTS plano text NOT NULL DEFAULT 'gratis'
    CHECK (plano IN ('gratis', 'mensal', 'anual', 'inativo')),
  ADD COLUMN IF NOT EXISTS plano_validade date;

-- Marca quando um CPF já usou o teste grátis (mesmo se a conta foi apagada).
CREATE TABLE IF NOT EXISTS public.gratuidade_usada (
  cpf_hash    text PRIMARY KEY,
  usada_em    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.gratuidade_usada TO authenticated;
GRANT ALL ON public.gratuidade_usada TO service_role;
ALTER TABLE public.gratuidade_usada ENABLE ROW LEVEL SECURITY;
-- Sem policy pública: só o service_role lê/grava.

-- ---------------------------------------------------------------------
-- 2. Configurações por tipo de prova (ABT1/ABT2/GRATIS)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.configuracoes_prova (
  tipo             text PRIMARY KEY CHECK (tipo IN ('ABT1', 'ABT2', 'GRATIS', 'LIVRE')),
  total_questoes   smallint NOT NULL,
  tempo_maximo_min smallint NOT NULL,
  nota_corte       smallint NOT NULL,
  pct_facil        smallint NOT NULL,
  pct_media        smallint NOT NULL,
  pct_dificil      smallint NOT NULL,
  pct_tema_1       smallint NOT NULL,
  pct_tema_2       smallint NOT NULL,
  pct_tema_3       smallint NOT NULL,
  pct_tema_4       smallint NOT NULL,
  mostrar_explicacao boolean NOT NULL DEFAULT false,
  updated_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (pct_facil + pct_media + pct_dificil = 100),
  CHECK (pct_tema_1 + pct_tema_2 + pct_tema_3 + pct_tema_4 = 100)
);

INSERT INTO public.configuracoes_prova
  (tipo, total_questoes, tempo_maximo_min, nota_corte,
   pct_facil, pct_media, pct_dificil,
   pct_tema_1, pct_tema_2, pct_tema_3, pct_tema_4, mostrar_explicacao)
VALUES
  ('ABT1',   40, 120, 70, 40, 45, 15, 45, 35, 12, 8, false),
  ('ABT2',   40, 120, 70, 15, 45, 40, 45, 35, 12, 8, false),
  ('GRATIS', 10,  30, 70, 60, 35,  5, 50, 30, 10, 10, false),
  ('LIVRE',  20,  60, 70, 40, 40, 20, 45, 35, 12, 8, false)
ON CONFLICT (tipo) DO NOTHING;

ALTER TABLE public.configuracoes_prova ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.configuracoes_prova TO authenticated;
GRANT ALL ON public.configuracoes_prova TO service_role;

DROP POLICY IF EXISTS "Alunos leem configurações da prova" ON public.configuracoes_prova;
CREATE POLICY "Alunos leem configurações da prova" ON public.configuracoes_prova
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------
-- 3. Tentativas de simulado
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.simulados (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo              text NOT NULL REFERENCES public.configuracoes_prova(tipo),
  status            text NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('em_andamento', 'finalizado', 'abandonado')),
  iniciado_em       timestamptz NOT NULL DEFAULT now(),
  finalizado_em     timestamptz,
  duracao_segundos  integer,
  total_questoes    smallint NOT NULL,
  acertos           smallint,
  aprovado          boolean,
  nota_corte        smallint NOT NULL,
  tempo_maximo_min  smallint NOT NULL
);

CREATE INDEX IF NOT EXISTS simulados_user_idx ON public.simulados (user_id, iniciado_em DESC);
CREATE INDEX IF NOT EXISTS simulados_status_idx ON public.simulados (user_id, status);

ALTER TABLE public.simulados ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.simulados TO authenticated;
GRANT ALL ON public.simulados TO service_role;

DROP POLICY IF EXISTS "Aluno lê seus simulados" ON public.simulados;
CREATE POLICY "Aluno lê seus simulados" ON public.simulados
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin lê todos os simulados" ON public.simulados;
CREATE POLICY "Admin lê todos os simulados" ON public.simulados
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------
-- 4. Questões de cada simulado
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.simulado_questoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulado_id    uuid NOT NULL REFERENCES public.simulados(id) ON DELETE CASCADE,
  questao_id     text NOT NULL REFERENCES public.questoes(id) ON DELETE RESTRICT,
  ordem          smallint NOT NULL,
  ordem_letras   text NOT NULL, -- ex.: "cadb" = ordem embaralhada das alternativas
  resposta       char(1),       -- letra escolhida pelo aluno, referente à ORDEM_LETRAS
  correta        boolean,
  respondida_em  timestamptz,
  tempo_ms       integer,
  UNIQUE (simulado_id, ordem),
  UNIQUE (simulado_id, questao_id)
);

CREATE INDEX IF NOT EXISTS simulado_questoes_simulado_idx ON public.simulado_questoes (simulado_id, ordem);
CREATE INDEX IF NOT EXISTS simulado_questoes_questao_idx ON public.simulado_questoes (questao_id);

ALTER TABLE public.simulado_questoes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.simulado_questoes TO authenticated;
GRANT ALL ON public.simulado_questoes TO service_role;

DROP POLICY IF EXISTS "Aluno lê questões dos seus simulados" ON public.simulado_questoes;
CREATE POLICY "Aluno lê questões dos seus simulados" ON public.simulado_questoes
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.simulados s WHERE s.id = simulado_id AND s.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admin lê todas questões respondidas" ON public.simulado_questoes;
CREATE POLICY "Admin lê todas questões respondidas" ON public.simulado_questoes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------
-- 5. Nova função de sorteio: por usuário, evitando repetição
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.gerar_simulado(text, integer);

CREATE OR REPLACE FUNCTION public.sortear_questoes_simulado(
  p_user_id  uuid,
  p_tipo     text
)
RETURNS TABLE (
  questao_id text,
  ordem      smallint,
  tema       smallint
)
LANGUAGE plpgsql VOLATILE
SET search_path = public
AS $$
DECLARE
  cfg public.configuracoes_prova%ROWTYPE;
  qtd_tema integer;
  ordem_atual smallint := 0;
  t smallint;
BEGIN
  SELECT * INTO cfg FROM public.configuracoes_prova WHERE tipo = p_tipo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tipo de prova % não configurado', p_tipo;
  END IF;

  -- Tabela temporária com as questões já respondidas pelo aluno, ordenadas
  -- por vezes vistas ASC e data mais antiga primeiro. Servem para "reciclar"
  -- quando as inéditas de um tema acabarem.
  CREATE TEMP TABLE IF NOT EXISTS _historico ON COMMIT DROP AS
    SELECT sq.questao_id, count(*) AS vezes, max(s.iniciado_em) AS ultima_vez,
           bool_or(sq.correta = false) AS ja_errou
    FROM public.simulado_questoes sq
    JOIN public.simulados s ON s.id = sq.simulado_id
    WHERE s.user_id = p_user_id
    GROUP BY sq.questao_id;

  CREATE TEMP TABLE IF NOT EXISTS _sorteadas (
    questao_id text PRIMARY KEY,
    tema smallint,
    ordem smallint
  ) ON COMMIT DROP;

  -- Sorteia por tema
  FOR t IN 1..4 LOOP
    qtd_tema := CASE t
      WHEN 1 THEN round(cfg.total_questoes * cfg.pct_tema_1 / 100.0)
      WHEN 2 THEN round(cfg.total_questoes * cfg.pct_tema_2 / 100.0)
      WHEN 3 THEN round(cfg.total_questoes * cfg.pct_tema_3 / 100.0)
      WHEN 4 THEN round(cfg.total_questoes * cfg.pct_tema_4 / 100.0)
    END;

    -- Garante ao menos 1 por tema (regra do simulado grátis)
    IF qtd_tema = 0 THEN qtd_tema := 1; END IF;

    -- Primeiro: inéditas neste tema
    INSERT INTO _sorteadas (questao_id, tema, ordem)
    SELECT q.id, q.tema, 0
    FROM public.questoes q
    WHERE q.ativa AND q.status = 'aprovada' AND q.tema = t
      AND NOT EXISTS (SELECT 1 FROM _historico h WHERE h.questao_id = q.id)
      AND NOT EXISTS (SELECT 1 FROM _sorteadas s WHERE s.questao_id = q.id)
    ORDER BY random()
    LIMIT qtd_tema;

    -- Se faltou, completa com as vistas há mais tempo, priorizando as que já errou
    IF (SELECT count(*) FROM _sorteadas WHERE tema = t) < qtd_tema THEN
      INSERT INTO _sorteadas (questao_id, tema, ordem)
      SELECT q.id, q.tema, 0
      FROM public.questoes q
      JOIN _historico h ON h.questao_id = q.id
      WHERE q.ativa AND q.status = 'aprovada' AND q.tema = t
        AND NOT EXISTS (SELECT 1 FROM _sorteadas s WHERE s.questao_id = q.id)
      ORDER BY h.ja_errou DESC, h.ultima_vez ASC, random()
      LIMIT qtd_tema - (SELECT count(*) FROM _sorteadas WHERE tema = t);
    END IF;
  END LOOP;

  -- Atribui ordem final, embaralhando entre temas
  WITH ord AS (
    SELECT questao_id, tema,
           row_number() OVER (ORDER BY random()) AS n
    FROM _sorteadas
  )
  UPDATE _sorteadas s SET ordem = ord.n
  FROM ord WHERE ord.questao_id = s.questao_id;

  RETURN QUERY SELECT s.questao_id, s.ordem, s.tema
    FROM _sorteadas s ORDER BY s.ordem;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sortear_questoes_simulado(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. Estatísticas do aluno (dashboard e relatórios)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.estatisticas_aluno(p_user_id uuid)
RETURNS TABLE (
  total_simulados     bigint,
  simulados_completos bigint,
  aprovados           bigint,
  melhor_pct          integer,
  media_pct           integer,
  total_questoes      bigint,
  tempo_total_seg     bigint
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE status = 'finalizado')::bigint,
    count(*) FILTER (WHERE aprovado)::bigint,
    coalesce(max(round((acertos::numeric / NULLIF(total_questoes,0)) * 100)), 0)::integer,
    coalesce(round(avg((acertos::numeric / NULLIF(total_questoes,0)) * 100) FILTER (WHERE status = 'finalizado')), 0)::integer,
    coalesce(sum(total_questoes) FILTER (WHERE status = 'finalizado'), 0)::bigint,
    coalesce(sum(duracao_segundos), 0)::bigint
  FROM public.simulados
  WHERE user_id = p_user_id;
$$;
GRANT EXECUTE ON FUNCTION public.estatisticas_aluno(uuid) TO authenticated, service_role;
