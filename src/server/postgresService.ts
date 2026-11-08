import pg from "pg";
import fs from "fs";
import path from "path";

const { Pool } = pg;

export interface PostgresConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
  source: "database" | "env" | "none";
  lastTestedAt?: string;
}

export interface TableStatus {
  name: string;
  category: "settings" | "products" | "customers" | "transactions" | "staff" | "caixa" | "suppliers" | "system";
  exists: boolean;
  recordCount: number;
}

export interface ConnectionTestResult {
  success: boolean;
  connected: boolean;
  latencyMs: number;
  version?: string;
  source: string;
  database?: string;
  host?: string;
  port?: number;
  tables: TableStatus[];
  allRequiredTablesExist: boolean;
  message: string;
  error?: string;
}

const DB_DIR = path.join(process.cwd(), "db_store");
const SETTINGS_FILE = path.join(DB_DIR, "settings.json");

function ensureDbDir() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
}

/**
 * Obtém a configuração ativa do PostgreSQL (Prioridade: Banco de Dados > Variáveis de Ambiente)
 */
export function getActivePostgresConfig(): PostgresConfig {
  let dbSettings: any = null;

  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const content = fs.readFileSync(SETTINGS_FILE, "utf-8");
      dbSettings = JSON.parse(content);
    } catch (err) {
      console.warn("[POSTGRES SERVICE] Falha ao ler settings.json:", err);
    }
  }

  // 1. Configuração salva no banco de dados local
  if (dbSettings && (dbSettings.pgConnectionString || dbSettings.pgHost)) {
    return {
      connectionString: dbSettings.pgConnectionString || "",
      host: dbSettings.pgHost || "",
      port: Number(dbSettings.pgPort || 5432),
      database: dbSettings.pgDatabase || "",
      user: dbSettings.pgUser || "",
      password: dbSettings.pgPassword || "",
      ssl: dbSettings.pgSsl === true || dbSettings.pgSsl === "true",
      source: "database",
      lastTestedAt: dbSettings.pgLastTestedAt
    };
  }

  // 2. Fallback para variáveis de ambiente
  const envUrl = process.env.DATABASE_URL;
  const isValidEnvUrl = envUrl && 
    !envUrl.includes("IP_DO_CLOUDSQL") && 
    !envUrl.includes("SENHA") && 
    !envUrl.includes("example.com") &&
    envUrl.startsWith("postgres");

  if (isValidEnvUrl) {
    return {
      connectionString: envUrl,
      source: "env"
    };
  }

  if (process.env.SQL_HOST && !process.env.SQL_HOST.includes("IP_DO_CLOUDSQL")) {
    return {
      host: process.env.SQL_HOST,
      port: Number(process.env.SQL_PORT || 5432),
      database: process.env.SQL_DB_NAME || "postgres",
      user: process.env.SQL_USER || "postgres",
      password: process.env.SQL_PASSWORD || "",
      ssl: process.env.SQL_SSL === "true",
      source: "env"
    };
  }

  return {
    port: 5432,
    ssl: true,
    source: "none"
  };
}

/**
 * Salva a configuração do PostgreSQL no settings.json
 */
export function savePostgresConfig(config: Partial<PostgresConfig>): boolean {
  try {
    ensureDbDir();
    let currentSettings: any = {};

    if (fs.existsSync(SETTINGS_FILE)) {
      try {
        currentSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
      } catch {
        currentSettings = {};
      }
    }

    const updated = {
      ...currentSettings,
      pgConnectionString: config.connectionString !== undefined ? config.connectionString : currentSettings.pgConnectionString,
      pgHost: config.host !== undefined ? config.host : currentSettings.pgHost,
      pgPort: config.port !== undefined ? config.port : currentSettings.pgPort,
      pgDatabase: config.database !== undefined ? config.database : currentSettings.pgDatabase,
      pgUser: config.user !== undefined ? config.user : currentSettings.pgUser,
      pgPassword: config.password !== undefined && config.password !== "********" ? config.password : currentSettings.pgPassword,
      pgSsl: config.ssl !== undefined ? config.ssl : currentSettings.pgSsl,
      pgLastTestedAt: config.lastTestedAt || new Date().toISOString()
    };

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("[POSTGRES SERVICE] Erro ao salvar configurações:", err);
    return false;
  }
}

/**
 * Cria um pool temporário do PostgreSQL para teste ou execução de DDL
 */
