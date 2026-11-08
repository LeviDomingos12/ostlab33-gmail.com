-- ==============================================================================
-- OST VENDAS ERP - Cloud SQL PostgreSQL Initialization Script
-- Target Database: ostvendas-db (europe-west2)
-- ==============================================================================

-- 1. Create Database & Dedicated Application User
DO $$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ostvendas_app') THEN
      CREATE ROLE ostvendas_app WITH LOGIN PASSWORD 'YOUR_SECURE_PASSWORD_HERE';
   END IF;
END
$$;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE postgres TO ostvendas_app;
ALTER ROLE ostvendas_app SET client_encoding TO 'utf8';
ALTER ROLE ostvendas_app SET default_transaction_isolation TO 'read committed';
ALTER ROLE ostvendas_app SET timezone TO 'UTC';

-- 2. Companies / Multi-Tenant Table
CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_uid TEXT NOT NULL,
    tax_id TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    currency TEXT DEFAULT 'AOA',
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- 3. Categories & Suppliers
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    contact_person TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    nif TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- 4. Products & Stock Movements
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT,
    barcode TEXT,
    category_id TEXT,
    category TEXT NOT NULL,
    price NUMERIC(14,2) NOT NULL,
    cost NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    stock NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    min_stock NUMERIC(14,2) DEFAULT 0.00,
    unit TEXT NOT NULL DEFAULT 'un',
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

CREATE TABLE IF NOT EXISTS stock_movements (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    type TEXT NOT NULL,
    quantity NUMERIC(14,2) NOT NULL,
    previous_stock NUMERIC(14,2) NOT NULL,
    new_stock NUMERIC(14,2) NOT NULL,
    reason TEXT,
    document_ref TEXT,
    created_by TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_prod ON stock_movements(tenant_id, product_id);

-- 5. Customers & Debts
CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    nif TEXT,
    credit_limit NUMERIC(14,2) DEFAULT 0.00,
    current_debt NUMERIC(14,2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_id ON customers(tenant_id);

CREATE TABLE IF NOT EXISTS customer_debts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    sale_id TEXT,
    amount NUMERIC(14,2) NOT NULL,
    paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    remaining_amount NUMERIC(14,2) NOT NULL,
    due_date TIMESTAMP WITHOUT TIME ZONE,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS debt_payments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    debt_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    payment_method TEXT NOT NULL,
    receipt_number TEXT,
    received_by TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- 6. Sales & Relational Items
CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    customer_id TEXT,
    customer_name TEXT,
    seller_id TEXT,
    seller_name TEXT,
    payment_method TEXT NOT NULL,
    subtotal NUMERIC(14,2) NOT NULL,
    discount_total NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    vat_total NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    grand_total NUMERIC(14,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    items_json TEXT,
    notes TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    timestamp TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_tenant_created ON sales(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    unit_price NUMERIC(14,2) NOT NULL,
    quantity NUMERIC(14,2) NOT NULL,
    discount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_price NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_items_tenant_sale ON sale_items(tenant_id, sale_id);

CREATE TABLE IF NOT EXISTS sale_payments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    received_amount NUMERIC(14,2),
    change_amount NUMERIC(14,2),
    transaction_ref TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- 7. Cash Registers & Movements
CREATE TABLE IF NOT EXISTS cash_registers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    closing_balance NUMERIC(14,2),
    expected_balance NUMERIC(14,2),
    difference NUMERIC(14,2),
    status TEXT NOT NULL DEFAULT 'OPEN',
    opened_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITHOUT TIME ZONE,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS cash_movements (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    cash_register_id TEXT NOT NULL,
    type TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    reason TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- 8. Audit Logs & System Settings
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    user_name TEXT NOT NULL,
    action TEXT NOT NULL,
    module TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value_json TEXT NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Security hardening: Revoke public privileges and grant strictly to application user
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
GRANT ALL ON ALL TABLES IN SCHEMA public TO ostvendas_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ostvendas_app;

-- Enable Row Level Security on all multi-tenant tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE debt_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Function & RLS Policies
CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS TEXT AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_tenant_id', true), '');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.current_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO ostvendas_app;

CREATE POLICY tenant_isolation_companies ON companies USING (id = current_tenant_id());
CREATE POLICY tenant_isolation_categories ON categories USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_suppliers ON suppliers USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_products ON products USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_stock_movements ON stock_movements USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_customers ON customers USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_customer_debts ON customer_debts USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_debt_payments ON debt_payments USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_sales ON sales USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_sale_items ON sale_items USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_sale_payments ON sale_payments USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_cash_registers ON cash_registers USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_cash_movements ON cash_movements USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_audit_logs ON audit_logs USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_settings ON settings USING (tenant_id = current_tenant_id());
