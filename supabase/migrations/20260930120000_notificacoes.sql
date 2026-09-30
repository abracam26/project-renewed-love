-- =====================================================================
-- Notificações (sino da barra superior).
-- Cada usuário recebe avisos sobre o que aconteceu com ele no sistema:
--   Aluno: chamado respondido/encerrado, reporte de questão analisado,
--          pedido pago, cancelado, vencido ou estornado, material novo.
--   Admin: novo chamado, novo reporte, novo pedido aguardando pagamento.
-- Os avisos são gravados por gatilhos nas tabelas (valem para qualquer
-- caminho: telas, funções do banco ou rotinas automáticas). Os avisos de
-- plano perto de vencer são criados pelo servidor quando o sino é aberto.
-- Um aviso que falhar nunca desfaz a operação principal (só gera WARNING).
-- Só o servidor (service_role) lê e grava a tabela.
-- Idempotente: pode ser aplicada mais de uma vez.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.notificacoes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo       text NOT NULL CHECK (tipo ~ '^[a-z_]{3,40}$'),
  titulo     text NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 200),
  mensagem   text CHECK (mensagem IS NULL OR char_length(mensagem) <= 1000),
  -- Só caminhos internos do próprio site (nada de links externos)
  link       text CHECK (link IS NULL OR (char_length(link) <= 300 AND link ~ '^/[A-Za-z0-9]')),
  -- Chave para não repetir o mesmo aviso (NULL = sem controle de repetição)
  ref        text CHECK (ref IS NULL OR char_length(ref) <= 200),
  lida_em    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notificacoes_usuario_idx
  ON public.notificacoes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notificacoes_nao_lidas_idx
  ON public.notificacoes (user_id) WHERE lida_em IS NULL;
-- NULLs não conflitam entre si: avisos sem ref podem se repetir
CREATE UNIQUE INDEX IF NOT EXISTS notificacoes_ref_unica
  ON public.notificacoes (user_id, tipo, ref);
CREATE INDEX IF NOT EXISTS notificacoes_tipo_ref_idx
  ON public.notificacoes (tipo, ref) WHERE ref IS NOT NULL;

ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notificacoes FROM anon, authenticated;
GRANT ALL ON public.notificacoes TO service_role;

-- ---------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.formatar_reais(p_centavos integer)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT 'R$ ' || translate(to_char(p_centavos / 100, 'FM999G999G990'), ',', '.')
         || ',' || lpad((p_centavos % 100)::text, 2, '0');
$$;

CREATE OR REPLACE FUNCTION public.notificar(
  p_user     uuid,
  p_tipo     text,
  p_titulo   text,
  p_mensagem text,
  p_link     text,
  p_ref      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem, link, ref)
  VALUES (p_user, p_tipo, left(p_titulo, 200), left(p_mensagem, 1000), p_link, p_ref)
  ON CONFLICT (user_id, tipo, ref) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Notificação não gravada (%): %', p_tipo, SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.notificar_admins(
  p_tipo     text,
  p_titulo   text,
  p_mensagem text,
  p_link     text,
  p_ref      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem, link, ref)
  SELECT DISTINCT r.user_id, p_tipo, left(p_titulo, 200), left(p_mensagem, 1000), p_link, p_ref
    FROM public.user_roles r
   WHERE r.role = 'admin' AND r.user_id IS NOT NULL
  ON CONFLICT (user_id, tipo, ref) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Notificação aos administradores não gravada (%): %', p_tipo, SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.nome_para_aviso(p_user uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT COALESCE(NULLIF(btrim(p.nome_completo), ''), NULLIF(btrim(p.full_name), ''), p.email)
       FROM public.profiles p WHERE p.id = p_user),
    'Um aluno');
$$;

