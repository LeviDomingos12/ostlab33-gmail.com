/**
 * @file src/lib/databaseSchemaSql.ts
 * Definições SQL DDL completas para o banco de dados PostgreSQL / Supabase,
 * alinhadas rigorosamente com a interface TypeScript 'Product' (src/types.ts),
 * permissões e políticas de segurança RLS (Row Level Security).
 */

export const PRODUCTS_SQL_SCHEMA = `-- ==============================================================================
-- 1. Habilitar extensões UUID
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 2. Tabela Principal de Produtos (public.products)
-- Estrutura exata baseada na interface TypeScript 'Product' (src/types.ts)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  company_id TEXT,
  owner_id TEXT,
  created_by TEXT,
  name TEXT NOT NULL,
  code TEXT,
  barcode TEXT,
  category TEXT NOT NULL DEFAULT 'Geral',
  supplier TEXT,
  supplier_id TEXT,
  cost_price NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  sale_price NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  cost NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  price NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  stock NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  min_stock NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 16.00,
  expiry_date TEXT,
  image TEXT,
  image_url TEXT,
  emoji TEXT,
  promotion TEXT,
  is_favorite BOOLEAN DEFAULT false,
  brand TEXT,
  weight_based BOOLEAN DEFAULT false,
  unit TEXT NOT NULL DEFAULT 'un',
  branch_stocks JSONB DEFAULT '{}'::jsonb,
  batches JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 3. Tabela Compatível em Português (public.produtos)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.produtos (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  company_id TEXT,
  owner_id TEXT,
  created_by TEXT,
  name TEXT NOT NULL,
  code TEXT,
  barcode TEXT,
  category TEXT NOT NULL DEFAULT 'Geral',
  category_id TEXT,
  supplier TEXT,
  supplier_id TEXT,
  cost_price NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  sale_price NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  cost NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  price NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  stock NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  min_stock NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 16.00,
  expiry_date TEXT,
  image TEXT,
  image_url TEXT,
  emoji TEXT,
  promotion TEXT,
  is_favorite BOOLEAN DEFAULT false,
  brand TEXT,
  weight_based BOOLEAN DEFAULT false,
  unit TEXT NOT NULL DEFAULT 'un',
  branch_stocks JSONB DEFAULT '{}'::jsonb,
  batches JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 4. Índices de Alta Performance
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_products_tenant ON public.products (tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products (is_active);
CREATE INDEX IF NOT EXISTS idx_products_code ON public.products (code);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products (barcode);
CREATE INDEX IF NOT EXISTS idx_produtos_tenant ON public.produtos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_produtos_active ON public.produtos (is_active);

-- ==============================================================================
-- 5. Políticas de Segurança (Row Level Security) e Concessão de Permissões
-- ==============================================================================
-- Helper de contexto multi-tenant seguro e autoritativo
-- NUNCA aceita JWTs, parâmetros ou variáveis de sessão controlados pelo cliente para trocar de empresa
CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS TEXT AS $$
BEGIN
  -- Se o utilizador estiver autenticado, derivar o tenant estritamente da identidade autorizada no banco
  IF auth.uid() IS NOT NULL THEN
    RETURN public.get_my_company_id();
  END IF;

  -- Se for operação interna do sistema com credenciais de serviço devidamente verificadas
  IF (
    current_user IN ('postgres', 'service_role', 'supabase_admin')
    OR COALESCE(auth.role(), '') = 'service_role'
    OR COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') = 'service_role'
  ) THEN
    RETURN NULLIF(current_setting('app.current_tenant_id', true), '');
  END IF;

  -- Acessos anónimos ou sem credenciais de serviço válidas não possuem tenant
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.current_tenant_id() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated, service_role, postgres;

CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND company_id IS NOT NULL AND company_id <> '' LIMIT 1),
    (SELECT tenant_id FROM public.colaboradores WHERE auth_uid = auth.uid()::text AND status = 'ACTIVE' AND tenant_id IS NOT NULL AND tenant_id <> '' LIMIT 1),
    (SELECT id FROM public.companies WHERE owner_uid = auth.uid()::text AND id IS NOT NULL AND id <> '' LIMIT 1)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_company_id() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_my_company_id() TO authenticated, service_role, postgres;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1),
    (SELECT role FROM public.colaboradores WHERE auth_uid = auth.uid()::text AND status = 'ACTIVE' LIMIT 1),
    NULL
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, service_role, postgres;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_products ON public.products;
DROP POLICY IF EXISTS tenant_isolation_products ON public.products;
CREATE POLICY tenant_isolation_products ON public.products
  FOR ALL TO authenticated
  USING (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

DROP POLICY IF EXISTS allow_all_produtos ON public.produtos;
DROP POLICY IF EXISTS tenant_isolation_produtos ON public.produtos;
CREATE POLICY tenant_isolation_produtos ON public.produtos
  FOR ALL TO authenticated
  USING (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

REVOKE ALL ON public.products FROM anon, public;
REVOKE ALL ON public.produtos FROM anon, public;
GRANT ALL ON public.products TO postgres, authenticated, service_role;
GRANT ALL ON public.produtos TO postgres, authenticated, service_role;

-- ==============================================================================
-- 6. View de Compatibilidade para variações de digitação (public.produts)
-- ==============================================================================
CREATE OR REPLACE VIEW public.produts WITH (security_invoker = true) AS SELECT * FROM public.products;
REVOKE ALL ON public.produts FROM anon, public;
GRANT ALL ON public.produts TO postgres, authenticated, service_role;

-- ==============================================================================
-- 7. Recarregar o cache de esquemas do PostgREST imediatamente
-- ==============================================================================
NOTIFY pgrst, 'reload schema';`;

