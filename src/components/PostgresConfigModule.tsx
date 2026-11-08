import React, { useState, useEffect } from "react";
import { 
  Database, 
  Server, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Save, 
  Play, 
  Copy, 
  Check, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  Terminal, 
  Layers, 
  Users, 
  Package, 
  CreditCard, 
  Clock, 
  FileCode2,
  Lock,
  ArrowRight,
  Building
} from "lucide-react";
import { SystemSettings, UserRole, Employee } from "../types";
import { ConnectionService } from "../services/dataService";

interface TableStatus {
  name: string;
  category: "settings" | "products" | "customers" | "transactions" | "staff" | "caixa" | "suppliers" | "system";
  exists: boolean;
  recordCount: number;
}

interface ConnectionTestResult {
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

interface PostgresConfigModuleProps {
  settings: SystemSettings;
  onUpdateSettings?: (newSettings: Partial<SystemSettings>) => void;
  onAddAuditLog: (action: string, module: string, details: string) => void;
  onShowToast?: (message: string, type: "success" | "error" | "info" | "warning", title?: string) => void;
  activeUser: Employee | null;
  currentRole: UserRole;
}

export default function PostgresConfigModule({
  settings: _settings,
  onUpdateSettings: _onUpdateSettings,
  onAddAuditLog,
  onShowToast,
  activeUser: _activeUser,
  currentRole: _currentRole
}: PostgresConfigModuleProps) {
  // Mode selection: URI vs Separate Fields
  const [connectionMode, setConnectionMode] = useState<"uri" | "fields">("uri");

  // Form Fields
  const [connectionString, setConnectionString] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState<number>(5432);
  const [database, setDatabase] = useState("");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [ssl, setSsl] = useState(true);

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [source, setSource] = useState<"database" | "env" | "none">("none");

  // Status and Loading
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunningSql, setIsRunningSql] = useState(false);
  const [activeTarget, setActiveTarget] = useState<"all" | "products" | "customers" | "transactions" | "settings" | "staff" | "suppliers" | "caixa" | null>(null);

