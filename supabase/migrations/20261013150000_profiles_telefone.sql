-- Telefone do aluno (o Pagar.me exige celular para gerar o Pix).
-- Rodar no SQL Editor do Supabase ANTES de publicar no Lovable.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telefone text;

-- Confere (deve listar a coluna telefone):
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'telefone';