export const SALES_SQL_SCHEMA = `-- ==============================================================================
-- 1. Habilitar extensões UUID se necessário
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. Tabela Principal de Vendas (public.vendas)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.vendas (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  idempotency_key TEXT,
  invoice_number TEXT NOT NULL,
  customer_id TEXT,
  customer_name TEXT DEFAULT 'Consumidor Final',
  customer_nuit TEXT,
  customer_phone TEXT,
  seller_id TEXT,
  seller_name TEXT,
  operator_name TEXT,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'PAID',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  vat_total NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  grand_total NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  change_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  items JSONB NOT NULL DEFAULT '[]'::JSONB,
  notes TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendas_tenant ON public.vendas (tenant_id);
CREATE INDEX IF NOT EXISTS idx_vendas_invoice ON public.vendas (tenant_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_vendas_created ON public.vendas (created_at);

-- ==============================================================================
-- 3. Tabela de Itens da Venda (public.venda_itens)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.venda_itens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  quantity NUMERIC(14,2) NOT NULL DEFAULT 1.00,
  cost_price NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 16.00,
  vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_price NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_venda_itens_sale ON public.venda_itens (sale_id);
CREATE INDEX IF NOT EXISTS idx_venda_itens_prod ON public.venda_itens (product_id);

-- ==============================================================================
-- 4. Movimentos de Stock (public.stock_movements)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'EXIT_SALE',
  quantity NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  previous_stock NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  new_stock NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  cost_price NUMERIC(14,2) DEFAULT 0.00,
  reason TEXT,
  reference_id TEXT,
  user_id TEXT,
  user_name TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_prod ON public.stock_movements (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant ON public.stock_movements (tenant_id);

-- ==============================================================================
-- 5. Movimentos de Caixa (public.caixa)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.caixa (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  cash_register_id TEXT,
  type TEXT NOT NULL DEFAULT 'INPUT',
  amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  reason TEXT NOT NULL,
  responsible_user TEXT,
  reference_id TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_caixa_tenant ON public.caixa (tenant_id);

-- ==============================================================================
-- 6. Logs de Auditoria (public.audit_logs)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  user_name TEXT,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  details TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 7. Clientes e Dívidas (public.clientes e public.customer_debts)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.clientes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  nuit TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  credit_limit NUMERIC(14,2) DEFAULT 0.00,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  debt NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_spent NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  purchase_count INTEGER NOT NULL DEFAULT 0,
  last_purchase_date TIMESTAMPTZ,
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  credit_blocked BOOLEAN NOT NULL DEFAULT false,
  preferred_payment_method TEXT,
  one_click_checkout_enabled BOOLEAN DEFAULT false,
  settlements JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 7.1 Devoluções e Notas de Crédito (public.returns)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.returns (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  credit_note_number TEXT NOT NULL,
  sale_id TEXT,
  original_invoice_number TEXT NOT NULL,
  customer_name TEXT DEFAULT 'Consumidor Final',
  customer_nuit TEXT,
  reason TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_refund NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  refund_method TEXT NOT NULL DEFAULT 'CASH',
  operator_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.customer_debts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  sale_id TEXT,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  remaining_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  due_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

-- ==============================================================================
-- 8. Permissões e RLS para Todas as Tabelas de Vendas
-- ==============================================================================
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venda_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caixa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_vendas ON public.vendas;
DROP POLICY IF EXISTS tenant_isolation_vendas ON public.vendas;
CREATE POLICY tenant_isolation_vendas ON public.vendas
  FOR ALL TO authenticated
  USING (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

DROP POLICY IF EXISTS allow_all_venda_itens ON public.venda_itens;
DROP POLICY IF EXISTS tenant_isolation_venda_itens ON public.venda_itens;
CREATE POLICY tenant_isolation_venda_itens ON public.venda_itens
  FOR ALL TO authenticated
  USING (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

DROP POLICY IF EXISTS allow_all_stock_movements ON public.stock_movements;
DROP POLICY IF EXISTS tenant_isolation_stock_movements ON public.stock_movements;
CREATE POLICY tenant_isolation_stock_movements ON public.stock_movements
  FOR ALL TO authenticated
  USING (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

DROP POLICY IF EXISTS allow_all_caixa ON public.caixa;
DROP POLICY IF EXISTS tenant_isolation_caixa ON public.caixa;
CREATE POLICY tenant_isolation_caixa ON public.caixa
  FOR ALL TO authenticated
  USING (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

DROP POLICY IF EXISTS allow_all_audit_logs ON public.audit_logs;
DROP POLICY IF EXISTS tenant_isolation_audit_logs ON public.audit_logs;
CREATE POLICY tenant_isolation_audit_logs ON public.audit_logs
  FOR ALL TO authenticated
  USING (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

DROP POLICY IF EXISTS allow_all_clientes ON public.clientes;
DROP POLICY IF EXISTS tenant_isolation_clientes ON public.clientes;
CREATE POLICY tenant_isolation_clientes ON public.clientes
  FOR ALL TO authenticated
  USING (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

DROP POLICY IF EXISTS allow_all_customer_debts ON public.customer_debts;
DROP POLICY IF EXISTS tenant_isolation_customer_debts ON public.customer_debts;
CREATE POLICY tenant_isolation_customer_debts ON public.customer_debts
  FOR ALL TO authenticated
  USING (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

DROP POLICY IF EXISTS allow_all_returns ON public.returns;
DROP POLICY IF EXISTS tenant_isolation_returns ON public.returns;
CREATE POLICY tenant_isolation_returns ON public.returns
  FOR ALL TO authenticated
  USING (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

REVOKE ALL ON public.vendas FROM anon, public;
REVOKE ALL ON public.venda_itens FROM anon, public;
REVOKE ALL ON public.stock_movements FROM anon, public;
REVOKE ALL ON public.caixa FROM anon, public;
REVOKE ALL ON public.audit_logs FROM anon, public;
REVOKE ALL ON public.clientes FROM anon, public;
REVOKE ALL ON public.customer_debts FROM anon, public;
REVOKE ALL ON public.returns FROM anon, public;

GRANT ALL ON public.vendas TO postgres, authenticated, service_role;
GRANT ALL ON public.venda_itens TO postgres, authenticated, service_role;
GRANT ALL ON public.stock_movements TO postgres, authenticated, service_role;
GRANT ALL ON public.caixa TO postgres, authenticated, service_role;
GRANT ALL ON public.audit_logs TO postgres, authenticated, service_role;
GRANT ALL ON public.clientes TO postgres, authenticated, service_role;
GRANT ALL ON public.customer_debts TO postgres, authenticated, service_role;
GRANT ALL ON public.returns TO postgres, authenticated, service_role;

-- ==============================================================================
-- 9. FUNÇÃO ATÓMICA OFICIAL: public.process_sale_atomic
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.process_sale_atomic(
  p_sale_id TEXT,
  p_company_id TEXT,
  p_user_id TEXT,
  p_items JSONB,
  p_payment_method TEXT,
  p_total NUMERIC,
  p_idempotency_key TEXT DEFAULT NULL,
  p_invoice_number TEXT DEFAULT NULL,
  p_customer_id TEXT DEFAULT NULL,
  p_customer_name TEXT DEFAULT 'Consumidor Final',
  p_customer_nuit TEXT DEFAULT NULL,
  p_user_name TEXT DEFAULT 'Operador',
  p_subtotal NUMERIC DEFAULT NULL,
  p_discount_total NUMERIC DEFAULT 0.00,
  p_vat_total NUMERIC DEFAULT 0.00,
  p_amount_paid NUMERIC DEFAULT NULL,
  p_change_amount NUMERIC DEFAULT 0.00,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_tenant_id TEXT;
  v_invoice_number TEXT;
  v_subtotal NUMERIC;
  v_total NUMERIC;
  v_amount_paid NUMERIC;
  v_user_name TEXT;
  v_idempotency_key TEXT;
  v_item JSONB;
  v_prod_id TEXT;
  v_prod_name TEXT;
  v_qty NUMERIC;
  v_unit_price NUMERIC;
  v_cost_price NUMERIC;
  v_curr_stock NUMERIC;
  v_new_stock NUMERIC;
  v_total_item NUMERIC;
  v_is_credit BOOLEAN;
  v_remaining_debt NUMERIC;
  v_existing_sale_id TEXT;
  v_existing_invoice_number TEXT;
  v_existing_total NUMERIC;
  v_prod_found BOOLEAN;
  v_is_service BOOLEAN;
BEGIN
  -- 0. Verificar credenciais internas de serviço (service_role, postgres, supabase_admin)
  v_is_service := (
    current_user IN ('postgres', 'service_role', 'supabase_admin')
    OR COALESCE(auth.role(), '') = 'service_role'
    OR COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') = 'service_role'
  );

  -- 0.1 Determinar e validar autoritativamente o tenant
  IF auth.uid() IS NOT NULL THEN
    v_tenant_id := public.get_my_company_id();
    IF v_tenant_id IS NULL OR TRIM(v_tenant_id) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: Utilizador autenticado sem empresa autorizada vinculada.');
    END IF;
    IF p_company_id IS NOT NULL AND TRIM(p_company_id) <> '' AND TRIM(p_company_id) <> v_tenant_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: Tenant especificado pelo cliente não corresponde à identidade autenticada.');
    END IF;
  ELSIF v_is_service THEN
    -- Operação interna com credenciais de serviço devidamente verificadas
    v_tenant_id := NULLIF(TRIM(p_company_id), '');
    IF v_tenant_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Operação de serviço rejeitada: Identificação da organização/empresa (tenant_id) é estritamente obrigatória.');
    END IF;
  ELSE
    -- Rejeitar chamadas anónimas ou sem identidade autenticada/credenciais de serviço
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: Chamada a procedimento sem identidade autenticada ou credenciais de serviço devidamente verificadas.');
  END IF;

  -- 0.1 Normalização de campos derivados
  v_total := COALESCE(p_total, 0.00);
  v_subtotal := COALESCE(p_subtotal, v_total);
  v_amount_paid := COALESCE(p_amount_paid, v_total);
  v_invoice_number := COALESCE(NULLIF(p_invoice_number, ''), p_sale_id);
  v_user_name := COALESCE(NULLIF(p_user_name, ''), 'Operador');
  v_idempotency_key := COALESCE(NULLIF(p_idempotency_key, ''), p_sale_id);

  -- 0.2 Verificação de Idempotência
  SELECT id, invoice_number, grand_total INTO v_existing_sale_id, v_existing_invoice_number, v_existing_total
  FROM public.vendas 
  WHERE tenant_id = v_tenant_id
    AND (
      id = p_sale_id 
      OR (v_idempotency_key IS NOT NULL AND (id = v_idempotency_key OR idempotency_key = v_idempotency_key))
    )
  LIMIT 1;

  IF v_existing_sale_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'sale_id', v_existing_sale_id,
      'invoice_number', v_existing_invoice_number,
      'grand_total', v_existing_total,
      'idempotent', true,
      'message', 'Venda já processada anteriormente (idempotente). Nenhuma alteração efetuada.'
    );
  END IF;

  -- 0.3 Validação de itens
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A venda deve conter pelo menos um artigo.');
  END IF;

  -- 1. Inserir registo mestre de venda
  INSERT INTO public.vendas (
    id, tenant_id, idempotency_key, invoice_number, customer_id, customer_name, customer_nuit,
    seller_id, seller_name, operator_name, payment_method, payment_status,
    subtotal, discount_total, vat_total, grand_total, amount_paid, change_amount,
    total_amount, tax_amount, status, items, notes, timestamp, created_at, updated_at
  ) VALUES (
    p_sale_id, v_tenant_id, v_idempotency_key, v_invoice_number, p_customer_id, p_customer_name, p_customer_nuit,
    p_user_id, v_user_name, v_user_name, p_payment_method,
    CASE WHEN p_payment_method IN ('A Prazo / Dívida', 'Crédito', 'CREDITO', 'DEBT') THEN 'PENDING_DEBT' ELSE 'PAID' END,
    v_subtotal, p_discount_total, p_vat_total, v_total, v_amount_paid, p_change_amount,
    v_total, p_vat_total, 'COMPLETED', p_items, p_notes, NOW(), NOW(), NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- 2. Processar itens da venda e abater stock atomicamente
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := COALESCE(v_item->>'productId', v_item->>'id');
    v_prod_name := COALESCE(v_item->>'productName', v_item->>'name', v_item->>'nome', 'Artigo');
    v_qty := COALESCE((v_item->>'quantity')::NUMERIC, (v_item->>'quantidade')::NUMERIC, 1.00);
    v_unit_price := COALESCE((v_item->>'salePrice')::NUMERIC, (v_item->>'unitPrice')::NUMERIC, (v_item->>'price')::NUMERIC, 0.00);
    v_cost_price := COALESCE((v_item->>'costPrice')::NUMERIC, (v_item->>'cost')::NUMERIC, 0.00);
    v_total_item := COALESCE((v_item->>'totalPrice')::NUMERIC, (v_item->>'total')::NUMERIC, v_qty * v_unit_price);

    -- Inserir item detalhado da venda
    INSERT INTO public.venda_itens (
      id, tenant_id, sale_id, product_id, product_name,
      unit_price, quantity, cost_price, total_price, created_at
    ) VALUES (
      COALESCE(gen_random_uuid()::TEXT, p_sale_id || '-' || v_prod_id), v_tenant_id, p_sale_id, v_prod_id, v_prod_name,
      v_unit_price, v_qty, v_cost_price, v_total_item, NOW()
    );

    -- Localizar produto em public.produtos ou public.products
    v_prod_found := FALSE;
    v_curr_stock := 0.00;

    BEGIN
      SELECT stock, name INTO v_curr_stock, v_prod_name 
      FROM public.produtos 
      WHERE id = v_prod_id 
      LIMIT 1 
      FOR UPDATE;
      IF FOUND THEN
        v_prod_found := TRUE;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_prod_found := FALSE;
    END;

    IF NOT v_prod_found THEN
      BEGIN
        SELECT stock, name INTO v_curr_stock, v_prod_name 
        FROM public.products 
        WHERE id = v_prod_id 
        LIMIT 1 
        FOR UPDATE;
        IF FOUND THEN
          v_prod_found := TRUE;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_prod_found := FALSE;
      END;
    END IF;

    -- Calcular novo saldo de stock
    v_new_stock := GREATEST(0.00, COALESCE(v_curr_stock, 0.00) - v_qty);

    -- Abater stock nas duas tabelas para consistência plena
    UPDATE public.produtos 
    SET stock = v_new_stock, updated_at = NOW() 
    WHERE id = v_prod_id;

    UPDATE public.products 
    SET stock = v_new_stock, updated_at = NOW() 
    WHERE id = v_prod_id;

    -- Registar movimento no Kardex (stock_movements)
    INSERT INTO public.stock_movements (
      id, tenant_id, product_id, type, quantity,
      previous_stock, new_stock, cost_price, reason, reference_id, user_id, user_name, timestamp
    ) VALUES (
      COALESCE(gen_random_uuid()::TEXT, p_sale_id || '-mov-' || v_prod_id), v_tenant_id, v_prod_id, 'EXIT_SALE', v_qty,
      COALESCE(v_curr_stock, 0.00), v_new_stock, v_cost_price, 'Venda ' || v_invoice_number, p_sale_id, p_user_id, v_user_name, NOW()
    );
  END LOOP;

  -- 3. Gestão de Dívida se venda a crédito/prazo
  v_is_credit := p_payment_method IN ('A Prazo / Dívida', 'Crédito', 'CREDITO', 'DEBT');
  IF v_is_credit AND p_customer_id IS NOT NULL AND p_customer_id <> '' THEN
    v_remaining_debt := GREATEST(0.00, v_total - v_amount_paid);
    
    INSERT INTO public.customer_debts (
      id, tenant_id, customer_id, sale_id, total_amount, paid_amount,
      remaining_balance, due_date, status, created_at
    ) VALUES (
      COALESCE(gen_random_uuid()::TEXT, p_sale_id || '-debt'), v_tenant_id, p_customer_id, p_sale_id, v_total, v_amount_paid,
      v_remaining_debt, NOW() + INTERVAL '30 days',
      CASE WHEN v_remaining_debt <= 0 THEN 'SETTLED' ELSE 'PENDING' END,
      NOW()
    );

    UPDATE public.clientes 
    SET balance = balance + v_remaining_debt, updated_at = NOW()
    WHERE id = p_customer_id;
  END IF;

  -- 4. Registar entrada de caixa se pago em dinheiro
  IF (UPPER(p_payment_method) LIKE '%DINHEIRO%' OR UPPER(p_payment_method) LIKE '%CASH%' OR UPPER(p_payment_method) LIKE '%NUMER%') AND v_amount_paid > 0 THEN
    INSERT INTO public.caixa (
      id, tenant_id, type, amount, reason, responsible_user, reference_id, timestamp
    ) VALUES (
      COALESCE(gen_random_uuid()::TEXT, p_sale_id || '-cash'), v_tenant_id, 'INPUT', v_amount_paid, 'Recebimento Venda ' || v_invoice_number, v_user_name, p_sale_id, NOW()
    );
  END IF;

  -- 5. Registar log de auditoria
  INSERT INTO public.audit_logs (
    id, tenant_id, user_id, user_name, action, module, details, timestamp
  ) VALUES (
    COALESCE(gen_random_uuid()::TEXT, p_sale_id || '-audit'), v_tenant_id, p_user_id, v_user_name,
    'VENDA_CONCLUIDA', 'POS',
    'Venda ' || v_invoice_number || ' no valor de ' || v_total || ' MT concluída via ' || p_payment_method || '.',
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', p_sale_id,
    'invoice_number', v_invoice_number,
    'grand_total', v_total,
    'message', 'Venda e movimentações processadas com sucesso.'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- Concessão de permissões de execução
REVOKE EXECUTE ON FUNCTION public.process_sale_atomic FROM anon, public;
GRANT EXECUTE ON FUNCTION public.process_sale_atomic TO postgres, authenticated, service_role;

-- ==============================================================================
-- 9.1 REPLENISH STOCK ATOMIC (Entrada de Stock Atómica com Auditoria)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.replenish_stock_atomic(
  p_tenant_id TEXT,
  p_product_id TEXT,
  p_quantity NUMERIC,
  p_cost_price NUMERIC DEFAULT NULL,
  p_reason TEXT DEFAULT 'Reabastecimento de Stock',
  p_user_name TEXT DEFAULT 'Sistema',
  p_received_by TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_tenant_id TEXT;
  v_curr_stock NUMERIC;
  v_new_stock NUMERIC;
  v_curr_cost NUMERIC;
  v_new_cost NUMERIC;
  v_operator TEXT;
  v_is_service BOOLEAN;
BEGIN
  v_is_service := (
    current_user IN ('postgres', 'service_role', 'supabase_admin')
    OR COALESCE(auth.role(), '') = 'service_role'
    OR COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') = 'service_role'
  );

  IF auth.uid() IS NOT NULL THEN
    v_tenant_id := public.get_my_company_id();
    IF v_tenant_id IS NULL OR TRIM(v_tenant_id) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: Utilizador autenticado não possui organização/empresa autorizada vinculada.');
    END IF;
    IF p_tenant_id IS NOT NULL AND TRIM(p_tenant_id) <> '' AND TRIM(p_tenant_id) <> v_tenant_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: Tenant especificado pelo cliente não corresponde à identidade autenticada.');
    END IF;
  ELSIF v_is_service THEN
    v_tenant_id := NULLIF(TRIM(p_tenant_id), '');
    IF v_tenant_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Operação de serviço rejeitada: Identificação da organização/empresa (tenant_id) é estritamente obrigatória.');
    END IF;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: Chamada a procedimento sem identidade autenticada ou credenciais de serviço devidamente verificadas.');
  END IF;

  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quantidade de reabastecimento deve ser superior a zero.');
  END IF;

  v_operator := COALESCE(p_received_by, p_user_name, 'Sistema');

  SELECT stock, cost_price INTO v_curr_stock, v_curr_cost 
  FROM public.produtos 
  WHERE id = p_product_id AND tenant_id = v_tenant_id FOR UPDATE;

  IF NOT FOUND THEN
    SELECT stock, cost INTO v_curr_stock, v_curr_cost 
    FROM public.products 
    WHERE id = p_product_id AND tenant_id = v_tenant_id FOR UPDATE;
  END IF;

  IF v_curr_stock IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Artigo não encontrado no catálogo de produtos da sua organização.');
  END IF;

  v_new_stock := v_curr_stock + p_quantity;
  v_new_cost := COALESCE(p_cost_price, v_curr_cost);

  UPDATE public.produtos 
  SET stock = v_new_stock, cost_price = v_new_cost, cost = v_new_cost, updated_at = NOW()
  WHERE id = p_product_id AND tenant_id = v_tenant_id;

  UPDATE public.products 
  SET stock = v_new_stock, cost_price = v_new_cost, cost = v_new_cost, updated_at = NOW()
  WHERE id = p_product_id AND tenant_id = v_tenant_id;

  INSERT INTO public.stock_movements (
    id, tenant_id, product_id, type, quantity,
    previous_stock, new_stock, cost_price, reason, user_name, timestamp
  ) VALUES (
    uuid_generate_v4()::TEXT, v_tenant_id, p_product_id, 'ENTRY', p_quantity,
    v_curr_stock, v_new_stock, v_new_cost, p_reason, v_operator, NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'product_id', p_product_id,
    'previous_stock', v_curr_stock,
    'new_stock', v_new_stock
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.replenish_stock_atomic FROM anon, public;
GRANT EXECUTE ON FUNCTION public.replenish_stock_atomic TO postgres, authenticated, service_role;

-- ==============================================================================
-- 9.2 SETTLE DEBT PAYMENT ATOMIC (Liquidação de Dívida Atómica)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.settle_debt_payment_atomic(
  p_tenant_id TEXT,
  p_debt_id TEXT,
  p_customer_id TEXT,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_notes TEXT DEFAULT NULL,
  p_user_name TEXT DEFAULT 'Operador',
  p_received_by TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_tenant_id TEXT;
  v_remaining NUMERIC;
  v_new_remaining NUMERIC;
  v_debt_customer_id TEXT;
  v_operator TEXT;
  v_is_service BOOLEAN;
BEGIN
  v_is_service := (
    current_user IN ('postgres', 'service_role', 'supabase_admin')
    OR COALESCE(auth.role(), '') = 'service_role'
    OR COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') = 'service_role'
  );

  IF auth.uid() IS NOT NULL THEN
    v_tenant_id := public.get_my_company_id();
    IF v_tenant_id IS NULL OR TRIM(v_tenant_id) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: Utilizador autenticado não possui organização/empresa autorizada vinculada.');
    END IF;
    IF p_tenant_id IS NOT NULL AND TRIM(p_tenant_id) <> '' AND TRIM(p_tenant_id) <> v_tenant_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: Tenant especificado pelo cliente não corresponde à identidade autenticada.');
    END IF;
  ELSIF v_is_service THEN
    v_tenant_id := NULLIF(TRIM(p_tenant_id), '');
    IF v_tenant_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Operação de serviço rejeitada: Identificação da organização/empresa (tenant_id) é estritamente obrigatória.');
    END IF;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: Chamada a procedimento sem identidade autenticada ou credenciais de serviço devidamente verificadas.');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'O valor do pagamento de dívida deve ser superior a zero.');
  END IF;

  v_operator := COALESCE(p_received_by, p_user_name, 'Operador');

  SELECT remaining_balance, customer_id INTO v_remaining, v_debt_customer_id 
  FROM public.customer_debts 
  WHERE id = p_debt_id AND tenant_id = v_tenant_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Registo de dívida não encontrado na organização.');
  END IF;

  IF p_amount > v_remaining THEN
    RETURN jsonb_build_object('success', false, 'error', 'O valor do pagamento (' || p_amount || ') é superior ao saldo pendente (' || v_remaining || ').');
  END IF;

  v_new_remaining := GREATEST(0.00, v_remaining - p_amount);

  UPDATE public.customer_debts 
  SET 
    paid_amount = paid_amount + p_amount,
    remaining_balance = v_new_remaining,
    status = CASE WHEN v_new_remaining <= 0 THEN 'SETTLED' ELSE 'PARTIAL' END,
    settled_at = CASE WHEN v_new_remaining <= 0 THEN NOW() ELSE NULL END
  WHERE id = p_debt_id AND tenant_id = v_tenant_id;

  INSERT INTO public.debt_payments (
    id, tenant_id, debt_id, customer_id, amount, payment_method, received_by, notes, timestamp
  ) VALUES (
    COALESCE(p_idempotency_key, uuid_generate_v4()::TEXT), v_tenant_id, p_debt_id, v_debt_customer_id, p_amount, p_payment_method, v_operator, p_notes, NOW()
  );

  UPDATE public.clientes 
  SET balance = GREATEST(0.00, balance - p_amount),
      debt = GREATEST(0.00, debt - p_amount),
      updated_at = NOW()
  WHERE id = v_debt_customer_id AND tenant_id = v_tenant_id;

  INSERT INTO public.caixa (
    id, tenant_id, type, amount, reason, responsible_user, reference_id, timestamp
  ) VALUES (
    uuid_generate_v4()::TEXT, v_tenant_id, 'INPUT', p_amount, 'Liquidação de Dívida (Cliente ' || v_debt_customer_id || ')', v_operator, p_debt_id, NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'debt_id', p_debt_id,
    'amount_paid', p_amount,
    'remaining_balance', v_new_remaining
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_debt_payment_atomic FROM anon, public;
GRANT EXECUTE ON FUNCTION public.settle_debt_payment_atomic TO postgres, authenticated, service_role;

-- ==============================================================================
-- 9.3 FUNÇÃO ATÓMICA DE DEVOLUÇÃO: public.record_sale_return_atomic
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.record_sale_return_atomic(
  p_tenant_id TEXT,
  p_sale_id TEXT,
  p_original_invoice TEXT,
  p_credit_note_number TEXT,
  p_customer_name TEXT,
  p_customer_nuit TEXT,
  p_reason TEXT,
  p_returned_items JSONB,
  p_total_refund NUMERIC,
  p_refund_method TEXT,
  p_operator_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_tenant_id TEXT;
  v_item JSONB;
  v_prod_id TEXT;
  v_qty NUMERIC;
  v_curr_stock NUMERIC;
  v_new_stock NUMERIC;
  v_price NUMERIC;
  v_is_service BOOLEAN;
BEGIN
  v_is_service := (
    current_user IN ('postgres', 'service_role', 'supabase_admin')
    OR COALESCE(auth.role(), '') = 'service_role'
    OR COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') = 'service_role'
  );

  IF auth.uid() IS NOT NULL THEN
    v_tenant_id := public.get_my_company_id();
    IF v_tenant_id IS NULL OR TRIM(v_tenant_id) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: Utilizador autenticado sem empresa autorizada vinculada.');
    END IF;
    IF p_tenant_id IS NOT NULL AND TRIM(p_tenant_id) <> '' AND TRIM(p_tenant_id) <> v_tenant_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: Tenant especificado pelo cliente não corresponde à identidade autenticada.');
    END IF;
  ELSIF v_is_service THEN
    v_tenant_id := NULLIF(TRIM(p_tenant_id), '');
    IF v_tenant_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Operação de serviço rejeitada: Identificação da organização/empresa (tenant_id) é estritamente obrigatória.');
    END IF;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: Chamada a procedimento sem identidade autenticada ou credenciais de serviço devidamente verificadas.');
  END IF;

  -- 1. Registar a Nota de Crédito / Devolução
  INSERT INTO public.returns (
    id, tenant_id, credit_note_number, sale_id, original_invoice_number,
    customer_name, customer_nuit, reason, items, total_refund, refund_method, operator_name, created_at
  ) VALUES (
    gen_random_uuid()::TEXT, v_tenant_id, p_credit_note_number, p_sale_id, p_original_invoice,
    p_customer_name, p_customer_nuit, p_reason, p_returned_items, p_total_refund, p_refund_method, p_operator_name, NOW()
  );

  -- 2. Restaurar o stock de cada artigo devolvido
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_returned_items)
  LOOP
    v_prod_id := COALESCE(v_item->>'productId', v_item->>'id');
    v_qty := COALESCE((v_item->>'quantity')::NUMERIC, 1.00);
    v_price := COALESCE((v_item->>'price')::NUMERIC, 0.00);

    SELECT stock INTO v_curr_stock FROM public.produtos WHERE id = v_prod_id AND tenant_id = v_tenant_id LIMIT 1;
    IF v_curr_stock IS NULL THEN
      SELECT stock INTO v_curr_stock FROM public.products WHERE id = v_prod_id AND tenant_id = v_tenant_id LIMIT 1;
    END IF;

    v_new_stock := COALESCE(v_curr_stock, 0.00) + v_qty;

    UPDATE public.produtos SET stock = v_new_stock, updated_at = NOW() WHERE id = v_prod_id AND tenant_id = v_tenant_id;
    UPDATE public.products SET stock = v_new_stock, updated_at = NOW() WHERE id = v_prod_id AND tenant_id = v_tenant_id;

    INSERT INTO public.stock_movements (
      id, tenant_id, product_id, type, quantity, previous_stock, new_stock,
      cost_price, reason, reference_id, user_name, timestamp
    ) VALUES (
      gen_random_uuid()::TEXT, v_tenant_id, v_prod_id, 'RETURN', v_qty,
      COALESCE(v_curr_stock, 0.00), v_new_stock, v_price, 'Devolução Ref ' || p_credit_note_number, p_sale_id, p_operator_name, NOW()
    );
  END LOOP;

  -- 3. Saída de caixa se reembolso efetuado em dinheiro
  IF p_refund_method = 'CASH' AND p_total_refund > 0 THEN
    INSERT INTO public.caixa (
      id, tenant_id, type, amount, reason, responsible_user, reference_id, timestamp
    ) VALUES (
      gen_random_uuid()::TEXT, v_tenant_id, 'DEVOLUTION', p_total_refund,
      'Reembolso Devolução NC ' || p_credit_note_number || ' (Fatura ' || p_original_invoice || ')',
      p_operator_name, p_sale_id, NOW()
    );
  END IF;

  -- 4. Atualizar o estado da venda se aplicável
  IF p_sale_id IS NOT NULL AND p_sale_id <> '' THEN
    UPDATE public.vendas SET status = 'REFUNDED', updated_at = NOW() WHERE id = p_sale_id AND tenant_id = v_tenant_id;
  END IF;

  -- 5. Registar auditoria
  INSERT INTO public.audit_logs (
    id, tenant_id, user_name, action, module, details, timestamp
  ) VALUES (
    gen_random_uuid()::TEXT, v_tenant_id, p_operator_name, 'DEVOLUCAO_CONCLUIDA', 'POS',
    'Nota de Crédito ' || p_credit_note_number || ' emitida para fatura ' || p_original_invoice || ' no valor de ' || p_total_refund || ' MT.',
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'credit_note_number', p_credit_note_number,
    'total_refund', p_total_refund
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_sale_return_atomic FROM anon, public;
GRANT EXECUTE ON FUNCTION public.record_sale_return_atomic TO postgres, authenticated, service_role;

-- ==============================================================================
-- 10. Recarregar o cache do PostgREST imediatamente
-- ==============================================================================
NOTIFY pgrst, 'reload schema';`;