export function createPgPool(config: PostgresConfig): pg.Pool {
  const timeoutMs = 8000;

  if (config.connectionString && config.connectionString.trim().length > 0) {
    let connStr = config.connectionString.trim();
    // Se for formato do Supabase pooler ou direct, respeitar SSL
    const hasSslMode = connStr.includes("sslmode=");
    return new Pool({
      connectionString: connStr,
      ssl: hasSslMode ? undefined : { rejectUnauthorized: false },
      connectionTimeoutMillis: timeoutMs,
      idleTimeoutMillis: 5000,
      max: 3
    });
  }

  return new Pool({
    host: config.host || "localhost",
    port: config.port || 5432,
    database: config.database || "postgres",
    user: config.user || "postgres",
    password: config.password || "",
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: timeoutMs,
    idleTimeoutMillis: 5000,
    max: 3
  });
}

/**
 * Testa conectividade com o PostgreSQL e inspeciona tabelas existentes
 */
export async function testPostgresConnection(customConfig?: Partial<PostgresConfig>): Promise<ConnectionTestResult> {
  const active = getActivePostgresConfig();
  const config: PostgresConfig = {
    ...active,
    ...customConfig,
    source: customConfig?.source || active.source
  };

  // Se a senha vier mascarada como '********', restaurar a original do settings
  if (config.password === "********") {
    config.password = active.password;
  }

  const hasConfig = (config.connectionString && config.connectionString.length > 5) || 
                    (config.host && config.database && config.user);

  if (!hasConfig) {
    return {
      success: false,
      connected: false,
      latencyMs: 0,
      source: "none",
      tables: [],
      allRequiredTablesExist: false,
      message: "Nenhuma credencial ou URL de conexão do PostgreSQL foi configurada.",
      error: "Credenciais ausentes."
    };
  }

  const pool = createPgPool(config);
  const start = Date.now();

  try {
    const client = await pool.connect();
    const latencyMs = Date.now() - start;

    try {
      // 1. Versão do PostgreSQL
      const versionRes = await client.query("SELECT version();");
      const version = versionRes.rows[0]?.version || "PostgreSQL";

      // 2. Consulta de tabelas no schema public
      const tablesRes = await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
      );
      const existingTableNames = new Set(tablesRes.rows.map(r => r.table_name.toLowerCase()));

      // 3. Inspeção das tabelas essenciais da aplicação
      const requiredTables: { name: string; category: "settings" | "products" | "customers" | "transactions" | "staff" | "caixa" | "suppliers" | "system" }[] = [
        { name: "settings", category: "settings" },
        { name: "companies", category: "settings" },
        { name: "colaboradores", category: "staff" },
        { name: "profiles", category: "staff" },
        { name: "products", category: "products" },
        { name: "categories", category: "products" },
        { name: "branches", category: "products" },
        { name: "clientes", category: "customers" },
        { name: "customers", category: "customers" },
        { name: "customer_debts", category: "customers" },
        { name: "vendas", category: "transactions" },
        { name: "venda_itens", category: "transactions" },
        { name: "transactions", category: "transactions" },
        { name: "stock_movements", category: "transactions" },
        { name: "returns", category: "transactions" },
        { name: "caixa", category: "caixa" },
        { name: "cash_closures", category: "caixa" },
        { name: "cash_shifts", category: "caixa" },
        { name: "suppliers", category: "suppliers" },
        { name: "supplier_orders", category: "suppliers" },
        { name: "audit_logs", category: "system" }
      ];

      const tablesStatus: TableStatus[] = [];

      for (const t of requiredTables) {
        const exists = existingTableNames.has(t.name);
        let recordCount = 0;
        if (exists) {
          try {
            // Contagem segura
            const countRes = await client.query(`SELECT count(*)::int AS total FROM public."${t.name}";`);
            recordCount = countRes.rows[0]?.total || 0;
          } catch {
            recordCount = 0;
          }
        }
        tablesStatus.push({
          name: t.name,
          category: t.category,
          exists,
          recordCount
        });
      }

      // Verificação de requisitos essenciais
      const hasSettings = tablesStatus.some(t => t.name === "settings" && t.exists);
      const hasProducts = tablesStatus.some(t => t.name === "products" && t.exists);
      const hasCustomers = tablesStatus.some(t => (t.name === "clientes" || t.name === "customers") && t.exists);
      const hasTransactions = tablesStatus.some(t => (t.name === "vendas" || t.name === "transactions") && t.exists);

      const allRequired = hasSettings && hasProducts && hasCustomers && hasTransactions;

      return {
        success: true,
        connected: true,
        latencyMs,
        version,
        source: config.source,
        database: config.database,
        host: config.host,
        port: config.port,
        tables: tablesStatus,
        allRequiredTablesExist: allRequired,
        message: allRequired
          ? `Conexão estabelecida com sucesso (${latencyMs}ms). Todas as tabelas essenciais (Definições da Empresa, Produtos, Clientes e Transações) estão operacionais!`
          : `Conexão bem-sucedida (${latencyMs}ms), porém existem tabelas essenciais ausentes. Use o botão de inicialização abaixo para criá-las.`
      };
    } finally {
      client.release();
    }
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    console.error("[POSTGRES SERVICE] Erro de conexão:", err.message);
    return {
      success: false,
      connected: false,
      latencyMs,
      source: config.source,
      tables: [],
      allRequiredTablesExist: false,
      message: `Falha ao conectar com o PostgreSQL: ${err.message}`,
      error: err.message
    };
  } finally {
    pool.end().catch(() => {});
  }
}

