-- =====================================================================
-- Sorteio de simulado passa a respeitar a mistura de dificuldade
-- (pct_facil / pct_media / pct_dificil de configuracoes_prova).
--
-- Antes, só a distribuição por tema era aplicada: ABT1 e ABT2 saíam com a
-- mesma mistura de dificuldade e os campos da tela de configurações não
-- tinham efeito.
--
-- Regra, para cada tema:
--   1. calcula quantas questões do tema entram (pct_tema_N, mínimo 1);
--   2. divide essa quantidade entre fácil / média / difícil pelos percentuais;
--   3. sorteia, em cada faixa, questões inéditas para o aluno;
--   4. se uma faixa não tiver inéditas suficientes, completa com inéditas de
--      outra faixa (média primeiro). A anti-repetição vem antes da mistura exata;
--   5. só quando o tema não tem mais inéditas para o aluno é que recicla as já
--      vistas, mantendo a mistura por faixa, priorizando as que ele errou e
--      depois as vistas há mais tempo;
--   6. última garantia: completa com qualquer questão do tema. O simulado nunca
--      sai incompleto por falta de uma faixa específica.
-- =====================================================================

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
      WHERE q.ativa AND q.status = 'aprovada' AND q.tema = t AND q.dificuldade = faixa
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
      WHERE q.ativa AND q.status = 'aprovada' AND q.tema = t
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
        WHERE q.ativa AND q.status = 'aprovada' AND q.tema = t AND q.dificuldade = faixa
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
      WHERE q.ativa AND q.status = 'aprovada' AND q.tema = t
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
