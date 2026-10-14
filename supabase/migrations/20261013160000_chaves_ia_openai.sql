-- Chaves de IA: aceitar também a OpenAI no provedor.
ALTER TABLE public.chaves_ia DROP CONSTRAINT IF EXISTS chaves_ia_provedor_check;
ALTER TABLE public.chaves_ia ADD CONSTRAINT chaves_ia_provedor_check
  CHECK (provedor IN ('gemini', 'openai'));

-- Confere (deve mostrar gemini e openai):
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'chaves_ia_provedor_check';