-- ---------------------------------------------------------------------
-- Chamados de suporte
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notificar_chamado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notificar_admins(
      'chamado_novo',
      'Novo chamado de suporte',
      format('%s abriu o chamado “%s”.', public.nome_para_aviso(NEW.user_id), NEW.titulo),
      '/admin/suporte',
      'chamado:' || NEW.id);
  ELSIF NEW.resposta IS NOT NULL AND NEW.resposta IS DISTINCT FROM OLD.resposta THEN
    PERFORM public.notificar(
      NEW.user_id,
      'chamado_respondido',
      CASE WHEN OLD.resposta IS NULL THEN 'Seu chamado foi respondido'
           ELSE 'A resposta do seu chamado foi atualizada' END,
      format('Chamado “%s”. Abra a página Suporte para ler a resposta da ABRACAM.', NEW.titulo),
      '/suporte');
  ELSIF NEW.status = 'fechado' AND OLD.status IS DISTINCT FROM 'fechado' AND NEW.resposta IS NULL THEN
    PERFORM public.notificar(
      NEW.user_id,
      'chamado_encerrado',
      'Seu chamado foi encerrado',
      format('O chamado “%s” foi encerrado pela ABRACAM.', NEW.titulo),
      '/suporte');
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Aviso de chamado não gravado: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS chamados_suporte_notificar ON public.chamados_suporte;
CREATE TRIGGER chamados_suporte_notificar
  AFTER INSERT OR UPDATE OF resposta, status ON public.chamados_suporte
  FOR EACH ROW EXECUTE FUNCTION public.notificar_chamado();

-- ---------------------------------------------------------------------
-- Reportes de questões
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notificar_reporte()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_motivo text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_motivo := CASE NEW.motivo
      WHEN 'gabarito' THEN 'gabarito incorreto'
      WHEN 'enunciado' THEN 'erro no enunciado'
      WHEN 'alternativas' THEN 'erro nas alternativas'
      WHEN 'material' THEN 'diverge do material'
      WHEN 'mais_de_uma' THEN 'mais de uma resposta correta'
      ELSE 'outro problema' END;
    PERFORM public.notificar_admins(
      'reporte_novo',
      'Novo reporte de questão',
      format('Questão %s: %s.', NEW.questao_id, v_motivo),
      '/admin/reportes',
      'reporte:' || NEW.id);
  ELSIF OLD.status = 'aberto' AND NEW.status IN ('resolvido', 'descartado') THEN
    PERFORM public.notificar(
      NEW.user_id,
      'reporte_analisado',
      'Seu reporte foi analisado',
      CASE WHEN NEW.status = 'resolvido'
        THEN format('A equipe da ABRACAM analisou o problema que você apontou na questão %s e marcou o reporte como resolvido. Obrigado pela ajuda!', NEW.questao_id)
        ELSE format('A equipe da ABRACAM analisou o problema que você apontou na questão %s, conferiu a questão com o material e não encontrou erro.', NEW.questao_id)
      END,
      -- O resultado só abre para simulados finalizados; nos outros casos, o histórico
      CASE WHEN NEW.simulado_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM public.simulados s
              WHERE s.id = NEW.simulado_id AND s.status = 'finalizado')
           THEN '/resultado/' || NEW.simulado_id
           ELSE '/historico' END,
      'reporte:' || NEW.id || ':' || NEW.status);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Aviso de reporte não gravado: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS reportes_questao_notificar ON public.reportes_questao;
CREATE TRIGGER reportes_questao_notificar
  AFTER INSERT OR UPDATE OF status ON public.reportes_questao
  FOR EACH ROW EXECUTE FUNCTION public.notificar_reporte();

