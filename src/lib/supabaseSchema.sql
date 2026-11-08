-- ============================================================================
-- OST VENDAS ERP - SUPABASE POSTGRESQL SCHEMA, RLS & MULTI-TENANT ISOLATION
-- ============================================================================
-- Architecture: Supabase Auth -> Supabase Client -> PostgreSQL + RLS + RPCs
-- Financial Types: All monetary & quantity metrics use NUMERIC(14,2)
-- Multi-Tenancy: Strict isolation via tenant_id, auth.uid() and profiles.company_id
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 2. TABLES DEFINITIONS & FULL SCHEMAS (100% INTEGRATED WITH SYSTEM TYPES)
-- ============================================================================

-- 2.1 EMPRESAS / COMPANIES (Multi-tenant boundaries)
CREATE TABLE IF NOT EXISTS public.companies (
  id TEXT PRIMARY KEY DEFAULT ('comp_' || substr(uuid_generate_v4()::TEXT, 1, 8)),
  name TEXT NOT NULL,
  owner_uid TEXT NOT NULL,
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

-- 2.1b DEFINIÇÕES E DADOS DA EMPRESA POR UTILIZADOR / EMAIL ISOLADO
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

-- 2.1c PERFIS DE EMPRESA ISOLADOS POR EMAIL / COMPANY PROFILES
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

-- 2.2 PERFIS DE UTILIZADOR / PROFILES (Direct mapping with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES public.companies(id) ON DELETE SET NULL,
  email TEXT,
  full_name TEXT,
  role TEXT DEFAULT 'ADMIN',
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.3 CATEGORIAS DE ARTIGOS
CREATE TABLE IF NOT EXISTS public.categories (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.4 FORNECEDORES / SUPPLIERS
CREATE TABLE IF NOT EXISTS public.suppliers (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  nif TEXT,
  nuit TEXT,
  status TEXT DEFAULT 'Ativo',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.5 FILIAIS / ARMAZÉNS / BRANCHES
CREATE TABLE IF NOT EXISTS public.branches (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  contact TEXT,
  city TEXT,
  code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.6 PRODUTOS / ARTIGOS (Inventário, Preços e Variações)
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
  unit TEXT NOT NULL DEFAULT 'un',
  expiry_date TEXT,
  image TEXT,
  image_url TEXT,
  emoji TEXT,
  promotion TEXT,
  is_favorite BOOLEAN DEFAULT false,
  brand TEXT,
  weight_based BOOLEAN DEFAULT false,
  branch_stocks JSONB DEFAULT '{}'::jsonb,
  batches JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe migrations for missing columns in existing public.produtos
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS owner_id TEXT;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS cost NUMERIC(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS price NUMERIC(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS expiry_date TEXT;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS emoji TEXT;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS promotion TEXT;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS weight_based BOOLEAN DEFAULT false;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS branch_stocks JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS batches JSONB DEFAULT '[]'::jsonb;

-- Trigger para sincronizar cost_price <-> cost e sale_price <-> price automaticamente
CREATE OR REPLACE FUNCTION public.sync_product_pricing_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.sale_price IS NOT NULL AND (NEW.price IS NULL OR NEW.price = 0) THEN
    NEW.price := NEW.sale_price;
  ELSIF NEW.price IS NOT NULL AND (NEW.sale_price IS NULL OR NEW.sale_price = 0) THEN
    NEW.sale_price := NEW.price;
  END IF;

  IF NEW.cost_price IS NOT NULL AND (NEW.cost IS NULL OR NEW.cost = 0) THEN
    NEW.cost := NEW.cost_price;
  ELSIF NEW.cost IS NOT NULL AND (NEW.cost_price IS NULL OR NEW.cost_price = 0) THEN
    NEW.cost_price := NEW.cost;
  END IF;

  IF NEW.image_url IS NOT NULL AND NEW.image IS NULL THEN
    NEW.image := NEW.image_url;
  ELSIF NEW.image IS NOT NULL AND NEW.image_url IS NULL THEN
    NEW.image_url := NEW.image;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_pricing ON public.produtos;
CREATE TRIGGER trg_sync_product_pricing
  BEFORE INSERT OR UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_pricing_columns();

-- 2.7 TABELA OU VIEW COMPATÍVEL DE PRODUTOS EM INGLÊS (public.products)
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

-- Trigger de sincronização nos produtos em inglês
DROP TRIGGER IF EXISTS trg_sync_products_table_pricing ON public.products;
CREATE TRIGGER trg_sync_products_table_pricing
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_pricing_columns();

-- 2.8 LOTES DE PRODUTOS / PRODUCT BATCHES (FIFO / LIFO / Controlo de Validade)
CREATE TABLE IF NOT EXISTS public.product_batches (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  batch_code TEXT NOT NULL,
  quantity NUMERIC(14,2) NOT NULL,
  initial_quantity NUMERIC(14,2) NOT NULL,
  expiry_date DATE NOT NULL,
  cost_price NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.9 MOVIMENTOS DE STOCK (Kardex / Rastreabilidade)
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'ENTRY', 'EXIT_SALE', 'LOSS', 'ADJUSTMENT', 'TRANSFER', 'RETURN'
  quantity NUMERIC(14,2) NOT NULL,
  previous_stock NUMERIC(14,2) NOT NULL,
  new_stock NUMERIC(14,2) NOT NULL,
  cost_price NUMERIC(14,2) DEFAULT 0.00,
  reason TEXT,
  reference_id TEXT,
  user_id TEXT,
  user_name TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 2.10 TRANSFERÊNCIAS DE STOCK ENTRE FILIAIS / ARMAZÉNS
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  origin_branch_id TEXT NOT NULL,
  destination_branch_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC(14,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'COMPLETED', -- 'PENDING', 'COMPLETED', 'CANCELLED'
  responsible_user TEXT NOT NULL,
  notes TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 2.11 CLIENTES & CRÉDITO
CREATE TABLE IF NOT EXISTS public.clientes (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  nuit TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  credit_limit NUMERIC(14,2) NOT NULL DEFAULT 0.00,
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

-- Safe migrations for clientes
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS debt NUMERIC(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS total_spent NUMERIC(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS purchase_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS last_purchase_date TIMESTAMPTZ;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS loyalty_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS credit_blocked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS preferred_payment_method TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS one_click_checkout_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS settlements JSONB DEFAULT '[]'::jsonb;

-- Trigger para sincronizar balance <-> debt em clientes
CREATE OR REPLACE FUNCTION public.sync_cliente_balance_debt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.balance IS NOT NULL AND (NEW.debt IS NULL OR NEW.debt = 0) THEN
    NEW.debt := NEW.balance;
  ELSIF NEW.debt IS NOT NULL AND (NEW.balance IS NULL OR NEW.balance = 0) THEN
    NEW.balance := NEW.debt;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cliente_balance ON public.clientes;
CREATE TRIGGER trg_sync_cliente_balance
  BEFORE INSERT OR UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.sync_cliente_balance_debt();

-- 2.12 DÍVIDAS / CONTAS A RECEBER (Customer Debts)
CREATE TABLE IF NOT EXISTS public.customer_debts (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  sale_id TEXT,
  total_amount NUMERIC(14,2) NOT NULL,
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  remaining_balance NUMERIC(14,2) NOT NULL,
  due_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

-- 2.13 PAGAMENTOS DE DÍVIDAS / LIQUIDAÇÕES
CREATE TABLE IF NOT EXISTS public.debt_payments (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  debt_id TEXT NOT NULL REFERENCES public.customer_debts(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL,
  payment_method TEXT NOT NULL,
  received_by TEXT,
  notes TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 2.14 VENDAS / FATURAS (Transactions)
CREATE TABLE IF NOT EXISTS public.vendas (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  idempotency_key TEXT,
  invoice_number TEXT NOT NULL,
  customer_id TEXT,
  customer_name TEXT DEFAULT 'Consumidor Final',
  customer_nuit TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  seller_id TEXT,
  seller_name TEXT,
  operator_name TEXT,
  cashier_name TEXT,
  branch_id TEXT,
  payment_method TEXT NOT NULL,
  payment_details TEXT,
  payment_status TEXT NOT NULL DEFAULT 'PAID',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  vat_total NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  grand_total NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  change_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  fiscal_hash TEXT,
  fiscal_keys TEXT,
  fiscal_certified BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'COMPLETED', -- 'COMPLETED', 'CANCELLED', 'REFUNDED'
  items JSONB NOT NULL DEFAULT '[]'::JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Safe migrations for vendas
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS cashier_name TEXT;
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS branch_id TEXT;
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS payment_details TEXT;
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS fiscal_hash TEXT;
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS fiscal_keys TEXT;
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS fiscal_certified BOOLEAN DEFAULT false;
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2.15 ITENS DA VENDA
CREATE TABLE IF NOT EXISTS public.venda_itens (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  sale_id TEXT NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  unit_price NUMERIC(14,2) NOT NULL,
  quantity NUMERIC(14,2) NOT NULL,
  cost_price NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 16.00,
  vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_price NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.16 DEVOLUÇÕES / NOTAS DE CRÉDITO (Returns & Credit Notes)
CREATE TABLE IF NOT EXISTS public.returns (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
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

-- Compatibilidade: View credit_notes apontando para returns
CREATE OR REPLACE VIEW public.credit_notes AS SELECT * FROM public.returns;

-- 2.17 CARRINHOS SUSPENSOS / EM ESPERA NO POS (Suspended Carts)
CREATE TABLE IF NOT EXISTS public.suspended_carts (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  customer_id TEXT,
  customer_name TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  note TEXT,
  saved_by TEXT,
  saved_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.18 FLUXO DE CAIXA / MOVIMENTOS DE CAIXA
CREATE TABLE IF NOT EXISTS public.caixa (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  cash_register_id TEXT,
  shift_id TEXT,
  type TEXT NOT NULL, -- 'INPUT', 'REINFORCEMENT', 'EXPENSE', 'QUEBRA', 'SANGRIA', 'DEVOLUTION', 'SOBRA'
  category TEXT,
  amount NUMERIC(14,2) NOT NULL,
  reason TEXT NOT NULL,
  responsible_user TEXT,
  payment_method TEXT DEFAULT 'CASH',
  reference TEXT,
  reference_id TEXT,
  destination TEXT,
  supplier_or_client TEXT,
  authorized_supervisor TEXT,
  supervisor_pin_verified BOOLEAN DEFAULT false,
  notes TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Safe migrations for caixa
ALTER TABLE public.caixa ADD COLUMN IF NOT EXISTS shift_id TEXT;
ALTER TABLE public.caixa ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.caixa ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'CASH';
ALTER TABLE public.caixa ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE public.caixa ADD COLUMN IF NOT EXISTS destination TEXT;
ALTER TABLE public.caixa ADD COLUMN IF NOT EXISTS supplier_or_client TEXT;
ALTER TABLE public.caixa ADD COLUMN IF NOT EXISTS authorized_supervisor TEXT;
ALTER TABLE public.caixa ADD COLUMN IF NOT EXISTS supervisor_pin_verified BOOLEAN DEFAULT false;
ALTER TABLE public.caixa ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2.19 SESSÕES DE CAIXA REGISTRADORA (Cash Registers)
CREATE TABLE IF NOT EXISTS public.cash_registers (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  opened_by TEXT NOT NULL,
  opener_name TEXT,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  closing_balance NUMERIC(14,2),
  actual_closing_balance NUMERIC(14,2),
  difference NUMERIC(14,2) DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'OPEN',
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- 2.20 HISTÓRICO DE FECHAMENTO DE TURNOS / BALANCETES (Cash Closures)
CREATE TABLE IF NOT EXISTS public.cash_closures (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  shift_id TEXT,
  shift_number INTEGER,
  register_id TEXT,
  opened_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL,
  opened_by TEXT NOT NULL,
  closed_by TEXT NOT NULL,
  opening_supervisor TEXT,
  closing_supervisor TEXT,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  theoretical_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  physical_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  difference NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  difference_type TEXT NOT NULL DEFAULT 'EXACT', -- 'EXACT', 'SURPLUS', 'SHORTAGE'
  reconciliation JSONB NOT NULL DEFAULT '{}'::JSONB,
  denominations JSONB DEFAULT '{}'::JSONB,
  closing_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.21 ESTADO ATIVO DO TURNO DE CAIXA (Current Cash Shift)
CREATE TABLE IF NOT EXISTS public.cash_shifts (
  id TEXT PRIMARY KEY DEFAULT 'current_shift',
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CLOSED', -- 'OPEN', 'CLOSED'
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  opened_by TEXT NOT NULL DEFAULT 'Admin',
  opening_supervisor TEXT,
  opening_notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.22 COLABORADORES / UTILIZADORES DO SISTEMA (Staff & Permissions)
CREATE TABLE IF NOT EXISTS public.colaboradores (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  auth_uid TEXT,
  name TEXT NOT NULL,
  username TEXT,
  email TEXT,
  contact TEXT,
  whatsapp TEXT,
  role TEXT NOT NULL DEFAULT 'Operador',
  salary NUMERIC(14,2) DEFAULT 0.00,
  admission_date DATE DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'BLOCKED'
  pin TEXT,
  pin_created_at TIMESTAMPTZ,
  pin_changed BOOLEAN DEFAULT true,
  foto_perfil TEXT,
  theme TEXT DEFAULT 'laranja',
  two_factor_email_enabled BOOLEAN DEFAULT true,
  two_factor_sms_enabled BOOLEAN DEFAULT false,
  is_phone_validated BOOLEAN DEFAULT false,
  observacoes TEXT,
  expiration_date DATE,
  logo_url TEXT,
  web_authn_enabled BOOLEAN DEFAULT false,
  web_authn_credential_id TEXT,
  subscription_plan TEXT DEFAULT 'OURO',
  plan_granted_by TEXT,
  branch TEXT DEFAULT 'Sede Principal',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe migrations for colaboradores
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'laranja';
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS two_factor_email_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS two_factor_sms_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS is_phone_validated BOOLEAN DEFAULT false;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS observacoes TEXT;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS expiration_date DATE;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS web_authn_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS web_authn_credential_id TEXT;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS plan_granted_by TEXT;

-- 2.23 PEDIDOS DE COMPRA A FORNECEDORES (Supplier Orders)
CREATE TABLE IF NOT EXISTS public.supplier_orders (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity_requested NUMERIC(14,2) NOT NULL,
  unit_cost NUMERIC(14,2) NOT NULL,
  total_value NUMERIC(14,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pendente', -- 'Pendente', 'Recebido', 'Cancelado'
  payment_status TEXT NOT NULL DEFAULT 'Pendente', -- 'Pago', 'Crédito', 'Pendente'
  request_date TIMESTAMPTZ DEFAULT NOW(),
  received_date TIMESTAMPTZ
);

-- 2.24 LEMBRETES OPERACIONAIS (Reminders)
CREATE TABLE IF NOT EXISTS public.reminders (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  time TEXT,
  completed BOOLEAN NOT NULL DEFAULT false,
  priority TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high'
  date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.25 LEMBRETES E ROTINAS RECORRENTES (Recurring Reminders)
CREATE TABLE IF NOT EXISTS public.recurring_reminders (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  frequency TEXT NOT NULL DEFAULT 'daily', -- 'daily', 'weekly', 'monthly'
  days_of_week JSONB DEFAULT '[]'::jsonb,
  time TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.26 PROGRESSO DE FORMAÇÃO E TREINAMENTO DO STAFF (User Training Progress)
CREATE TABLE IF NOT EXISTS public.user_training_progress (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  watched BOOLEAN DEFAULT true,
  watched_at TIMESTAMPTZ DEFAULT NOW(),
  quiz_score INTEGER,
  quiz_completed BOOLEAN DEFAULT false
);

-- 2.27 LOGS DE AUDITORIA & SEGURANÇA
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  user_name TEXT NOT NULL,
  user_role TEXT,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  details TEXT,
  ip_address TEXT,
  device TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Safe migrations for audit_logs
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_role TEXT;

-- 2.28 DEFINIÇÕES DO SISTEMA (Settings & Configuration)
CREATE TABLE IF NOT EXISTS public.settings (
  id TEXT PRIMARY KEY DEFAULT 'config',
  tenant_id TEXT NOT NULL,
  company_name TEXT NOT NULL DEFAULT 'OST Comércio Geral, Lda',
  company_address TEXT DEFAULT 'Av. Eduardo Mondlane, Nº 1234, Maputo - Moçambique',
  company_nuit TEXT DEFAULT '400123987',
  company_phone TEXT DEFAULT '+258 84 000 0000',
  company_email TEXT DEFAULT 'contacto@ostvendas.co.mz',
  receipt_footer_message TEXT DEFAULT 'Obrigado pela sua preferência! Processado por computador.',
  enable_vat BOOLEAN DEFAULT true,
  vat_percentage NUMERIC(5,2) DEFAULT 16.00,
  currency TEXT DEFAULT 'MT',
  low_stock_threshold NUMERIC(14,2) DEFAULT 5.00,
  default_printer TEXT DEFAULT 'thermal_80mm',
  cloud_backup_enabled BOOLEAN DEFAULT true,
  backup_frequency TEXT DEFAULT 'daily',
  backup_time TEXT DEFAULT '18:00',
  logo_url TEXT,
  theme TEXT DEFAULT 'laranja',
  invoice_series TEXT DEFAULT 'A',
  security_pin TEXT,
  system_version TEXT DEFAULT '2.4.0',
  auto_backup BOOLEAN DEFAULT true,
  sms_gateway TEXT,
  smtp_server TEXT,
  report_recipient_email TEXT,
  report_hour TEXT DEFAULT '18:00',
  report_frequency TEXT DEFAULT 'daily',
  fiscal_certification_number TEXT,
  fiscal_logo_url TEXT,
  fiscal_mode_enabled BOOLEAN DEFAULT true,
  inventory_strategy TEXT DEFAULT 'FIFO',
  expiry_alert_days INTEGER DEFAULT 30,
  expiry_alerts_enabled BOOLEAN DEFAULT true,
  expiry_notification_method TEXT DEFAULT 'EMAIL',
  ai_auto_monitoring BOOLEAN DEFAULT true,
  ai_health_sensitivity INTEGER DEFAULT 5,
  branches JSONB DEFAULT '[]'::jsonb,
  stock_transfers JSONB DEFAULT '[]'::jsonb,
  batches JSONB DEFAULT '[]'::jsonb,
  suppliers JSONB DEFAULT '[]'::jsonb,
  supplier_orders JSONB DEFAULT '[]'::jsonb,
  supplier_overdue_tolerance_days INTEGER DEFAULT 7,
  val_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe migrations for settings
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS invoice_series TEXT DEFAULT 'A';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS security_pin TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS system_version TEXT DEFAULT '2.4.0';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS auto_backup BOOLEAN DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS sms_gateway TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS smtp_server TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS smtp_host TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT 587;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS smtp_user TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS smtp_password TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS smtp_secure BOOLEAN DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS smtp_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS smtp_sender_name TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS smtp_from_email TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS report_recipient_email TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS report_hour TEXT DEFAULT '18:00';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS report_frequency TEXT DEFAULT 'daily';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS fiscal_certification_number TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS fiscal_logo_url TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS fiscal_mode_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS inventory_strategy TEXT DEFAULT 'FIFO';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS expiry_alert_days INTEGER DEFAULT 30;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS expiry_alerts_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS expiry_notification_method TEXT DEFAULT 'EMAIL';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS ai_auto_monitoring BOOLEAN DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS ai_health_sensitivity INTEGER DEFAULT 5;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS branches JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS stock_transfers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS batches JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS suppliers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS supplier_orders JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS supplier_overdue_tolerance_days INTEGER DEFAULT 7;

-- 2.29 PEDIDOS DE RECUPERAÇÃO DE ACESSO
CREATE TABLE IF NOT EXISTS public.recovery_requests (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- ============================================================================
-- 3. INDEXES FOR MAXIMUM QUERY AND TRANSACTION PERFORMANCE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_produtos_tenant ON public.produtos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_produtos_code ON public.produtos(code);
CREATE INDEX IF NOT EXISTS idx_produtos_barcode ON public.produtos(barcode);
CREATE INDEX IF NOT EXISTS idx_produtos_active ON public.produtos(is_active);
CREATE INDEX IF NOT EXISTS idx_produtos_category ON public.produtos(category);

CREATE INDEX IF NOT EXISTS idx_products_tenant ON public.products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(is_active);

CREATE INDEX IF NOT EXISTS idx_clientes_tenant ON public.clientes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clientes_nuit ON public.clientes(nuit);
CREATE INDEX IF NOT EXISTS idx_clientes_phone ON public.clientes(phone);

CREATE INDEX IF NOT EXISTS idx_vendas_tenant ON public.vendas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vendas_invoice ON public.vendas(invoice_number);
CREATE INDEX IF NOT EXISTS idx_vendas_timestamp ON public.vendas(timestamp);
CREATE INDEX IF NOT EXISTS idx_vendas_created ON public.vendas(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendas_tenant_idempotency ON public.vendas (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_venda_itens_sale ON public.venda_itens(sale_id);
CREATE INDEX IF NOT EXISTS idx_venda_itens_prod ON public.venda_itens(product_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant ON public.stock_movements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_prod ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_timestamp ON public.stock_movements(timestamp);

CREATE INDEX IF NOT EXISTS idx_product_batches_prod ON public.product_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_expiry ON public.product_batches(expiry_date);

CREATE INDEX IF NOT EXISTS idx_caixa_tenant ON public.caixa(tenant_id);
CREATE INDEX IF NOT EXISTS idx_caixa_timestamp ON public.caixa(timestamp);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp);

CREATE INDEX IF NOT EXISTS idx_colaboradores_tenant ON public.colaboradores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_colaboradores_email ON public.colaboradores(email);
CREATE INDEX IF NOT EXISTS idx_profiles_company ON public.profiles(company_id);

CREATE INDEX IF NOT EXISTS idx_returns_tenant ON public.returns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_returns_credit_note ON public.returns(credit_note_number);

CREATE INDEX IF NOT EXISTS idx_reminders_tenant ON public.reminders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_suspended_carts_tenant ON public.suspended_carts(tenant_id);

-- ============================================================================
-- 4. TENANT ISOLATION HELPERS & TRIGGER FOR AUTH
-- ============================================================================

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

-- Trigger: Cria automaticamente Empresa e Perfil ao registar novo utilizador
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id TEXT;
  v_company_name TEXT;
  v_user_name TEXT;
BEGIN
  v_user_name := COALESCE(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1)
  );
  
  v_company_name := COALESCE(
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'branch',
    v_user_name || ' - Vendas'
  );

  v_company_id := 'comp_' || substr(new.id::text, 1, 8);

  INSERT INTO public.companies (id, name, owner_uid, email, created_at, updated_at)
  VALUES (v_company_id, v_company_name, new.id::text, new.email, NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, company_id, email, full_name, role, avatar_url, created_at, updated_at)
  VALUES (
    new.id,
    v_company_id,
    new.email,
    v_user_name,
    COALESCE(new.raw_user_meta_data->>'role', 'ADMIN'),
    COALESCE(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    company_id = COALESCE(public.profiles.company_id, EXCLUDED.company_id),
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    updated_at = NOW();

  INSERT INTO public.colaboradores (
    id, tenant_id, auth_uid, name, email, role, status, branch, subscription_plan, created_at, updated_at
  )
  VALUES (
    'emp_' || substr(new.id::text, 1, 8),
    v_company_id,
    new.id::text,
    v_user_name,
    new.email,
    'ADMIN',
    'ACTIVE',
    v_company_name,
    'OURO',
    NOW(),
    NOW()
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.settings (
    id, tenant_id, company_name, company_email, company_phone, currency, enable_vat, vat_percentage, updated_at
  )
  VALUES (
    'config_' || v_company_id,
    v_company_id,
    v_company_name,
    new.email,
    '+258 84 000 0000',
    'MT',
    true,
    16.00,
    NOW()
  )
  ON CONFLICT DO NOTHING;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES & CONCESSÃO DE PERMISSÕES
-- ============================================================================
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venda_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suspended_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caixa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_training_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_requests ENABLE ROW LEVEL SECURITY;

-- 5.1 FUNÇÃO HELPER DE CONTEXTO MULTI-TENANT SEGURO E AUTORITATIVO
-- NUNCA aceita JWTs, parâmetros ou variáveis de sessão controlados pelo cliente para trocar de empresa
CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS TEXT AS $$
BEGIN
  -- Se o utilizador estiver autenticado, derivar o tenant estritamente da identidade autorizada no banco
  IF auth.uid() IS NOT NULL THEN
    RETURN public.get_my_company_id();
  END IF;

  -- Se for operação interna do sistema com credenciais de serviço devidamente verificadas (sem depender de current_user)
  IF (
    COALESCE(auth.role(), '') = 'service_role'
    OR COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') = 'service_role'
    OR (session_user IN ('service_role', 'supabase_admin'))
    OR (session_user = 'postgres' AND COALESCE(auth.role(), '') = '' AND NULLIF(current_setting('request.jwt.claims', true), '') IS NULL)
  ) THEN
    RETURN NULLIF(current_setting('app.current_tenant_id', true), '');
  END IF;

  -- Acessos anónimos ou sem credenciais de serviço válidas não possuem tenant
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.current_tenant_id() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated, service_role, postgres;

-- 5.2 PROTEÇÕES CONTRA ESCALAÇÃO DE PRIVILÉGIOS E ALTERAÇÃO DE PERFIS (Triggers Autoritativos)
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_service BOOLEAN;
  v_caller_role TEXT;
BEGIN
  v_is_service := (
    COALESCE(auth.role(), '') = 'service_role'
    OR COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') = 'service_role'
    OR (session_user IN ('service_role', 'supabase_admin'))
    OR (session_user = 'postgres' AND COALESCE(auth.role(), '') = '' AND NULLIF(current_setting('request.jwt.claims', true), '') IS NULL)
  );

  IF v_is_service THEN
    RETURN NEW;
  END IF;

  -- Impedir utilizador de alterar company_id
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Violação de segurança: Não é permitido alterar a empresa (company_id) do perfil.';
  END IF;

  -- Impedir utilizador de alterar o próprio role ou de terceiros sem privilégio de ADMIN verificado
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    v_caller_role := public.get_my_role();
    IF v_caller_role IS DISTINCT FROM 'ADMIN' THEN
      RAISE EXCEPTION 'Acesso negado: Apenas administradores autorizados têm permissão para alterar papéis (role).';
    END IF;
  END IF;

  -- Impedir alteração de id
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Violação de segurança: Não é permitido alterar o identificador do perfil.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- Trigger para colaboradores: apenas administradores podem inserir, alterar ou apagar colaboradores
CREATE OR REPLACE FUNCTION public.prevent_colaborador_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_service BOOLEAN;
  v_caller_role TEXT;
BEGIN
  v_is_service := (
    COALESCE(auth.role(), '') = 'service_role'
    OR COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') = 'service_role'
    OR (session_user IN ('service_role', 'supabase_admin'))
    OR (session_user = 'postgres' AND COALESCE(auth.role(), '') = '' AND NULLIF(current_setting('request.jwt.claims', true), '') IS NULL)
  );

  IF v_is_service THEN
    RETURN NEW;
  END IF;

  v_caller_role := public.get_my_role();
  IF v_caller_role IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Acesso negado: Apenas administradores autorizados têm permissão para gerir colaboradores e permissões.';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Violação de segurança: Não é permitido alterar a empresa (tenant_id) do colaborador.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_colaborador_privilege_escalation ON public.colaboradores;
CREATE TRIGGER trg_prevent_colaborador_privilege_escalation
  BEFORE INSERT OR UPDATE OR DELETE ON public.colaboradores
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_colaborador_privilege_escalation();

-- 5.3 POLÍTICAS RLS ESPECÍFICAS POR OPERAÇÃO PARA PROFILES
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
DROP POLICY IF EXISTS "profiles_isolation" ON public.profiles;
DROP POLICY IF EXISTS "allow_all_profiles" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR (public.get_my_role() IN ('ADMIN', 'SUPERVISOR') AND company_id = public.get_my_company_id())
    OR auth.role() = 'service_role'
    OR session_user IN ('postgres', 'service_role')
  );

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR (public.get_my_role() = 'ADMIN' AND company_id = public.get_my_company_id())
    OR auth.role() = 'service_role'
    OR session_user IN ('postgres', 'service_role')
  )
  WITH CHECK (
    id = auth.uid()
    OR (public.get_my_role() = 'ADMIN' AND company_id = public.get_my_company_id())
    OR auth.role() = 'service_role'
    OR session_user IN ('postgres', 'service_role')
  );

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    id = auth.uid()
    OR (public.get_my_role() = 'ADMIN' AND company_id = public.get_my_company_id())
    OR auth.role() = 'service_role'
    OR session_user IN ('postgres', 'service_role')
  );

CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE TO authenticated
  USING (
    (public.get_my_role() = 'ADMIN' AND company_id = public.get_my_company_id())
    OR auth.role() = 'service_role'
    OR session_user IN ('postgres', 'service_role')
  );

REVOKE ALL ON public.profiles FROM anon, public;
GRANT ALL ON public.profiles TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

-- 5.4 POLÍTICAS RLS ESPECÍFICAS POR OPERAÇÃO PARA COLABORADORES
DROP POLICY IF EXISTS "colaboradores_select" ON public.colaboradores;
DROP POLICY IF EXISTS "colaboradores_insert" ON public.colaboradores;
DROP POLICY IF EXISTS "colaboradores_update" ON public.colaboradores;
DROP POLICY IF EXISTS "colaboradores_delete" ON public.colaboradores;
DROP POLICY IF EXISTS "tenant_isolation_colaboradores" ON public.colaboradores;
DROP POLICY IF EXISTS "allow_all_colaboradores" ON public.colaboradores;

CREATE POLICY "colaboradores_select" ON public.colaboradores
  FOR SELECT TO authenticated
  USING (
    (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
    OR auth.role() = 'service_role'
    OR session_user IN ('postgres', 'service_role')
  );

CREATE POLICY "colaboradores_insert" ON public.colaboradores
  FOR INSERT TO authenticated
  WITH CHECK (
    ((public.get_my_role() = 'ADMIN' AND tenant_id = public.current_tenant_id()))
    OR auth.role() = 'service_role'
    OR session_user IN ('postgres', 'service_role')
  );

CREATE POLICY "colaboradores_update" ON public.colaboradores
  FOR UPDATE TO authenticated
  USING (
    ((public.get_my_role() = 'ADMIN' AND tenant_id = public.current_tenant_id()))
    OR auth.role() = 'service_role'
    OR session_user IN ('postgres', 'service_role')
  )
  WITH CHECK (
    ((public.get_my_role() = 'ADMIN' AND tenant_id = public.current_tenant_id()))
    OR auth.role() = 'service_role'
    OR session_user IN ('postgres', 'service_role')
  );

CREATE POLICY "colaboradores_delete" ON public.colaboradores
  FOR DELETE TO authenticated
  USING (
    ((public.get_my_role() = 'ADMIN' AND tenant_id = public.current_tenant_id()))
    OR auth.role() = 'service_role'
    OR session_user IN ('postgres', 'service_role')
  );

REVOKE ALL ON public.colaboradores FROM anon, public;
GRANT ALL ON public.colaboradores TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.colaboradores TO authenticated;

-- 5.5 POLÍTICAS DE ISOLAMENTO RIGOROSO POR TENANT COM PRIVILÉGIOS MÍNIMOS
DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'categories', 'suppliers', 'branches',
    'produtos', 'products', 'product_batches', 'stock_movements', 'stock_transfers',
    'clientes', 'customer_debts', 'debt_payments', 'vendas', 'venda_itens',
    'returns', 'suspended_carts', 'caixa', 'cash_registers', 'cash_shifts',
    'cash_closures', 'supplier_orders', 'reminders',
    'recurring_reminders', 'user_training_progress', 'audit_logs', 'settings',
    'recovery_requests'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS "allow_all_%s" ON public.%I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_%s" ON public.%I;', tbl, tbl);

    -- Permite acesso estrito somente a utilizadores autenticados com tenant id correspondente
    EXECUTE format('
      CREATE POLICY "tenant_isolation_%s" ON public.%I
      FOR ALL TO authenticated
      USING (
        (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
        OR auth.role() = ''service_role''
        OR session_user IN (''postgres'', ''service_role'')
      )
      WITH CHECK (
        (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id())
        OR auth.role() = ''service_role''
        OR session_user IN (''postgres'', ''service_role'')
      );
    ', tbl, tbl);

    -- Revogação total de privilégios para anon e public
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, public;', tbl);
    EXECUTE format('GRANT ALL ON public.%I TO postgres, service_role;', tbl);

    -- Concessão de menor privilégio necessário para utilizadores autenticados
    IF tbl = 'audit_logs' THEN
      EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated;', tbl);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', tbl);
    END IF;
  END LOOP;
END $$;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- POLÍTICAS RLS ESPECÍFICAS PARA company_settings: Isolamento por e-mail do proprietário autenticado
DROP POLICY IF EXISTS "allow_all_company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "company_settings_matching_email" ON public.company_settings;
CREATE POLICY "company_settings_matching_email" ON public.company_settings
  FOR ALL TO authenticated
  USING (
    (auth.jwt()->>'email' IS NOT NULL AND LOWER(TRIM(user_email)) = LOWER(TRIM(auth.jwt()->>'email')))
    OR auth.role() = 'service_role'
    OR session_user IN ('postgres', 'service_role')
  )
  WITH CHECK (
    (auth.jwt()->>'email' IS NOT NULL AND LOWER(TRIM(user_email)) = LOWER(TRIM(auth.jwt()->>'email')))
    OR auth.role() = 'service_role'
    OR session_user IN ('postgres', 'service_role')
  );

REVOKE ALL ON public.company_settings FROM anon, public;
GRANT ALL ON public.company_settings TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE ON public.company_settings TO authenticated;

-- POLÍTICAS RLS ESPECÍFICAS PARA company_profiles: Utilizador só acede aos registos com email correspondente autenticado
DROP POLICY IF EXISTS "allow_all_company_profiles" ON public.company_profiles;
DROP POLICY IF EXISTS "company_profiles_select_matching_email" ON public.company_profiles;
DROP POLICY IF EXISTS "company_profiles_insert_matching_email" ON public.company_profiles;
DROP POLICY IF EXISTS "company_profiles_update_matching_email" ON public.company_profiles;
DROP POLICY IF EXISTS "company_profiles_delete_matching_email" ON public.company_profiles;
DROP POLICY IF EXISTS "company_profiles_matching_email" ON public.company_profiles;

CREATE POLICY "company_profiles_matching_email" ON public.company_profiles
  FOR ALL TO authenticated
  USING (
    (auth.jwt()->>'email' IS NOT NULL AND LOWER(TRIM(email)) = LOWER(TRIM(auth.jwt()->>'email')))
    OR auth.role() = 'service_role'
    OR session_user IN ('postgres', 'service_role')
  )
  WITH CHECK (
    (auth.jwt()->>'email' IS NOT NULL AND LOWER(TRIM(email)) = LOWER(TRIM(auth.jwt()->>'email')))
    OR auth.role() = 'service_role'
    OR session_user IN ('postgres', 'service_role')
  );

REVOKE ALL ON public.company_profiles FROM anon, public;
GRANT ALL ON public.company_profiles TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE ON public.company_profiles TO authenticated;

-- Views protegidas com invocação de segurança e sem acessos anónimos
CREATE OR REPLACE VIEW public.sales WITH (security_invoker = true) AS SELECT * FROM public.vendas;
CREATE OR REPLACE VIEW public.transactions WITH (security_invoker = true) AS SELECT * FROM public.vendas;
CREATE OR REPLACE VIEW public.customers WITH (security_invoker = true) AS SELECT * FROM public.clientes;

REVOKE ALL ON public.sales FROM anon, public;
REVOKE ALL ON public.transactions FROM anon, public;
REVOKE ALL ON public.customers FROM anon, public;
REVOKE ALL ON public.credit_notes FROM anon, public;

GRANT ALL ON public.sales TO postgres, service_role;
GRANT ALL ON public.transactions TO postgres, service_role;
GRANT ALL ON public.customers TO postgres, service_role;
GRANT ALL ON public.credit_notes TO postgres, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.credit_notes TO authenticated;

-- ============================================================================
-- 6. ATOMIC STORED PROCEDURES / POSTGRESQL FUNCTIONS (RPC) - COMPLETE & HARDENED
-- ============================================================================

-- RPC 1: PROCESS SALE ATOMIC (Idempotente, Gestão de Inventário, Dívidas, Caixa e Auditoria)
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
      RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: Utilizador autenticado não possui organização/empresa autorizada vinculada.');
    END IF;
    -- Rejeitar qualquer tentativa de operar com tenant diferente do autorizado pela identidade
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

  -- 0.2 Validação de valores monetários
  IF v_subtotal < 0 OR p_discount_total < 0 OR p_vat_total < 0 OR v_total < 0 OR v_amount_paid < 0 OR p_change_amount < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valores monetários inválidos ou negativos.');
  END IF;

  -- 0.3 Verificação de Idempotência isolada por tenant
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

  -- 0.4 Validação de itens
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A venda deve conter pelo menos um artigo.');
  END IF;

  -- 0.5 Validação e reserva atómica de stock com isolamento estrito por tenant
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := COALESCE(v_item->>'productId', v_item->>'id');
    v_qty := COALESCE((v_item->>'quantity')::NUMERIC, (v_item->>'quantidade')::NUMERIC, 0.00);
    v_unit_price := COALESCE((v_item->>'salePrice')::NUMERIC, (v_item->>'unitPrice')::NUMERIC, (v_item->>'price')::NUMERIC, -1.00);

    IF v_prod_id IS NULL OR v_prod_id = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Identificador de artigo em falta num dos itens da venda.');
    END IF;

    IF v_qty <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Quantidade inválida para o artigo.');
    END IF;

    IF v_unit_price < 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Preço unitário inválido para o artigo.');
    END IF;

    -- Bloqueio pessimista para prevenir race condition em concorrência
    v_prod_found := FALSE;
    v_curr_stock := 0.00;

    BEGIN
      SELECT stock, name INTO v_curr_stock, v_prod_name 
      FROM public.produtos 
      WHERE id = v_prod_id AND tenant_id = v_tenant_id AND is_active = TRUE 
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
        WHERE id = v_prod_id AND tenant_id = v_tenant_id AND is_active = TRUE 
        LIMIT 1 
        FOR UPDATE;
        IF FOUND THEN
          v_prod_found := TRUE;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_prod_found := FALSE;
      END;
    END IF;

    IF NOT v_prod_found THEN
      RETURN jsonb_build_object('success', false, 'error', 'Artigo (' || v_prod_id || ') não encontrado no inventário ativo da empresa.');
    END IF;

    IF v_curr_stock < v_qty THEN
      RETURN jsonb_build_object('success', false, 'error', 'Stock insuficiente para o artigo "' || v_prod_name || '". Stock atual: ' || v_curr_stock || ', Solicitado: ' || v_qty);
    END IF;
  END LOOP;

  -- 1. Inserir registo mestre de venda
  INSERT INTO public.vendas (
    id, tenant_id, idempotency_key, invoice_number, customer_id, customer_name, customer_nuit,
    seller_id, seller_name, operator_name, cashier_name, payment_method, payment_status,
    subtotal, discount_total, vat_total, grand_total, amount_paid, change_amount,
    total_amount, tax_amount, status, items, notes, timestamp, created_at, updated_at
  ) VALUES (
    p_sale_id, v_tenant_id, v_idempotency_key, v_invoice_number, p_customer_id, p_customer_name, p_customer_nuit,
    p_user_id, v_user_name, v_user_name, v_user_name, p_payment_method,
    CASE WHEN p_payment_method IN ('A Prazo / Dívida', 'Crédito', 'CREDITO', 'DEBT') THEN 'PENDING_DEBT' ELSE 'PAID' END,
    v_subtotal, p_discount_total, p_vat_total, v_total, v_amount_paid, p_change_amount,
    v_total, p_vat_total, 'COMPLETED', p_items, p_notes, NOW(), NOW(), NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- 2. Processar itens individuais e abater stock no inventário
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := COALESCE(v_item->>'productId', v_item->>'id');
    v_prod_name := COALESCE(v_item->>'productName', v_item->>'name', v_item->>'nome', 'Artigo');
    v_qty := COALESCE((v_item->>'quantity')::NUMERIC, (v_item->>'quantidade')::NUMERIC, 1.00);
    v_unit_price := COALESCE((v_item->>'salePrice')::NUMERIC, (v_item->>'unitPrice')::NUMERIC, (v_item->>'price')::NUMERIC, 0.00);
    v_cost_price := COALESCE((v_item->>'costPrice')::NUMERIC, (v_item->>'cost')::NUMERIC, 0.00);
    v_total_item := COALESCE((v_item->>'totalPrice')::NUMERIC, (v_item->>'total')::NUMERIC, v_qty * v_unit_price);

    -- Inserir item da venda
    INSERT INTO public.venda_itens (
      id, tenant_id, sale_id, product_id, product_name,
      unit_price, quantity, cost_price, total_price, created_at
    ) VALUES (
      COALESCE(uuid_generate_v4()::TEXT, p_sale_id || '-' || v_prod_id), v_tenant_id, p_sale_id, v_prod_id, v_prod_name,
      v_unit_price, v_qty, v_cost_price, v_total_item, NOW()
    );

    -- Obter stock atualizado isolado por tenant
    SELECT stock INTO v_curr_stock FROM public.produtos WHERE id = v_prod_id AND tenant_id = v_tenant_id LIMIT 1;
    IF v_curr_stock IS NULL THEN
      SELECT stock INTO v_curr_stock FROM public.products WHERE id = v_prod_id AND tenant_id = v_tenant_id LIMIT 1;
    END IF;

    v_new_stock := GREATEST(0.00, COALESCE(v_curr_stock, 0.00) - v_qty);

    -- Atualizar stock nas tabelas de inventário estritamente da mesma empresa
    UPDATE public.produtos 
    SET stock = v_new_stock, updated_at = NOW() 
    WHERE id = v_prod_id AND tenant_id = v_tenant_id;

    UPDATE public.products 
    SET stock = v_new_stock, updated_at = NOW() 
    WHERE id = v_prod_id AND tenant_id = v_tenant_id;

    -- Registar no Kardex de movimentos de stock
    INSERT INTO public.stock_movements (
      id, tenant_id, product_id, type, quantity,
      previous_stock, new_stock, cost_price, reason, reference_id, user_id, user_name, timestamp
    ) VALUES (
      COALESCE(uuid_generate_v4()::TEXT, p_sale_id || '-mov-' || v_prod_id), v_tenant_id, v_prod_id, 'EXIT_SALE', v_qty,
      COALESCE(v_curr_stock, 0.00), v_new_stock, v_cost_price, 'Venda ' || v_invoice_number, p_sale_id, p_user_id, v_user_name, NOW()
    );
  END LOOP;

  -- 3. Gestão de Dívida se a venda foi a crédito/prazo
  v_is_credit := p_payment_method IN ('A Prazo / Dívida', 'Crédito', 'CREDITO', 'DEBT');
  IF v_is_credit AND p_customer_id IS NOT NULL AND p_customer_id <> '' THEN
    v_remaining_debt := GREATEST(0.00, v_total - v_amount_paid);
    
    INSERT INTO public.customer_debts (
      id, tenant_id, customer_id, sale_id, total_amount, paid_amount,
      remaining_balance, due_date, status, created_at
    ) VALUES (
      COALESCE(uuid_generate_v4()::TEXT, p_sale_id || '-debt'), v_tenant_id, p_customer_id, p_sale_id, v_total, v_amount_paid,
      v_remaining_debt, NOW() + INTERVAL '30 days',
      CASE WHEN v_remaining_debt <= 0 THEN 'SETTLED' ELSE 'PENDING' END,
      NOW()
    );

    -- Atualizar saldo em aberto do cliente
    UPDATE public.clientes 
    SET balance = balance + v_remaining_debt,
        debt = debt + v_remaining_debt,
        total_spent = total_spent + v_total,
        purchase_count = purchase_count + 1,
        last_purchase_date = NOW(),
        updated_at = NOW()
    WHERE id = p_customer_id AND tenant_id = v_tenant_id;
  ELSIF p_customer_id IS NOT NULL AND p_customer_id <> '' THEN
    -- Atualizar estatísticas de compra do cliente em vendas pagas
    UPDATE public.clientes 
    SET total_spent = total_spent + v_total,
        purchase_count = purchase_count + 1,
        last_purchase_date = NOW(),
        loyalty_points = loyalty_points + FLOOR(v_total / 100)::INTEGER,
        updated_at = NOW()
    WHERE id = p_customer_id AND tenant_id = v_tenant_id;
  END IF;

  -- 4. Registar entrada de caixa se pago em dinheiro
  IF (UPPER(p_payment_method) LIKE '%DINHEIRO%' OR UPPER(p_payment_method) LIKE '%CASH%' OR UPPER(p_payment_method) LIKE '%NUMER%') AND v_amount_paid > 0 THEN
    INSERT INTO public.caixa (
      id, tenant_id, type, amount, reason, responsible_user, reference_id, timestamp
    ) VALUES (
      COALESCE(uuid_generate_v4()::TEXT, p_sale_id || '-cash'), v_tenant_id, 'INPUT', v_amount_paid, 'Recebimento Venda ' || v_invoice_number, v_user_name, p_sale_id, NOW()
    );
  END IF;

  -- 5. Registar auditoria de venda concluída
  INSERT INTO public.audit_logs (
    id, tenant_id, user_id, user_name, action, module, details, timestamp
  ) VALUES (
    COALESCE(uuid_generate_v4()::TEXT, p_sale_id || '-audit'), v_tenant_id, p_user_id, v_user_name,
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

REVOKE EXECUTE ON FUNCTION public.process_sale_atomic FROM anon, public;
GRANT EXECUTE ON FUNCTION public.process_sale_atomic TO postgres, authenticated, service_role;

-- RPC 2: REPLENISH STOCK ATOMIC
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

-- RPC 3: SETTLE DEBT PAYMENT ATOMIC
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

-- RPC 4: RECORD SALE RETURN ATOMIC (Devolução com Reabastecimento, Nota de Crédito e Caixa)
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

  -- 1. Registar a Nota de Crédito / Devolução
  INSERT INTO public.returns (
    id, tenant_id, credit_note_number, sale_id, original_invoice_number,
    customer_name, customer_nuit, reason, items, total_refund, refund_method, operator_name, created_at
  ) VALUES (
    uuid_generate_v4()::TEXT, v_tenant_id, p_credit_note_number, p_sale_id, p_original_invoice,
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
      uuid_generate_v4()::TEXT, v_tenant_id, v_prod_id, 'RETURN', v_qty,
      COALESCE(v_curr_stock, 0.00), v_new_stock, v_price, 'Devolução Ref ' || p_credit_note_number, p_sale_id, p_operator_name, NOW()
    );
  END LOOP;

  -- 3. Saída de caixa se reembolso efetuado em numerário
  IF p_refund_method = 'CASH' AND p_total_refund > 0 THEN
    INSERT INTO public.caixa (
      id, tenant_id, type, amount, reason, responsible_user, reference_id, timestamp
    ) VALUES (
      uuid_generate_v4()::TEXT, v_tenant_id, 'DEVOLUTION', p_total_refund,
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
    uuid_generate_v4()::TEXT, v_tenant_id, p_operator_name, 'DEVOLUCAO_CONCLUIDA', 'POS',
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

-- ============================================================================
-- 7. RECARREGAR O SCHEMA CACHE DO POSTGREST IMEDIATAMENTE
-- ============================================================================
NOTIFY pgrst, 'reload schema';
