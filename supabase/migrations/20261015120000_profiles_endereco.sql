-- Endereço do aluno (o Pagar.me exige endereço do pagador para emitir boleto).
-- Rodar no SQL Editor do Supabase ANTES de publicar no Lovable.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS endereco jsonb;

-- Confere (deve listar a coluna endereco):
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'endereco';
