-- =====================================================================
-- Planos à venda, pedidos e pagamentos (Etapa 1: confirmação manual pelo
-- admin, já preparada para ligar o Pagar.me na Etapa 2).
--
-- Modelo pedido pela ABRACAM: CLIENTE (id, nome, email, cpf_cnpj,
-- external_customer_id), PEDIDO (id, cliente_id, codigo, valor_total,
-- status, external_order_id) e PAGAMENTO (id, pedido_id, gateway,
-- metodo_pagamento, valor, status, external_payment_id, created_at,
-- paid_at, metadata), com os campos extras necessários para registro de
-- venda, liberação do acesso, cancelamento, estorno e auditoria.
--
-- Regras principais:
-- - Valores em centavos (inteiro), como na API do Pagar.me.
-- - Só o servidor (service_role) lê e grava; as operações que mexem em
--   dinheiro e acesso são funções atômicas que travam pedido e perfil.
-- - Pagamento recebido nunca é descartado: se não puder liberar o acesso
--   (pedido cancelado, valor menor, conta bloqueada...), fica registrado
--   com "precisa de revisão".
-- - O dia da compra conta: 1 mês comprado hoje vale até a véspera do mesmo
--   dia do mês seguinte (28/09 → 27/10); a renovação começa no dia seguinte
--   ao fim da validade atual.
-- - Travas sempre na ordem perfil → pedido → pagamentos (sem deadlock).
-- Idempotente: pode ser executada mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Utilitários
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hoje_sao_paulo()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date
$$;

-- Nova validade ao somar um período. O período começa no dia seguinte ao fim
-- da validade atual (se o acesso ainda vale) ou hoje (o dia da compra já conta
-- como 1º dia). Dias: N dias corridos. Meses: até a véspera do mesmo dia N
-- meses depois (28/09 → 27/10; 01/03 → 31/03; 31/01 → 28/02, fim do mês).
DROP FUNCTION IF EXISTS public.calcular_nova_validade(text, date, integer, text);
CREATE OR REPLACE FUNCTION public.calcular_nova_validade(
  p_plano_atual    text,
  p_validade_atual date,
  p_quantidade     integer,
  p_unidade        text,
  p_hoje           date DEFAULT NULL
)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hoje   date := COALESCE(p_hoje, public.hoje_sao_paulo());
  v_inicio date;
  v_fim    date;
BEGIN
  IF p_quantidade IS NULL OR p_quantidade < 1 THEN
    RAISE EXCEPTION 'Duração inválida.';
  END IF;
  IF p_plano_atual IN ('mensal', 'anual') AND p_validade_atual IS NOT NULL
     AND p_validade_atual >= v_hoje THEN
    v_inicio := p_validade_atual + 1;
  ELSE
    v_inicio := v_hoje;
  END IF;
  IF p_unidade = 'dias' THEN
    RETURN v_inicio + p_quantidade - 1;
  ELSIF p_unidade = 'meses' THEN
    v_fim := (v_inicio + make_interval(months => p_quantidade))::date;
    -- Dia ajustado ao fim de um mês mais curto (31/01 + 1 mês = 28/02): vale até ele
    IF extract(day FROM v_fim) < extract(day FROM v_inicio) THEN
      RETURN v_fim;
    END IF;
    RETURN v_fim - 1;
  END IF;
  RAISE EXCEPTION 'Unidade de duração inválida: %', p_unidade;
END;
$$;

-- ---------------------------------------------------------------------
-- 1. Perfil: nome do plano comprado (exibição); a categoria continua em
--    profiles.plano ('mensal' | 'anual'), usada nas regras de acesso.
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plano_nome text;

-- ---------------------------------------------------------------------
-- 2. Catálogo de planos
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.planos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome               text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 3 AND 60),
  descricao          text NOT NULL DEFAULT '' CHECK (char_length(descricao) <= 300),
  beneficios         text[] NOT NULL DEFAULT '{}' CHECK (cardinality(beneficios) <= 12),
  tipo_acesso        text NOT NULL CHECK (tipo_acesso IN ('mensal', 'anual')),
  duracao_quantidade integer NOT NULL CHECK (duracao_quantidade BETWEEN 1 AND 3660),
  duracao_unidade    text NOT NULL CHECK (duracao_unidade IN ('dias', 'meses')),
  preco_centavos     integer NOT NULL DEFAULT 0 CHECK (preco_centavos BETWEEN 0 AND 100000000),
  -- Formas e parcelas valem para o pagamento online (Etapa 2)
  formas_pagamento   text[] NOT NULL DEFAULT ARRAY['pix', 'cartao', 'boleto']::text[]
                       CHECK (cardinality(formas_pagamento) >= 1
                              AND formas_pagamento <@ ARRAY['pix', 'cartao', 'boleto']::text[]),
  parcelas_max       integer NOT NULL DEFAULT 1 CHECK (parcelas_max BETWEEN 1 AND 12),
  destaque           boolean NOT NULL DEFAULT false,
  ordem              integer NOT NULL DEFAULT 0,
  ativo              boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planos_duracao_meses CHECK (duracao_unidade = 'dias' OR duracao_quantidade <= 120),
  CONSTRAINT planos_ativo_com_preco CHECK (NOT ativo OR preco_centavos > 0)
);

