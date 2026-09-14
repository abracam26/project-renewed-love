-- =====================================================================
-- Geração de questões por IA: material de referência por tema,
-- configurações editáveis (regras de geração) e log de gerações.
-- =====================================================================

-- Material de apoio separado por tema (fonte única da geração).
CREATE TABLE IF NOT EXISTS public.material_trechos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tema        smallint NOT NULL CHECK (tema BETWEEN 1 AND 4),
  ordem       smallint NOT NULL DEFAULT 1,
  titulo      text NOT NULL,
  conteudo    text NOT NULL,
  versao      text NOT NULL DEFAULT 'junho/2026',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tema, ordem)
);

DROP TRIGGER IF EXISTS material_trechos_set_updated_at ON public.material_trechos;
CREATE TRIGGER material_trechos_set_updated_at BEFORE UPDATE ON public.material_trechos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.material_trechos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.material_trechos TO authenticated;
GRANT ALL ON public.material_trechos TO service_role;

DROP POLICY IF EXISTS "Admins leem material" ON public.material_trechos;
CREATE POLICY "Admins leem material" ON public.material_trechos
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Configurações simples (chave/valor). Ex.: regras_geracao.
CREATE TABLE IF NOT EXISTS public.configuracoes (
  chave       text PRIMARY KEY,
  valor       text NOT NULL,
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.configuracoes TO authenticated;
GRANT ALL ON public.configuracoes TO service_role;

DROP POLICY IF EXISTS "Admins leem configurações" ON public.configuracoes;
CREATE POLICY "Admins leem configurações" ON public.configuracoes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Log de gerações por IA.
CREATE TABLE IF NOT EXISTS public.geracoes_ia (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tema            smallint NOT NULL CHECK (tema BETWEEN 1 AND 4),
  nivel           text NOT NULL,
  dificuldade     text,
  quantidade      smallint NOT NULL,
  instrucao_extra text,
  modelo          text NOT NULL,
  geradas         smallint NOT NULL DEFAULT 0,
  descartadas     smallint NOT NULL DEFAULT 0,
  erros           jsonb NOT NULL DEFAULT '[]'::jsonb,
  tokens_entrada  integer,
  tokens_saida    integer,
  duracao_ms      integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.geracoes_ia ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.geracoes_ia TO authenticated;
GRANT ALL ON public.geracoes_ia TO service_role;

DROP POLICY IF EXISTS "Admins leem gerações" ON public.geracoes_ia;
CREATE POLICY "Admins leem gerações" ON public.geracoes_ia
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Rastreia de qual geração a questão veio.
ALTER TABLE public.questoes ADD COLUMN IF NOT EXISTS geracao_id uuid REFERENCES public.geracoes_ia(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS questoes_geracao_idx ON public.questoes (geracao_id);
