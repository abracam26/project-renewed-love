DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id
  INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower('admin@abracam.com.br')
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário admin@abracam.com.br não encontrado';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END
$$;