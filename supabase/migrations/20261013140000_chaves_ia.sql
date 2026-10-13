-- =====================================================================
-- Chaves da API de IA (Gemini) trocadas pelo Admin, sem mexer no projeto.
-- 1. Até duas chaves: a principal e a reserva. Se a principal falhar, a
--    geração de questões tenta sozinha pela reserva.
-- 2. Só o servidor (service_role) lê e grava; a chave nunca vai inteira
--    para o navegador (a tela mostra só o começo e o fim).
-- 3. Sem chave cadastrada aqui, continua valendo a GEMINI_API_KEY do projeto.
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.chaves_ia (
  -- DEFERRABLE: permite trocar principal e reserva numa única instrução
  posicao          text NOT NULL CHECK (posicao IN ('principal', 'reserva')),
  provedor         text NOT NULL DEFAULT 'gemini' CHECK (provedor IN ('gemini')),
  chave            text NOT NULL CHECK (char_length(chave) BETWEEN 20 AND 300 AND chave !~ '\s'),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  atualizado_por   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ultimo_teste_em  timestamptz,
  ultimo_teste_ok  boolean,
  ultimo_teste_msg text CHECK (ultimo_teste_msg IS NULL OR char_length(ultimo_teste_msg) <= 500),
  ultimo_uso_em    timestamptz,
  CONSTRAINT chaves_ia_pkey PRIMARY KEY (posicao) DEFERRABLE INITIALLY IMMEDIATE
);

ALTER TABLE public.chaves_ia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chaves_ia FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.chaves_ia TO service_role;

-- Reserva vira principal e vice-versa (os testes e o uso acompanham a chave)
CREATE OR REPLACE FUNCTION public.trocar_chaves_ia(p_por uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.chaves_ia;
  IF v_n < 2 THEN
    RAISE EXCEPTION 'Cadastre a chave principal e a reserva antes de trocar uma pela outra.';
  END IF;
  UPDATE public.chaves_ia
     SET posicao = CASE posicao WHEN 'principal' THEN 'reserva' ELSE 'principal' END,
         atualizado_em = now(), atualizado_por = p_por;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.trocar_chaves_ia(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trocar_chaves_ia(uuid) TO service_role;