/**
 * Scripts SQL DDL completos para criação das tabelas essenciais
 */
export const SQL_SCRIPTS = {
  settings: `
-- ==============================================================================
-- DEFINIÇÕES DO SISTEMA E IDENTIDADE DA EMPRESA (public.company_settings, public.settings e public.companies)
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

ALTER TABLE public.company_profiles ENABLE ROW LEVEL SECURITY;

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

REVOKE ALL ON public.company_profiles FROM anon, public;
GRANT ALL ON public.company_profiles TO postgres, authenticated, service_role;

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
`,

  staff: `
-- ==============================================================================
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
`,

  suppliers: `
-- ==============================================================================
-- FORNECEDORES, ORDENS DE COMPRA, CATEGORIAS E FILIAIS
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.categories (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS public.suppliers (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  nuit TEXT,
  status TEXT DEFAULT 'Ativo',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.supplier_orders (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity_requested NUMERIC(14,2) NOT NULL DEFAULT 1.00,
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_value NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'PENDING',
  payment_status TEXT NOT NULL DEFAULT 'UNPAID',
  payment_due_date TEXT,
  request_date TIMESTAMPTZ DEFAULT NOW(),
  received_date TIMESTAMPTZ,
  received_quantity NUMERIC(14,2),
  delivery_confirmed_date TIMESTAMPTZ,
  delivery_confirmed_by TEXT,
  delivery_notes TEXT,
  is_replenishment_order BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_orders_tenant ON public.supplier_orders (tenant_id);
`,

  caixa: `
-- ==============================================================================
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
`,

  products: `
-- ==============================================================================
-- PRODUTOS & CATÁLOGO (public.products e public.produtos)
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

CREATE TABLE IF NOT EXISTS public.produtos (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  barcode TEXT,
  category TEXT NOT NULL DEFAULT 'Geral',
  supplier TEXT,
  cost_price NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  sale_price NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  stock NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  min_stock NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 16.00,
  unit TEXT NOT NULL DEFAULT 'un',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_tenant ON public.products (tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products (barcode);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products (name);
`,

  customers: `
-- ==============================================================================
-- CLIENTES E CRÉDITO (public.clientes e public.customers)
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

CREATE INDEX IF NOT EXISTS idx_clientes_tenant ON public.clientes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_clientes_phone ON public.clientes (phone);
CREATE INDEX IF NOT EXISTS idx_clientes_name ON public.clientes (name);
`,

  transactions: `
-- ==============================================================================
-- TRANSAÇÕES & VENDAS (public.vendas, public.transactions, etc.)
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.vendas (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  numero_fatura TEXT,
  invoice_number TEXT,
  operador TEXT,
  cashier_name TEXT,
  cliente_id TEXT,
  customer_id TEXT,
  cliente_nome TEXT,
  customer_name TEXT,
  metodo_pagamento TEXT DEFAULT 'DINHEIRO',
  payment_method TEXT DEFAULT 'CASH',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  imposto NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  desconto NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  grand_total NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  itens JSONB DEFAULT '[]'::jsonb,
  items JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'COMPLETED',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  cashier_name TEXT,
  customer_id TEXT,
  customer_name TEXT,
  payment_method TEXT NOT NULL DEFAULT 'CASH',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  tax NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  grand_total NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.venda_itens (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  venda_id TEXT NOT NULL,
  produto_id TEXT NOT NULL,
  quantidade NUMERIC(14,2) NOT NULL DEFAULT 1.00,
  preco_unitario NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'SALE',
  quantity NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  previous_stock NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  new_stock NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  cost_price NUMERIC(14,2) DEFAULT 0.00,
  reason TEXT,
  reference_id TEXT,
  user_name TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.caixa (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  tenant_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'INPUT',
  amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  reason TEXT NOT NULL,
  responsible_user TEXT,
  reference_id TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

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
  operator_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendas_tenant ON public.vendas (tenant_id);
CREATE INDEX IF NOT EXISTS idx_vendas_invoice ON public.vendas (invoice_number);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant ON public.transactions (tenant_id);
`
};

