-- =====================================================================
-- Sorteio com o total exato de questões.
-- Antes, a cota de cada tema era arredondada separadamente (e cada tema
-- recebia no mínimo 1 questão), e a soma podia passar do total configurado:
-- com 45/35/12/8 em 10 questões saíam 5+4+1+1 = 11 questões no teste grátis.
-- Agora a divisão entre os temas usa o método dos maiores restos e fecha
-- sempre no total configurado. Tema com percentual acima de zero continua
-- com pelo menos 1 questão; tema com 0% deixa de cair na prova.
-- O resto do sorteio (anti-repetição, mistura de dificuldade, banco de cada
-- prova) não muda. Idempotente.
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
  pcts       numeric[];
  cotas      integer[] := ARRAY[0, 0, 0, 0];
  resto      integer;
  doador     integer;
  g          integer;
  -- Cada prova sorteia só do seu banco: ABT (Correspondentes) e o teste
  -- grátis do ABT usam o e-book; ABT1, ABT2 e os testes grátis deles usam o
  -- Material de Apoio.
  v_exame    text := CASE WHEN p_tipo IN ('ABT', 'GRATIS_ABT') THEN 'ABT' ELSE 'ABT12' END;
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

  -- Cota de cada tema pelo método dos maiores restos: a soma é sempre o total
  -- configurado (arredondar tema a tema podia dar 11 questões num teste de 10).
  pcts := ARRAY[cfg.pct_tema_1, cfg.pct_tema_2, cfg.pct_tema_3, cfg.pct_tema_4]::numeric[];
  FOR g IN 1..4 LOOP
    cotas[g] := floor(cfg.total_questoes * pcts[g] / 100.0);
  END LOOP;
  resto := cfg.total_questoes - (cotas[1] + cotas[2] + cotas[3] + cotas[4]);
  FOR g IN
    SELECT x.n FROM (
      SELECT s.n,
             cfg.total_questoes * pcts[s.n] / 100.0 - floor(cfg.total_questoes * pcts[s.n] / 100.0) AS frac
      FROM generate_series(1, 4) AS s(n)
      WHERE pcts[s.n] > 0
    ) x
    ORDER BY x.frac DESC, pcts[x.n] DESC, x.n
    LIMIT greatest(resto, 0)
  LOOP
    cotas[g] := cotas[g] + 1;
  END LOOP;
  -- Tema com percentual acima de zero tem pelo menos 1 questão (sem mudar o
  -- total): a questão sai do tema com a maior cota. Tema com 0% fica de fora.
  FOR g IN 1..4 LOOP
    IF pcts[g] > 0 AND cotas[g] = 0 THEN
      SELECT s.n INTO doador
      FROM generate_series(1, 4) AS s(n)
      WHERE cotas[s.n] > 1
      ORDER BY cotas[s.n] DESC, s.n
      LIMIT 1;
      IF doador IS NOT NULL THEN
        cotas[doador] := cotas[doador] - 1;
        cotas[g] := 1;
      END IF;
    END IF;
  END LOOP;

  FOR t IN 1..4 LOOP
    qtd_tema := cotas[t];
    CONTINUE WHEN qtd_tema <= 0;

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