export const SETTINGS_SQL_SCHEMA = `-- ==============================================================================
-- DEFINIÇÕES DO SISTEMA E EMPRESA (public.company_settings, public.settings e public.companies)
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- TABELA DEDICADA PARA DADOS DA EMPRESA COM ISOLAMENTO POR EMAIL DO UTILIZADOR
CREATE TABLE IF NOT EXISTS public.company_settings (
  id TEXT PRIMARY KEY DEFAULT ('cs_' || substr(uuid_generate_v4()::TEXT, 1, 12)),
  user_email TEXT NOT NULL,
  company_name TEXT NOT NULL DEFAULT 'OST Comércio Geral, Lda',
  slogan TEXT DEFAULT '',
  tax_id TEXT DEFAULT '',
  company_nuit TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  currency TEXT DEFAULT 'MT',
  default_vat NUMERIC(5,2) DEFAULT 16.00,
  vat_percentage NUMERIC(5,2) DEFAULT 16.00,
  enable_vat BOOLEAN DEFAULT true,
  receipt_footer_message TEXT DEFAULT '',
  paper_size TEXT DEFAULT '80MM',
  printer_auto_cut BOOLEAN DEFAULT true,
  logo_url TEXT DEFAULT '',
  theme TEXT DEFAULT 'laranja',
  val_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_settings_user_email ON public.company_settings (LOWER(TRIM(user_email)));
CREATE INDEX IF NOT EXISTS idx_company_settings_lookup ON public.company_settings (user_email);

-- TABELA DEDICADA: company_profiles (Isolamento por email com RLS)
CREATE TABLE IF NOT EXISTS public.company_profiles (
  id TEXT PRIMARY KEY DEFAULT ('cp_' || substr(uuid_generate_v4()::TEXT, 1, 12)),
  email TEXT UNIQUE NOT NULL,
  company_name TEXT NOT NULL DEFAULT 'OST Comércio Geral, Lda',
  nuit TEXT DEFAULT '',
  address TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_profiles_email ON public.company_profiles (LOWER(TRIM(email)));

CREATE TABLE IF NOT EXISTS public.companies (
  id TEXT PRIMARY KEY DEFAULT ('comp_' || substr(uuid_generate_v4()::TEXT, 1, 8)),
  name TEXT NOT NULL DEFAULT 'OST Comércio Geral, Lda',
  owner_uid TEXT NOT NULL DEFAULT 'system',
  owner_email TEXT,
  tax_id TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  currency TEXT DEFAULT 'MT',
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.settings (
  id TEXT PRIMARY KEY DEFAULT 'config',
  tenant_id TEXT NOT NULL,
  company_name TEXT NOT NULL DEFAULT 'OST Comércio Geral, Lda',
  company_address TEXT DEFAULT '',
  company_nuit TEXT DEFAULT '',
  company_phone TEXT DEFAULT '',
  company_email TEXT DEFAULT '',
  receipt_footer_message TEXT DEFAULT '',
  enable_vat BOOLEAN DEFAULT true,
  vat_percentage NUMERIC(5,2) DEFAULT 16.00,
  currency TEXT NOT NULL DEFAULT 'MT',
  low_stock_threshold NUMERIC(14,2) DEFAULT 5.00,
  default_printer TEXT DEFAULT 'thermal_80mm',
  cloud_backup_enabled BOOLEAN DEFAULT true,
  backup_frequency TEXT DEFAULT 'daily',
  backup_time TEXT DEFAULT '18:00',
  logo_url TEXT DEFAULT '',
  theme TEXT DEFAULT 'laranja',
  smtp_host TEXT DEFAULT '',
  smtp_port INTEGER DEFAULT 587,
  smtp_user TEXT DEFAULT '',
  smtp_password TEXT DEFAULT '',
  smtp_secure BOOLEAN DEFAULT false,
  smtp_enabled BOOLEAN DEFAULT true,
  smtp_sender_name TEXT DEFAULT '',
  smtp_from_email TEXT DEFAULT '',
  val_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settings_tenant ON public.settings (tenant_id);

ALTER TABLE public.company_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS RLS ESPECÍFICAS PARA company_profiles: Utilizador só acede aos registos com email correspondente autenticado
DROP POLICY IF EXISTS "allow_all_company_profiles" ON public.company_profiles;
DROP POLICY IF EXISTS "company_profiles_matching_email" ON public.company_profiles;
DROP POLICY IF EXISTS "company_profiles_select_matching_email" ON public.company_profiles;
DROP POLICY IF EXISTS "company_profiles_insert_matching_email" ON public.company_profiles;
DROP POLICY IF EXISTS "company_profiles_update_matching_email" ON public.company_profiles;
DROP POLICY IF EXISTS "company_profiles_delete_matching_email" ON public.company_profiles;

CREATE POLICY "company_profiles_matching_email" ON public.company_profiles
  FOR ALL TO authenticated
  USING (
    (auth.jwt()->>'email' IS NOT NULL AND LOWER(TRIM(email)) = LOWER(TRIM(auth.jwt()->>'email')))
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    (auth.jwt()->>'email' IS NOT NULL AND LOWER(TRIM(email)) = LOWER(TRIM(auth.jwt()->>'email')))
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

DROP POLICY IF EXISTS allow_all_company_settings ON public.company_settings;
DROP POLICY IF EXISTS company_settings_matching_email ON public.company_settings;
CREATE POLICY company_settings_matching_email ON public.company_settings
  FOR ALL TO authenticated
  USING (
    (auth.jwt()->>'email' IS NOT NULL AND LOWER(TRIM(user_email)) = LOWER(TRIM(auth.jwt()->>'email')))
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    (auth.jwt()->>'email' IS NOT NULL AND LOWER(TRIM(user_email)) = LOWER(TRIM(auth.jwt()->>'email')))
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

DROP POLICY IF EXISTS allow_all_settings ON public.settings;
DROP POLICY IF EXISTS tenant_isolation_settings ON public.settings;
CREATE POLICY tenant_isolation_settings ON public.settings
  FOR ALL TO authenticated
  USING (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

DROP POLICY IF EXISTS allow_all_companies ON public.companies;
DROP POLICY IF EXISTS tenant_isolation_companies ON public.companies;
CREATE POLICY tenant_isolation_companies ON public.companies
  FOR ALL TO authenticated
  USING (
    (public.current_tenant_id() IS NOT NULL AND id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    (public.current_tenant_id() IS NOT NULL AND id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

REVOKE ALL ON public.company_profiles FROM anon, public;
REVOKE ALL ON public.company_settings FROM anon, public;
REVOKE ALL ON public.settings FROM anon, public;
REVOKE ALL ON public.companies FROM anon, public;

GRANT ALL ON public.company_profiles TO postgres, authenticated, service_role;
GRANT ALL ON public.company_settings TO postgres, authenticated, service_role;
GRANT ALL ON public.settings TO postgres, authenticated, service_role;
GRANT ALL ON public.companies TO postgres, authenticated, service_role;
NOTIFY pgrst, 'reload schema';`;

