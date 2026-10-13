-- =====================================================================
-- Planos por pacote de simulados (por quantidade).
-- 1. Plano com tipo de acesso "pacote" e a quantidade de simulados
--    (ex.: 3, 5, 10). A duração não se aplica ao pacote.
-- 2. O aluno tem um saldo de simulados (profiles.creditos_simulados), que
--    não vence. Pagamento confirmado de um pacote soma ao saldo; o estorno
--    tira os simulados ainda não usados.
-- 3. Cada simulado completo (ABT1, ABT2 ou ABT – Correspondentes) iniciado
--    por quem não tem plano por tempo ativo consome 1 do saldo, mesmo que
--    não seja finalizado (a prova não pode ser pausada).
-- 4. Toda entrada e saída do saldo fica em movimentos_creditos (extrato).
-- 5. O admin pode ajustar o saldo na ficha do aluno, com observação.
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Planos e pedidos: tipo "pacote"
-- ---------------------------------------------------------------------
ALTER TABLE public.planos ADD COLUMN IF NOT EXISTS quantidade_simulados integer;
ALTER TABLE public.planos DROP CONSTRAINT IF EXISTS planos_tipo_acesso_check;
ALTER TABLE public.planos ADD CONSTRAINT planos_tipo_acesso_check
  CHECK (tipo_acesso IN ('mensal', 'anual', 'pacote'));
ALTER TABLE public.planos DROP CONSTRAINT IF EXISTS planos_pacote_quantidade;
ALTER TABLE public.planos ADD CONSTRAINT planos_pacote_quantidade CHECK (
  (tipo_acesso = 'pacote') = (quantidade_simulados IS NOT NULL)
  AND (quantidade_simulados IS NULL OR quantidade_simulados BETWEEN 1 AND 500));

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS plano_quantidade_simulados integer,
  ADD COLUMN IF NOT EXISTS creditos_concedidos integer,
  ADD COLUMN IF NOT EXISTS creditos_removidos integer;
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_plano_tipo_acesso_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_plano_tipo_acesso_check
  CHECK (plano_tipo_acesso IN ('mensal', 'anual', 'pacote'));
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_pacote_quantidade;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_pacote_quantidade CHECK (
  (plano_tipo_acesso = 'pacote') = (plano_quantidade_simulados IS NOT NULL)
  AND (plano_quantidade_simulados IS NULL OR plano_quantidade_simulados > 0));
-- Pedido pago: o plano por tempo grava a validade concedida; o pacote, os simulados concedidos
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_pago_liberado;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_pago_liberado CHECK (
  status NOT IN ('pago', 'estornado')
  OR (liberado_em IS NOT NULL AND (
        (plano_tipo_acesso <> 'pacote' AND validade_concedida IS NOT NULL AND dias_concedidos IS NOT NULL)
     OR (plano_tipo_acesso = 'pacote' AND creditos_concedidos IS NOT NULL))));

-- ---------------------------------------------------------------------
-- Saldo de simulados do aluno (só o servidor grava)
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS creditos_simulados integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_creditos_simulados_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_creditos_simulados_check
  CHECK (creditos_simulados >= 0);

CREATE TABLE IF NOT EXISTS public.movimentos_creditos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quantidade   integer NOT NULL CHECK (quantidade <> 0),
  saldo_depois integer NOT NULL CHECK (saldo_depois >= 0),
  origem       text NOT NULL CHECK (origem IN ('pedido', 'estorno', 'simulado', 'admin')),
  pedido_id    uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  simulado_id  uuid REFERENCES public.simulados(id) ON DELETE SET NULL,
  feito_por    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  observacao   text CHECK (observacao IS NULL OR char_length(observacao) <= 500),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS movimentos_creditos_usuario_idx
  ON public.movimentos_creditos (user_id, created_at DESC);
-- Um simulado consome no máximo um crédito
CREATE UNIQUE INDEX IF NOT EXISTS movimentos_creditos_um_por_simulado
  ON public.movimentos_creditos (simulado_id) WHERE origem = 'simulado';

ALTER TABLE public.movimentos_creditos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.movimentos_creditos FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.movimentos_creditos TO service_role;

