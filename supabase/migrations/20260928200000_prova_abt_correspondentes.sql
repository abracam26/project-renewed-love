-- =====================================================================
-- Prova ABT (Certificação dos Correspondentes) no lugar do Treino livre.
--
-- 1. questoes.exame separa os bancos: 'ABT12' (ABT1/ABT2, Material de
--    Apoio) e 'ABT' (Correspondentes, e-book próprio). IDs do banco ABT
--    começam com ABTC- (ex.: ABTC-T4-0001).
-- 2. Novo tipo de prova 'ABT': 20 questões, 120 minutos, nota 70%,
--    dificuldade 50/30/20 e temas 30/20/25/25 (câmbio, PLD/FTP, SFN,
--    correspondente), conforme o e-book. O tipo 'LIVRE' continua na tabela
--    só por causa do histórico; não aparece mais para iniciar.
-- 3. O sorteio passa a filtrar pelo banco da prova.
-- 4. Contagem de questões por prova e tema (painel admin).
-- Idempotente: pode ser aplicada mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Banco de questões por prova
-- ---------------------------------------------------------------------
ALTER TABLE public.questoes
  ADD COLUMN IF NOT EXISTS exame text NOT NULL DEFAULT 'ABT12';

ALTER TABLE public.questoes DROP CONSTRAINT IF EXISTS questoes_exame_valido;
ALTER TABLE public.questoes
  ADD CONSTRAINT questoes_exame_valido CHECK (exame IN ('ABT12', 'ABT'));

-- O prefixo do ID e o banco sempre andam juntos
ALTER TABLE public.questoes DROP CONSTRAINT IF EXISTS questoes_exame_confere_id;
ALTER TABLE public.questoes
  ADD CONSTRAINT questoes_exame_confere_id CHECK ((exame = 'ABT') = (id LIKE 'ABTC-%'));

CREATE INDEX IF NOT EXISTS questoes_sorteio_exame_idx
  ON public.questoes (exame, tema, dificuldade) WHERE ativa AND status = 'aprovada';