export const STAFF_SQL_SCHEMA = `-- ==============================================================================
-- COLABORADORES E PERFIS (public.colaboradores e public.profiles)
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.colaboradores (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  auth_uid TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'VENDEDOR',
  contact TEXT DEFAULT '',
  salary NUMERIC(14,2) DEFAULT 0.00,
  admission_date DATE DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  branch TEXT DEFAULT '',
  subscription_plan TEXT DEFAULT 'OURO',
  foto_perfil TEXT DEFAULT '',
  pin TEXT DEFAULT '',
  theme TEXT DEFAULT 'laranja',
  two_factor_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  email TEXT,
  full_name TEXT,
  role TEXT DEFAULT 'ADMIN',
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_colaboradores_tenant ON public.colaboradores (tenant_id);
CREATE INDEX IF NOT EXISTS idx_colaboradores_email ON public.colaboradores (email);

ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_colaboradores ON public.colaboradores;
DROP POLICY IF EXISTS tenant_isolation_colaboradores ON public.colaboradores;
CREATE POLICY tenant_isolation_colaboradores ON public.colaboradores
  FOR ALL TO authenticated
  USING (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

DROP POLICY IF EXISTS allow_all_profiles ON public.profiles;
DROP POLICY IF EXISTS profiles_isolation ON public.profiles;
CREATE POLICY profiles_isolation ON public.profiles
  FOR ALL TO authenticated
  USING (
    id = auth.uid()
    OR (public.current_tenant_id() IS NOT NULL AND company_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    id = auth.uid()
    OR (public.current_tenant_id() IS NOT NULL AND company_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

REVOKE ALL ON public.colaboradores FROM anon, public;
REVOKE ALL ON public.profiles FROM anon, public;
GRANT ALL ON public.colaboradores TO postgres, authenticated, service_role;
GRANT ALL ON public.profiles TO postgres, authenticated, service_role;
NOTIFY pgrst, 'reload schema';`;