-- Campo do pedido que não muda depois de criado
CREATE OR REPLACE FUNCTION public.pedidos_antes_de_alterar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'pendente' AND NEW.status IN ('pago', 'cancelado', 'expirado'))
    OR (OLD.status IN ('cancelado', 'expirado') AND NEW.status = 'pago')
    OR (OLD.status = 'pago' AND NEW.status = 'estornado')
  ) THEN
    RAISE EXCEPTION 'Mudança de situação do pedido não permitida: % para %.', OLD.status, NEW.status;
  END IF;

  IF NEW.codigo IS DISTINCT FROM OLD.codigo
     OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
     OR NEW.plano_id IS DISTINCT FROM OLD.plano_id
     OR NEW.plano_nome IS DISTINCT FROM OLD.plano_nome
     OR NEW.plano_tipo_acesso IS DISTINCT FROM OLD.plano_tipo_acesso
     OR NEW.plano_duracao_quantidade IS DISTINCT FROM OLD.plano_duracao_quantidade
     OR NEW.plano_duracao_unidade IS DISTINCT FROM OLD.plano_duracao_unidade
     OR NEW.plano_quantidade_simulados IS DISTINCT FROM OLD.plano_quantidade_simulados
     OR NEW.valor_total IS DISTINCT FROM OLD.valor_total
     OR NEW.comprador_documento IS DISTINCT FROM OLD.comprador_documento
     OR NEW.comprador_tipo IS DISTINCT FROM OLD.comprador_tipo
     OR NEW.origem IS DISTINCT FROM OLD.origem
     OR NEW.chave_venda IS DISTINCT FROM OLD.chave_venda
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (NEW.user_id IS DISTINCT FROM OLD.user_id AND NEW.user_id IS NOT NULL)
  THEN
    RAISE EXCEPTION 'Os dados de um pedido não podem ser alterados depois de criado.';
  END IF;

  -- Conta apagada: o registro de venda fica, sem o e-mail de contato.
  IF NEW.user_id IS NULL AND OLD.user_id IS NOT NULL THEN
    NEW.comprador_email := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- Pedido guarda a quantidade do pacote (retrato do plano)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_pedido(
  p_user           uuid,
  p_plano          uuid,
  p_metodo         text,
  p_comprador_tipo text DEFAULT 'cpf',
  p_origem         text DEFAULT 'aluno',
  p_por            uuid DEFAULT NULL,
  p_prazo_dias     integer DEFAULT 3,
  p_valor          integer DEFAULT NULL,
  p_chave          uuid DEFAULT NULL,
  -- O que a página mostrava ao aluno: código do pedido pendente e se ele seria mantido
  p_pendente_esperado text DEFAULT NULL,
  p_manter_esperado   boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_perfil  record;
  v_plano   record;
  v_pend    record;
  v_doc     text;
  v_nome    text;
  v_valor   integer;
  v_valor_cheio integer;
  v_assoc   uuid;
  v_cliente uuid;
  v_pedido  record;
  v_teste   boolean;
  v_tem_pend boolean;
  v_reusar  boolean := false;
BEGIN
  IF p_origem NOT IN ('aluno', 'admin') THEN
    RAISE EXCEPTION 'Origem do pedido inválida.';
  END IF;
  IF p_metodo IS NULL OR p_metodo NOT IN ('pix', 'cartao', 'boleto', 'transferencia', 'outro') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida.';
  END IF;
  IF p_origem = 'aluno' AND p_valor IS NOT NULL THEN
    RAISE EXCEPTION 'O valor do pedido vem do plano.';
  END IF;

  SELECT nome_completo, email, cpf, cnpj, instituicao, plano, plano_validade, cadastro_completo_em,
         associado_id
    INTO v_perfil
    FROM public.profiles WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta não encontrada.';
  END IF;
  IF v_perfil.plano = 'inativo' THEN
    RAISE EXCEPTION 'Esta conta está bloqueada. Fale com a ABRACAM.';
  END IF;
  IF v_perfil.cpf IS NULL OR (p_origem = 'aluno' AND v_perfil.cadastro_completo_em IS NULL) THEN
    RAISE EXCEPTION 'Complete o cadastro (nome e CPF) antes de contratar um plano.';
  END IF;

  IF p_comprador_tipo = 'cnpj' THEN
    IF v_perfil.cnpj IS NULL THEN
      RAISE EXCEPTION 'Não há CNPJ no cadastro desta conta.';
    END IF;
    v_doc := v_perfil.cnpj;
    v_nome := COALESCE(NULLIF(btrim(v_perfil.instituicao), ''), v_perfil.nome_completo);
  ELSIF p_comprador_tipo = 'cpf' THEN
    v_doc := v_perfil.cpf;
    v_nome := v_perfil.nome_completo;
  ELSE
    RAISE EXCEPTION 'Tipo de comprador inválido.';
  END IF;
  IF v_nome IS NULL OR btrim(v_nome) = '' THEN
    RAISE EXCEPTION 'Complete o cadastro (nome) antes de contratar um plano.';
  END IF;

  SELECT * INTO v_plano FROM public.planos WHERE id = p_plano;
  IF NOT FOUND OR (p_origem = 'aluno' AND NOT v_plano.ativo) THEN
    RAISE EXCEPTION 'Este plano não está disponível.';
  END IF;
  v_valor_cheio := COALESCE(p_valor, v_plano.preco_centavos);
  v_valor := v_valor_cheio;
  -- Associado ABRACAM (validado por CNPJ + domínio do e-mail) paga o preço de associado,
  -- quando o plano tiver um. Na venda registrada pelo admin, vale o valor informado por ele.
  IF p_origem = 'aluno' AND v_perfil.associado_id IS NOT NULL
     AND v_plano.preco_associado_centavos IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.associados a WHERE a.id = v_perfil.associado_id AND a.ativo) THEN
    v_valor := v_plano.preco_associado_centavos;
    v_assoc := v_perfil.associado_id;
  END IF;
  IF v_valor IS NULL OR v_valor <= 0 THEN
    RAISE EXCEPTION 'O plano está sem preço definido.';
  END IF;

  -- Pendentes vencidos saem do caminho
  PERFORM public.expirar_pedidos_vencidos(p_user);

  -- Pedido pendente: reaproveita se for o mesmo plano, preço e comprador;
  -- senão, é substituído pelo novo.
  SELECT * INTO v_pend FROM public.pedidos
   WHERE user_id = p_user AND status = 'pendente' FOR UPDATE;
  v_tem_pend := FOUND;
  IF v_tem_pend THEN
    v_reusar := p_origem = 'aluno'
       AND v_pend.plano_id = v_plano.id
       AND v_pend.valor_total = v_valor
       AND v_pend.plano_tipo_acesso = v_plano.tipo_acesso
       AND v_pend.plano_duracao_quantidade = v_plano.duracao_quantidade
       AND v_pend.plano_duracao_unidade = v_plano.duracao_unidade
       AND v_pend.plano_quantidade_simulados IS NOT DISTINCT FROM v_plano.quantidade_simulados
       AND v_pend.comprador_documento = v_doc;
  END IF;
  -- A página prometeu manter um pedido que o banco não manteria, ou há um pendente que o
  -- aluno não viu (seria cancelado em silêncio): recusa para ele conferir antes de pagar.
  IF p_origem = 'aluno' AND p_manter_esperado IS NOT NULL
     AND ((p_manter_esperado AND NOT v_reusar)
          OR (v_tem_pend AND v_pend.codigo IS DISTINCT FROM p_pendente_esperado)) THEN
    RAISE EXCEPTION 'Seus pedidos mudaram desde que a página foi aberta. Confira em Meus pedidos antes de fazer outro.';
  END IF;
  IF v_tem_pend THEN
    IF v_reusar THEN
      IF v_pend.metodo_pagamento IS DISTINCT FROM p_metodo THEN
        UPDATE public.pedidos SET metodo_pagamento = p_metodo WHERE id = v_pend.id;
        UPDATE public.pagamentos SET metodo_pagamento = p_metodo
         WHERE pedido_id = v_pend.id AND status = 'pendente';
      END IF;
      RETURN jsonb_build_object('pedido_id', v_pend.id, 'codigo', v_pend.codigo,
                                'reaproveitado', true);
    END IF;
    UPDATE public.pagamentos SET status = 'cancelado'
     WHERE pedido_id = v_pend.id AND status = 'pendente';
    UPDATE public.pedidos
       SET status = 'cancelado', cancelado_em = now(), cancelado_por = p_por,
           motivo_cancelamento = CASE WHEN p_origem = 'admin'
                                      THEN 'Substituído por uma venda registrada pela ABRACAM.'
                                      ELSE 'Substituído por um novo pedido.' END
     WHERE id = v_pend.id;
  END IF;

  INSERT INTO public.clientes (user_id, nome, email, cpf_cnpj)
  VALUES (p_user, v_nome, v_perfil.email, v_doc)
  ON CONFLICT (user_id, cpf_cnpj) WHERE user_id IS NOT NULL
  DO UPDATE SET nome = EXCLUDED.nome, email = EXCLUDED.email
  RETURNING id INTO v_cliente;

  v_teste := EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user AND role = 'admin');

  INSERT INTO public.pedidos (
    cliente_id, user_id, plano_id, plano_nome, plano_tipo_acesso, plano_duracao_quantidade,
    plano_duracao_unidade, valor_total, gateway, metodo_pagamento, comprador_nome,
    comprador_email, comprador_documento, comprador_tipo, origem, teste, criado_por, expira_em,
    chave_venda, desconto_associado, associado_id, valor_sem_desconto, plano_quantidade_simulados)
  VALUES (
    v_cliente, p_user, v_plano.id, v_plano.nome, v_plano.tipo_acesso, v_plano.duracao_quantidade,
    v_plano.duracao_unidade, v_valor, 'manual', p_metodo, v_nome,
    v_perfil.email, v_doc, p_comprador_tipo, p_origem, v_teste, COALESCE(p_por, p_user),
    CASE WHEN p_origem = 'aluno' AND COALESCE(p_prazo_dias, 0) > 0
         THEN now() + make_interval(days => p_prazo_dias) END,
    p_chave, v_assoc IS NOT NULL, v_assoc,
    CASE WHEN v_assoc IS NOT NULL THEN v_valor_cheio END,
    CASE WHEN v_plano.tipo_acesso = 'pacote' THEN v_plano.quantidade_simulados END)
  RETURNING id, codigo INTO v_pedido;

  -- Tentativa de pagamento aguardando (o aluno paga por fora na Etapa 1)
  IF p_origem = 'aluno' THEN
    INSERT INTO public.pagamentos (pedido_id, gateway, metodo_pagamento, valor, status)
    VALUES (v_pedido.id, 'manual', p_metodo, v_valor, 'pendente');
  END IF;

  RETURN jsonb_build_object('pedido_id', v_pedido.id, 'codigo', v_pedido.codigo,
                            'reaproveitado', false);