/**
 * Executa scripts SQL para criar as tabelas no PostgreSQL
 */
export async function runPostgresSchemaSql(
  target: "all" | "products" | "customers" | "transactions" | "settings" | "staff" | "suppliers" | "caixa" = "all",
  customConfig?: Partial<PostgresConfig>
): Promise<{ success: boolean; executedTables: string[]; logs: string[]; error?: string }> {
  const active = getActivePostgresConfig();
  const config: PostgresConfig = {
    ...active,
    ...customConfig
  };

  if (config.password === "********") {
    config.password = active.password;
  }

  const pool = createPgPool(config);
  const logs: string[] = [];
  const executedTables: string[] = [];

  try {
    const client = await pool.connect();
    logs.push("Ligação ao PostgreSQL estabelecida com sucesso.");

    try {
      const runSqlChunk = async (sql: string, title: string, tableNames: string[]) => {
        logs.push(`A executar script SQL para: ${title}...`);
        await client.query(sql);
        logs.push(`✓ Tabelas criadas/atualizadas com sucesso: [${tableNames.join(", ")}]`);
        executedTables.push(...tableNames);
      };

      if (target === "all" || target === "settings") {
        await runSqlChunk(SQL_SCRIPTS.settings, "Definições e Empresa", ["company_profiles", "company_settings", "settings", "companies"]);
      }

      if (target === "all" || target === "staff") {
        await runSqlChunk(SQL_SCRIPTS.staff, "Colaboradores e Perfis", ["colaboradores", "profiles"]);
      }

      if (target === "all" || target === "suppliers") {
        await runSqlChunk(SQL_SCRIPTS.suppliers, "Categorias, Fornecedores e Ordens", ["categories", "branches", "suppliers", "supplier_orders"]);
      }

      if (target === "all" || target === "products") {
        await runSqlChunk(SQL_SCRIPTS.products, "Produtos e Catálogo", ["products", "produtos"]);
      }

      if (target === "all" || target === "customers") {
        await runSqlChunk(SQL_SCRIPTS.customers, "Clientes e Dívidas", ["clientes", "customers", "customer_debts"]);
      }

      if (target === "all" || target === "transactions") {
        await runSqlChunk(SQL_SCRIPTS.transactions, "Vendas, Movimentos e Caixa", [
          "vendas",
          "transactions",
          "venda_itens",
          "stock_movements",
          "caixa",
          "returns"
        ]);
      }

      if (target === "all" || target === "caixa") {
        await runSqlChunk(SQL_SCRIPTS.caixa, "Caixa, Turnos e Auditoria", [
          "cash_closures",
          "cash_shifts",
          "audit_logs",
          "recovery_requests"
        ]);
      }

      // Permissões gerais de segurança
      try {
        await client.query(`
          REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, public;
          GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, authenticated, service_role;
        `);
        logs.push("✓ Permissões restritas com segurança: revogados acessos públicos/anon e mantidos autenticados.");
      } catch (permErr: any) {
        logs.push(`Aviso sobre permissões: ${permErr.message}`);
      }

      logs.push("Execução concluída com sucesso sem erros.");
      return {
        success: true,
        executedTables,
        logs
      };
    } finally {
      client.release();
    }
  } catch (err: any) {
    logs.push(`ERRO: ${err.message}`);
    console.error("[POSTGRES SERVICE] Erro na execução de scripts DDL:", err);
    return {
      success: false,
      executedTables,
      logs,
      error: err.message
    };
  } finally {
    pool.end().catch(() => {});
  }
}