-- ---------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notificar_pedido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_anterior text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM v_anterior THEN
    RETURN NULL;
  END IF;

  -- Pedido novo feito pelo aluno: avisa a equipe (pedidos de teste não)
  IF TG_OP = 'INSERT' AND NEW.status = 'pendente' AND NEW.origem = 'aluno' AND NOT NEW.teste THEN
    PERFORM public.notificar_admins(
      'pedido_novo',
      'Novo pedido aguardando pagamento',
      format('%s: %s, %s, %s.', NEW.codigo, NEW.comprador_nome, NEW.plano_nome,
             public.formatar_reais(NEW.valor_total)),
      '/admin/pagamentos',
      'pedido:' || NEW.id);
  END IF;

  IF NEW.status = 'pago' THEN
    PERFORM public.notificar(
      NEW.user_id,
      'pedido_pago',
      'Pagamento confirmado',
      format('Pedido %s: seu acesso aos simulados completos está liberado até %s.',
             NEW.codigo, to_char(NEW.validade_concedida, 'DD/MM/YYYY')),
      '/planos',
      'pedido:' || NEW.id || ':pago');
  ELSIF NEW.status = 'cancelado' AND NEW.cancelado_por IS DISTINCT FROM NEW.user_id THEN
    -- Quem cancelou o próprio pedido (ou trocou de plano) não precisa de aviso
    PERFORM public.notificar(
      NEW.user_id,
      'pedido_cancelado',
      'Pedido cancelado',
      format('O pedido %s foi cancelado.%s', NEW.codigo,
             CASE WHEN NULLIF(btrim(NEW.motivo_cancelamento), '') IS NOT NULL
                  THEN ' Motivo: ' || btrim(NEW.motivo_cancelamento) ELSE '' END),
      '/planos',
      'pedido:' || NEW.id || ':cancelado');
  ELSIF NEW.status = 'expirado' THEN
    PERFORM public.notificar(
      NEW.user_id,
      'pedido_expirado',
      'Prazo do pedido vencido',
      format('O prazo para pagar o pedido %s terminou. Se você já pagou, não faça outro pedido: fale com a ABRACAM informando o código.', NEW.codigo),
      '/planos',
      'pedido:' || NEW.id || ':expirado');
  ELSIF NEW.status = 'estornado' THEN
    PERFORM public.notificar(
      NEW.user_id,
      'pedido_estornado',
      'Pedido estornado',
      format('O pedido %s foi estornado.%s', NEW.codigo,
             CASE WHEN NEW.acesso_removido THEN ' O acesso liberado por ele foi retirado.' ELSE '' END),
      '/planos',
      'pedido:' || NEW.id || ':estornado');
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Aviso de pedido não gravado: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS pedidos_notificar ON public.pedidos;
CREATE TRIGGER pedidos_notificar
  AFTER INSERT OR UPDATE OF status ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.notificar_pedido();

-- ---------------------------------------------------------------------
-- Materiais em PDF: material novo publicado avisa todos os usuários
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notificar_material()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.ativo THEN
    INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem, link, ref)
    SELECT p.id, 'material_novo', 'Novo material disponível',
           left(format('“%s” já pode ser baixado na página PDFs.', NEW.titulo), 1000),
           '/pdfs', 'material:' || NEW.id
      FROM public.profiles p
     WHERE p.id IS DISTINCT FROM NEW.created_by
    ON CONFLICT (user_id, tipo, ref) DO NOTHING;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Aviso de material não gravado: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS materiais_notificar ON public.materiais;
CREATE TRIGGER materiais_notificar
  AFTER INSERT ON public.materiais
  FOR EACH ROW EXECUTE FUNCTION public.notificar_material();

-- Material ocultado ou excluído: o aviso "já pode ser baixado" deixa de valer
CREATE OR REPLACE FUNCTION public.retirar_aviso_material()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (OLD.ativo AND NOT NEW.ativo) THEN
    DELETE FROM public.notificacoes
     WHERE tipo = 'material_novo' AND ref = 'material:' || OLD.id;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Aviso de material não retirado: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS materiais_retirar_aviso ON public.materiais;
CREATE TRIGGER materiais_retirar_aviso
  AFTER DELETE OR UPDATE OF ativo ON public.materiais
  FOR EACH ROW EXECUTE FUNCTION public.retirar_aviso_material();

-- ---------------------------------------------------------------------
-- Ninguém chama essas funções diretamente (nem pela API): só os gatilhos.
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.formatar_reais(integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notificar(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notificar_admins(text, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.nome_para_aviso(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notificar_chamado() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notificar_reporte() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notificar_pedido() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notificar_material() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.retirar_aviso_material() FROM PUBLIC, anon, authenticated, service_role;
