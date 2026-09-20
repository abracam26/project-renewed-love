CREATE OR REPLACE FUNCTION public.sortear_questoes_simulado(p_user_id uuid, p_tipo text)
 RETURNS TABLE(questao_id text, ordem smallint, tema smallint)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg public.configuracoes_prova%ROWTYPE;
  qtd_tema integer;
  t smallint;
  ja integer;
BEGIN
  SELECT * INTO cfg FROM public.configuracoes_prova WHERE tipo = p_tipo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tipo de prova % não configurado', p_tipo;
  END IF;

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

  FOR t IN 1..4 LOOP
    qtd_tema := CASE t
      WHEN 1 THEN round(cfg.total_questoes * cfg.pct_tema_1 / 100.0)
      WHEN 2 THEN round(cfg.total_questoes * cfg.pct_tema_2 / 100.0)
      WHEN 3 THEN round(cfg.total_questoes * cfg.pct_tema_3 / 100.0)
      WHEN 4 THEN round(cfg.total_questoes * cfg.pct_tema_4 / 100.0)
    END;

    IF qtd_tema = 0 THEN qtd_tema := 1; END IF;

    INSERT INTO _sorteadas (questao_id, tema, ordem)
    SELECT q.id, q.tema, 0
    FROM public.questoes q
    WHERE q.ativa AND q.status = 'aprovada' AND q.tema = t
      AND NOT EXISTS (SELECT 1 FROM _historico h WHERE h.questao_id = q.id)
      AND NOT EXISTS (SELECT 1 FROM _sorteadas sd WHERE sd.questao_id = q.id)
    ORDER BY random()
    LIMIT qtd_tema;

    SELECT count(*) INTO ja FROM _sorteadas sd WHERE sd.tema = t;

    IF ja < qtd_tema THEN
      INSERT INTO _sorteadas (questao_id, tema, ordem)
      SELECT q.id, q.tema, 0
      FROM public.questoes q
      JOIN _historico h ON h.questao_id = q.id
      WHERE q.ativa AND q.status = 'aprovada' AND q.tema = t
        AND NOT EXISTS (SELECT 1 FROM _sorteadas sd WHERE sd.questao_id = q.id)
      ORDER BY h.ja_errou DESC, h.ultima_vez ASC, random()
      LIMIT qtd_tema - ja;
    END IF;
  END LOOP;

  WITH ord AS (
    SELECT sd.questao_id AS qid, row_number() OVER (ORDER BY random()) AS n
    FROM _sorteadas sd
  )
  UPDATE _sorteadas sd SET ordem = ord.n
  FROM ord WHERE ord.qid = sd.questao_id;

  RETURN QUERY SELECT sd.questao_id, sd.ordem, sd.tema
    FROM _sorteadas sd ORDER BY sd.ordem;
END;
$function$;