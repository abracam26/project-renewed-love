-- =====================================================================
-- 1. Reporte de questões pelos alunos (divergência com o material,
--    gabarito errado etc.), tratado pelo admin em /admin/reportes.
-- 2. Sessão da prova: o simulado só continua na aba em que foi iniciado.
--    Sair da prova (fechar a aba, abrir em outra aba, iniciar outro) encerra
--    o simulado como abandonado: não existe "parar e retomar depois".
-- Idempotente: pode ser aplicada mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Reportes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reportes_questao (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questao_id     text NOT NULL REFERENCES public.questoes(id) ON DELETE CASCADE,
  user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  simulado_id    uuid REFERENCES public.simulados(id) ON DELETE SET NULL,
  motivo         text NOT NULL CHECK (motivo IN (
                   'gabarito', 'enunciado', 'alternativas', 'material', 'mais_de_uma', 'outro')),
  descricao      text CHECK (descricao IS NULL OR char_length(descricao) <= 2000),
  status         text NOT NULL DEFAULT 'aberto'
                   CHECK (status IN ('aberto', 'resolvido', 'descartado')),
  resposta_admin text CHECK (resposta_admin IS NULL OR char_length(resposta_admin) <= 2000),
  created_at     timestamptz NOT NULL DEFAULT now(),
  resolvido_em   timestamptz,
  resolvido_por  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS reportes_questao_status_idx
  ON public.reportes_questao (status, created_at DESC);
CREATE INDEX IF NOT EXISTS reportes_questao_questao_idx
  ON public.reportes_questao (questao_id);
CREATE INDEX IF NOT EXISTS reportes_questao_usuario_idx
  ON public.reportes_questao (user_id, created_at DESC);

-- Um reporte aberto por aluno e questão (evita duplicidade)
CREATE UNIQUE INDEX IF NOT EXISTS reportes_questao_um_aberto
  ON public.reportes_questao (questao_id, user_id) WHERE status = 'aberto';

-- Só o servidor (service_role) lê e grava: o aluno reporta pela função
-- de servidor, que confere se a questão estava num simulado dele.
ALTER TABLE public.reportes_questao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reportes_questao FROM anon, authenticated;
GRANT ALL ON public.reportes_questao TO service_role;

-- ---------------------------------------------------------------------
-- 2. Sessão da prova
-- ---------------------------------------------------------------------
ALTER TABLE public.simulados
  ADD COLUMN IF NOT EXISTS sessao_prova uuid;