END;
$$;

-- ---------------------------------------------------------------------
-- Pagamento confirmado: pacote soma ao saldo; plano por tempo, como antes
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_pagamento_pedido(
  p_pedido                  uuid,
  p_origem                  text,
  p_gateway                 text,
  p_metodo                  text,
  p_valor                   integer,
  p_por                     uuid DEFAULT NULL,
  p_pago_em                 timestamptz DEFAULT now(),
  p_parcelas                integer DEFAULT 1,
  p_external_payment_id     text DEFAULT NULL,
  p_pagamento_id            uuid DEFAULT NULL,
  p_metadata                jsonb DEFAULT '{}'::jsonb,
  p_aceitar_valor_diferente boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid;
  v_ped        record;
  v_perfil     record;
  v_tem_perfil boolean := false;
  v_pag        record;
  v_pag_id     uuid;
  v_ja_pago    boolean := false;
  v_valor      integer;
  v_metodo     text := p_metodo;
  v_motivo     text;
  v_alerta     text;
  v_hoje       date := public.hoje_sao_paulo();
  v_ativo      boolean;
  v_base       date;
  v_nova       date;
  v_plano      text;
  v_nome       text;
  v_ids        uuid[];
  v_codigos    text[];
  v_saldo      integer;
  v_pacote     boolean;
BEGIN
  IF p_origem NOT IN ('admin', 'gateway') THEN
    RAISE EXCEPTION 'Origem inválida.';
  END IF;
  IF p_gateway NOT IN ('manual', 'pagarme') THEN
    RAISE EXCEPTION 'Gateway inválido.';
  END IF;
  IF p_metodo IS NULL OR p_metodo NOT IN ('pix', 'cartao', 'boleto', 'transferencia', 'outro') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida.';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'Informe o valor recebido.';
  END IF;
  IF p_pago_em IS NULL OR p_pago_em > now() + interval '10 minutes' THEN
    RAISE EXCEPTION 'A data do pagamento não pode ser no futuro.';
  END IF;

  -- Travas na ordem perfil → pedido → pagamentos (a mesma das outras funções)
  SELECT user_id INTO v_uid FROM public.pedidos WHERE id = p_pedido;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;
  IF v_uid IS NOT NULL THEN
    SELECT plano, plano_validade, plano_nome, creditos_simulados INTO v_perfil
      FROM public.profiles WHERE id = v_uid FOR UPDATE;
    v_tem_perfil := FOUND;
  END IF;
  SELECT * INTO v_ped FROM public.pedidos WHERE id = p_pedido FOR UPDATE;

  -- Mesmo aviso do gateway chegando de novo (inclusive ao mesmo tempo): nada a fazer
  IF p_external_payment_id IS NOT NULL THEN
    SELECT id, pedido_id, status INTO v_pag FROM public.pagamentos
     WHERE gateway = p_gateway AND external_payment_id = p_external_payment_id FOR UPDATE;
    IF FOUND THEN
      IF v_pag.pedido_id <> p_pedido THEN
        RAISE EXCEPTION 'Este pagamento do gateway pertence a outro pedido.';
      END IF;
      IF v_pag.status IN ('pago', 'estornado') THEN
        RETURN jsonb_build_object('situacao', 'ja_registrado', 'pagamento_id', v_pag.id);
      END IF;
      v_pag_id := v_pag.id;
    END IF;
  END IF;

  IF p_pagamento_id IS NOT NULL THEN
    SELECT id, status, valor, metodo_pagamento, requer_revisao INTO v_pag FROM public.pagamentos
     WHERE id = p_pagamento_id AND pedido_id = p_pedido FOR UPDATE;
    IF NOT FOUND OR (v_pag_id IS NOT NULL AND v_pag_id <> v_pag.id) THEN
      RAISE EXCEPTION 'Tentativa de pagamento não pertence ao pedido.';
    END IF;
    v_pag_id := v_pag.id;
    IF v_pag.status = 'pago' THEN
      -- Pagamento já recebido (em revisão ou revisado): libera com ele, sem gravar outro
      v_ja_pago := true;
      v_metodo := v_pag.metodo_pagamento;
    ELSIF v_pag.status = 'estornado' THEN
      RAISE EXCEPTION 'Este pagamento foi estornado.';
    END IF;
  ELSIF p_origem = 'admin' AND v_pag_id IS NULL AND v_ped.status NOT IN ('pago', 'estornado')
        AND EXISTS (SELECT 1 FROM public.pagamentos WHERE pedido_id = p_pedido AND status = 'pago') THEN
    RAISE EXCEPTION 'Este pedido já tem um pagamento recebido. Use "Liberar acesso com este pagamento" nele, em vez de registrar outro.';
  END IF;
  IF v_ja_pago THEN
    v_valor := v_pag.valor;
  ELSE
    v_valor := p_valor;
  END IF;

  -- Pode liberar o acesso?
  IF v_ped.status = 'pago' THEN
    v_motivo := 'O pedido já estava pago: pagamento em duplicidade.';
  ELSIF v_ped.status = 'estornado' THEN
    v_motivo := 'O pedido já tinha sido estornado.';
  ELSIF v_ped.status IN ('cancelado', 'expirado') AND p_origem = 'gateway' THEN
    v_motivo := 'Pagamento recebido em pedido ' || v_ped.status || '.';
  ELSIF v_valor < v_ped.valor_total AND NOT (p_origem = 'admin' AND p_aceitar_valor_diferente) THEN
    v_motivo := 'Valor recebido menor que o do pedido.';
  ELSIF v_valor > v_ped.valor_total AND p_origem = 'admin' AND NOT p_aceitar_valor_diferente THEN
    v_motivo := 'Valor recebido maior que o do pedido.';
  ELSIF v_ped.user_id IS NULL OR v_ped.user_id IS DISTINCT FROM v_uid OR NOT v_tem_perfil THEN
    v_motivo := 'A conta do aluno não existe mais.';
  ELSIF v_perfil.plano = 'inativo' THEN
    v_motivo := 'A conta do aluno está bloqueada.';
  END IF;

  IF v_motivo IS NOT NULL AND p_origem = 'admin' THEN
    RAISE EXCEPTION '%', v_motivo || CASE
      WHEN v_motivo LIKE '%bloqueada%' THEN ' Desbloqueie em Usuários e planos antes de confirmar.'
      WHEN v_motivo LIKE 'Valor%' THEN ' Confira o valor e, se estiver certo, marque a opção de aceitar valor diferente, com observação.'
      ELSE '' END;
  END IF;
  -- Pelo gateway, valor a mais libera, mas fica sinalizado para devolver a diferença
  IF v_motivo IS NULL AND v_valor > v_ped.valor_total AND p_origem = 'gateway' THEN
    v_alerta := 'Valor recebido maior que o do pedido: verifique a devolução da diferença.';
  END IF;

  -- Registra o pagamento: a tentativa informada, a do mesmo id no gateway,
  -- a tentativa manual aguardando deste pedido ou uma nova linha.
  IF v_ja_pago THEN
    UPDATE public.pagamentos
       SET revisao_resolvida_em = CASE WHEN requer_revisao THEN now() ELSE revisao_resolvida_em END,
           revisao_resolvida_por = CASE WHEN requer_revisao THEN p_por ELSE revisao_resolvida_por END,
           requer_revisao = false, motivo_revisao = NULL,
           metadata = metadata || COALESCE(p_metadata, '{}'::jsonb)
     WHERE id = v_pag_id;
  ELSE
    IF v_pag_id IS NULL AND v_motivo IS NULL THEN
      SELECT id INTO v_pag_id FROM public.pagamentos
       WHERE pedido_id = p_pedido AND status IN ('pendente', 'cancelado', 'falhou')
         AND gateway = p_gateway AND external_payment_id IS NULL
       ORDER BY (status = 'pendente') DESC, created_at DESC
       LIMIT 1 FOR UPDATE;
    END IF;
    IF v_pag_id IS NULL THEN
      INSERT INTO public.pagamentos (pedido_id, gateway, metodo_pagamento, valor, parcelas, status,
                                     external_payment_id, paid_at, metadata, registrado_por,
                                     requer_revisao, motivo_revisao)
      VALUES (p_pedido, p_gateway, p_metodo, p_valor, COALESCE(p_parcelas, 1), 'pago',
              p_external_payment_id, p_pago_em, COALESCE(p_metadata, '{}'::jsonb), p_por,
              COALESCE(v_motivo, v_alerta) IS NOT NULL, COALESCE(v_motivo, v_alerta))
      RETURNING id INTO v_pag_id;
    ELSE
      UPDATE public.pagamentos
         SET status = 'pago', metodo_pagamento = p_metodo, valor = p_valor,
             parcelas = COALESCE(p_parcelas, 1),
             external_payment_id = COALESCE(p_external_payment_id, external_payment_id),
             paid_at = p_pago_em, metadata = metadata || COALESCE(p_metadata, '{}'::jsonb),
             registrado_por = p_por, requer_revisao = COALESCE(v_motivo, v_alerta) IS NOT NULL,
             motivo_revisao = COALESCE(v_motivo, v_alerta)
       WHERE id = v_pag_id;
    END IF;
  END IF;

  IF v_motivo IS NOT NULL THEN
    RETURN jsonb_build_object('situacao', 'revisao', 'motivo', v_motivo, 'pagamento_id', v_pag_id);
  END IF;

  v_pacote := v_ped.plano_tipo_acesso = 'pacote';
  IF v_pacote THEN
    -- Pacote de simulados: soma ao saldo; o plano por tempo (se houver) não muda
    UPDATE public.profiles
       SET creditos_simulados = creditos_simulados + v_ped.plano_quantidade_simulados
     WHERE id = v_uid
    RETURNING creditos_simulados INTO v_saldo;
    INSERT INTO public.movimentos_creditos (user_id, quantidade, saldo_depois, origem, pedido_id,
                                            feito_por, observacao)
    VALUES (v_uid, v_ped.plano_quantidade_simulados, v_saldo, 'pedido', p_pedido, p_por,
            'Pagamento do pedido ' || v_ped.codigo);
  ELSE
    -- Libera o acesso
    v_ativo := v_perfil.plano IN ('mensal', 'anual') AND v_perfil.plano_validade IS NOT NULL
               AND v_perfil.plano_validade >= v_hoje;
    v_base := CASE WHEN v_ativo THEN v_perfil.plano_validade ELSE v_hoje - 1 END;
    v_nova := public.calcular_nova_validade(v_perfil.plano, v_perfil.plano_validade,
                                            v_ped.plano_duracao_quantidade, v_ped.plano_duracao_unidade);
    -- Quem tem o anual ativo e compra um período mensal continua como anual
    IF v_ativo AND v_perfil.plano = 'anual' AND v_ped.plano_tipo_acesso = 'mensal' THEN
      v_plano := 'anual';
      v_nome := COALESCE(v_perfil.plano_nome, 'Anual');
    ELSE
      v_plano := v_ped.plano_tipo_acesso;
      v_nome := v_ped.plano_nome;
    END IF;

    UPDATE public.profiles
       SET plano = v_plano, plano_validade = v_nova, plano_nome = v_nome
     WHERE id = v_uid;
  END IF;

  UPDATE public.pagamentos SET status = 'cancelado'
   WHERE pedido_id = p_pedido AND status = 'pendente' AND id <> v_pag_id;

  IF v_pacote THEN
    UPDATE public.pedidos
       SET status = 'pago', metodo_pagamento = v_metodo, liberado_em = now(), liberado_por = p_por,
           plano_anterior = v_perfil.plano, validade_anterior = v_perfil.plano_validade,
           plano_nome_anterior = v_perfil.plano_nome, plano_concedido = 'pacote',
           creditos_concedidos = v_ped.plano_quantidade_simulados
     WHERE id = p_pedido;
  ELSE
    UPDATE public.pedidos
       SET status = 'pago', metodo_pagamento = v_metodo, liberado_em = now(), liberado_por = p_por,
           plano_anterior = v_perfil.plano, validade_anterior = v_perfil.plano_validade,
           plano_nome_anterior = v_perfil.plano_nome, plano_concedido = v_plano,
           validade_concedida = v_nova, dias_concedidos = v_nova - v_base
     WHERE id = p_pedido;
  END IF;

  -- Outro pedido do aluno aguardando pagamento (só existe se este estava
  -- cancelado ou vencido) é cancelado para não ser pago de novo.
  WITH canc AS (
    UPDATE public.pedidos
       SET status = 'cancelado', cancelado_em = now(), cancelado_por = p_por,
           motivo_cancelamento = 'Pagamento confirmado no pedido ' || v_ped.codigo || '.'
     WHERE user_id = v_uid AND status = 'pendente' AND id <> p_pedido
    RETURNING id, codigo)
  SELECT array_agg(id), array_agg(codigo) INTO v_ids, v_codigos FROM canc;
  IF v_ids IS NOT NULL THEN
    UPDATE public.pagamentos SET status = 'cancelado'
     WHERE pedido_id = ANY (v_ids) AND status = 'pendente';
  END IF;

  IF v_pacote THEN
    RETURN jsonb_build_object('situacao', 'liberado', 'pagamento_id', v_pag_id, 'plano', 'pacote',
                              'creditos', v_ped.plano_quantidade_simulados, 'saldo', v_saldo,
                              'alerta', v_alerta,
                              'pedidos_cancelados', COALESCE(to_jsonb(v_codigos), '[]'::jsonb));
  END IF;

  INSERT INTO public.historico_acesso (user_id, origem, pedido_id, plano_antes, validade_antes,
                                       plano_depois, validade_depois, feito_por, observacao)
  VALUES (v_uid, 'pedido', p_pedido, v_perfil.plano, v_perfil.plano_validade, v_plano, v_nova,
          p_por, 'Pagamento do pedido ' || v_ped.codigo);

  RETURN jsonb_build_object('situacao', 'liberado', 'pagamento_id', v_pag_id, 'plano', v_plano,
                            'validade_anterior', v_perfil.plano_validade, 'validade', v_nova,
                            'dias', v_nova - v_base, 'alerta', v_alerta,
                            'pedidos_cancelados', COALESCE(to_jsonb(v_codigos), '[]'::jsonb));
END;
$$;

-- ---------------------------------------------------------------------
-- Estorno: pacote tira do saldo os simulados não usados
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.estornar_pedido(
  p_pedido         uuid,
  p_por            uuid,
  p_remover_acesso boolean,
  p_motivo         text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid;
  v_ped        record;
  v_perfil     record;
  v_tem_perfil boolean := false;
  v_hoje       date := public.hoje_sao_paulo();
  v_rem        integer;
  v_plano      text;
  v_nome       text;
  v_antes      date;
  v_nova       date;
  v_modo       text := 'nada';
  v_cred       integer := 0;
  v_saldo      integer;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Informe o motivo do estorno.';
  END IF;
  SELECT user_id INTO v_uid FROM public.pedidos WHERE id = p_pedido;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;
  IF v_uid IS NOT NULL THEN
    SELECT plano, plano_validade, plano_nome, creditos_simulados INTO v_perfil
      FROM public.profiles WHERE id = v_uid FOR UPDATE;
    v_tem_perfil := FOUND;
  END IF;
  SELECT * INTO v_ped FROM public.pedidos WHERE id = p_pedido FOR UPDATE;
  IF v_ped.status <> 'pago' THEN
    RAISE EXCEPTION 'Só é possível estornar um pedido pago.';
  END IF;

  IF v_ped.plano_tipo_acesso = 'pacote' THEN
    -- Pacote: tira do saldo os simulados ainda não usados (os já feitos não voltam)
    v_rem := 0;
    IF p_remover_acesso AND v_tem_perfil AND v_ped.user_id = v_uid THEN
      v_cred := LEAST(COALESCE(v_ped.creditos_concedidos, 0), v_perfil.creditos_simulados);
      IF v_cred > 0 THEN
        UPDATE public.profiles SET creditos_simulados = creditos_simulados - v_cred
         WHERE id = v_uid
        RETURNING creditos_simulados INTO v_saldo;
        INSERT INTO public.movimentos_creditos (user_id, quantidade, saldo_depois, origem, pedido_id,
                                                feito_por, observacao)
        VALUES (v_uid, -v_cred, v_saldo, 'estorno', p_pedido, p_por,
                left('Estorno do pedido ' || v_ped.codigo || ': ' || btrim(p_motivo), 500));
        v_modo := 'creditos';
      END IF;
    END IF;
    UPDATE public.pagamentos SET status = 'estornado'
     WHERE pedido_id = p_pedido AND status = 'pago';
    UPDATE public.pedidos
       SET status = 'estornado', estornado_em = now(), estornado_por = p_por,
           motivo_estorno = left(btrim(p_motivo), 500), acesso_removido = (v_modo <> 'nada'),
           creditos_removidos = v_cred
     WHERE id = p_pedido;
    RETURN jsonb_build_object('acesso_removido', v_modo <> 'nada', 'modo', v_modo,
                              'dias_nao_usados', 0, 'creditos_removidos', v_cred,
                              'saldo', COALESCE(v_saldo, v_perfil.creditos_simulados),
                              'plano', NULL, 'validade_anterior', NULL, 'validade', NULL);
  END IF;

  -- Dias deste pedido ainda não usados (os já usados não voltam)
  v_rem := GREATEST(0, LEAST(COALESCE(v_ped.dias_concedidos, 0),
                             v_ped.validade_concedida - (v_hoje - 1)));

  IF p_remover_acesso AND v_tem_perfil AND v_ped.user_id = v_uid THEN
    v_antes := v_perfil.plano_validade;
    IF v_perfil.plano IS NOT DISTINCT FROM v_ped.plano_concedido
       AND v_perfil.plano_validade IS NOT DISTINCT FROM v_ped.validade_concedida THEN
      -- Ninguém mexeu no acesso depois deste pedido: volta ao que era antes dele
      v_plano := COALESCE(v_ped.plano_anterior, 'gratis');
      v_nova := CASE WHEN v_plano IN ('mensal', 'anual') THEN v_ped.validade_anterior END;
      v_nome := CASE WHEN v_plano IN ('mensal', 'anual') THEN v_ped.plano_nome_anterior END;
      UPDATE public.profiles SET plano = v_plano, plano_validade = v_nova, plano_nome = v_nome
       WHERE id = v_uid;
      v_modo := 'restaurado';
    ELSIF v_rem > 0 AND v_perfil.plano IN ('mensal', 'anual') AND v_perfil.plano_validade IS NOT NULL THEN
      -- O acesso mudou depois (outra compra ou ajuste): tira só os dias não usados deste pedido
      v_plano := v_perfil.plano;
      v_nova := v_perfil.plano_validade - v_rem;
      UPDATE public.profiles SET plano_validade = v_nova WHERE id = v_uid;
      v_modo := 'dias';
    END IF;
    IF v_modo <> 'nada' THEN
      INSERT INTO public.historico_acesso (user_id, origem, pedido_id, plano_antes, validade_antes,
                                           plano_depois, validade_depois, feito_por, observacao)
      VALUES (v_uid, 'estorno', p_pedido, v_perfil.plano, v_perfil.plano_validade, v_plano, v_nova,
              p_por, left('Estorno do pedido ' || v_ped.codigo || ': ' || btrim(p_motivo)
                          || CASE WHEN v_modo = 'dias'
                                  THEN ' (o acesso tinha mudado depois do pedido; só os dias não usados foram tirados)'
                                  ELSE '' END, 500));
    END IF;
  END IF;

  UPDATE public.pagamentos SET status = 'estornado'
   WHERE pedido_id = p_pedido AND status = 'pago';
  UPDATE public.pedidos
     SET status = 'estornado', estornado_em = now(), estornado_por = p_por,
         motivo_estorno = left(btrim(p_motivo), 500), acesso_removido = (v_modo <> 'nada')
   WHERE id = p_pedido;

  RETURN jsonb_build_object('acesso_removido', v_modo <> 'nada', 'modo', v_modo,
                            'dias_nao_usados', v_rem, 'creditos_removidos', 0, 'plano', v_plano,
                            'validade_anterior', v_antes, 'validade', v_nova);
END;
$$;

-- ---------------------------------------------------------------------
-- Aviso de pagamento confirmado / estorno com o texto do pacote
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
      CASE WHEN NEW.plano_tipo_acesso = 'pacote'
           THEN format('Pedido %s: %s simulado%s adicionado%s ao seu saldo.', NEW.codigo,
                       NEW.creditos_concedidos,
                       CASE WHEN NEW.creditos_concedidos = 1 THEN '' ELSE 's' END,
                       CASE WHEN NEW.creditos_concedidos = 1 THEN '' ELSE 's' END)
           ELSE format('Pedido %s: seu acesso aos simulados completos está liberado até %s.',
                       NEW.codigo, to_char(NEW.validade_concedida, 'DD/MM/YYYY')) END,
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
             CASE WHEN NEW.acesso_removido AND NEW.plano_tipo_acesso = 'pacote'
                  THEN ' Os simulados não usados deste pedido foram retirados do seu saldo.'
                  WHEN NEW.acesso_removido THEN ' O acesso liberado por ele foi retirado.'
                  ELSE '' END),
      '/planos',
      'pedido:' || NEW.id || ':estornado');
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Aviso de pedido não gravado: %', SQLERRM;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------
-- Início de um simulado completo pago com o saldo: tira 1 crédito
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consumir_credito_simulado(p_user uuid, p_simulado uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_saldo integer;
BEGIN
  UPDATE public.profiles SET creditos_simulados = creditos_simulados - 1
   WHERE id = p_user AND creditos_simulados > 0
  RETURNING creditos_simulados INTO v_saldo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Você não tem simulados disponíveis no seu saldo. Veja os pacotes na página Planos.';
  END IF;
  INSERT INTO public.movimentos_creditos (user_id, quantidade, saldo_depois, origem, simulado_id, feito_por)
  VALUES (p_user, -1, v_saldo, 'simulado', p_simulado, p_user);
  RETURN v_saldo;
END;
$$;

-- ---------------------------------------------------------------------
-- Ajuste manual do saldo pelo admin (ex.: compensar um problema técnico)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_ajustar_creditos(
  p_user           uuid,
  p_quantidade     integer,
  p_por            uuid,
  p_observacao     text,
  p_saldo_esperado integer
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_atual integer;
  v_novo  integer;
BEGIN
  IF p_quantidade IS NULL OR p_quantidade = 0 THEN
    RAISE EXCEPTION 'Informe quantos simulados somar ou tirar.';
  END IF;
  IF p_observacao IS NULL OR char_length(btrim(p_observacao)) < 3 THEN
    RAISE EXCEPTION 'Explique o motivo do ajuste.';
  END IF;
  SELECT creditos_simulados INTO v_atual FROM public.profiles WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado.';
  END IF;
  IF v_atual IS DISTINCT FROM p_saldo_esperado THEN
    RAISE EXCEPTION 'O saldo deste aluno mudou desde que a ficha foi aberta. Feche e abra a ficha de novo antes de ajustar.';
  END IF;
  v_novo := v_atual + p_quantidade;
  IF v_novo < 0 THEN
    RAISE EXCEPTION 'O saldo não pode ficar negativo (o aluno tem % simulado(s)).', v_atual;
  END IF;
  IF v_novo > 10000 THEN
    RAISE EXCEPTION 'Saldo muito alto.';
  END IF;
  UPDATE public.profiles SET creditos_simulados = v_novo WHERE id = p_user;
  INSERT INTO public.movimentos_creditos (user_id, quantidade, saldo_depois, origem, feito_por, observacao)
  VALUES (p_user, p_quantidade, v_novo, 'admin', p_por, left(btrim(p_observacao), 500));
  RETURN v_novo;
END;
$$;

REVOKE ALL ON FUNCTION public.consumir_credito_simulado(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_credito_simulado(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.admin_ajustar_creditos(uuid, integer, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ajustar_creditos(uuid, integer, uuid, text, integer) TO service_role;

-- ---------------------------------------------------------------------
-- Lista de usuários do admin: saldo de simulados e filtro "Com saldo"
-- (o retorno mudou, por isso a função é recriada)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_listar_usuarios(text, text, integer, integer);
CREATE OR REPLACE FUNCTION public.admin_listar_usuarios(
  p_busca  text DEFAULT NULL,
  p_filtro text DEFAULT 'todos',
  p_limite integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  user_id           uuid,
  nome              text,
  email             text,
  cpf               text,
  cnpj              text,
  instituicao       text,
  plano             text,
  plano_validade    date,
  acesso_ativo      boolean,
  cadastro_completo boolean,
  is_admin          boolean,
  provedor          text,
  criado_em         timestamptz,
  ultimo_acesso     timestamptz,
  simulados         integer,
  creditos          integer,
  total             bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH hoje AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d
  ),
  termo AS (
    SELECT
      NULLIF(trim(coalesce(p_busca, '')), '') AS texto,
      NULLIF(regexp_replace(coalesce(p_busca, ''), '[^0-9]', '', 'g'), '') AS digitos
  ),
  base AS (
    SELECT
      p.id AS b_id,
      coalesce(p.nome_completo, p.full_name, p.username) AS b_nome,
      coalesce(p.email, u.email) AS b_email,
      p.cpf AS b_cpf,
      p.cnpj AS b_cnpj,
      p.instituicao AS b_instituicao,
      p.plano AS b_plano,
      p.plano_validade AS b_validade,
      (p.plano IN ('mensal', 'anual')
        AND p.plano_validade IS NOT NULL
        AND p.plano_validade >= (SELECT d FROM hoje)) AS b_ativo,
      (p.cadastro_completo_em IS NOT NULL) AS b_completo,
      EXISTS (
        SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'admin'
      ) AS b_admin,
      coalesce(u.raw_app_meta_data->>'provider', 'email') AS b_provedor,
      p.created_at AS b_criado,
      u.last_sign_in_at AS b_ultimo,
      (SELECT count(*)::integer FROM public.simulados s
        WHERE s.user_id = p.id AND s.status = 'finalizado') AS b_simulados,
      p.creditos_simulados AS b_creditos
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
  ),
  filtrada AS (
    SELECT b.*
    FROM base b, termo t, hoje h
    WHERE (
        t.texto IS NULL
        OR b.b_nome ILIKE '%' || t.texto || '%'
        OR b.b_email ILIKE '%' || t.texto || '%'
        OR b.b_instituicao ILIKE '%' || t.texto || '%'
        OR (t.digitos IS NOT NULL AND length(t.digitos) >= 3
            AND (b.b_cpf LIKE '%' || t.digitos || '%' OR b.b_cnpj LIKE '%' || t.digitos || '%'))
      )
      AND CASE coalesce(p_filtro, 'todos')
        WHEN 'ativos' THEN b.b_ativo
        WHEN 'vencendo' THEN b.b_ativo AND b.b_validade <= h.d + 7
        WHEN 'vencidos' THEN b.b_plano IN ('mensal', 'anual') AND NOT b.b_ativo
        WHEN 'sem_plano' THEN b.b_plano = 'inativo' OR (b.b_plano = 'gratis' AND b.b_creditos = 0)
        WHEN 'com_saldo' THEN b.b_creditos > 0
        WHEN 'incompletos' THEN NOT b.b_completo
        WHEN 'admins' THEN b.b_admin
        ELSE true
      END
  )
  SELECT
    f.b_id, f.b_nome, f.b_email, f.b_cpf, f.b_cnpj, f.b_instituicao, f.b_plano,
    f.b_validade, f.b_ativo, f.b_completo, f.b_admin, f.b_provedor, f.b_criado,
    f.b_ultimo, f.b_simulados, f.b_creditos,
    count(*) OVER () AS total
  FROM filtrada f
  ORDER BY f.b_criado DESC
  LIMIT greatest(1, least(coalesce(p_limite, 50), 200))
  OFFSET greatest(0, coalesce(p_offset, 0));
$$;

REVOKE ALL ON FUNCTION public.admin_listar_usuarios(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_listar_usuarios(text, text, integer, integer)
  TO service_role;