export const CUSTOMERS_SQL_SCHEMA = `-- ==============================================================================
-- CLIENTES E CRÉDITO (public.clientes, public.customers e customer_debts)
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.clientes (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  nuit TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  credit_limit NUMERIC(14,2) DEFAULT 0.00,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  debt NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_spent NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  purchase_count INTEGER NOT NULL DEFAULT 0,
  last_purchase_date TIMESTAMPTZ,
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  credit_blocked BOOLEAN NOT NULL DEFAULT false,
  preferred_payment_method TEXT,
  one_click_checkout_enabled BOOLEAN DEFAULT false,
  settlements JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.customers (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  nuit TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  credit_limit NUMERIC(14,2) DEFAULT 0.00,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  debt NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_spent NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  purchase_count INTEGER NOT NULL DEFAULT 0,
  last_purchase_date TIMESTAMPTZ,
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  credit_blocked BOOLEAN NOT NULL DEFAULT false,
  preferred_payment_method TEXT,
  one_click_checkout_enabled BOOLEAN DEFAULT false,
  settlements JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.customer_debts (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  sale_id TEXT,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  remaining_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  due_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.debt_payments (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  debt_id TEXT,
  customer_id TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  payment_method TEXT NOT NULL DEFAULT 'CASH',
  receipt_number TEXT,
  operator_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_tenant ON public.clientes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_clientes_phone ON public.clientes (phone);
CREATE INDEX IF NOT EXISTS idx_customer_debts_cust ON public.customer_debts (customer_id);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_clientes ON public.clientes;
DROP POLICY IF EXISTS tenant_isolation_clientes ON public.clientes;
CREATE POLICY tenant_isolation_clientes ON public.clientes
  FOR ALL TO authenticated
  USING (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

DROP POLICY IF EXISTS allow_all_customers ON public.customers;
DROP POLICY IF EXISTS tenant_isolation_customers ON public.customers;
CREATE POLICY tenant_isolation_customers ON public.customers
  FOR ALL TO authenticated
  USING (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

DROP POLICY IF EXISTS allow_all_customer_debts ON public.customer_debts;
DROP POLICY IF EXISTS tenant_isolation_customer_debts ON public.customer_debts;
CREATE POLICY tenant_isolation_customer_debts ON public.customer_debts
  FOR ALL TO authenticated
  USING (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

DROP POLICY IF EXISTS allow_all_debt_payments ON public.debt_payments;
DROP POLICY IF EXISTS tenant_isolation_debt_payments ON public.debt_payments;
CREATE POLICY tenant_isolation_debt_payments ON public.debt_payments
  FOR ALL TO authenticated
  USING (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

REVOKE ALL ON public.clientes FROM anon, public;
REVOKE ALL ON public.customers FROM anon, public;
REVOKE ALL ON public.customer_debts FROM anon, public;
REVOKE ALL ON public.debt_payments FROM anon, public;

GRANT ALL ON public.clientes TO postgres, authenticated, service_role;
GRANT ALL ON public.customers TO postgres, authenticated, service_role;
GRANT ALL ON public.customer_debts TO postgres, authenticated, service_role;
GRANT ALL ON public.debt_payments TO postgres, authenticated, service_role;
NOTIFY pgrst, 'reload schema';`;