  // Diagnostics result
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [sqlLogs, setSqlLogs] = useState<string[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [sqlScripts, setSqlScripts] = useState<{
    all?: string;
    settings?: string;
    staff?: string;
    products?: string;
    customers?: string;
    transactions?: string;
    caixa?: string;
    suppliers?: string;
  } | null>(null);
  const [activeSqlTab, setActiveSqlTab] = useState<"all" | "settings" | "staff" | "products" | "customers" | "transactions" | "caixa">("settings");

  // Load current configuration from server
  const loadConfig = async () => {
    setIsLoadingConfig(true);
    try {
      const res = await fetch("/api/database/config");
      if (res.ok) {
        const body = await res.json();
        if (body.success && body.config) {
          const cfg = body.config;
          setConnectionString(cfg.connectionString || "");
          setHost(cfg.host || "");
          setPort(cfg.port || 5432);
          setDatabase(cfg.database || "");
          setUser(cfg.user || "");
          setPassword(cfg.password || "");
          setSsl(cfg.ssl !== false);
          setSource(cfg.source || "none");

          if (cfg.connectionString && cfg.connectionString.length > 0) {
            setConnectionMode("uri");
          } else if (cfg.host) {
            setConnectionMode("fields");
          }
        }
      }
    } catch (e: any) {
      console.warn("Erro ao carregar configurações do PostgreSQL:", e);
    } finally {
      setIsLoadingConfig(false);
    }
  };

  // Load SQL scripts for viewing/copying
  const loadSqlScripts = async () => {
    try {
      const res = await fetch("/api/database/sql-scripts");
      if (res.ok) {
        const body = await res.json();
        if (body.success && body.scripts) {
          setSqlScripts(body.scripts);
        }
      }
    } catch (e) {
      console.warn("Erro ao ler scripts SQL:", e);
    }
  };

  useEffect(() => {
    loadConfig();
    loadSqlScripts();
  }, []);

  // Test connection using ConnectionService
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    const activeDbUrl = connectionMode === "uri" ? connectionString.trim() : undefined;

    try {
      // 1. Validação de conectividade com Supabase/PostgreSQL usando ConnectionService
      const serviceResult = await ConnectionService.validatePostgresConnection(activeDbUrl);

      const payload = connectionMode === "uri" 
        ? { connectionString: connectionString.trim() }
        : { host: host.trim(), port, database: database.trim(), user: user.trim(), password, ssl };

      // 2. Se a validação direta do ConnectionService já possui a lista de tabelas detalhada, utiliza-a
      let data: ConnectionTestResult = {
        success: serviceResult.success,
        connected: serviceResult.connected,
        latencyMs: serviceResult.latencyMs,
        version: serviceResult.version,
        source: serviceResult.source || source || "database",
        tables: serviceResult.tables || [],
        allRequiredTablesExist: Boolean(serviceResult.allRequiredTablesExist),
        message: serviceResult.message,
        error: serviceResult.error
      };

      if (!data.tables || data.tables.length === 0) {
        const res = await fetch("/api/database/test-connection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          data = await res.json();
        }
      }

      setTestResult(data);

      if (data.connected) {
        if (data.allRequiredTablesExist) {
          if (onShowToast) onShowToast("Conexão validada com sucesso pelo ConnectionService! Todas as tabelas essenciais existem.", "success", "PostgreSQL Operacional");
        } else {
          if (onShowToast) onShowToast("Conectividade validada via ConnectionService! Clique no botão 'Criar Tabelas de Sistema' para criar as tabelas ausentes.", "warning", "Tabelas Ausentes");
        }
        onAddAuditLog("Testar Conexão PostgreSQL", "CONFIGURAÇÕES", `Conexão validada pelo ConnectionService (${data.latencyMs}ms).`);
      } else {
        if (onShowToast) onShowToast(data.message || "Falha na conexão com o PostgreSQL/Supabase.", "error", "Falha de Conexão");
        onAddAuditLog("Falha Conexão PostgreSQL", "CONFIGURAÇÕES", `Falha no teste de conexão via ConnectionService: ${data.error || data.message}`);
      }
    } catch (err: any) {
      const failResult: ConnectionTestResult = {
        success: false,
        connected: false,
        latencyMs: 0,
        source: "unknown",
        tables: [],
        allRequiredTablesExist: false,
        message: err.message || "Erro de rede ao validar conexão com o ConnectionService.",
        error: err.message
      };
      setTestResult(failResult);
      if (onShowToast) onShowToast("Erro de comunicação ao testar com ConnectionService.", "error");
    } finally {
      setIsTesting(false);
    }
  };

