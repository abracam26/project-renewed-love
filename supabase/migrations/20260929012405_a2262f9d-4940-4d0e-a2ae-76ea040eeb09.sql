ALTER TABLE public.configuracoes_prova
  DROP CONSTRAINT configuracoes_prova_tipo_check;

ALTER TABLE public.configuracoes_prova
  ADD CONSTRAINT configuracoes_prova_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'ABT1'::text,
    'ABT2'::text,
    'ABT'::text,
    'GRATIS_ABT1'::text,
    'GRATIS_ABT2'::text,
    'GRATIS_ABT'::text,
    'GRATIS'::text,
    'LIVRE'::text
  ]));

INSERT INTO public.configuracoes_prova (
  tipo, total_questoes, tempo_maximo_min, nota_corte,
  pct_facil, pct_media, pct_dificil,
  pct_tema_1, pct_tema_2, pct_tema_3, pct_tema_4,
  mostrar_explicacao
)
SELECT
  'GRATIS_ABT1', 10, 30, nota_corte,
  pct_facil, pct_media, pct_dificil,
  pct_tema_1, pct_tema_2, pct_tema_3, pct_tema_4,
  mostrar_explicacao
FROM public.configuracoes_prova
WHERE tipo = 'ABT1'
ON CONFLICT (tipo) DO NOTHING;

INSERT INTO public.configuracoes_prova (
  tipo, total_questoes, tempo_maximo_min, nota_corte,
  pct_facil, pct_media, pct_dificil,
  pct_tema_1, pct_tema_2, pct_tema_3, pct_tema_4,
  mostrar_explicacao
)
SELECT
  'GRATIS_ABT2', 10, 30, nota_corte,
  pct_facil, pct_media, pct_dificil,
  pct_tema_1, pct_tema_2, pct_tema_3, pct_tema_4,
  mostrar_explicacao
FROM public.configuracoes_prova
WHERE tipo = 'ABT2'
ON CONFLICT (tipo) DO NOTHING;

INSERT INTO public.configuracoes_prova (
  tipo, total_questoes, tempo_maximo_min, nota_corte,
  pct_facil, pct_media, pct_dificil,
  pct_tema_1, pct_tema_2, pct_tema_3, pct_tema_4,
  mostrar_explicacao
)
SELECT
  'GRATIS_ABT', 10, 30, nota_corte,
  pct_facil, pct_media, pct_dificil,
  pct_tema_1, pct_tema_2, pct_tema_3, pct_tema_4,
  mostrar_explicacao
FROM public.configuracoes_prova
WHERE tipo = 'ABT'
ON CONFLICT (tipo) DO NOTHING;

DO $$
DECLARE
  v_oid oid;
  v_definition text;
  v_old text := 'v_exame    text := CASE WHEN p_tipo = ''ABT'' THEN ''ABT'' ELSE ''ABT12'' END;';
  v_new text := 'v_exame    text := CASE WHEN p_tipo IN (''ABT'', ''GRATIS_ABT'') THEN ''ABT'' ELSE ''ABT12'' END;';
BEGIN
  SELECT p.oid, pg_get_functiondef(p.oid)
    INTO v_oid, v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'sortear_questoes_simulado'
    AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_tipo text';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'Função sortear_questoes_simulado não encontrada';
  END IF;

  IF position(v_old in v_definition) = 0 THEN
    RAISE EXCEPTION 'Trecho esperado da função de sorteio não encontrado';
  END IF;

  EXECUTE replace(v_definition, v_old, v_new);
END
$$;