DROP TRIGGER IF EXISTS planos_set_updated_at ON public.planos;
CREATE TRIGGER planos_set_updated_at BEFORE UPDATE ON public.planos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Carga inicial (só se o catálogo estiver vazio): Mensal e Anual, com o preço
-- que estava em configuracoes.planos_info quando ele estiver no formato
-- "R$ 49,90". Entram DESATIVADOS: o admin revisa e ativa.
DO $$
DECLARE
  v_info  jsonb;
  v_texto text;
  v_m     text;
  v_a     text;
  v_pm    integer := 0;
  v_pa    integer := 0;
  v_benef text[] := ARRAY[
    'Simulados ABT1 e ABT2 completos (40 questões, 120 minutos)',
    'Simulado ABT – Correspondentes (20 questões, e-book próprio)',
    'Quantos simulados quiser durante a validade',
    'Questões sem repetição até esgotar o banco de cada tema',
    'Relatórios de desempenho por tema e dificuldade',
    'Participação opcional no ranking'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM public.planos) THEN
    RETURN;
  END IF;

  SELECT valor INTO v_texto FROM public.configuracoes WHERE chave = 'planos_info';
  BEGIN
    v_info := COALESCE(v_texto, '{}')::jsonb;
  EXCEPTION WHEN others THEN
    v_info := '{}'::jsonb;
  END;

  v_m := v_info #>> '{mensal,preco}';
  v_a := v_info #>> '{anual,preco}';
  IF v_m ~ '^\s*(R\$)?\s*([0-9]{1,3}(\.[0-9]{3})+|[0-9]+),[0-9]{2}\s*$' THEN
    v_pm := round(replace(replace(regexp_replace(v_m, '[^0-9,.]', '', 'g'), '.', ''), ',', '.')::numeric * 100);
  END IF;
  IF v_a ~ '^\s*(R\$)?\s*([0-9]{1,3}(\.[0-9]{3})+|[0-9]+),[0-9]{2}\s*$' THEN
    v_pa := round(replace(replace(regexp_replace(v_a, '[^0-9,.]', '', 'g'), '.', ''), ',', '.')::numeric * 100);
  END IF;

  INSERT INTO public.planos
    (nome, descricao, beneficios, tipo_acesso, duracao_quantidade, duracao_unidade,
     preco_centavos, destaque, ordem, ativo)
  VALUES
    ('Mensal',
     COALESCE(NULLIF(btrim(left(v_info #>> '{mensal,descricao}', 300)), ''), 'Acesso completo por 1 mês.'),
     v_benef, 'mensal', 1, 'meses', LEAST(v_pm, 100000000), true, 1, false),
    ('Anual',
     COALESCE(NULLIF(btrim(left(v_info #>> '{anual,descricao}', 300)), ''), 'Acesso completo por 12 meses.'),
     v_benef, 'anual', 12, 'meses', LEAST(v_pa, 100000000), false, 2, false);
END $$;

-- ---------------------------------------------------------------------
-- 3. Clientes (vínculo da conta com o cliente no gateway)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clientes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  nome                 text NOT NULL,
  email                text,
  cpf_cnpj             text NOT NULL CHECK (cpf_cnpj ~ '^([0-9]{11}|[0-9]{14})$'),
  telefone             text CHECK (telefone IS NULL OR telefone ~ '^[1-9][0-9]{9,10}$'),
  gateway              text NOT NULL DEFAULT 'manual' CHECK (gateway IN ('manual', 'pagarme')),
  external_customer_id text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS clientes_usuario_documento
  ON public.clientes (user_id, cpf_cnpj) WHERE user_id IS NOT NULL;

-- Conta apagada: o registro de venda fica (obrigação fiscal), sem contato.
CREATE OR REPLACE FUNCTION public.clientes_antes_de_alterar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.user_id IS NULL AND OLD.user_id IS NOT NULL THEN
    NEW.email := NULL;
    NEW.telefone := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clientes_antes_de_alterar ON public.clientes;
CREATE TRIGGER clientes_antes_de_alterar BEFORE UPDATE ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.clientes_antes_de_alterar();

-- ---------------------------------------------------------------------
-- 4. Pedidos
-- ---------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.pedidos_codigo_seq;

CREATE OR REPLACE FUNCTION public.gerar_codigo_pedido()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, pg_temp
AS $$
  SELECT 'PED-' || CASE WHEN s.n < 1000000 THEN lpad(s.n::text, 6, '0') ELSE s.n::text END
  FROM (SELECT nextval('public.pedidos_codigo_seq') AS n) s
$$;

CREATE TABLE IF NOT EXISTS public.pedidos (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo                   text NOT NULL UNIQUE DEFAULT public.gerar_codigo_pedido(),
  cliente_id               uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  user_id                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Retrato do plano no momento do pedido
  plano_id                 uuid NOT NULL REFERENCES public.planos(id) ON DELETE RESTRICT,
  plano_nome               text NOT NULL,
  plano_tipo_acesso        text NOT NULL CHECK (plano_tipo_acesso IN ('mensal', 'anual')),
  plano_duracao_quantidade integer NOT NULL CHECK (plano_duracao_quantidade > 0),
  plano_duracao_unidade    text NOT NULL CHECK (plano_duracao_unidade IN ('dias', 'meses')),
  valor_total              integer NOT NULL CHECK (valor_total > 0),
  status                   text NOT NULL DEFAULT 'pendente'
                             CHECK (status IN ('pendente', 'pago', 'cancelado', 'expirado', 'estornado')),
  gateway                  text NOT NULL DEFAULT 'manual' CHECK (gateway IN ('manual', 'pagarme')),
  metodo_pagamento         text CHECK (metodo_pagamento IS NULL OR metodo_pagamento IN
                             ('pix', 'cartao', 'boleto', 'transferencia', 'outro')),
  external_order_id        text,
  -- Retrato de quem comprou (registro de venda)
  comprador_nome           text NOT NULL,
  comprador_email          text,
  comprador_documento      text NOT NULL CHECK (comprador_documento ~ '^([0-9]{11}|[0-9]{14})$'),
  comprador_tipo           text NOT NULL CHECK (comprador_tipo IN ('cpf', 'cnpj')),
  origem                   text NOT NULL DEFAULT 'aluno' CHECK (origem IN ('aluno', 'admin')),
  teste                    boolean NOT NULL DEFAULT false,
  criado_por               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expira_em                timestamptz,
  -- Liberação do acesso
  plano_anterior           text,
  plano_nome_anterior      text,
  plano_concedido          text,
  validade_anterior        date,
  validade_concedida       date,
  dias_concedidos          integer,
  liberado_em              timestamptz,
  liberado_por             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Cancelamento / expiração
  cancelado_em             timestamptz,
  cancelado_por            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  motivo_cancelamento      text CHECK (motivo_cancelamento IS NULL OR char_length(motivo_cancelamento) <= 500),
  -- Estorno
  estornado_em             timestamptz,
  estornado_por            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  motivo_estorno           text CHECK (motivo_estorno IS NULL OR char_length(motivo_estorno) <= 500),
  acesso_removido          boolean,
  -- Venda registrada pelo admin: evita registrar duas vezes a mesma venda
  chave_venda              uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pedidos_documento_tipo CHECK (
    (comprador_tipo = 'cpf' AND char_length(comprador_documento) = 11)
    OR (comprador_tipo = 'cnpj' AND char_length(comprador_documento) = 14)),
  CONSTRAINT pedidos_pago_liberado CHECK (
    status NOT IN ('pago', 'estornado')
    OR (liberado_em IS NOT NULL AND validade_concedida IS NOT NULL AND dias_concedidos IS NOT NULL)),
  CONSTRAINT pedidos_cancelado_data CHECK (status NOT IN ('cancelado', 'expirado') OR cancelado_em IS NOT NULL),
  CONSTRAINT pedidos_estornado_data CHECK (status <> 'estornado' OR estornado_em IS NOT NULL)
);

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS plano_nome_anterior text,
  ADD COLUMN IF NOT EXISTS plano_concedido text,
  ADD COLUMN IF NOT EXISTS chave_venda uuid;

CREATE INDEX IF NOT EXISTS pedidos_status_idx ON public.pedidos (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_chave_venda_unica
  ON public.pedidos (chave_venda) WHERE chave_venda IS NOT NULL;
CREATE INDEX IF NOT EXISTS pedidos_usuario_idx ON public.pedidos (user_id, created_at DESC);
-- Um pedido aguardando pagamento por aluno
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_um_pendente_por_usuario
  ON public.pedidos (user_id) WHERE status = 'pendente';

-- Transições permitidas e campos que não mudam depois de criado o pedido.
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

DROP TRIGGER IF EXISTS pedidos_antes_de_alterar ON public.pedidos;
CREATE TRIGGER pedidos_antes_de_alterar BEFORE UPDATE ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.pedidos_antes_de_alterar();

-- ---------------------------------------------------------------------
-- 5. Pagamentos (cada tentativa ou recebimento de um pedido)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pagamentos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id             uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE RESTRICT,
  gateway               text NOT NULL CHECK (gateway IN ('manual', 'pagarme')),
  metodo_pagamento      text NOT NULL CHECK (metodo_pagamento IN
                          ('pix', 'cartao', 'boleto', 'transferencia', 'outro')),
  valor                 integer NOT NULL CHECK (valor > 0),
  parcelas              integer NOT NULL DEFAULT 1 CHECK (parcelas BETWEEN 1 AND 12),
  status                text NOT NULL DEFAULT 'pendente'
                          CHECK (status IN ('pendente', 'pago', 'falhou', 'cancelado', 'estornado')),
  status_gateway        text,
  external_payment_id   text,
  expira_em             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  paid_at               timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  registrado_por        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requer_revisao        boolean NOT NULL DEFAULT false,
  motivo_revisao        text,
  revisao_resolvida_em  timestamptz,
  revisao_resolvida_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT pagamentos_pago_data CHECK (status NOT IN ('pago', 'estornado') OR paid_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS pagamentos_pedido_idx ON public.pagamentos (pedido_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pagamentos_revisao_idx ON public.pagamentos (created_at DESC) WHERE requer_revisao;
-- Idempotência dos avisos do gateway (o mesmo pagamento não entra duas vezes)
CREATE UNIQUE INDEX IF NOT EXISTS pagamentos_externo_unico
  ON public.pagamentos (gateway, external_payment_id) WHERE external_payment_id IS NOT NULL;

DROP TRIGGER IF EXISTS pagamentos_set_updated_at ON public.pagamentos;
CREATE TRIGGER pagamentos_set_updated_at BEFORE UPDATE ON public.pagamentos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 6. Histórico de mudanças do acesso (pedido, estorno ou admin)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.historico_acesso (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  origem          text NOT NULL CHECK (origem IN ('pedido', 'estorno', 'admin')),
  pedido_id       uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  plano_antes     text,
  validade_antes  date,
  plano_depois    text,
  validade_depois date,
  feito_por       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  observacao      text CHECK (observacao IS NULL OR char_length(observacao) <= 500),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS historico_acesso_usuario_idx
  ON public.historico_acesso (user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 7. Acesso: só o servidor (service_role)
-- ---------------------------------------------------------------------
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_acesso ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.planos, public.clientes, public.pedidos, public.pagamentos,
  public.historico_acesso FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.planos, public.clientes, public.pedidos, public.pagamentos,
  public.historico_acesso TO service_role;

REVOKE ALL ON SEQUENCE public.pedidos_codigo_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.pedidos_codigo_seq TO service_role;

-- ---------------------------------------------------------------------
-- 8. Pedidos pendentes com prazo vencido viram "expirado" (de um aluno ou
--    de todos quando p_user é nulo). O admin ainda pode confirmar depois.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expirar_pedidos_vencidos(p_user uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  -- Ordem das travas em todo o módulo: perfil → pedido → pagamentos
  WITH exp AS (
    UPDATE public.pedidos
       SET status = 'expirado', cancelado_em = now(),
           motivo_cancelamento = 'Prazo para pagamento vencido.'
     WHERE status = 'pendente' AND expira_em < now() AND (p_user IS NULL OR user_id = p_user)
    RETURNING id)
  SELECT array_agg(id) INTO v_ids FROM exp;
  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;
  UPDATE public.pagamentos SET status = 'cancelado'
   WHERE pedido_id = ANY (v_ids) AND status = 'pendente';
  RETURN cardinality(v_ids);
END;
$$;

-- ---------------------------------------------------------------------
-- 9. Criar pedido (aluno pela página Planos ou admin em "Registrar venda")
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

  SELECT nome_completo, email, cpf, cnpj, instituicao, plano, plano_validade, cadastro_completo_em
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
  v_valor := COALESCE(p_valor, v_plano.preco_centavos);
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
    chave_venda)
  VALUES (
    v_cliente, p_user, v_plano.id, v_plano.nome, v_plano.tipo_acesso, v_plano.duracao_quantidade,
    v_plano.duracao_unidade, v_valor, 'manual', p_metodo, v_nome,
    v_perfil.email, v_doc, p_comprador_tipo, p_origem, v_teste, COALESCE(p_por, p_user),
    CASE WHEN p_origem = 'aluno' AND COALESCE(p_prazo_dias, 0) > 0
         THEN now() + make_interval(days => p_prazo_dias) END,
    p_chave)
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
-- 10. Registrar pagamento recebido e liberar o acesso
--    p_origem 'admin'  : confirmação manual (erros viram mensagem na tela).
--    p_origem 'gateway': aviso do Pagar.me (Etapa 2). Nunca descarta: se não
--                        puder liberar, grava com "precisa de revisão".
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
    SELECT plano, plano_validade, plano_nome INTO v_perfil
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

  UPDATE public.pagamentos SET status = 'cancelado'
   WHERE pedido_id = p_pedido AND status = 'pendente' AND id <> v_pag_id;

  UPDATE public.pedidos
     SET status = 'pago', metodo_pagamento = v_metodo, liberado_em = now(), liberado_por = p_por,
         plano_anterior = v_perfil.plano, validade_anterior = v_perfil.plano_validade,
         plano_nome_anterior = v_perfil.plano_nome, plano_concedido = v_plano,
         validade_concedida = v_nova, dias_concedidos = v_nova - v_base
   WHERE id = p_pedido;

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
-- 11. Cancelar pedido aguardando pagamento (aluno: só o próprio)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancelar_pedido(
  p_pedido uuid,
  p_por    uuid,
  p_dono   uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ped record;
BEGIN
  SELECT id, user_id, status, codigo INTO v_ped FROM public.pedidos WHERE id = p_pedido FOR UPDATE;
  IF NOT FOUND OR (p_dono IS NOT NULL AND v_ped.user_id IS DISTINCT FROM p_dono) THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;
  IF v_ped.status <> 'pendente' THEN
    RAISE EXCEPTION 'Só é possível cancelar um pedido que está aguardando pagamento.';
  END IF;
  UPDATE public.pagamentos SET status = 'cancelado'
   WHERE pedido_id = p_pedido AND status = 'pendente';
  UPDATE public.pedidos
     SET status = 'cancelado', cancelado_em = now(), cancelado_por = p_por,
         motivo_cancelamento = COALESCE(NULLIF(btrim(p_motivo), ''),
           CASE WHEN p_dono IS NOT NULL THEN 'Cancelado pelo aluno.' ELSE 'Cancelado pelo admin.' END)
   WHERE id = p_pedido;
  RETURN jsonb_build_object('codigo', v_ped.codigo);
END;
$$;

-- ---------------------------------------------------------------------
-- 12. Estornar pedido pago (opcionalmente tirando os dias concedidos)
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
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Informe o motivo do estorno.';
  END IF;
  SELECT user_id INTO v_uid FROM public.pedidos WHERE id = p_pedido;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;
  IF v_uid IS NOT NULL THEN
    SELECT plano, plano_validade, plano_nome INTO v_perfil
      FROM public.profiles WHERE id = v_uid FOR UPDATE;
    v_tem_perfil := FOUND;
  END IF;
  SELECT * INTO v_ped FROM public.pedidos WHERE id = p_pedido FOR UPDATE;
  IF v_ped.status <> 'pago' THEN
    RAISE EXCEPTION 'Só é possível estornar um pedido pago.';
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
                            'dias_nao_usados', v_rem, 'plano', v_plano,
                            'validade_anterior', v_antes, 'validade', v_nova);
END;
$$;

-- ---------------------------------------------------------------------
-- 13. Admin muda plano/validade em Usuários e planos: só grava se ninguém
--     mudou o acesso desde que a ficha foi aberta, e registra no histórico.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_definir_plano(
  p_user              uuid,
  p_plano             text,
  p_por               uuid,
  p_validade          date DEFAULT NULL,
  p_plano_esperado    text DEFAULT NULL,
  p_validade_esperada date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_perfil   record;
  v_validade date;
  v_ids      uuid[];
  v_codigos  text[];
BEGIN
  IF p_plano NOT IN ('gratis', 'mensal', 'anual', 'inativo') THEN
    RAISE EXCEPTION 'Plano inválido.';
  END IF;
  IF p_plano IN ('mensal', 'anual') AND p_validade IS NULL THEN
    RAISE EXCEPTION 'Informe até quando o acesso é válido.';
  END IF;
  SELECT plano, plano_validade, plano_nome INTO v_perfil
    FROM public.profiles WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado.';
  END IF;
  IF v_perfil.plano IS DISTINCT FROM p_plano_esperado
     OR v_perfil.plano_validade IS DISTINCT FROM p_validade_esperada THEN
    RAISE EXCEPTION 'O acesso deste aluno mudou desde que a ficha foi aberta (por exemplo, um pagamento confirmado). Feche e abra a ficha de novo antes de salvar.';
  END IF;
  v_validade := CASE WHEN p_plano IN ('mensal', 'anual') THEN p_validade END;
  UPDATE public.profiles
     SET plano = p_plano, plano_validade = v_validade,
         plano_nome = CASE WHEN p_plano = v_perfil.plano THEN v_perfil.plano_nome END
   WHERE id = p_user;
  IF v_perfil.plano IS DISTINCT FROM p_plano OR v_perfil.plano_validade IS DISTINCT FROM v_validade THEN
    INSERT INTO public.historico_acesso (user_id, origem, plano_antes, validade_antes, plano_depois,
                                         validade_depois, feito_por)
    VALUES (p_user, 'admin', v_perfil.plano, v_perfil.plano_validade, p_plano, v_validade, p_por);
  END IF;

  -- Conta bloqueada: pedidos aguardando pagamento são cancelados (o aluno não deve pagar)
  IF p_plano = 'inativo' AND v_perfil.plano <> 'inativo' THEN
    WITH canc AS (
      UPDATE public.pedidos
         SET status = 'cancelado', cancelado_em = now(), cancelado_por = p_por,
             motivo_cancelamento = 'Cancelado: conta bloqueada pela ABRACAM.'
       WHERE user_id = p_user AND status = 'pendente'
      RETURNING id, codigo)
    SELECT array_agg(id), array_agg(codigo) INTO v_ids, v_codigos FROM canc;
    IF v_ids IS NOT NULL THEN
      UPDATE public.pagamentos SET status = 'cancelado'
       WHERE pedido_id = ANY (v_ids) AND status = 'pendente';
    END IF;
  END IF;

  RETURN jsonb_build_object('plano', p_plano, 'validade', v_validade,
                            'pedidos_cancelados', COALESCE(to_jsonb(v_codigos), '[]'::jsonb));
END;
$$;

-- ---------------------------------------------------------------------
-- 14. Venda combinada por fora (admin): cria o pedido e registra o pagamento
--     na mesma transação. A chave evita registrar duas vezes quando o admin
--     tenta de novo depois de uma resposta perdida.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_venda_admin(
  p_user                    uuid,
  p_plano                   uuid,
  p_metodo                  text,
  p_valor                   integer,
  p_por                     uuid,
  p_chave                   uuid,
  p_pago_em                 timestamptz DEFAULT now(),
  p_comprador_tipo          text DEFAULT 'cpf',
  p_metadata                jsonb DEFAULT '{}'::jsonb,
  p_pendente_esperado       text DEFAULT NULL,
  p_aceitar_valor_diferente boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ped   record;
  v_pend  text;
  v_rec   text;
  v_preco integer;
  v_c     jsonb;
  v_r     jsonb;
BEGIN
  IF p_chave IS NULL THEN
    RAISE EXCEPTION 'Chave da venda ausente.';
  END IF;
  PERFORM 1 FROM public.profiles WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta não encontrada.';
  END IF;

  SELECT codigo, status, validade_concedida INTO v_ped FROM public.pedidos WHERE chave_venda = p_chave;
  IF FOUND THEN
    IF v_ped.status = 'pago' THEN
      RETURN jsonb_build_object('situacao', 'ja_registrado', 'codigo', v_ped.codigo,
                                'validade', v_ped.validade_concedida);
    END IF;
    IF v_ped.status = 'estornado' THEN
      RAISE EXCEPTION 'A venda registrada nesta janela (%) foi estornada. Abra "Registrar venda" de novo para registrar outra.', v_ped.codigo;
    END IF;
    RAISE EXCEPTION 'Esta venda já foi registrada (pedido %) e não está paga. Confira em Planos e pagamentos.', v_ped.codigo;
  END IF;

  -- O admin precisa ter visto o pedido pendente que a venda vai substituir
  PERFORM public.expirar_pedidos_vencidos(p_user);
  SELECT codigo INTO v_pend FROM public.pedidos WHERE user_id = p_user AND status = 'pendente';
  IF v_pend IS DISTINCT FROM p_pendente_esperado THEN
    RAISE EXCEPTION 'Os pedidos deste aluno mudaram desde que a ficha foi aberta%. Feche e abra a ficha de novo antes de registrar a venda.',
      CASE WHEN v_pend IS NOT NULL THEN ' (há o pedido ' || v_pend || ' aguardando pagamento)' ELSE '' END;
  END IF;

  -- Pagamento já recebido num pedido que não liberou acesso: libera com ele, não registra outro
  SELECT pd.codigo INTO v_rec
    FROM public.pedidos pd JOIN public.pagamentos pg ON pg.pedido_id = pd.id
   WHERE pd.user_id = p_user AND pd.status NOT IN ('pago', 'estornado') AND pg.status = 'pago'
   ORDER BY pg.paid_at DESC
   LIMIT 1;
  IF v_rec IS NOT NULL THEN
    RAISE EXCEPTION 'O pedido % já tem um pagamento recebido. Use "Liberar acesso com este pagamento" em Planos e pagamentos em vez de registrar outra venda.', v_rec;
  END IF;

  SELECT preco_centavos INTO v_preco FROM public.planos WHERE id = p_plano;
  IF v_preco IS NOT NULL AND v_preco > 0 AND p_valor IS DISTINCT FROM v_preco
     AND NOT p_aceitar_valor_diferente THEN
    RAISE EXCEPTION 'O valor é diferente do preço do plano. Confira e, se estiver certo, marque a confirmação e explique na observação.';
  END IF;

  v_c := public.criar_pedido(p_user => p_user, p_plano => p_plano, p_metodo => p_metodo,
                             p_comprador_tipo => p_comprador_tipo, p_origem => 'admin', p_por => p_por,
                             p_prazo_dias => 0, p_valor => p_valor, p_chave => p_chave);
  v_r := public.registrar_pagamento_pedido(
           p_pedido => (v_c ->> 'pedido_id')::uuid, p_origem => 'admin', p_gateway => 'manual',
           p_metodo => p_metodo, p_valor => p_valor, p_por => p_por, p_pago_em => p_pago_em,
           p_metadata => COALESCE(p_metadata, '{}'::jsonb) || '{"venda_registrada_pelo_admin": true}'::jsonb);
  RETURN v_r || jsonb_build_object('codigo', v_c ->> 'codigo');
END;
$$;

-- ---------------------------------------------------------------------
-- 15. Exclusão de conta: pedidos que nunca foram pagos saem junto (sem venda,
--     não há obrigação de guardar o CPF). Pedidos pagos ou estornados e
--     pagamentos em revisão ficam, sem o e-mail (registro fiscal).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apagar_pedidos_nao_pagos(p_user uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(pd.id) INTO v_ids
    FROM public.pedidos pd
   WHERE pd.user_id = p_user AND pd.status IN ('pendente', 'cancelado', 'expirado')
     AND NOT EXISTS (SELECT 1 FROM public.pagamentos pg
                      WHERE pg.pedido_id = pd.id
                        AND (pg.status IN ('pago', 'estornado') OR pg.requer_revisao));
  IF v_ids IS NOT NULL THEN
    DELETE FROM public.pagamentos WHERE pedido_id = ANY (v_ids);
    DELETE FROM public.pedidos WHERE id = ANY (v_ids);
  END IF;
  DELETE FROM public.clientes c
   WHERE c.user_id = p_user
     AND NOT EXISTS (SELECT 1 FROM public.pedidos p WHERE p.cliente_id = c.id);
  RETURN COALESCE(cardinality(v_ids), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.antes_de_apagar_usuario_pedidos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.apagar_pedidos_nao_pagos(OLD.id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_deleted_pedidos ON auth.users;
CREATE TRIGGER on_auth_user_deleted_pedidos
BEFORE DELETE ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.antes_de_apagar_usuario_pedidos();

-- ---------------------------------------------------------------------
-- 16. Resolver a revisão de um pagamento recebido. Com p_devolvido, o valor
--     foi devolvido ao aluno e o pagamento passa a 'estornado' (sai da receita).
--     Sem devolução, ele continua valendo: o admin libera o acesso com ele.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolver_revisao_pagamento(
  p_pagamento  uuid,
  p_por        uuid,
  p_observacao text,
  p_devolvido  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido     uuid;
  v_ped_status text;
  v_pag        record;
BEGIN
  IF p_observacao IS NULL OR btrim(p_observacao) = '' THEN
    RAISE EXCEPTION 'Descreva como a revisão foi resolvida.';
  END IF;
  SELECT pedido_id INTO v_pedido FROM public.pagamentos WHERE id = p_pagamento;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento não encontrado.';
  END IF;
  SELECT status INTO v_ped_status FROM public.pedidos WHERE id = v_pedido FOR UPDATE;
  SELECT id, status, requer_revisao INTO v_pag FROM public.pagamentos WHERE id = p_pagamento FOR UPDATE;
  IF NOT v_pag.requer_revisao THEN
    RAISE EXCEPTION 'Este pagamento não está aguardando revisão.';
  END IF;
  -- Pagamento recebido em pedido que não liberou acesso: ou libera com ele, ou devolve
  IF v_pag.status = 'pago' AND NOT COALESCE(p_devolvido, false)
     AND v_ped_status NOT IN ('pago', 'estornado') THEN
    RAISE EXCEPTION 'Este pagamento foi recebido e o pedido não liberou acesso. Use "Liberar acesso com este pagamento" ou marque que o valor foi devolvido ao aluno.';
  END IF;
  -- O pagamento que liberou o pedido não é devolvido por aqui (o pedido ficaria pago sem pagamento)
  IF COALESCE(p_devolvido, false) AND v_pag.status = 'pago' AND v_ped_status = 'pago'
     AND NOT EXISTS (SELECT 1 FROM public.pagamentos
                      WHERE pedido_id = v_pedido AND status = 'pago' AND id <> p_pagamento) THEN
    RAISE EXCEPTION 'Este é o pagamento que liberou o pedido. Se o valor inteiro foi devolvido, use Estornar no pedido; se foi só a diferença, descreva na observação sem marcar a devolução.';
  END IF;
  UPDATE public.pagamentos
     SET requer_revisao = false, revisao_resolvida_em = now(), revisao_resolvida_por = p_por,
         status = CASE WHEN p_devolvido AND status = 'pago' THEN 'estornado' ELSE status END,
         metadata = metadata || jsonb_build_object('resolucao', left(btrim(p_observacao), 500),
                                                   'devolvido', COALESCE(p_devolvido, false))
   WHERE id = p_pagamento;
  RETURN jsonb_build_object('devolvido', COALESCE(p_devolvido, false) AND v_pag.status = 'pago');
END;
$$;

-- ---------------------------------------------------------------------
-- 17. Expurgo depois do prazo fiscal (procedimento anual do DPO): apaga os
--     pedidos de contas excluídas (user_id nulo) encerrados antes de p_antes,
--     sem revisão pendente, e os clientes que ficarem sem pedidos.
--     Ex.: em janeiro de 2032, SELECT public.expurgar_pedidos_antigos('2027-01-01');
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expurgar_pedidos_antigos(p_antes date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  -- Prazo fiscal conta a partir do exercício seguinte ao da operação (CTN, art. 173)
  IF p_antes IS NULL
     OR p_antes > make_date(extract(year FROM public.hoje_sao_paulo())::int - 5, 1, 1) THEN
    RAISE EXCEPTION 'Use como data de corte, no máximo, 1º de janeiro de cinco anos atrás (ex.: em 2032, 2027-01-01).';
  END IF;
  SELECT array_agg(pd.id) INTO v_ids
    FROM public.pedidos pd
   WHERE pd.user_id IS NULL
     AND pd.status IN ('pago', 'estornado', 'cancelado', 'expirado')
     AND COALESCE(pd.estornado_em, pd.liberado_em, pd.cancelado_em, pd.created_at) < p_antes
     AND NOT EXISTS (SELECT 1 FROM public.pagamentos pg
                      WHERE pg.pedido_id = pd.id
                        AND (pg.requer_revisao
                             OR GREATEST(pg.paid_at, pg.created_at, pg.revisao_resolvida_em) >= p_antes));
  IF v_ids IS NOT NULL THEN
    DELETE FROM public.pagamentos WHERE pedido_id = ANY (v_ids);
    DELETE FROM public.pedidos WHERE id = ANY (v_ids);
  END IF;
  DELETE FROM public.clientes c
   WHERE c.user_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.pedidos p WHERE p.cliente_id = c.id);
  RETURN COALESCE(cardinality(v_ids), 0);
END;
$$;

-- Funções só para o servidor
REVOKE ALL ON FUNCTION public.hoje_sao_paulo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calcular_nova_validade(text, date, integer, text, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gerar_codigo_pedido() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clientes_antes_de_alterar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pedidos_antes_de_alterar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expirar_pedidos_vencidos(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.criar_pedido(uuid, uuid, text, text, text, uuid, integer, integer, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_venda_admin(uuid, uuid, text, integer, uuid, uuid, timestamptz, text, jsonb, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apagar_pedidos_nao_pagos(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolver_revisao_pagamento(uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
-- Expurgo: só pelo SQL Editor (nem o servidor do app executa)
REVOKE ALL ON FUNCTION public.expurgar_pedidos_antigos(date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.antes_de_apagar_usuario_pedidos() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_pagamento_pedido(uuid, text, text, text, integer, uuid, timestamptz, integer, text, uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancelar_pedido(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.estornar_pedido(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_definir_plano(uuid, text, uuid, date, text, date) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.hoje_sao_paulo() TO service_role;
GRANT EXECUTE ON FUNCTION public.calcular_nova_validade(text, date, integer, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.gerar_codigo_pedido() TO service_role;
GRANT EXECUTE ON FUNCTION public.expirar_pedidos_vencidos(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.criar_pedido(uuid, uuid, text, text, text, uuid, integer, integer, uuid, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_venda_admin(uuid, uuid, text, integer, uuid, uuid, timestamptz, text, jsonb, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.apagar_pedidos_nao_pagos(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolver_revisao_pagamento(uuid, uuid, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_pedido(uuid, text, text, text, integer, uuid, timestamptz, integer, text, uuid, jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.estornar_pedido(uuid, uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_definir_plano(uuid, text, uuid, date, text, date) TO service_role;

-- ---------------------------------------------------------------------
-- 18. Configuração do pagamento (editada em /admin/pagamentos)
-- ---------------------------------------------------------------------
INSERT INTO public.configuracoes (chave, valor)
VALUES ('pagamento_config',
        '{"gateway":"manual","prazo_pedido_dias":3,"formas_manual":["pix"],"instrucoes":{},"pagarme":{"chave_publica":""}}')
ON CONFLICT (chave) DO NOTHING;