-- ---------------------------------------------------------------------
-- 2. Tipo de prova ABT
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.configuracoes_prova'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tipo%'
  LOOP
    EXECUTE format('ALTER TABLE public.configuracoes_prova DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.configuracoes_prova
  ADD CONSTRAINT configuracoes_prova_tipo_check
  CHECK (tipo IN ('ABT1', 'ABT2', 'GRATIS', 'LIVRE', 'ABT'));

INSERT INTO public.configuracoes_prova
  (tipo, total_questoes, tempo_maximo_min, nota_corte,
   pct_facil, pct_media, pct_dificil,
   pct_tema_1, pct_tema_2, pct_tema_3, pct_tema_4, mostrar_explicacao)
VALUES
  ('ABT', 20, 120, 70, 50, 30, 20, 30, 20, 25, 25, false)
ON CONFLICT (tipo) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. Sorteio filtrando pelo banco da prova
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sortear_questoes_simulado(p_user_id uuid, p_tipo text)
 RETURNS TABLE(questao_id text, ordem smallint, tema smallint)
 LANGUAGE plpgsql
 VOLATILE
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg        public.configuracoes_prova%ROWTYPE;
  t          smallint;
  qtd_tema   integer;
  q_facil    integer;
  q_dificil  integer;
  q_media    integer;
  faixa      text;
  alvo       integer;
  ja         integer;
  faixas     text[] := ARRAY['facil', 'media', 'dificil'];
  -- Cada prova sorteia só do seu banco: ABT (Correspondentes) usa o e-book
  -- próprio; ABT1, ABT2 e o teste grátis usam o Material de Apoio.
  v_exame    text := CASE WHEN p_tipo = 'ABT' THEN 'ABT' ELSE 'ABT12' END;
BEGIN
  SELECT * INTO cfg FROM public.configuracoes_prova c WHERE c.tipo = p_tipo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tipo de prova % não configurado', p_tipo;
  END IF;

  DROP TABLE IF EXISTS _historico;
  DROP TABLE IF EXISTS _sorteadas;

  CREATE TEMP TABLE _historico ON COMMIT DROP AS
    SELECT sq.questao_id AS qid,
           max(s.iniciado_em) AS ultima_vez,
           bool_or(sq.correta = false) AS ja_errou
    FROM public.simulado_questoes sq
    JOIN public.simulados s ON s.id = sq.simulado_id
    WHERE s.user_id = p_user_id
    GROUP BY sq.questao_id;

  CREATE TEMP TABLE _sorteadas (
    qid    text PRIMARY KEY,
    tema_s smallint,
    ord    smallint
  ) ON COMMIT DROP;

  FOR t IN 1..4 LOOP
    qtd_tema := CASE t
      WHEN 1 THEN round(cfg.total_questoes * cfg.pct_tema_1 / 100.0)
      WHEN 2 THEN round(cfg.total_questoes * cfg.pct_tema_2 / 100.0)
      WHEN 3 THEN round(cfg.total_questoes * cfg.pct_tema_3 / 100.0)
      WHEN 4 THEN round(cfg.total_questoes * cfg.pct_tema_4 / 100.0)
    END;
    IF qtd_tema < 1 THEN qtd_tema := 1; END IF;

    -- Divide a cota do tema entre as faixas de dificuldade
    q_facil   := round(qtd_tema * cfg.pct_facil / 100.0);
    q_dificil := round(qtd_tema * cfg.pct_dificil / 100.0);
    IF q_facil + q_dificil > qtd_tema THEN
      q_dificil := qtd_tema - q_facil;
    END IF;
    q_media := qtd_tema - q_facil - q_dificil;

    -- Passo 1: inéditas, respeitando a cota de cada faixa
    FOREACH faixa IN ARRAY faixas LOOP
      alvo := CASE faixa WHEN 'facil' THEN q_facil WHEN 'media' THEN q_media ELSE q_dificil END;
      CONTINUE WHEN alvo <= 0;
      INSERT INTO _sorteadas (qid, tema_s, ord)
      SELECT q.id, q.tema, 0
      FROM public.questoes q
      WHERE q.ativa AND q.status = 'aprovada' AND q.exame = v_exame AND q.tema = t AND q.dificuldade = faixa
        AND NOT EXISTS (SELECT 1 FROM _historico h WHERE h.qid = q.id)
        AND NOT EXISTS (SELECT 1 FROM _sorteadas sd WHERE sd.qid = q.id)
      ORDER BY random()
      LIMIT alvo;
    END LOOP;

    -- Passo 2: se alguma faixa não tinha inéditas suficientes, completa com
    -- inéditas de outra faixa (a média primeiro, por ser vizinha das duas).
    -- A anti-repetição tem prioridade sobre a mistura exata de dificuldade.
    SELECT count(*) INTO ja FROM _sorteadas sd WHERE sd.tema_s = t;
    IF ja < qtd_tema THEN
      INSERT INTO _sorteadas (qid, tema_s, ord)
      SELECT q.id, q.tema, 0
      FROM public.questoes q
      WHERE q.ativa AND q.status = 'aprovada' AND q.exame = v_exame AND q.tema = t
        AND NOT EXISTS (SELECT 1 FROM _historico h WHERE h.qid = q.id)
        AND NOT EXISTS (SELECT 1 FROM _sorteadas sd WHERE sd.qid = q.id)
      ORDER BY (q.dificuldade = 'media') DESC, random()
      LIMIT qtd_tema - ja;
      SELECT count(*) INTO ja FROM _sorteadas sd WHERE sd.tema_s = t;
    END IF;

    -- Passo 3: o tema não tem mais inéditas para este aluno. Recicla as já
    -- vistas mantendo a mistura: por faixa, as que ele errou primeiro e depois
    -- as vistas há mais tempo.
    IF ja < qtd_tema THEN
      FOREACH faixa IN ARRAY faixas LOOP
        alvo := CASE faixa WHEN 'facil' THEN q_facil WHEN 'media' THEN q_media ELSE q_dificil END;
        alvo := alvo - (SELECT count(*) FROM _sorteadas sd JOIN public.questoes q ON q.id = sd.qid
                        WHERE sd.tema_s = t AND q.dificuldade = faixa);
        -- nunca ultrapassa o que ainda falta para fechar a cota do tema
        alvo := least(alvo, qtd_tema - (SELECT count(*) FROM _sorteadas sd WHERE sd.tema_s = t));
        CONTINUE WHEN alvo <= 0;
        INSERT INTO _sorteadas (qid, tema_s, ord)
        SELECT q.id, q.tema, 0
        FROM public.questoes q
        JOIN _historico h ON h.qid = q.id
        WHERE q.ativa AND q.status = 'aprovada' AND q.exame = v_exame AND q.tema = t AND q.dificuldade = faixa
          AND NOT EXISTS (SELECT 1 FROM _sorteadas sd WHERE sd.qid = q.id)
        ORDER BY h.ja_errou DESC, h.ultima_vez ASC, random()
        LIMIT alvo;
      END LOOP;
      SELECT count(*) INTO ja FROM _sorteadas sd WHERE sd.tema_s = t;
    END IF;

    -- Passo 4: última garantia de simulado completo, qualquer faixa
    IF ja < qtd_tema THEN
      INSERT INTO _sorteadas (qid, tema_s, ord)
      SELECT q.id, q.tema, 0
      FROM public.questoes q
      JOIN _historico h ON h.qid = q.id
      WHERE q.ativa AND q.status = 'aprovada' AND q.exame = v_exame AND q.tema = t
        AND NOT EXISTS (SELECT 1 FROM _sorteadas sd WHERE sd.qid = q.id)
      ORDER BY h.ja_errou DESC, h.ultima_vez ASC, random()
      LIMIT qtd_tema - ja;
    END IF;
  END LOOP;

  -- Ordem final embaralhada entre temas
  WITH o AS (
    SELECT sd.qid AS k, row_number() OVER (ORDER BY random()) AS n
    FROM _sorteadas sd
  )
  UPDATE _sorteadas sd SET ord = o.n
  FROM o WHERE o.k = sd.qid;

  RETURN QUERY
    SELECT sd.qid, sd.ord, sd.tema_s
    FROM _sorteadas sd
    ORDER BY sd.ord;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.sortear_questoes_simulado(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Contagem por prova e tema (painel admin)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contar_questoes_por_exame_tema()
RETURNS TABLE (exame text, tema smallint, total bigint, ativas bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT e.exame, t.tema::smallint,
         count(q.id) AS total,
         count(q.id) FILTER (WHERE q.ativa AND q.status = 'aprovada') AS ativas
  FROM (VALUES ('ABT12'), ('ABT')) AS e(exame)
  CROSS JOIN generate_series(1, 4) AS t(tema)
  LEFT JOIN public.questoes q ON q.exame = e.exame AND q.tema = t.tema
  GROUP BY e.exame, t.tema
  ORDER BY e.exame DESC, t.tema;
$$;

REVOKE ALL ON FUNCTION public.contar_questoes_por_exame_tema() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contar_questoes_por_exame_tema() TO authenticated, service_role;