  // Save credentials to database
  const handleSaveConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);

    const payload = connectionMode === "uri"
      ? { connectionString: connectionString.trim() }
      : { host: host.trim(), port, database: database.trim(), user: user.trim(), password, ssl };

    try {
      const res = await fetch("/api/database/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        setSource("database");
        if (onShowToast) onShowToast("Credenciais do PostgreSQL armazenadas com sucesso no banco de dados!", "success", "Configuração Salva");
        onAddAuditLog("Salvar Credenciais PostgreSQL", "CONFIGURAÇÕES", "Credenciais do PostgreSQL salvas no banco de dados.");
        // Testa a conexão logo em seguida para validar
        handleTestConnection();
      } else {
        if (onShowToast) onShowToast(data.error || "Falha ao salvar credenciais.", "error");
      }
    } catch (err: any) {
      if (onShowToast) onShowToast(`Erro ao salvar: ${err.message}`, "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Run SQL scripts to create system tables using ConnectionService
  const handleRunSql = async (
    target: "all" | "products" | "customers" | "transactions" | "settings" | "staff" | "suppliers" | "caixa"
  ) => {
    setIsRunningSql(true);
    setActiveTarget(target);
    setSqlLogs(["A iniciar execução dos scripts SQL via ConnectionService..."]);

    const activeDbUrl = connectionMode === "uri" ? connectionString.trim() : undefined;

    try {
      // Executa criação das tabelas através do ConnectionService
      const result = await ConnectionService.createSystemTables(activeDbUrl, target);

      if (result.logs && Array.isArray(result.logs)) {
        setSqlLogs(result.logs);
      }

      if (result.success) {
        if (onShowToast) {
          onShowToast(
            `Tabelas de sistema garantidas com sucesso! [${(result.executedTables || []).join(", ")}]`,
            "success",
            "Tabelas de Sistema Criadas"
          );
        }
        onAddAuditLog(
          "Criar Tabelas de Sistema",
          "CONFIGURAÇÕES",
          `Tabelas essenciais criadas/garantidas no PostgreSQL: [${(result.executedTables || []).join(", ")}]`
        );
        // Atualiza a verificação de tabelas
        await handleTestConnection();
      } else {
        if (onShowToast) onShowToast(`Erro ao criar tabelas: ${result.error}`, "error", "Falha DDL");
      }
    } catch (err: any) {
      setSqlLogs(prev => [...prev, `ERRO: ${err.message}`]);
      if (onShowToast) onShowToast(`Erro ao executar scripts: ${err.message}`, "error");
    } finally {
      setIsRunningSql(false);
      setActiveTarget(null);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    if (onShowToast) onShowToast("Script SQL copiado para a área de transferência!", "info");
  };

  return (
    <div className="space-y-6 text-black">
      {/* HEADER BANNER */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
              <Database className="w-6 h-6 text-indigo-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-black">Base de Dados PostgreSQL & Inicialização DDL</h2>
                {source === "database" && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" /> Banco de Dados
                  </span>
                )}
                {source === "env" && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
                    <Server className="w-3.5 h-3.5 text-blue-700" /> Variáveis .env
                  </span>
                )}
                {source === "none" && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700" /> Não Configurado
                  </span>
                )}
              </div>
              <p className="text-xs text-black mt-1 leading-relaxed max-w-2xl font-medium">
                Valide as credenciais de acesso ao PostgreSQL, realize testes de latência e conectividade em tempo real, 
                e crie automaticamente as tabelas essenciais de <strong>Produtos</strong>, <strong>Clientes</strong> e <strong>Transações</strong> sem depender de variáveis manuais.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={loadConfig}
              disabled={isLoadingConfig}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-black border border-slate-300 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Recarregar configurações salvas"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-black ${isLoadingConfig ? "animate-spin" : ""}`} />
              Recarregar
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* FORMULÁRIO DE CREDENCIAIS (COLUNA ESQUERDA) */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-indigo-700" />
                <h3 className="text-sm font-bold text-black">Credenciais do Servidor PostgreSQL</h3>
              </div>

              {/* Toggle de Modo */}
              <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setConnectionMode("uri")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    connectionMode === "uri" 
                      ? "bg-white text-black shadow-sm" 
                      : "text-slate-600 hover:text-black"
                  }`}
                >
                  URI de Conexão
                </button>
                <button
                  type="button"
                  onClick={() => setConnectionMode("fields")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    connectionMode === "fields" 
                      ? "bg-white text-black shadow-sm" 
                      : "text-slate-600 hover:text-black"
                  }`}
                >
                  Campos Individuais
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              {connectionMode === "uri" ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-black flex items-center justify-between">
                    <span>DATABASE_URL (String de Conexão Supabase / PostgreSQL) *</span>
                    <span className="text-[11px] text-slate-600 font-normal">postgresql://user:pass@host:port/dbname</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={connectionString}
                      onChange={(e) => setConnectionString(e.target.value)}
                      placeholder="postgresql://postgres:senha@db.supabase.co:5432/postgres?sslmode=require"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 pr-10 text-xs font-mono font-medium text-black focus:border-indigo-600 focus:bg-white outline-none transition"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-black cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-700 leading-tight">
                    Suporta conexão direta ou pooler do Supabase, AWS RDS, Neon, Google Cloud SQL ou qualquer PostgreSQL.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-xs font-bold text-black">Host / Servidor *</label>
                      <input
                        type="text"
                        value={host}
                        onChange={(e) => setHost(e.target.value)}
                        placeholder="Ex: aws-0-eu-central-1.pooler.supabase.com"
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-medium text-black focus:border-indigo-600 focus:bg-white outline-none"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-black">Porta *</label>
                      <input
                        type="number"
                        value={port}
                        onChange={(e) => setPort(Number(e.target.value))}
                        placeholder="5432"
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-mono font-medium text-black focus:border-indigo-600 focus:bg-white outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-black">Base de Dados *</label>
                      <input
                        type="text"
                        value={database}
                        onChange={(e) => setDatabase(e.target.value)}
                        placeholder="postgres"
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-medium text-black focus:border-indigo-600 focus:bg-white outline-none"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-black">Utilizador (User) *</label>
                      <input
                        type="text"
                        value={user}
                        onChange={(e) => setUser(e.target.value)}
                        placeholder="postgres"
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-medium text-black focus:border-indigo-600 focus:bg-white outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-black">Senha do PostgreSQL *</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Digite ou altere a senha"
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 pr-10 text-xs font-mono font-medium text-black focus:border-indigo-600 focus:bg-white outline-none"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-black cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="pt-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={ssl}
                        onChange={(e) => setSsl(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                      />
                      <span className="text-xs font-bold text-black">Exigir Conexão Segura SSL (Recomendado para Cloud/Supabase)</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Botões de Ação */}
              <div className="pt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isTesting ? "animate-spin" : ""}`} />
                  {isTesting ? "A Validar Conectividade..." : "Testar Conexão"}
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="py-2.5 px-5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-black text-white shadow-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4 text-emerald-400" />
                  {isSaving ? "A Gravar..." : "Salvar Credenciais no Banco"}
                </button>
              </div>
            </form>
          </div>

          {/* PAINEL DE CRIAÇÃO AUTOMÁTICA DE TABELAS */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-bold text-black">Inicialização Automática de Tabelas DDL</h3>
              </div>
              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                PostgreSQL Idempotente
              </span>
            </div>

            <p className="text-xs text-black leading-relaxed font-medium">
              Execute as instruções DDL com cláusulas <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-black font-bold">CREATE TABLE IF NOT EXISTS</code> para criar com segurança todas as tabelas e índices necessários no PostgreSQL:
            </p>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={() => handleRunSql("all")}
                disabled={isRunningSql}
                className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white shadow-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Play className={`w-4 h-4 ${isRunningSql && activeTarget === "all" ? "animate-spin" : ""}`} />
                {isRunningSql && activeTarget === "all" 
                  ? "A Executar Todos os Scripts DDL no PostgreSQL..." 
                  : "Criar Todas as Tabelas de Sistema (Empresa, Colaboradores, Produtos, Clientes, Vendas, Caixa)"}
              </button>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleRunSql("settings")}
                  disabled={isRunningSql}
                  className="py-2.5 px-3 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Cria tabelas 'settings' e 'companies' para armazenar os dados e configurações da empresa"
                >
                  <Building className="w-3.5 h-3.5 text-indigo-700" />
                  {isRunningSql && activeTarget === "settings" ? "Criando..." : "Definições Empresa"}
                </button>

                <button
                  type="button"
                  onClick={() => handleRunSql("staff")}
                  disabled={isRunningSql}
                  className="py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-black border border-slate-300 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Cria tabelas 'colaboradores' e 'profiles'"
                >
                  <Users className="w-3.5 h-3.5 text-blue-700" />
                  {isRunningSql && activeTarget === "staff" ? "Criando..." : "Colaboradores"}
                </button>

                <button
                  type="button"
                  onClick={() => handleRunSql("products")}
                  disabled={isRunningSql}
                  className="py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-black border border-slate-300 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Package className="w-3.5 h-3.5 text-indigo-700" />
                  {isRunningSql && activeTarget === "products" ? "Criando..." : "Criar Produtos"}
                </button>

                <button
                  type="button"
                  onClick={() => handleRunSql("customers")}
                  disabled={isRunningSql}
                  className="py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-black border border-slate-300 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Users className="w-3.5 h-3.5 text-emerald-700" />
                  {isRunningSql && activeTarget === "customers" ? "Criando..." : "Criar Clientes"}
                </button>

                <button
                  type="button"
                  onClick={() => handleRunSql("transactions")}
                  disabled={isRunningSql}
                  className="py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-black border border-slate-300 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CreditCard className="w-3.5 h-3.5 text-amber-700" />
                  {isRunningSql && activeTarget === "transactions" ? "Criando..." : "Criar Vendas"}
                </button>

                <button
                  type="button"
                  onClick={() => handleRunSql("caixa")}
                  disabled={isRunningSql}
                  className="py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-black border border-slate-300 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Cria tabelas 'caixa', 'cash_closures', 'cash_shifts', 'audit_logs'"
                >
                  <Layers className="w-3.5 h-3.5 text-slate-700" />
                  {isRunningSql && activeTarget === "caixa" ? "Criando..." : "Caixa & Auditoria"}
                </button>
              </div>
            </div>

            {/* Console de Logs em Tempo Real */}
            {sqlLogs.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-black flex items-center gap-1">
                    <Terminal className="w-3.5 h-3.5 text-slate-700" /> Log de Execução DDL:
                  </span>
                  <button
                    type="button"
                    onClick={() => setSqlLogs([])}
                    className="text-[10px] text-slate-600 hover:text-black underline cursor-pointer"
                  >
                    Limpar
                  </button>
                </div>
                <div className="bg-slate-900 text-slate-200 p-3 rounded-xl text-[11px] font-mono space-y-1 max-h-40 overflow-y-auto border border-slate-800">
                  {sqlLogs.map((log, i) => (
                    <div key={i} className={log.startsWith("✓") ? "text-emerald-400 font-bold" : log.startsWith("ERRO") ? "text-red-400 font-bold" : "text-slate-300"}>
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* DIAGNÓSTICO E TABELAS DETECTADAS (COLUNA DIREITA) */}
        <div className="lg:col-span-6 space-y-6">
          {/* CARTÃO DE STATUS DA CONEXÃO */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-700" />
                <h3 className="text-sm font-bold text-black">Diagnóstico da Conexão & Tabelas</h3>
              </div>
              {testResult && (
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border flex items-center gap-1 ${
                  testResult.connected 
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300" 
                    : "bg-red-100 text-red-800 border-red-300"
                }`}>
                  {testResult.connected ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" /> Conectado ({testResult.latencyMs}ms)
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-red-700" /> Desconectado
                    </>
                  )}
                </span>
              )}
            </div>

            {testResult ? (
              <div className="space-y-4">
                <div className={`p-3.5 rounded-xl border text-xs leading-relaxed font-medium ${
                  testResult.connected 
                    ? testResult.allRequiredTablesExist 
                      ? "bg-emerald-50 text-emerald-950 border-emerald-200"
                      : "bg-amber-50 text-amber-950 border-amber-200"
                    : "bg-red-50 text-red-950 border-red-200"
                }`}>
                  <p className="font-bold mb-1">{testResult.message}</p>
                  {testResult.version && (
                    <p className="text-[11px] font-mono text-slate-700">Versão: {testResult.version}</p>
                  )}
                </div>

                {/* Grade de Tabelas Verificadas */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-black uppercase tracking-wider">Estado das Tabelas no Schema Public</span>
                    <span className="text-[11px] text-slate-700 font-bold">
                      {testResult.tables.filter(t => t.exists).length} de {testResult.tables.length} encontradas
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-72 overflow-y-auto">
                    {testResult.tables.map((t) => (
                      <div key={t.name} className="flex items-center justify-between p-2.5 bg-white hover:bg-slate-50 transition text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${t.exists ? "bg-emerald-500" : "bg-red-400"}`}></span>
                          <span className="font-mono font-bold text-black">{t.name}</span>
                          <span className="text-[10px] font-semibold text-slate-700 capitalize bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {t.category === "settings"
                              ? "Empresa"
                              : t.category === "staff"
                              ? "Colaboradores"
                              : t.category === "products"
                              ? "Produtos"
                              : t.category === "customers"
                              ? "Clientes"
                              : t.category === "transactions"
                              ? "Vendas"
                              : t.category === "caixa"
                              ? "Caixa"
                              : t.category === "suppliers"
                              ? "Fornecedores"
                              : "Sistema"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {t.exists ? (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              {t.recordCount} registo(s)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-200">
                              Não Existe
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-2">
                <Clock className="w-8 h-8 text-slate-400 mx-auto" />
                <h4 className="text-xs font-bold text-black">Aguardando Validação</h4>
                <p className="text-xs text-slate-600 max-w-sm mx-auto">
                  Clique no botão <strong>"Testar Conexão"</strong> acima para checar as credenciais e inspecionar a existência das tabelas de definições da empresa, produtos, clientes e vendas.
                </p>
              </div>
            )}
          </div>

          {/* VISUALIZADOR DE SCRIPTS SQL DDL */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-2">
              <div className="flex items-center gap-2">
                <FileCode2 className="w-4 h-4 text-indigo-700" />
                <h3 className="text-sm font-bold text-black">Scripts SQL DDL (Para Uso Manual / Editor)</h3>
              </div>

              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => setActiveSqlTab("all")}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    activeSqlTab === "all" ? "bg-emerald-600 text-white shadow-2xs" : "text-slate-600 hover:text-black bg-slate-100"
                  }`}
                >
                  Tudo (Completo)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSqlTab("settings")}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    activeSqlTab === "settings" ? "bg-indigo-600 text-white shadow-2xs" : "text-slate-600 hover:text-black bg-slate-100"
                  }`}
                >
                  Empresa
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSqlTab("staff")}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    activeSqlTab === "staff" ? "bg-indigo-600 text-white shadow-2xs" : "text-slate-600 hover:text-black bg-slate-100"
                  }`}
                >
                  Staff
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSqlTab("products")}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    activeSqlTab === "products" ? "bg-indigo-600 text-white shadow-2xs" : "text-slate-600 hover:text-black bg-slate-100"
                  }`}
                >
                  Produtos
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSqlTab("customers")}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    activeSqlTab === "customers" ? "bg-indigo-600 text-white shadow-2xs" : "text-slate-600 hover:text-black bg-slate-100"
                  }`}
                >
                  Clientes
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSqlTab("transactions")}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    activeSqlTab === "transactions" ? "bg-indigo-600 text-white shadow-2xs" : "text-slate-600 hover:text-black bg-slate-100"
                  }`}
                >
                  Vendas
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSqlTab("caixa")}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    activeSqlTab === "caixa" ? "bg-indigo-600 text-white shadow-2xs" : "text-slate-600 hover:text-black bg-slate-100"
                  }`}
                >
                  Caixa
                </button>
              </div>
            </div>

            <div className="relative">
              <div className="absolute right-2 top-2 z-10">
                <button
                  type="button"
                  onClick={() => {
                    const txt = sqlScripts ? sqlScripts[activeSqlTab] || "" : "";
                    copyToClipboard(txt, activeSqlTab);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold flex items-center gap-1 shadow transition cursor-pointer"
                >
                  {copiedKey === activeSqlTab ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-300" /> Copiar SQL
                    </>
                  )}
                </button>
              </div>

              <pre className="bg-slate-900 text-slate-200 p-4 rounded-xl text-[11px] font-mono overflow-x-auto max-h-56 border border-slate-800 leading-relaxed">
                {sqlScripts ? sqlScripts[activeSqlTab] || "-- Carregando script..." : "-- Carregando scripts..."}
              </pre>
            </div>

            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-950 font-medium flex items-start gap-2">
              <ArrowRight className="w-4 h-4 text-indigo-700 shrink-0 mt-0.5" />
              <span>
                Caso prefira criar as tabelas externamente, copie o script acima e execute-o diretamente no <strong>SQL Editor do Supabase</strong> ou console <strong>psql / pgAdmin</strong>.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