export const CAIXA_AUDIT_SQL_SCHEMA = `-- ==============================================================================
-- CAIXA, TURNOS, FECHAMENTOS E AUDITORIA (public.caixa, cash_closures, audit_logs)
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.cash_closures (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  date TEXT NOT NULL,
  opening_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_sales NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_cash NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_mpesa NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_emola NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_card NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_credit NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_expenses NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  expected_in_drawer NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  actual_in_drawer NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  difference NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  notes TEXT,
  closed_by TEXT NOT NULL DEFAULT 'Operador',
  closed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cash_shifts (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  operator_id TEXT,
  operator_name TEXT NOT NULL,
  initial_cash NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  final_cash NUMERIC(14,2),
  status TEXT NOT NULL DEFAULT 'OPEN',
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  action TEXT NOT NULL,
  category TEXT NOT NULL,
  details TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT 'Sistema',
  user_role TEXT DEFAULT 'ADMIN',
  ip_address TEXT,
  device TEXT
);

CREATE TABLE IF NOT EXISTS public.recovery_requests (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON public.audit_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cash_closures_tenant ON public.cash_closures (tenant_id);

ALTER TABLE public.cash_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_cash_closures ON public.cash_closures;
DROP POLICY IF EXISTS tenant_isolation_cash_closures ON public.cash_closures;
CREATE POLICY tenant_isolation_cash_closures ON public.cash_closures
  FOR ALL TO authenticated
  USING (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

DROP POLICY IF EXISTS allow_all_cash_shifts ON public.cash_shifts;
DROP POLICY IF EXISTS tenant_isolation_cash_shifts ON public.cash_shifts;
CREATE POLICY tenant_isolation_cash_shifts ON public.cash_shifts
  FOR ALL TO authenticated
  USING (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

DROP POLICY IF EXISTS allow_all_audit_logs ON public.audit_logs;
DROP POLICY IF EXISTS tenant_isolation_audit_logs ON public.audit_logs;
CREATE POLICY tenant_isolation_audit_logs ON public.audit_logs
  FOR ALL TO authenticated
  USING (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

DROP POLICY IF EXISTS allow_all_recovery_requests ON public.recovery_requests;
DROP POLICY IF EXISTS service_role_recovery_requests ON public.recovery_requests;
CREATE POLICY service_role_recovery_requests ON public.recovery_requests
  FOR ALL TO authenticated
  USING (
    auth.role() = 'service_role'
    OR current_user = 'postgres'
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR current_user = 'postgres'
  );

REVOKE ALL ON public.cash_closures FROM anon, public;
REVOKE ALL ON public.cash_shifts FROM anon, public;
REVOKE ALL ON public.audit_logs FROM anon, public;
REVOKE ALL ON public.recovery_requests FROM anon, public;

GRANT ALL ON public.cash_closures TO postgres, authenticated, service_role;
GRANT ALL ON public.cash_shifts TO postgres, authenticated, service_role;
GRANT ALL ON public.audit_logs TO postgres, authenticated, service_role;
GRANT ALL ON public.recovery_requests TO postgres, authenticated, service_role;
NOTIFY pgrst, 'reload schema';`;

export const FULL_DATABASE_SCHEMA_SQL =
  SETTINGS_SQL_SCHEMA +
  "\n\n" +
  STAFF_SQL_SCHEMA +
  "\n\n" +
  CUSTOMERS_SQL_SCHEMA +
  "\n\n" +
  PRODUCTS_SQL_SCHEMA +
  "\n\n" +
  SALES_SQL_SCHEMA +
  "\n\n" +
  CAIXA_AUDIT_SQL_SCHEMA;
