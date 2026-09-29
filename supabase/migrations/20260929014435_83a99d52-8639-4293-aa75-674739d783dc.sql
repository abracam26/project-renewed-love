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

REVOKE ALL ON FUNCTION public.expirar_pedidos_vencidos(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expirar_pedidos_vencidos(uuid) TO service_role;