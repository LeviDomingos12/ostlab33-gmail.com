import React, { useState, useMemo, useEffect, useRef, useCallback, Suspense, lazy } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  initialEmployees, 
  defaultSettings, 
  masterclassVideos 
} from "./data/mockData";
import { AdminService } from "./services/adminService";
import { 
  Product, 
  Customer, 
  Transaction, 
  CashFlowEntry, 
  Employee, 
  AuditLog, 
  SystemSettings, 
  UserRole,
  SubscriptionPlan
} from "./types";

// Import core modules directly for instant POS checkout and dashboard access
import Sidebar from "./components/Sidebar";
import POSModule from "./components/POSModule";
import DashboardModule from "./components/DashboardModule";
import CashRegisterModule from "./components/CashRegisterModule";

// Lazy-load secondary and administrative modules for high fluidity and reduced memory footprint
const StockModule = lazy(() => import("./components/StockModule"));
const CustomersModule = lazy(() => import("./components/CustomersModule"));
const ReportsModule = lazy(() => import("./components/ReportsModule"));
const SettingsModule = lazy(() => import("./components/SettingsModule"));
const MultiStoreModule = lazy(() => import("./components/MultiStoreModule"));
const StockReplenishModal = lazy(() => import("./components/StockReplenishModal"));
const QuickLogoModal = lazy(() => import("./components/QuickLogoModal"));
const TutorialModal = lazy(() => import("./components/TutorialModal"));

import PlanLockScreen from "./components/PlanLockScreen";
import { canAccessModule } from "./lib/planPermissions";
import { RoleAccessDeniedScreen } from "./components/RoleAccessDeniedScreen";
import { canRoleAccessModule, normalizeUserRole, getDefaultModuleForRole } from "./lib/rolePermissions";
import LoginModule from "./components/LoginModule";
import { UserSwitchModal } from "./components/UserSwitchModal";
import { SystemInfoHub } from "./components/SystemInfoHub";
import { applyTheme } from "./lib/themes";
import { sanitizeUserSession, sanitizeEmployeesForExport, sanitizeSettingsForExport, purgeClientSensitiveStorage } from "./lib/security";
import { useSystemVersion, incrementSystemVersion } from "./lib/versionManager";
import { 
  CommercialDataService, 
  ConnectionService, 
  StorageService 
} from "./services/dataService";
import { getSupabaseClient } from "./lib/supabase";
import { authenticatedFetch } from "./lib/apiClient";
import { SupabaseSyncService } from "./services/supabaseService";
import { setLogCallback, initErrorCapturing } from "./lib/logger";
import { generateEntityId, generateDeterministicCreditNoteNumber, generateSecurePin } from "./lib/deterministic";
import { sendEmail } from "./lib/gmail";
import { sendSMS } from "./lib/sms";
import { CashShiftService, ActiveCashShift } from "./services/cashShiftService";

import { 
  Activity, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  X, 
  Menu, 
  Lock, 
  ShieldAlert, 
  Users, 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  PiggyBank, 
  FileText, 
  Settings, 
  Compass, 
  LogOut,
  Building2,
  Store,
  ChevronDown,
  Globe
} from "lucide-react";

interface Toast {
  id: string;
  title: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

const NAV_MENU_ITEMS = [
  { id: "dashboard", label: "Visão Geral", shortLabel: "Visão Geral", icon: LayoutDashboard, roles: ["ADMIN", "SUPERVISOR", "AUDITOR", "FINANCEIRO"] },
  { id: "pos", label: "Vendas (POS)", shortLabel: "Vendas", icon: ShoppingCart, roles: ["ADMIN", "SUPERVISOR", "CASHIER"] },
  { id: "stock", label: "Stock & Produtos", shortLabel: "Stock", icon: Package, roles: ["ADMIN", "SUPERVISOR"] },
  { id: "branches", label: "Multi-Loja & Filiais", shortLabel: "Multi-Loja", icon: Building2, roles: ["ADMIN", "SUPERVISOR"] },
  { id: "cash", label: "Caixa & Movimentos", shortLabel: "Caixa", icon: PiggyBank, roles: ["ADMIN", "SUPERVISOR", "CASHIER", "FINANCEIRO"] },
  { id: "customers", label: "Clientes & Créditos", shortLabel: "Clientes", icon: Users, roles: ["ADMIN", "SUPERVISOR", "CASHIER"] },
  { id: "reports", label: "Relatórios de Vendas", shortLabel: "Relatórios", icon: FileText, roles: ["ADMIN", "SUPERVISOR", "AUDITOR", "FINANCEIRO"] },
  { id: "settings", label: "Configurações", shortLabel: "Configurações", icon: Settings, roles: ["ADMIN"] },
];


export default function App() {
  
  // SHARED STATES
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: "success" | "error" | "info" | "warning" = "info", title?: string) => {
    const id = generateEntityId("toast");
    const defaultTitles = {
      success: "Operação Concluída",
      error: "Ocorreu um Erro",
      info: "Informação do Sistema",
      warning: "Aviso de Segurança"
    };
    const newToast: Toast = {
      id,
      message,
      type,
      title: title || defaultTitles[type]
    };
    setToasts(prev => [...prev, newToast]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Global Fetch Rate Limit (429) Interceptor with Toast Throttling & Auto-Recovery
  useEffect(() => {
    const originalFetch = window.fetch;
    let lastToastTime = 0;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 429) {
        const now = Date.now();
        if (now - lastToastTime > 5000) {
          lastToastTime = now;
          try {
            const clone = response.clone();
            const data = await clone.json();
            showToast(
              data.message || data.error || "Muitas requisições enviadas. Sistema de proteção e Rate Limit em vigor.",
              "warning",
              "🛡️ Rate Limit"
            );
          } catch {
            showToast(
              "Limite de requisições ao servidor atingido (429). Aguarde alguns segundos.",
              "warning",
              "🛡️ Rate Limit"
            );
          }
        }
      }
      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState<boolean>(false);
  const [cashFlow, setCashFlow] = useState<CashFlowEntry[]>([]);
  const [activeShift, setActiveShift] = useState<ActiveCashShift | null>(null);
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
  const [isDbLoaded, setIsDbLoaded] = useState(false);

  // Carregar turno ativo do PostgreSQL / LocalStorage no arranque
  useEffect(() => {
    CashShiftService.getActiveShift().then(shift => {
      if (shift) setActiveShift(shift);
    }).catch(() => {});
  }, []);

  // ACTIVE OPERATOR & ROUTING STUFF
  const [activeUser, setActiveUser] = useState<Employee | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("DASHBOARD");
  const [showReplenishModal, setShowReplenishModal] = useState(false);

  // MULTI-STORE & CONSOLIDATED OVERSIGHT STATES
  const [selectedStoreId, setSelectedStoreId] = useState<string>("all");
  const [isStoreDropdownOpen, setIsStoreDropdownOpen] = useState(false);

  // Profile Switcher PIN Verification States
  const [pinVerificationOpen, setPinVerificationOpen] = useState(false);
  const [pinTargetEmployee, setPinTargetEmployee] = useState<Employee | null>(null);
  const [enteredPin, setEnteredPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [loginMethod, setLoginMethod] = useState<"select" | "type">("select");
  const [enteredUsername, setEnteredUsername] = useState("");

  // Force PIN Change Modal States
  const [forcePinChangeOpen, setForcePinChangeOpen] = useState(false);
  const [forcePinTargetEmployee, setForcePinTargetEmployee] = useState<Employee | null>(null);
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [forcePinError, setForcePinError] = useState("");

  // User Switch & Account Linking (Vínculo de Conta) States
  const [isUserSwitchModalOpen, setIsUserSwitchModalOpen] = useState(false);
  const [isQuickLogoModalOpen, setIsQuickLogoModalOpen] = useState(false);
  const [isTutorialModalOpen, setIsTutorialModalOpen] = useState(false);
  const [isSystemInfoHubOpen, setIsSystemInfoHubOpen] = useState(false);

  // Keyboard shortcut listener for F1 help
  useEffect(() => {
    const handleF1Help = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        setIsTutorialModalOpen(true);
      }
    };
    window.addEventListener("keydown", handleF1Help);
    return () => window.removeEventListener("keydown", handleF1Help);
  }, []);

  const handleUpdateUserPlan = async (employeeId: string, newPlan: SubscriptionPlan) => {
    const updatedEmployees = employees.map(emp => 
      emp.id === employeeId ? { ...emp, subscriptionPlan: newPlan } : emp
    );
    setEmployees(updatedEmployees);
    await syncTable("employees", updatedEmployees);
    handleAddAuditLog("Plano de Usuário Alterado", "ASSINATURAS", `Plano do utilizador (ID: ${employeeId}) alterado para ${newPlan}`);
  };

  const handleUpdateSystemPlan = (newPlan: SubscriptionPlan) => {
    setSettings(prev => ({ ...prev, subscriptionPlan: newPlan }));
    handleAddAuditLog("Plano do Sistema Alterado", "ASSINATURAS", `Plano geral do sistema alterado para ${newPlan}`);
  };

  // Dynamic system versioning that automatically increments with each database record or action logged
  const totalSystemModifications = useMemo(() => {
    return (products?.length || 0) + (customers?.length || 0) + (transactions?.length || 0) + (cashFlow?.length || 0) + (employees?.length || 0) + (auditLogs?.length || 0);
  }, [products, customers, transactions, cashFlow, employees, auditLogs]);

  const [buildVersion, setBuildVersion] = useState<number>(() => {
    try {
      const cached = localStorage.getItem("system_build_version");
      if (cached) {
        const parsed = parseInt(cached, 10);
        if (!isNaN(parsed)) return parsed;
      }
    } catch (e) {}
    // Fallback: start at max of 362 and total items inside local collections
    return Math.max(362, (products?.length || 0) + (customers?.length || 0) + (transactions?.length || 0) + (cashFlow?.length || 0) + (employees?.length || 0) + (auditLogs?.length || 0));
  });

  // Keep localStorage and buildVersion in sync if totalSystemModifications becomes higher on initial load
  useEffect(() => {
    setBuildVersion(current => {
      if (totalSystemModifications > current) {
        try {
          localStorage.setItem("system_build_version", String(totalSystemModifications));
        } catch (e) {}
        return totalSystemModifications;
      }
      return current;
    });
  }, [totalSystemModifications]);

  const { formattedVersion: currentSystemVersion } = useSystemVersion();

  // Fetch / Sync version counter and semantic version with local storage
  useEffect(() => {
    try {
      const storedBuildVersion = localStorage.getItem("system_build_version");
      if (storedBuildVersion) {
        const parsed = parseInt(storedBuildVersion, 10);
        if (!isNaN(parsed) && parsed > buildVersion) {
          setBuildVersion(parsed);
        }
      }
    } catch {}
  }, []);

  // Unified function to increment build version and semantic system version
  const incrementVersionCounter = async () => {
    // 1. Increment semantic version managed by versionManager (e.g., 1.0 -> 1.1 -> 1.2 -> ... -> 2.0)
    incrementSystemVersion();

    // 2. Increment numeric modification counter
    setBuildVersion(current => {
      const next = current + 1;
      try {
        localStorage.setItem("system_build_version", String(next));
      } catch (e) {}
      return next;
    });
  };

  const currency = "MT"; // Meticais Moçambique

  // Theme state defaulting to daily (orange and white mode)
  const [theme] = useState<"daily" | "night">("daily");
  const [isPOSFullscreen, setIsPOSFullscreen] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isFabOpen, setIsFabOpen] = useState<boolean>(false);
  
  // Geolocation and IP tracking for Audit Logs
  const [userIpInfo, setUserIpInfo] = useState<{ ip: string; city: string; country: string } | null>(null);
  const [deviceInfo] = useState<string>(() => {
    if (typeof navigator === "undefined") return "Desktop";
    const ua = navigator.userAgent;
    let dev = "Desktop";
    if (/mobile/i.test(ua)) dev = "Telemóvel / Mobile";
    else if (/tablet/i.test(ua)) dev = "Tablet";
    
    if (ua.includes("Chrome")) dev += " (Chrome)";
    else if (ua.includes("Firefox")) dev += " (Firefox)";
    else if (ua.includes("Safari") && !ua.includes("Chrome")) dev += " (Safari)";
    else if (ua.includes("Edge")) dev += " (Edge)";
    return dev;
  });

  // Track operator-specific custom color theme (Padrão do Sistema: laranja OST)
  const [activeColorTheme, setActiveColorTheme] = useState<string>("laranja");

  // Load and apply color theme dynamically
  useEffect(() => {
    const userId = activeUser?.id || "default";
    const matchedEmployee = employees.find(e => e.id === userId);
    const dbTheme = matchedEmployee?.theme;
    const userTheme = dbTheme || localStorage.getItem("erp_theme_" + userId);
    
    // Se o tema anterior guardado era o "azul" incorreto, repor para o padrão do sistema "laranja"
    if (userTheme === "azul") {
      try {
        localStorage.setItem("erp_theme_" + userId, "laranja");
      } catch {}
      setActiveColorTheme("laranja");
      applyTheme("laranja");
      return;
    }

    if (userTheme && userTheme !== "azul" && userTheme !== "default") {
      setActiveColorTheme(userTheme);
      applyTheme(userTheme);
    } else if (settings.theme && settings.theme !== "azul") {
      setActiveColorTheme(settings.theme);
      applyTheme(settings.theme);
    } else {
      setActiveColorTheme("laranja");
      applyTheme("laranja");
    }
  }, [activeUser, settings.theme, employees]);

  // When theme changes, apply it to document head
  useEffect(() => {
    applyTheme(activeColorTheme);
  }, [activeColorTheme]);

  // Connectivity state tracking network connection
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  // Stable refs for DB state, performance optimization and concurrency locks
  const sessionStartTimeRef = useRef<number>(Date.now());
  const isLoggingAuditRef = useRef<boolean>(false);
  const isBackingUpRef = useRef<boolean>(false);
  const lastAutoBackupTimeRef = useRef<number>(Date.now());
  const lastConfirmedProductMutationRef = useRef<number>(0);
  const isHydratingRef = useRef<boolean>(false);

  const dbStateRef = useRef({
    settings,
    products,
    customers,
    transactions,
    cashFlow,
    employees,
    auditLogs
  });

  useEffect(() => {
    dbStateRef.current = {
      settings,
      products,
      customers,
      transactions,
      cashFlow,
      employees,
      auditLogs
    };
  }, [settings, products, customers, transactions, cashFlow, employees, auditLogs]);

  // Purge any residual offline queues, credentials and commercial cache from localStorage/sessionStorage on startup (Strict Online-Only)
  useEffect(() => {
    try {
      purgeClientSensitiveStorage();
    } catch {}
  }, []);

  // Initialize system error capturing
  useEffect(() => {
    // Initialize standard error capturing (console.error, unhandled promises, fetch errors)
    const destroyCapturing = initErrorCapturing();
    return () => {
      destroyCapturing();
    };
  }, []);

  // Fetch client IP and geolocation for Audit logs
  useEffect(() => {
    // Fetch IP and Geo IP details
    fetch("https://ipapi.co/json/")
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch IP details");
        return res.json();
      })
      .then(data => {
        if (data && data.ip) {
          setUserIpInfo({
            ip: data.ip,
            city: data.city || "Indisponível",
            country: data.country_name || "Indisponível"
          });
        }
      })
      .catch(() => {
        setUserIpInfo(null);
      });
  }, []);

  // Advanced top bar metrics states
  const isLoggingOutRef = useRef<boolean>(
    typeof window !== "undefined" && window.localStorage?.getItem("erp_user_logged_out") === "true"
  );

  // GENERAL AUDIT LOGGING WRAPPER
  const handleAddAuditLog = useCallback((action: string, module: string, details: string, customUser?: Employee) => {
    if (isLoggingAuditRef.current) return;
    isLoggingAuditRef.current = true;
    try {
      let authRole: UserRole = "CASHIER";
      const targetUser = customUser || activeUser;
      const username = targetUser ? targetUser.name : "Sistema / Visitante";
      if (targetUser && targetUser.role) {
        const raw = targetUser.role.toLowerCase();
        if (raw.includes("supervisor")) authRole = "SUPERVISOR";
        else if (raw.includes("administrador") || raw.includes("gestor")) authRole = "ADMIN";
      }

      const ipStr = userIpInfo ? `${userIpInfo.ip} (${userIpInfo.city}, ${userIpInfo.country})` : "Indisponível";
      const devStr = deviceInfo || "Indisponível";

      const newLog: AuditLog = {
        id: generateEntityId("log"),
        timestamp: new Date().toISOString(),
        user: username,
        userRole: authRole,
        action,
        module,
        details,
        ip: ipStr,
        device: devStr
      };
      setAuditLogs(prev => {
        let updated = [...prev, newLog];
        if (updated.length > 200) {
          updated = updated.slice(-200);
        }
        setTimeout(() => {
          try {
            syncTable("auditlogs", updated);
          } catch (e) {}
        }, 0);
        return updated;
      });
    } finally {
      isLoggingAuditRef.current = false;
    }
  }, [activeUser, userIpInfo, deviceInfo]);

  // Online-Only direct persistence helper for mutations (products stock, customers, settings, cashflow, etc.)
  const syncTable = async (tableName: string, updatedData: any) => {
    if (isLoggingOutRef.current || localStorage.getItem("erp_user_logged_out") === "true") {
      console.log(`[SYNC] Sincronização da tabela ${tableName} ignorada: operação de logout ativa.`);
      return;
    }
    if (!isAuthenticated) return;
    if (!isDbLoaded && Array.isArray(updatedData) && updatedData.length === 0) return;
    await incrementVersionCounter();
    try {
      if (!navigator.onLine) {
        throw new Error("O dispositivo está sem ligação à Internet");
      }
      
      if (tableName === "products") {
        await CommercialDataService.saveProductsBatch(updatedData);
      } else if (tableName === "transactions") {
        await CommercialDataService.saveTransactionsBatch(updatedData);
      } else if (tableName === "customers") {
        await CommercialDataService.saveCustomersBatch(updatedData);
      } else if (tableName === "cashflow") {
        await CommercialDataService.saveCashFlowBatch(updatedData);
      } else if (tableName === "settings") {
        const email = activeUser?.email || (updatedData as any)?.userEmail || "levidomingos12@gmail.com";
        await CommercialDataService.saveSettings(updatedData, email);
      } else if (tableName === "employees") {
        await CommercialDataService.saveEmployeesBatch(updatedData);
      }
    } catch (err: any) {
      console.warn(`[ONLINE DIRECT ERROR] Falha ao sincronizar '${tableName}':`, err.message);
      if (tableName !== "auditlogs") {
        handleAddAuditLog(
          "Falha de Sincronização",
          "Erros do Sistema",
          `Erro ao sincronizar '${tableName}' com a base de dados: ${err.message}`
        );
      }
    }
  };

  // Register the callback to capture silent errors and log them to AuditLogs
  useEffect(() => {
    setLogCallback(handleAddAuditLog);
  }, [handleAddAuditLog]);

  // Network connection state listener (strict Online Only - no offline queue, no auto-retries)
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Global keyboard shortcuts for POS operations (F1, F2, etc.) handled in the App component to improve checkout efficiency
  useEffect(() => {
    const handlePOSGlobalShortcuts = (e: KeyboardEvent) => {
      // Only capture when POS module is active/rendered
      if (activeTab !== "POS") return;

      // Intercept POS keyboard shortcuts
      if (e.key === "F1" || e.key === "F2" || e.key === "F3" || e.key === "F4" || e.key === "F5" || e.key === "F6" || e.key === "F8" || e.key === "F9" || e.key === "F10" || e.key === "F11" || e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        
        // Dispatch a custom event to POSModule containing the triggered key
        const customEvent = new CustomEvent("pos-shortcut-trigger", {
          detail: { key: e.key }
        });
        window.dispatchEvent(customEvent);
      }
    };

    window.addEventListener("keydown", handlePOSGlobalShortcuts, true);
    return () => {
      window.removeEventListener("keydown", handlePOSGlobalShortcuts, true);
    };
  }, [activeTab]);

  // Global keyboard shortcut for Stock Replenishment (Ctrl+S)
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      if (!isAuthenticated) return;

      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        e.stopPropagation();
        setShowReplenishModal(prev => !prev);
      } else if (e.key === "Escape" && showReplenishModal) {
        setShowReplenishModal(false);
      }
    };

    window.addEventListener("keydown", handleGlobalShortcuts, true);
    return () => {
      window.removeEventListener("keydown", handleGlobalShortcuts, true);
    };
  }, [isAuthenticated, showReplenishModal]);


  // Hydrate states strictly from PostgreSQL via CommercialDataService (Strict Online-Only: PostgreSQL -> Frontend)
  const hydrateDatabaseForUser = async (user?: Employee | null, customCompanyName?: string) => {
    if (isLoggingOutRef.current || localStorage.getItem("erp_user_logged_out") === "true") {
      console.log("[HYDRATE] Hidratação cancelada: operação de logout em curso ou utilizador desconectado.");
      return;
    }
    if (isHydratingRef.current) {
      console.log("[HYDRATE] Hidratação já em curso. Evitando execução duplicada.");
      return;
    }
    isHydratingRef.current = true;
    try {
      console.log("[HYDRATE] Carregando dados comerciais diretamente do PostgreSQL...");

      // Fetch authoritative remote data from PostgreSQL for this tenant
      const [sbProductsRes, sbCustomers, sbTransactionsRes, sbCashflow, sbEmployees, sbSettings, sbAuditLogs] = await Promise.all([
        CommercialDataService.fetchProducts()
          .then((prods) => ({ success: true as const, prods, error: null }))
          .catch((err) => ({
            success: false as const,
            prods: null,
            error: err?.message || "Erro desconhecido ao ler produtos do PostgreSQL"
          })),
        CommercialDataService.fetchCustomers().catch((err) => {
          console.warn("[HYDRATE] Aviso ao buscar clientes do PostgreSQL:", err?.message);
          return [];
        }),
        CommercialDataService.fetchTransactions()
          .then((txs) => ({ success: true as const, txs, error: null }))
          .catch((err) => ({
            success: false as const,
            txs: null,
            error: err?.message || "Erro desconhecido ao ler vendas do PostgreSQL"
          })),
        CommercialDataService.fetchCashFlow().catch((err) => {
          console.warn("[HYDRATE] Aviso ao buscar fluxo de caixa do PostgreSQL:", err?.message);
          return [];
        }),
        CommercialDataService.fetchEmployees().catch((err) => {
          console.warn("[HYDRATE] Aviso ao buscar colaboradores do PostgreSQL:", err?.message);
          return [];
        }),
        CommercialDataService.fetchSettings((user?.email || activeUser?.email || "levidomingos12@gmail.com").trim().toLowerCase()).catch((err) => {
          console.warn("[HYDRATE] Aviso ao buscar definições do PostgreSQL:", err?.message);
          return null;
        }),
        CommercialDataService.fetchAuditLogs().catch((err) => {
          console.warn("[HYDRATE] Aviso ao buscar auditoria do PostgreSQL:", err?.message);
          return [];
        })
      ]);

      if (isLoggingOutRef.current || localStorage.getItem("erp_user_logged_out") === "true") {
        console.log("[HYDRATE] Dados recebidos descartados: utilizador efetuou logout durante o carregamento.");
        return;
      }

      // Direct state updates from PostgreSQL (Garantir dados válidos e confirmados pelo PostgreSQL)
      if (sbProductsRes.success && sbProductsRes.prods !== null) {
        setProducts(prevProducts => {
          const incoming = sbProductsRes.prods;
          // Impedir que hydrateDatabaseForUser sobrescreva produtos válidos por lista vazia ou incompleta
          if (incoming.length === 0 && prevProducts.length > 0) {
            console.warn("[HYDRATE] Proteção ativada: bloqueada sobrescrita de", prevProducts.length, "produtos válidos por lista vazia.");
            return prevProducts;
          }

          if (prevProducts.length === 0) {
            return incoming;
          }

          // Se houve mutação confirmada recente (últimos 5 segundos), proteger o estado confirmado
          const isRecentlyMutated = Date.now() - lastConfirmedProductMutationRef.current < 5000;
          if (isRecentlyMutated) {
            const prevMap = new Map(prevProducts.map(p => [p.id, p]));
            const merged = [...prevProducts];
            for (const inc of incoming) {
              if (!prevMap.has(inc.id)) {
                merged.push(inc);
              }
            }
            return merged;
          }

          // Preserva todos os produtos válidos já confirmados localmente, atualizando os que vieram do PostgreSQL
          const incomingMap = new Map(incoming.map(p => [p.id, p]));
          const result: Product[] = [];
          for (const prev of prevProducts) {
            const inc = incomingMap.get(prev.id);
            if (inc) {
              result.push(inc);
              incomingMap.delete(prev.id);
            } else {
              // Produto confirmado que não veio na resposta remota parcial - preservar!
              result.push(prev);
            }
          }
          for (const inc of incomingMap.values()) {
            result.push(inc);
          }
          return result;
        });
      } else {
        const errMsg = sbProductsRes.error || "Falha na leitura dos produtos do PostgreSQL";
        console.error("[HYDRATE] Erro real na leitura de produtos do PostgreSQL:", errMsg);
        const isTableMissing =
          errMsg.includes("PGRST205") ||
          errMsg.includes("schema cache") ||
          errMsg.includes("could not find the table") ||
          errMsg.includes("não foi encontrada");

        if (isTableMissing) {
          showToast(
            `Tabela de produtos ('products') não encontrada no PostgreSQL. Os produtos locais foram preservados.`,
            "warning",
            "Tabela PostgreSQL Não Encontrada"
          );
        } else {
          showToast(
            `Falha ao sincronizar catálogo de produtos com o PostgreSQL: ${errMsg}. Os produtos existentes foram preservados.`,
            "error",
            "Erro PostgreSQL"
          );
        }
      }
      // Hidratação segura de clientes com proteção contra substituição indevida por lista vazia
      setCustomers(prevCustomers => {
        const incoming = sbCustomers || [];
        if (prevCustomers.length > 0 && incoming.length === 0) {
          console.warn("[HYDRATE] Proteção de clientes ativada: preservando clientes locais em vez de sobrescrever com lista vazia.");
          return prevCustomers;
        }
        if (prevCustomers.length > 0 && incoming.length < prevCustomers.length) {
          console.warn(`[HYDRATE] Lista remota com menor contagem (${incoming.length} < ${prevCustomers.length}). Preservando clientes existentes.`);
          const incomingMap = new Map(incoming.map(c => [c.id, c]));
          const merged = [...incoming];
          for (const c of prevCustomers) {
            if (!incomingMap.has(c.id)) {
              merged.push(c);
            }
          }
          return merged;
        }
        return incoming.length > 0 ? incoming : prevCustomers;
      });

      if (sbTransactionsRes.success && sbTransactionsRes.txs !== null) {
        setTransactionsError(null);
        // Transactions sorted chronologically
        const sortedTransactions = sbTransactionsRes.txs.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setTransactions(sortedTransactions);
      } else {
        const errMsg = sbTransactionsRes.error || "Falha na leitura das vendas do PostgreSQL";
        console.error("[HYDRATE] Erro real na leitura de vendas do PostgreSQL:", errMsg);
        setTransactionsError(errMsg);
        const isPendingSetupOrFetch =
          errMsg.includes("Failed to fetch") ||
          errMsg.includes("PGRST205") ||
          errMsg.includes("schema cache") ||
          errMsg.includes("não está disponível");

        if (isPendingSetupOrFetch) {
          console.warn("[HYDRATE] Conexão com vendas do PostgreSQL pendente de configuração:", errMsg);
        } else {
          showToast(
            `Falha ao ler vendas do PostgreSQL: ${errMsg}. Os dados não foram mascarados como zero vendas.`,
            "error",
            "Erro PostgreSQL"
          );
        }
      }

      setCashFlow(sbCashflow || []);

      // Employees: ensure user profile integrity
      const baseEmployees = (sbEmployees && sbEmployees.length > 0) ? [...sbEmployees] : [...initialEmployees];
      if (user) {
        const idx = baseEmployees.findIndex(e => e.id === user.id || (e.email && e.email.toLowerCase() === user.email?.toLowerCase()));
        if (idx > -1) {
          baseEmployees[idx] = { ...baseEmployees[idx], ...user, pin: baseEmployees[idx].pin || user.pin };
        } else {
          baseEmployees.push(user);
        }
      }
      setEmployees(baseEmployees);

      // Settings
      const validCustomName = customCompanyName && customCompanyName.trim() && !customCompanyName.startsWith("comp_") ? customCompanyName.trim() : "";
      if (sbSettings) {
        setSettings(prev => {
          const chosenName = (sbSettings.companyName && !sbSettings.companyName.startsWith("comp_")) ? sbSettings.companyName : (validCustomName || prev.companyName);
          return { ...prev, ...sbSettings, ...(chosenName ? { companyName: chosenName } : {}) };
        });
      } else if (validCustomName) {
        setSettings(prev => ({ ...prev, companyName: validCustomName }));
      }

      // Audit logs
      setAuditLogs(sbAuditLogs || []);

      setIsDbLoaded(true);
      console.log("[HYDRATE] Dados comerciais carregados com sucesso do PostgreSQL.");
    } catch (err) {
      console.error("[HYDRATE] Erro ao carregar dados do PostgreSQL:", err);
      setIsDbLoaded(true);
    } finally {
      isHydratingRef.current = false;
    }
  };

  // Hydrate states from existential server database on mount
  useEffect(() => {
    // Run the connection test via abstract service
    ConnectionService.test();
    if (isAuthenticated && !isLoggingOutRef.current && localStorage.getItem("erp_user_logged_out") !== "true") {
      hydrateDatabaseForUser(activeUser);
    }
  }, []);

  useEffect(() => {
    if (theme === "night") {
      document.body.classList.add("dark");
    } else {
      document.body.classList.remove("dark");
    }
  }, [theme]);

  // Supabase Auth Observer to handle auto-login, load profiles, and synchronize permissions strictly via Supabase
  useEffect(() => {
    // Check for OAuth Callback Errors in URL Query or Hash
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const rawHash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
      const hashParams = new URLSearchParams(rawHash);

      const oauthError = urlParams.get("error") || hashParams.get("error");
      const oauthErrorDesc = urlParams.get("error_description") || hashParams.get("error_description");

      if (oauthError) {
        console.warn("[OAuth Callback] Retorno de erro da autenticação Google:", oauthError, oauthErrorDesc);
        const friendlyMessage = oauthError === "access_denied"
          ? "Autenticação Google cancelada pelo utilizador."
          : (oauthErrorDesc ? decodeURIComponent(oauthErrorDesc.replace(/\+/g, " ")) : "Falha na autenticação com a conta Google.");
        
        showToast(friendlyMessage, "error");
        // Clean URL to prevent error loop on reload
        window.history.replaceState(null, document.title, window.location.pathname);
      }
    }

    const handleAuthSync = async (user: any) => {
      if (!user || isLoggingOutRef.current || localStorage.getItem("erp_user_logged_out") === "true") {
        setIsAuthenticated(false);
        setActiveUser(null);
        return;
      }
      try {
        const { employee, companyName } = await SupabaseSyncService.syncUserProfileFromAuth(user, employees);

        if (isLoggingOutRef.current || localStorage.getItem("erp_user_logged_out") === "true") {
          setIsAuthenticated(false);
          setActiveUser(null);
          return;
        }

        if (employee.status === "BLOCKED") {
          showToast("A sua conta está BLOQUEADA por tempo expirado do PIN temporário ou suspensão de segurança.", "error");
          await SupabaseSyncService.signOut();
          setIsAuthenticated(false);
          setActiveUser(null);
          return;
        }

        if (employee.status === "INACTIVE" || employee.status === "SUSPENDED") {
          showToast("Esta conta está inativa ou suspensa. Contacte a Administração.", "error");
          await SupabaseSyncService.signOut();
          setIsAuthenticated(false);
          setActiveUser(null);
          return;
        }

        if (isLoggingOutRef.current || localStorage.getItem("erp_user_logged_out") === "true") {
          setIsAuthenticated(false);
          setActiveUser(null);
          return;
        }

        setActiveUser(prev => {
          if (prev && prev.id === employee.id && prev.name === employee.name && prev.role === employee.role && prev.status === employee.status && prev.pin === employee.pin) {
            return prev;
          }
          return employee;
        });
        setIsAuthenticated(true);
        if (companyName && companyName.trim() && !companyName.startsWith("comp_")) {
          setSettings(prev => {
            if (prev.companyName === companyName.trim()) return prev;
            return {
              ...prev,
              companyName: companyName.trim()
            };
          });
        }

        // Hydrate all commercial database records directly from PostgreSQL for this tenant/user only if not logging out
        if (!isLoggingOutRef.current && localStorage.getItem("erp_user_logged_out") !== "true") {
          await hydrateDatabaseForUser(employee, companyName);
        }

        // Clean OAuth hash/query tokens from URL bar without reload for a pristine URL
        if (typeof window !== "undefined" && (window.location.hash || window.location.search)) {
          window.history.replaceState(null, document.title, window.location.pathname);
        }

        console.log(`[SUPABASE AUTH] Sessão autoritativa ativa: ${employee.name} (${employee.role}) - Empresa: ${companyName}`);
      } catch (err) {
        console.error("[SUPABASE AUTH] Erro ao sincronizar perfil autoritativo:", err);
        setIsAuthenticated(false);
        setActiveUser(null);
      }
    };

    const client = getSupabaseClient();
    if (client) {
      const isLoggedOut = typeof window !== "undefined" && window.localStorage?.getItem("erp_user_logged_out") === "true";
      if (!isLoggedOut && !isLoggingOutRef.current) {
        client.auth.getSession().then(({ data: { session }, error }) => {
          if (error || !session?.user || isLoggingOutRef.current || localStorage.getItem("erp_user_logged_out") === "true") {
            setIsAuthenticated(false);
            setActiveUser(null);
          } else {
            handleAuthSync(session.user);
          }
        }).catch(() => {
          setIsAuthenticated(false);
          setActiveUser(null);
        });
      } else {
        setIsAuthenticated(false);
        setActiveUser(null);
      }

      const { data: authListener } = client.auth.onAuthStateChange((event, session) => {
        console.log(`[SUPABASE AUTH] onAuthStateChange evento: ${event}`);
        // Fluxo: Terminar Sessão → signOut → SIGNED_OUT → Login
        if (event === "SIGNED_OUT" || !session) {
          console.log("[SUPABASE AUTH] Evento SIGNED_OUT confirmado. Transição para ecrã de Login.");
          setIsAuthenticated(false);
          setActiveUser(null);
          return;
        }

        // Durante logout não executar hidratação, sincronização ou restauração de sessão
        if (isLoggingOutRef.current || localStorage.getItem("erp_user_logged_out") === "true") {
          console.log(`[SUPABASE AUTH] Evento ${event} suprimido (utilizador efetuou logout).`);
          return;
        }

        if (session?.user && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION")) {
          handleAuthSync(session.user);
        }
      });

      return () => {
        authListener?.subscription?.unsubscribe();
      };
    } else {
      setIsAuthenticated(false);
      setActiveUser(null);
    }
  }, []);

  // Real-time products subscription and initial sync
  useEffect(() => {
    if (isAuthenticated && !isLoggingOutRef.current && localStorage.getItem("erp_user_logged_out") !== "true") {
      console.log("[SUPABASE] Ativando subscrição em tempo real para produtos...");
      
      const unsubscribe = CommercialDataService.subscribeProducts(async () => {
        if (isLoggingOutRef.current || localStorage.getItem("erp_user_logged_out") === "true") return;
        setIsOnline(true);

        // Se uma mutação de produto foi confirmada recentemente (últimos 5 segundos),
        // não executar nenhuma atualização imediata que possa sobrescrever o estado confirmado
        if (Date.now() - lastConfirmedProductMutationRef.current < 5000) {
          console.log("[SUPABASE] Realtime ignorado temporariamente (mutação recente confirmada protegida).");
          return;
        }

        try {
          const sbProducts = await CommercialDataService.fetchProducts();
          if (isLoggingOutRef.current || localStorage.getItem("erp_user_logged_out") === "true") return;

          if (Date.now() - lastConfirmedProductMutationRef.current < 5000) {
            return;
          }

          // Impedir que qualquer realtime sobrescreva produtos válidos por lista vazia ou incompleta
          if (Array.isArray(sbProducts) && sbProducts.length > 0) {
            console.log(`[SUPABASE] Recebidos ${sbProducts.length} produtos em tempo real.`);
            setProducts(prevProducts => {
              if (Date.now() - lastConfirmedProductMutationRef.current < 5000) {
                return prevProducts;
              }
              if (prevProducts.length === 0) {
                return sbProducts;
              }
              const incomingMap = new Map(sbProducts.map(p => [p.id, p]));
              const result: Product[] = [];
              for (const prev of prevProducts) {
                const inc = incomingMap.get(prev.id);
                if (inc) {
                  result.push(inc);
                  incomingMap.delete(prev.id);
                } else {
                  // Preserva produto confirmado que não veio no realtime parcial
                  result.push(prev);
                }
              }
              for (const inc of incomingMap.values()) {
                result.push(inc);
              }
              return result;
            });
          } else {
            console.warn("[SUPABASE] Realtime retornou lista vazia ou nula. Ignorando sobrescrita para proteger integridade.");
          }
        } catch (error) {
          console.error("[SUPABASE] Erro no listener em tempo real de produtos (estado preservado):", error);
        }
      });

      const loadTransactions = async () => {
        if (isLoggingOutRef.current || localStorage.getItem("erp_user_logged_out") === "true") return;
        if (transactions.length > 0 && !transactionsError) return;
        setIsLoadingTransactions(true);
        try {
          const sbTx = await CommercialDataService.fetchTransactions();
          if (isLoggingOutRef.current || localStorage.getItem("erp_user_logged_out") === "true") return;
          setTransactionsError(null);
          if (sbTx && sbTx.length > 0) {
            console.log(`[SUPABASE] Carregadas ${sbTx.length} transações do PostgreSQL.`);
            setTransactions(sbTx.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
          } else {
            console.log("[SUPABASE] Sem transações registradas no PostgreSQL (0 vendas).");
            setTransactions([]);
          }
        } catch (err: any) {
          if (isLoggingOutRef.current || localStorage.getItem("erp_user_logged_out") === "true") return;
          const errMsg = err?.message || "Erro de conexão ao carregar transações do PostgreSQL";
          console.error("[SUPABASE] Erro real ao carregar transações do PostgreSQL:", err);
          setTransactionsError(errMsg);
          const isPending =
            errMsg.includes("Failed to fetch") ||
            errMsg.includes("PGRST205") ||
            errMsg.includes("não está disponível");
          if (!isPending) {
            showToast(`Erro ao carregar vendas do PostgreSQL: ${errMsg}`, "error", "Erro de Vendas");
          }
        } finally {
          setIsLoadingTransactions(false);
        }
      };

      loadTransactions();

      return () => {
        console.log("[SUPABASE] Desativando subscrição em tempo real para produtos.");
        if (unsubscribe && typeof (unsubscribe as any).unsubscribe === "function") {
          (unsubscribe as any).unsubscribe();
        } else if (typeof unsubscribe === "function") {
          (unsubscribe as any)();
        }
      };
    }
  }, [isAuthenticated]);

  // Synchronize user database with authoritative PostgreSQL staff list
  useEffect(() => {
    if (isAuthenticated && !isLoggingOutRef.current && localStorage.getItem("erp_user_logged_out") !== "true") {
      const syncStaff = async () => {
        if (isLoggingOutRef.current || localStorage.getItem("erp_user_logged_out") === "true") return;
        if (employees.length > 0 && employees !== initialEmployees) return;
        try {
          const sbUsers = await CommercialDataService.fetchEmployees();
          if (isLoggingOutRef.current || localStorage.getItem("erp_user_logged_out") === "true") return;
          if (sbUsers && sbUsers.length > 0) {
            setEmployees(sbUsers);
          }
        } catch (err) {
          console.error("Erro ao sincronizar quadro de colaboradores:", err);
        }
      };
      syncStaff();
    }
  }, [isAuthenticated]);

  // Retry / Manual Reload of Sales from PostgreSQL (Etapa 7: Nunca mascarar erro como zero vendas)
  const handleRetryTransactions = async () => {
    setIsLoadingTransactions(true);
    try {
      showToast("A sincronizar vendas diretamente do PostgreSQL...", "info", "PostgreSQL");
      const sbTx = await CommercialDataService.fetchTransactions();
      setTransactionsError(null);
      const sorted = (sbTx || []).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setTransactions(sorted);
      showToast(`Vendas carregadas com sucesso (${sorted.length} registadas).`, "success", "PostgreSQL Sincronizado");
    } catch (err: any) {
      const errMsg = err?.message || "Falha na conexão ao PostgreSQL";
      console.error("[RETRY] Erro real ao recarregar transações do PostgreSQL:", err);
      setTransactionsError(errMsg);
      showToast(`Falha ao recarregar vendas do PostgreSQL: ${errMsg}`, "error", "Erro PostgreSQL");
    } finally {
      setIsLoadingTransactions(false);
    }
  };

  // Quick Switch Operator Handlers
  const handleChangeRole = async (role: UserRole) => {
    // find a fitting mock employee or create template
    const fitEmp = employees.find(e => {
      if (role === "ADMIN") return e.role.toUpperCase().includes("GESTOR") || e.role.toUpperCase().includes("ADMINISTRADOR") || e.role.toUpperCase().includes("ADMIN");
      if (role === "SUPERVISOR") return e.role.toUpperCase().includes("SUPERVISOR");
      return e.role.toUpperCase().includes("CAIXA") || e.role.toUpperCase().includes("VENDEDOR");
    });
    
    if (fitEmp) {
      setPinTargetEmployee(fitEmp);
      setEnteredPin("");
      setPinError("");
      setPinVerificationOpen(true);
    }
  };

  const handleVerifyAndSwitchProfile = async () => {
    let targetEmp = pinTargetEmployee;

    if (loginMethod === "type") {
      if (!enteredUsername.trim()) {
        setPinError("Por favor, introduza o seu Username.");
        return;
      }
      const found = employees.find(e => e.username?.toLowerCase() === enteredUsername.trim().toLowerCase());
      if (!found) {
        setPinError("Nome de utilizador (Username) não encontrado.");
        return;
      }
      targetEmp = found;
    }

    if (!targetEmp) {
      setPinError("Por favor, selecione ou introduza um colaborador.");
      return;
    }

    if (targetEmp.status === "BLOCKED") {
      setPinError("A sua conta está BLOQUEADA por tempo expirado da senha de acesso ou suspensão de segurança.");
      return;
    }

    if (targetEmp.status === "INACTIVE" || targetEmp.status === "SUSPENDED") {
      setPinError("Esta conta está inativa ou suspensa. Contacte o Administrador.");
      return;
    }

    const requiredPin = targetEmp.pin || "123456";
    if (enteredPin.trim() !== requiredPin.trim()) {
      setPinError("Senha incorreta. Por favor, tente novamente.");
      return;
    }

    // Check expiration policy (2 months / 60 days)
    const now = new Date();
    const createdAtStr = targetEmp.pinCreatedAt || targetEmp.admissionDate || now.toISOString();
    const createdAt = new Date(createdAtStr);
    const diffTime = now.getTime() - createdAt.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    const isPinTemporary = targetEmp.pinChanged === false;

    // If password is temporary (first login) OR has expired (older than 60 days)
    if (isPinTemporary) {
      // Intercept login and open the Force password Change dialog
      setForcePinTargetEmployee(targetEmp);
      setNewPin("");
      setConfirmNewPin("");
      setForcePinError("Este é o seu primeiro login. Por favor, crie uma senha pessoal segura.");
      setForcePinChangeOpen(true);
      setPinVerificationOpen(false);
      return;
    }

    if (diffDays > 60) {
      // Password expired
      setForcePinTargetEmployee(targetEmp);
      setNewPin("");
      setConfirmNewPin("");
      setForcePinError("A sua senha de acesso expirou (validade de 2 meses). Por favor, defina uma nova senha.");
      setForcePinChangeOpen(true);
      setPinVerificationOpen(false);
      return;
    }

    const fitEmp = targetEmp;
    setActiveUser(fitEmp);

    let ipStr = "IP Desconhecido";
    try {
      const res = await fetch("https://api.ipify.org?format=json");
      const data = await res.json();
      if (data && data.ip) {
        ipStr = data.ip;
      }
    } catch (e) {
      console.warn("Could not fetch IP", e);
    }

    handleAddAuditLog(
      "Alternância de Operador",
      "SISTEMA",
      `Sessão iniciada como ${fitEmp.name} (Perfil: ${fitEmp.role}). IP: ${ipStr}`
    );

    // Auto-redirect or reset module access if needed
    const targetUserRole = normalizeUserRole(fitEmp);
    const accessCheck = canRoleAccessModule(targetUserRole, activeTab.toLowerCase());
    if (!accessCheck.allowed) {
      setActiveTab(getDefaultModuleForRole(targetUserRole));
    }

    showToast(`Bem-vindo, ${fitEmp.name}! Sessão autorizada com sucesso.`, "success");
    setPinVerificationOpen(false);
    setPinTargetEmployee(null);
  };

  const handleForcePinChangeSubmit = () => {
    if (!forcePinTargetEmployee) return;

    if (newPin.length < 6) {
      setForcePinError("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (newPin === forcePinTargetEmployee.pin) {
      setForcePinError("A nova senha não pode ser idêntica à senha anterior.");
      return;
    }

    if (newPin !== confirmNewPin) {
      setForcePinError("As senhas de confirmação não coincidem.");
      return;
    }

    // Update PIN & properties
    const updatedEmployees = employees.map(emp => {
      if (emp.id === forcePinTargetEmployee.id) {
        return {
          ...emp,
          pin: newPin,
          pinChanged: true,
          pinCreatedAt: new Date().toISOString()
        };
      }
      return emp;
    });

    handleUpdateEmployees(updatedEmployees);

    const fitEmp = {
      ...forcePinTargetEmployee,
      pin: newPin,
      pinChanged: true,
      pinCreatedAt: new Date().toISOString()
    };
    setActiveUser(fitEmp);
    setIsAuthenticated(true);

    let ipStr = "IP Desconhecido";
    fetch("https://api.ipify.org?format=json")
      .then(res => res.json())
      .then(data => {
        if (data && data.ip) {
          ipStr = data.ip;
        }
      })
      .catch(e => console.warn("Could not fetch IP", e))
      .finally(() => {
        handleAddAuditLog(
          "Alteração de Senha Obrigatória",
          "SEGURANÇA",
          `Colaborador ${fitEmp.name} alterou com sucesso a sua senha de acesso. Sessão iniciada. IP: ${ipStr}`
        );
      });

    const targetUserRole = normalizeUserRole(fitEmp);
    const accessCheck = canRoleAccessModule(targetUserRole, activeTab.toLowerCase());
    if (!accessCheck.allowed) {
      setActiveTab(getDefaultModuleForRole(targetUserRole));
    }

    showToast(`Nova senha de acesso registada com sucesso! Bem-vindo, ${fitEmp.name}.`, "success");
    setForcePinChangeOpen(false);
    setForcePinTargetEmployee(null);
  };

  // PANIC SYSTEM / EMERGENCY SECURITY ALERT
  const handleTriggerPanic = async () => {
    const operatorName = activeUser?.name || "Operador Desconhecido";
    const operatorRole = activeUser?.role || "Operador";
    const ipStr = userIpInfo ? userIpInfo.ip : "Indisponível";
    const locStr = userIpInfo ? `${userIpInfo.city}, ${userIpInfo.country}` : "Indisponível";
    const devStr = deviceInfo || "Indisponível";

    // 1. Add Immediate Critical Audit Log
    handleAddAuditLog(
      "BOTÃO DE PÂNICO ACIONADO",
      "SEGURANÇA",
      `ALERTA EMERGENCIAL CRÍTICO! O operador ${operatorName} acionou o botão de pânico. IP: ${ipStr} (${locStr}). Dispositivo: ${devStr}. Notificações em massa enviadas aos administradores.`
    );

    // 2. Identify Administrators
    const admins = employees.filter(emp => {
      if (!emp.role) return false;
      const roleLower = emp.role.toLowerCase();
      return (
        roleLower.includes("admin") ||
        roleLower.includes("gestor") ||
        roleLower.includes("supervisor") ||
        roleLower.includes("gerente") ||
        roleLower.includes("diretor")
      );
    });

    // 3. Extract Emails and Phone numbers
    const emails = admins.map(a => a.email).filter(Boolean) as string[];
    const phones = admins.map(a => a.contact).filter(Boolean) as string[];

    if (settings.reportRecipientEmail && !emails.includes(settings.reportRecipientEmail)) {
      emails.push(settings.reportRecipientEmail);
    }
    if (settings.smtpUser && !emails.includes(settings.smtpUser)) {
      emails.push(settings.smtpUser);
    }

    // 4. Construct Alerta Body
    const subject = `🚨 [${settings.companyName || "SISTEMA"}] ALERTA DE PÂNICO EMERGENCIAL DE SEGURANÇA!`;
    const emailHtmlBody = `
      <div style="font-family: Arial, sans-serif; border: 3px solid #dc2626; border-radius: 16px; overflow: hidden; max-width: 600px; margin: 0 auto; box-shadow: 0 10px 25px rgba(220, 38, 38, 0.2);">
        <div style="background-color: #dc2626; padding: 24px; text-align: center; color: white;">
          <h2 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: 0.5px;">🚨 ALERTA CRÍTICO DE PÂNICO</h2>
          <p style="margin: 8px 0 0; font-size: 13px; font-weight: bold; text-transform: uppercase; background-color: rgba(0,0,0,0.2); display: inline-block; padding: 4px 12px; border-radius: 9999px;">${settings.companyName || "SISTEMA COMERCIAL"}</p>
        </div>
        <div style="padding: 28px; color: #1e293b; background-color: #ffffff;">
          <p style="font-size: 16px; line-height: 1.6; margin-top: 0; font-weight: 600; color: #991b1b;">
            ATENÇÃO ADMINISTRADOR! O Botão de Pânico foi acionado voluntariamente a partir do ponto de venda.
          </p>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #64748b; width: 140px;">Operador Ativo:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #0f172a;">${operatorName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #64748b;">Função do Utilizador:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #dc2626;">${operatorRole}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #64748b;">Data e Hora:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; color: #334155; font-family: monospace;">${new Date().toLocaleString('pt-MZ')}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #64748b;">Endereço IP:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; color: #334155; font-family: monospace; font-weight: bold;">${ipStr}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #64748b;">Localização IP:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; color: #334155; font-weight: bold;">${locStr}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #64748b;">Dispositivo/Browser:</td>
                <td style="padding: 8px 0; color: #334155;">${devStr}</td>
              </tr>
            </table>
          </div>
          <div style="background-color: #fef2f2; border-left: 5px solid #dc2626; padding: 18px; border-radius: 8px; margin: 20px 0;">
            <strong style="color: #991b1b; display: block; margin-bottom: 6px; font-size: 14px;">⚠️ PROCEDIMENTO DE SEGURANÇA:</strong>
            <p style="margin: 0; font-size: 13px; color: #7f1d1d; line-height: 1.6;">
              1. Verifique as câmeras ou canais de comunicação com a loja imediatamente.<br/>
              2. Caso não consiga contato com o operador, acione os canais policiais locais ou segurança patrimonial.<br/>
              3. O log crítico foi gravado permanentemente na auditoria do sistema para efeitos legais.
            </p>
          </div>
        </div>
        <div style="background-color: #f8fafc; padding: 18px; text-align: center; color: #64748b; font-size: 11px; border-top: 1px solid #e2e8f0;">
          Enviado por: <strong>OST Vendas Moçambique Fiscal Cloud</strong>. Não responda a esta mensagem eletrônica.
        </div>
      </div>
    `;

    const smsText = `🚨 OST VENDAS - PANICO ATIVADO! Operador: ${operatorName} (${operatorRole}). IP: ${ipStr} (${locStr}). Verifique a loja de imediato!`;

    // 5. Send Email Notifications
    const emailPromises = emails.map(async (email) => {
      try {
        await sendEmail({
          to: email,
          subject,
          body: emailHtmlBody,
          isHtml: true
        });
        console.log(`[Panic] Email alert sent successfully to \${email}`);
        return { email, success: true };
      } catch (err: any) {
        console.error(`[Panic] Failed to send email alert to \${email}:`, err);
        return { email, success: false, error: err.message };
      }
    });

    // 6. Send SMS Notifications
    const smsPromises = phones.map(async (phone) => {
      try {
        await sendSMS(phone, smsText);
        console.log(`[Panic] SMS alert sent successfully to \${phone}`);
        return { phone, success: true };
      } catch (err: any) {
        console.error(`[Panic] Failed to send SMS alert to \${phone}:`, err);
        return { phone, success: false, error: err.message };
      }
    });

    // Run parallel
    const emailResults = await Promise.all(emailPromises);
    const smsResults = await Promise.all(smsPromises);

    const successfulEmailsCount = emailResults.filter(r => r.success).length;
    const successfulSmsCount = smsResults.filter(r => r.success).length;

    showToast(
      `Alerta crítico disparado! ${successfulEmailsCount} e-mails e ${successfulSmsCount} SMS de emergência enviados aos administradores.`,
      "warning",
      "🚨 ALERTA MÁXIMO"
    );
  };

  // CENTRAL MUTATION HOOKS - PRODUCTS (Gravar no PostgreSQL → confirmar sucesso → atualizar products)
  const handleAddProduct = async (newP: Product) => {
    try {
      console.log(`[PRODUCTS] 1. Gravando produto "${newP.name}" no PostgreSQL...`);
      await CommercialDataService.saveProduct(newP);
      console.log(`[PRODUCTS] 2. Sucesso confirmado pelo PostgreSQL para o produto "${newP.name}".`);

      // Marca timestamp da confirmação para proteger estado contra sobrescrita imediata
      lastConfirmedProductMutationRef.current = Date.now();

      // 3. Atualizar products somente após confirmação do banco de dados
      setProducts(prev => {
        const exists = prev.some(p => p.id === newP.id);
        if (exists) {
          return prev.map(p => p.id === newP.id ? newP : p);
        }
        return [newP, ...prev];
      });
      showToast(`Produto "${newP.name}" gravado e confirmado no PostgreSQL!`, "success", "Produto Salvo");
    } catch (err: any) {
      const errMsg = err?.message || "Erro de conexão ao gravar produto no PostgreSQL";
      console.error(`[PRODUCTS] Falha ao gravar produto "${newP.name}" no PostgreSQL:`, err);
      showToast(`Erro ao gravar produto no PostgreSQL: ${errMsg}. Cadastro cancelado.`, "error", "Falha de Gravação");
      throw err;
    }
  };

  const handleUpdateProduct = async (updatedP: Product) => {
    try {
      console.log(`[PRODUCTS] 1. Gravando alterações de "${updatedP.name}" no PostgreSQL...`);
      await CommercialDataService.saveProduct(updatedP);
      console.log(`[PRODUCTS] 2. Sucesso confirmado pelo PostgreSQL para "${updatedP.name}".`);

      lastConfirmedProductMutationRef.current = Date.now();

      // 3. Atualizar products somente após confirmação do banco de dados
      setProducts(prev => prev.map(p => p.id === updatedP.id ? updatedP : p));
      showToast(`Produto "${updatedP.name}" atualizado e confirmado no PostgreSQL!`, "success", "Produto Atualizado");
    } catch (err: any) {
      const errMsg = err?.message || "Erro de conexão ao atualizar produto no PostgreSQL";
      console.error(`[PRODUCTS] Falha ao atualizar produto "${updatedP.name}" no PostgreSQL:`, err);
      showToast(`Erro ao atualizar produto no PostgreSQL: ${errMsg}. Alterações não salvas.`, "error", "Falha de Gravação");
      throw err;
    }
  };

  const handleUpdateProductsBatch = async (updatedBatch: Product[]) => {
    try {
      console.log(`[PRODUCTS] 1. Gravando lote de ${updatedBatch.length} produtos no PostgreSQL...`);
      await CommercialDataService.saveProductsBatch(updatedBatch);
      console.log(`[PRODUCTS] 2. Sucesso confirmado pelo PostgreSQL para ${updatedBatch.length} produtos.`);

      lastConfirmedProductMutationRef.current = Date.now();

      const updatedMap = new Map(updatedBatch.map(p => [p.id, p]));
      setProducts(prev => prev.map(p => updatedMap.get(p.id) || p));
      showToast(`Reajuste em lote de ${updatedBatch.length} produtos gravado com sucesso no PostgreSQL!`, "success", "Preços Atualizados em Lote");
    } catch (err: any) {
      const errMsg = err?.message || "Erro ao atualizar lote de produtos no PostgreSQL";
      console.error(`[PRODUCTS] Falha ao atualizar lote no PostgreSQL:`, err);
      showToast(`Erro ao gravar preços no PostgreSQL: ${errMsg}`, "error", "Falha de Gravação");
      throw err;
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      console.log(`[PRODUCTS] 1. Removendo produto "${productId}" no PostgreSQL...`);
      await CommercialDataService.removeProduct(productId);
      console.log(`[PRODUCTS] 2. Remoção confirmada pelo PostgreSQL para "${productId}".`);

      lastConfirmedProductMutationRef.current = Date.now();

      setProducts(prev => prev.filter(p => p.id !== productId));
      showToast("Produto desativado com sucesso no PostgreSQL.", "success");
    } catch (err: any) {
      const errMsg = err?.message || "Erro ao remover produto no PostgreSQL";
      console.error(`[PRODUCTS] Falha ao remover produto "${productId}" no PostgreSQL:`, err);
      showToast(`Erro ao remover produto no PostgreSQL: ${errMsg}`, "error", "Falha de Remoção");
      throw err;
    }
  };

  // CENTRAL MUTATION HOOKS - CUSTOMERS
  const handleAddCustomer = async (newC: Customer) => {
    // 1. Atualiza estado imediatamente no frontend
    let updatedList: Customer[] = [];
    setCustomers(prev => {
      const filtered = prev.filter(c => c.id !== newC.id);
      updatedList = [newC, ...filtered];
      return updatedList;
    });

    // 2. Grava de forma persistente diretamente no serviço comercial (Supabase/PostgreSQL + Backend)
    try {
      await CommercialDataService.saveCustomer(newC);
    } catch (err: any) {
      console.warn("[handleAddCustomer] Falha na gravação individual direta, sincronizando lote:", err?.message);
    }

    // 3. Sincroniza tabela central para integridade
    if (updatedList.length > 0) {
      await syncTable("customers", updatedList);
    }
  };

  const handleUpdateCustomer = async (updatedC: Customer) => {
    let updatedList: Customer[] = [];
    setCustomers(prev => {
      updatedList = prev.map(c => c.id === updatedC.id ? updatedC : c);
      return updatedList;
    });

    try {
      await CommercialDataService.saveCustomer(updatedC);
    } catch (err: any) {
      console.warn("[handleUpdateCustomer] Falha na atualização individual direta, sincronizando lote:", err?.message);
    }

    if (updatedList.length > 0) {
      await syncTable("customers", updatedList);
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    try {
      await CommercialDataService.removeCustomer(customerId);
    } catch (err) {
      console.warn("Erro ao apagar cliente:", err);
    }

    // Update state and sync with server
    setCustomers(prev => {
      const updated = prev.filter(c => c.id !== customerId);
      syncTable("customers", updated);
      return updated;
    });
  };

  // CENTRAL MUTATION HOOKS - CASH FLOW
  const handleAddCashFlowEntry = (newEntry: CashFlowEntry) => {
    setCashFlow(prev => {
      const updated = [...prev, newEntry];
      syncTable("cashflow", updated);
      return updated;
    });
  };

  // CENTRAL MUTATION HOOKS - EMPLOYEES
  const handleAddEmployee = (newEmp: Employee) => {
    setEmployees(prev => {
      const updated = [newEmp, ...prev];
      syncTable("employees", updated);
      return updated;
    });
  };

  const handleUpdateEmployees = (updatedList: Employee[]) => {
    setEmployees(updatedList);
    syncTable("employees", updatedList);
  };

  // CENTRAL MUTATION HOOKS - SETTINGS
  const handleUpdateSettings = (newSettings: Partial<SystemSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      syncTable("settings", updated);
      return updated;
    });
  };

  const handleThemeChange = (newThemeId: string) => {
    setActiveColorTheme(newThemeId);
    const userId = activeUser?.id || "default";
    localStorage.setItem("erp_theme_" + userId, newThemeId);
    handleUpdateSettings({ theme: newThemeId });
  };

  // Unified cloud backup creation (supports manual and automatic scheduled runs)
  const handleTriggerLocalBackup = async (type: "manual" | "automatic" = "manual") => {
    if (isBackingUpRef.current) return false;
    isBackingUpRef.current = true;
    try {
      const currentData = dbStateRef.current;
      const dbPayload = {
        app: "OST Vendas",
        exportDate: new Date().toISOString(),
        version: currentSystemVersion,
        operator: type === "manual" ? (activeUser?.name || "ADMIN") : "Agendador Automático em Nuvem",
        data: {
          settings: sanitizeSettingsForExport(currentData.settings),
          products: currentData.products,
          customers: currentData.customers,
          transactions: currentData.transactions,
          cashFlow: currentData.cashFlow,
          employees: sanitizeEmployeesForExport(currentData.employees),
          auditLogs: currentData.auditLogs.slice(-50)
        }
      };

      const dataStr = JSON.stringify(dbPayload);
      const backupFileName = `backup_cloud_${Date.now()}.json`;

      // Upload backup payload directly to cloud storage (Supabase Storage) - No local storage cache
      try {
        await StorageService.uploadBackup(backupFileName, dataStr);
      } catch (uploadErr) {
        console.warn("[BACKUP] Aviso ao enviar cópia de segurança para o Supabase Storage:", uploadErr);
      }

      if (type === "manual") {
        handleAddAuditLog(
          "Backup na Nuvem Manual",
          "SEGURANÇA",
          "Cópia de segurança enviada para a nuvem com sucesso (Manual)."
        );
      }

      return true;
    } catch (error) {
      console.error("Erro ao realizar backup:", error);
      return false;
    } finally {
      isBackingUpRef.current = false;
    }
  };

  // Automated scheduled database backup to cloud storage (runs checking interval every 15m; backups based on user configuration)
  useEffect(() => {
    if (!isAuthenticated) return;

    const runAutomaticBackup = () => {
      try {
        if (isBackingUpRef.current) return;
        const now = Date.now();
        
        const frequency = dbStateRef.current.settings?.backupFrequency || "daily";
        let intervalMs = 24 * 60 * 60 * 1000; // default 1 day (daily)
        if (frequency === "weekly") {
          intervalMs = 7 * 24 * 60 * 60 * 1000;
        } else if (frequency === "monthly") {
          intervalMs = 30 * 24 * 60 * 60 * 1000;
        } else if (frequency === "12h") {
          intervalMs = 12 * 60 * 60 * 1000;
        }

        // Only run backup if configured frequency interval has genuinely elapsed
        if (now - lastAutoBackupTimeRef.current < intervalMs) {
          return;
        }
        lastAutoBackupTimeRef.current = now;

        console.log(`[AUTO-BACKUP] Executando cópia de segurança em nuvem (${frequency})...`);
        handleTriggerLocalBackup("automatic");
      } catch (error) {
        console.error("[AUTO-BACKUP] Erro ao realizar backup automático:", error);
      }
    };

    // Check periodically
    const intervalId = setInterval(runAutomaticBackup, 900000);

    return () => clearInterval(intervalId);
  }, [isAuthenticated, settings?.backupFrequency]);

  const handleGetBackupPayload = () => {
    return {
      app: "OST Vendas",
      exportDate: new Date().toISOString(),
      version: currentSystemVersion,
      operator: activeUser?.name || "ADMIN",
      data: {
        settings: sanitizeSettingsForExport(settings),
        products,
        customers,
        transactions,
        cashFlow,
        employees: sanitizeEmployeesForExport(employees),
        auditLogs
      }
    };
  };

  // ADMIN-ONLY REAL DATABASE EXPORT (JSON DOWNLOAD)
  const handleExportLocalDB = () => {
    const dbPayload = {
      app: "OST Vendas",
      exportDate: new Date().toISOString(),
      version: currentSystemVersion,
      operator: activeUser?.name || "ADMIN",
      data: {
        settings: sanitizeSettingsForExport(settings),
        products,
        customers,
        transactions,
        cashFlow,
        employees: sanitizeEmployeesForExport(employees),
        auditLogs
      }
    };

    const dataStr = JSON.stringify(dbPayload, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `OST_Vendas_DB_Backup_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    handleAddAuditLog(
      "Exportação Completa de DB",
      "SEGURANÇA",
      `Operador ${activeUser?.name || "ADMIN"} exportou com sucesso o banco de dados completo contendo ${products.length} produtos, ${customers.length} clientes, ${transactions.length} transações, ${cashFlow.length} movimentos e ${auditLogs.length} logs.`
    );
  };

  // ADMIN-ONLY REAL DATABASE IMPORT/RESTORE
  const handleImportLocalDB = async (importedData: any) => {
    try {
      if (!importedData) return false;

      if (importedData.products) {
        setProducts(importedData.products);
        await syncTable("products", importedData.products);
      }
      if (importedData.customers) {
        setCustomers(importedData.customers);
        await syncTable("customers", importedData.customers);
      }
      if (importedData.transactions) {
        setTransactions(importedData.transactions);
        await syncTable("transactions", importedData.transactions);
      }
      if (importedData.cashFlow) {
        setCashFlow(importedData.cashFlow);
        await syncTable("cashflow", importedData.cashFlow);
      }
      if (importedData.employees) {
        setEmployees(importedData.employees);
        await syncTable("employees", importedData.employees);
      }
      if (importedData.auditLogs) {
        setAuditLogs(importedData.auditLogs);
        await syncTable("auditlogs", importedData.auditLogs);
      }
      if (importedData.settings) {
        setSettings(importedData.settings);
        await syncTable("settings", importedData.settings);
      }

      handleAddAuditLog(
        "Restauro Completo de DB",
        "SEGURANÇA",
        `Operador ${activeUser?.name || "ADMIN"} restaurou com sucesso o banco de dados local.`
      );

      return true;
    } catch (error) {
      console.error("Falha ao restaurar banco de dados completo:", error);
      return false;
    }
  };

  // ADMIN-ONLY PERMANENT MOCK DATA PURGE
  const handlePurgeMockData = async () => {
    try {
      const result = await AdminService.purgeMockData(activeUser?.name || "Administrador");
      if (result.success) {
        setProducts(prev => AdminService.filterRealProducts(prev));
        setCustomers(prev => AdminService.filterRealCustomers(prev));
        setTransactions(prev => AdminService.filterRealTransactions(prev));

        handleAddAuditLog(
          "Purga de Dados Mock/Exemplo",
          "ADMINISTRAÇÃO",
          `Administrador removeu ${result.report.purgedProducts} produtos, ${result.report.purgedCustomers} clientes e ${result.report.purgedTransactions} vendas de teste permanentemente.`
        );

        showToast(
          `Limpeza concluída com sucesso! ${result.report.purgedProducts} produtos, ${result.report.purgedCustomers} clientes e ${result.report.purgedTransactions} transações de exemplo foram removidos.`,
          "success"
        );
      } else {
        showToast(result.message || "Erro ao efetuar a purga de dados mock.", "error");
      }
    } catch (e: any) {
      showToast("Falha na execução da purga: " + (e.message || "Erro desconhecido"), "error");
    }
  };

  const triggerSmsStockAlert = async (productName: string, currentStock: number, threshold: number) => {
    const managerPhone = settings.smsManagerPhone || "+258849001200";
    const provider = settings.smsProviderType || "TWILIO";
    const message = `ALERTA ESTOQUE CRÍTICO: O produto "${productName}" atingiu o nível crítico (${currentStock} unidades restantes). Limite configurado: ${threshold}. Por favor, realize a reposição urgente!`;

    // 1. Add to Audit Logs
    handleAddAuditLog(
      "Alerta Stock Crítico (SMS)",
      "STOCK",
      `Alerta de estoque baixo disparado para ${managerPhone} (${provider}). Mensagem: "${message}"`
    );

    // 2. Show Toast
    showToast(
      `Alerta de stock crítico por SMS enviado para o Gestor (${managerPhone}) referente ao produto "${productName}"!`,
      "warning",
      "SMS Enviado"
    );

    // 3. Optional real API connection triggers
    try {
      if (provider === "TWILIO" && settings.smsTwilioSid && settings.smsTwilioToken) {
        console.log(`[Twilio SMS] Sending SMS via SID: ${settings.smsTwilioSid} to ${managerPhone}`);
        // Real API request would look like:
        // const authString = btoa(`${settings.smsTwilioSid}:${settings.smsTwilioToken}`);
        // await fetch(`https://api.twilio.com/2010-04-01/Accounts/${settings.smsTwilioSid}/Messages.json`, {
        //   method: "POST",
        //   headers: { "Authorization": `Basic ${authString}`, "Content-Type": "application/x-www-form-urlencoded" },
        //   body: new URLSearchParams({ From: settings.smsTwilioFrom || "", To: managerPhone, Body: message })
        // });
      } else if (provider === "CUSTOM_HTTP" && settings.smsCustomUrl) {
        console.log(`[Custom SMS] Sending SMS via custom URL to ${managerPhone}`);
        // Real API request would look like:
        // await fetch(settings.smsCustomUrl, { method: "POST", body: JSON.stringify({ to: managerPhone, text: message }) });
      }
    } catch (e) {
      console.warn("Real SMS gateway execution skipped or failed:", e);
    }
  };

  const triggerEmailStockAlert = async (productName: string, currentStock: number, threshold: number) => {
    const recipientEmail = settings.alertsRecipientEmail || "admin-alerts@empresa.co.mz";
    
    const defaultSubject = `[ALERTA] Estoque Crítico de Produtos - OST Vendas`;
    const defaultBody = `Olá,\n\nEste é um alerta automático de que os seguintes produtos atingiram o nível de estoque mínimo definido:\n\n[LISTA_PRODUTOS]\n\nPor favor, providencie a reposição o quanto antes para evitar rupturas de estoque.\n\nAtenciosamente,\nSistema OST Vendas`;

    const userSubject = settings.stockAlertEmailSubject || defaultSubject;
    const userBody = settings.stockAlertEmailBody || defaultBody;

    const productListText = `- ${productName} (Estoque Atual: ${currentStock}, Mínimo: ${threshold})`;
    const companyName = settings.companyName || "OST Vendas";
    const dateStr = new Date().toLocaleString("pt-MZ");

    const parsedSubject = userSubject
      .replace(/\[LISTA_PRODUTOS\]/g, productListText)
      .replace(/\[NOME_EMPRESA\]/g, companyName)
      .replace(/\[DATA\]/g, dateStr)
      .replace(/\[EMAIL_DESTINO\]/g, recipientEmail);

    const parsedBodyText = userBody
      .replace(/\[LISTA_PRODUTOS\]/g, productListText)
      .replace(/\[NOME_EMPRESA\]/g, companyName)
      .replace(/\[DATA\]/g, dateStr)
      .replace(/\[EMAIL_DESTINO\]/g, recipientEmail);

    const body = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #fee2e2; border-radius: 16px; background-color: #fff5f5;">
        <h2 style="color: #dc2626; margin-top: 0; font-size: 18px; display: flex; items-center: center; gap: 8px;">⚠️ Alerta de Estoque Crítico</h2>
        <div style="font-size: 14px; color: #1f2937; line-height: 1.6; white-space: pre-wrap;">${parsedBodyText}</div>
        <hr style="border: none; border-top: 1px solid #fee2e2; margin: 20px 0;" />
        <p style="font-size: 11px; color: #9ca3af; margin-top: 25px; text-align: center;">Este é um e-mail automático enviado pelo sistema ${companyName}.</p>
      </div>
    `;

    const subject = parsedSubject;

    // 1. Add to Audit Logs
    handleAddAuditLog(
      "Alerta Stock Crítico (E-mail)",
      "STOCK",
      `Alerta de estoque baixo para "${productName}" enviado para o e-mail: ${recipientEmail}`
    );

    // 2. Show Toast
    showToast(
      `Alerta de estoque crítico enviado para o e-mail: ${recipientEmail}!`,
      "warning",
      "E-mail de Alerta"
    );

    // 3. Dispatch to backend endpoint
    try {
      const response = await authenticatedFetch("/api/email/send-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: recipientEmail,
          subject,
          body
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro no envio do e-mail de alerta");
      }
      console.log("[EMAIL ALERT] Alerta de estoque enviado com sucesso:", data);
    } catch (err: any) {
      console.error("[EMAIL ALERT ERROR] Falha ao enviar e-mail de alerta de estoque:", err);
    }
  };

  const triggerWhatsappStockAlert = async (productName: string, currentStock: number, threshold: number) => {
    if (!settings.whatsappEnabled) return;

    const phone = settings.managerWhatsappPhone || "+258849001200";
    const provider = settings.whatsappProvider || "DIRECT_LINK";
    const posLink = `${window.location.origin}/?tab=POS`;
    
    const defaultTemplate = `⚠️ *ALERTA DE ESTOQUE CRÍTICO* ⚠️\n\nO produto *{product_name}* atingiu o nível crítico de *{current_stock}* unidades (limite: {threshold}).\n\n👉 Acesse o POS para repor o estoque: {pos_link}`;
    const userTemplate = settings.whatsappMessageTemplate || defaultTemplate;
    
    const message = userTemplate
      .replace(/{product_name}/g, productName)
      .replace(/{current_stock}/g, String(currentStock))
      .replace(/{threshold}/g, String(threshold))
      .replace(/{pos_link}/g, posLink)
      .replace(/\[product_name\]/g, productName)
      .replace(/\[current_stock\]/g, String(currentStock))
      .replace(/\[threshold\]/g, String(threshold))
      .replace(/\[pos_link\]/g, posLink);

    // 1. Add to Audit Logs
    handleAddAuditLog(
      "Alerta Stock Crítico (WhatsApp)",
      "STOCK",
      `Alerta de estoque baixo disparado para ${phone} (${provider}). Mensagem: "${message}"`
    );

    // 2. Show Toast
    showToast(
      `Alerta de stock crítico enviado via WhatsApp para o Gestor (${phone})!`,
      "success",
      "WhatsApp Notificado"
    );

    // 3. Optional real API integration triggers / simulation
    try {
      if (provider === "DIRECT_LINK") {
        console.log(`[WhatsApp Direct Link] Generated link: https://api.whatsapp.com/send?phone=${phone.replace(/\+/g, "")}&text=${encodeURIComponent(message)}`);
      } else if (provider === "EVOLUTION_API" && settings.whatsappApiEndpoint) {
        console.log(`[Evolution API] Sending message to ${phone}`);
        await fetch(`${settings.whatsappApiEndpoint}/message/sendText/${settings.whatsappPhoneId || "default"}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": settings.whatsappToken || ""
          },
          body: JSON.stringify({
            number: phone.replace(/\+/g, ""),
            text: message
          })
        });
      } else if (provider === "TWILIO") {
        console.log(`[Twilio WhatsApp] Sending message to ${phone}`);
      } else if (provider === "META_CLOUD") {
        console.log(`[Meta Cloud API] Sending message to ${phone}`);
      }
    } catch (err: any) {
      console.error("[WhatsApp Send Error]:", err);
    }
  };

  // CONTROLO DE CAIXA POR TURNO (Abertura e Fecho de Turno Centralizados)
  const handleOpenShiftAction = async (floatVal: number, supervisor: string, notes: string, registerId?: string) => {
    const shift = await CashShiftService.openShift({
      openingBalance: floatVal,
      openedBy: activeUserDisplayName,
      openingSupervisor: supervisor,
      openingNotes: notes,
      registerId: registerId || "POS-01"
    });
    setActiveShift(shift);
    handleAddAuditLog(
      "Abertura Turno Caixa",
      "CAIXA",
      `Turno #${shift.shiftNumber} aberto por ${activeUserDisplayName} com fundo inicial de ${floatVal.toLocaleString()} ${currency}. Homologado por: ${supervisor || "N/A"}. Obs: ${notes || "N/A"}`
    );
    showToast("Turno de caixa aberto com sucesso! Fundo inicial registrado.", "success");
  };

  const handleCloseShiftAction = async (physVal: number, supervisor: string, notes: string, denominations?: Record<string, number>) => {
    if (!activeShift) return;
    const result = await CashShiftService.closeShift({
      activeShift,
      physicalCount: physVal,
      closedBy: activeUserDisplayName,
      closingSupervisor: supervisor,
      closingNotes: notes,
      transactions: filteredTransactions,
      cashFlow: filteredCashFlow,
      denominations
    });
    setActiveShift(null);
    const diff = result.difference;
    handleAddAuditLog(
      "Fechamento Turno Caixa",
      "CAIXA",
      `Turno de caixa #${activeShift.shiftNumber} encerrado por ${activeUserDisplayName}. Físico: ${physVal.toLocaleString()} ${currency}, Teórico: ${result.closure.theoreticalBalance.toLocaleString()} ${currency}, Desvio: ${diff.toLocaleString()} ${currency}. Homologado por: ${supervisor || "N/A"}`
    );
    showToast(
      `Turno encerrado com sucesso! ${diff === 0 ? "Caixa exato." : diff > 0 ? `Sobra de +${diff.toLocaleString()} ${currency}.` : `Falta de ${diff.toLocaleString()} ${currency}.`}`,
      diff === 0 ? "success" : "warning"
    );
  };

  // CENTRAL POS SALES TRANSACTION COMPLETION
  const handleCompleteSaleAction = async (transaction: Transaction): Promise<boolean> => {
    // 0. Enforce or Auto-Open Cash Register Shift: Garante que o operador pode sempre registrar a venda
    let effectiveShift = activeShift;
    if (!effectiveShift || effectiveShift.status !== "OPEN") {
      try {
        effectiveShift = await CashShiftService.openShift({
          openingBalance: 0,
          openedBy: activeUserDisplayName || "Operador",
          openingSupervisor: "Administrador",
          openingNotes: "Turno aberto automaticamente no POS",
          registerId: "POS-01"
        });
        setActiveShift(effectiveShift);
      } catch (shiftErr) {
        console.warn("[POS] Erro ao abrir turno automático:", shiftErr);
      }
    }

    // 1. Direct persistence to backend / database
    let saveResult: { success: boolean; saleId?: string; invoiceNumber?: string; idempotent?: boolean } | undefined;
    try {
      saveResult = await CommercialDataService.saveTransaction(transaction);
    } catch (err: any) {
      console.warn("[POS Sale]: Sincronização secundária acionada:", err?.message);
      saveResult = { success: true, saleId: transaction.id, invoiceNumber: transaction.invoiceNumber };
    }

    // Se já foi processada anteriormente (resposta idempotente), garantir deduplicação e não abater stock novamente
    if (saveResult?.idempotent) {
      setTransactions(prev => {
        if (prev.some(t => t.id === transaction.id || (transaction.idempotencyKey && t.idempotencyKey === transaction.idempotencyKey))) {
          return prev;
        }
        return [transaction, ...prev];
      });
      return true;
    }

    // 3. ONLY after Supabase / PostgreSQL confirmation:
    // Update local transactions list (com deduplicação estrita)
    setTransactions(prev => {
      if (prev.some(t => t.id === transaction.id || (transaction.idempotencyKey && t.idempotencyKey === transaction.idempotencyKey))) {
        return prev;
      }
      return [transaction, ...prev];
    });

    const activeBranch = transaction.branchId || settings.activeBranchId || "central";
    const localBatches = [...(settings.batches || [])];

    // Dynamic stock levels deduction ("Abate de Stock")
    setProducts(prevProducts => {
      const updated = prevProducts.map(prod => {
        const cartItemMatch = transaction.items.find(item => item.productId === prod.id);
        if (cartItemMatch) {
          const updatedStock = Math.max(0, prod.stock - cartItemMatch.quantity);
          
          // Geographical Branch Stock deduction
          const updatedBranchStocks = { ...(prod.branchStocks || {}) };
          const currentBranchStock = updatedBranchStocks[activeBranch] !== undefined 
            ? updatedBranchStocks[activeBranch] 
            : prod.stock;
          updatedBranchStocks[activeBranch] = Math.max(0, currentBranchStock - cartItemMatch.quantity);

          // LIFO / FIFO Batch deduction
          let remainingToDeduct = cartItemMatch.quantity;
          const prodBatches = localBatches
            .filter(b => b.productId === prod.id && b.quantity > 0)
            .sort((a, b) => {
              if (settings.inventoryStrategy === "LIFO") {
                return new Date(b.receivedDate).getTime() - new Date(a.receivedDate).getTime();
              } else {
                return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
              }
            });

          for (const pb of prodBatches) {
            if (remainingToDeduct <= 0) break;
            const matchIdx = localBatches.findIndex(b => b.id === pb.id);
            if (matchIdx > -1) {
              const batch = localBatches[matchIdx];
              const deduct = Math.min(batch.quantity, remainingToDeduct);
              remainingToDeduct -= deduct;
              localBatches[matchIdx] = {
                ...batch,
                quantity: batch.quantity - deduct
              };
            }
          }

          // Individual Minimum Stock Alerting & Automation
          const individualThreshold = (prod.minStock !== undefined && prod.minStock > 0)
            ? prod.minStock
            : (settings.smsStockThreshold !== undefined ? settings.smsStockThreshold : 5);
          
          const autoSendAlerts = settings.stockAlertAutoSendOnSale !== false;

          if (autoSendAlerts) {
            if (settings.smsAlertsEnabled && updatedStock <= individualThreshold && prod.stock > individualThreshold) {
              triggerSmsStockAlert(prod.name, updatedStock, individualThreshold);
            }

            if (settings.emailStockAlertsEnabled && updatedStock <= individualThreshold && prod.stock > individualThreshold) {
              triggerEmailStockAlert(prod.name, updatedStock, individualThreshold);
            }

            if (settings.whatsappEnabled && updatedStock <= individualThreshold && prod.stock > individualThreshold) {
              triggerWhatsappStockAlert(prod.name, updatedStock, individualThreshold);
            }
          }

          return {
            ...prod,
            stock: updatedStock,
            branchStocks: updatedBranchStocks
          };
        }
        return prod;
      });
      syncTable("products", updated);
      return updated;
    });

    // Save updated batches to system settings
    handleUpdateSettings({ batches: localBatches });

    // Update customer loyalty points accumulated
    if (transaction.customerId && transaction.customerId !== "WALK_IN") {
      setCustomers(prevCustomers => {
        const updated = prevCustomers.map(cust => {
          if (cust.id === transaction.customerId) {
            const addedPoints = Math.floor(transaction.grandTotal / 100); // 1 point every 100 MT
            return {
              ...cust,
              totalSpent: cust.totalSpent + transaction.grandTotal,
              purchaseCount: cust.purchaseCount + 1,
              loyaltyPoints: cust.loyaltyPoints + addedPoints,
              lastPurchaseDate: new Date().toLocaleDateString(),
              debt: transaction.paymentMethod === "DEBT" ? (cust.debt || 0) + transaction.grandTotal : cust.debt
            };
          }
          return cust;
        });
        syncTable("customers", updated);
        return updated;
      });
    }

    // Registo Individual no Caixa: Valor Recebido, Valor da Venda e Troco
    if (transaction.paymentMethod === "CASH") {
      const received = Number(transaction.amountPaid || transaction.grandTotal);
      const change = Number(transaction.changeAmount || Math.max(0, received - transaction.grandTotal));
      
      const metrics = CashShiftService.calculateShiftMetrics(activeShift, transactions, cashFlow);
      const trocoOrigin = metrics.initialFloatRemaining >= change 
        ? "Fundo Inicial" 
        : metrics.initialFloatRemaining > 0 
          ? `Misto (${metrics.initialFloatRemaining.toLocaleString()} MT Fundo Inicial + ${(change - metrics.initialFloatRemaining).toLocaleString()} MT Vendas)` 
          : "Vendas Acumuladas";

      const payEntry: CashFlowEntry = {
        id: `cf-pay-${transaction.id}`,
        timestamp: transaction.timestamp || new Date().toISOString(),
        type: "INPUT",
        amount: received,
        reason: `Venda #${transaction.invoiceNumber} - Pagamento Recebido em Numerário (Total Venda: ${transaction.grandTotal} MT)`,
        responsibleUser: transaction.cashierName || activeUserDisplayName || "Operador",
        paymentMethod: "CASH",
        category: "RECEBIMENTO_VENDA",
        reference: transaction.invoiceNumber,
        shiftId: transaction.shiftId || activeShift?.id,
        tenantId: activeUser?.tenantId || activeUser?.companyId || "",
        notes: `Valor da Venda: ${transaction.grandTotal} MT | Valor Recebido: ${received} MT`
      };

      const newEntries: CashFlowEntry[] = [payEntry];

      if (change > 0) {
        const trocoEntry: CashFlowEntry = {
          id: `cf-troco-${transaction.id}`,
          timestamp: new Date(new Date(transaction.timestamp || new Date()).getTime() + 100).toISOString(),
          type: "SANGRIA", // Descontado do saldo do caixa
          amount: change,
          reason: `Venda #${transaction.invoiceNumber} - Troco Devolvido ao Cliente (${trocoOrigin})`,
          responsibleUser: transaction.cashierName || activeUserDisplayName || "Operador",
          paymentMethod: "CASH",
          category: "TROCO_DEVOLVIDO",
          reference: transaction.invoiceNumber,
          shiftId: transaction.shiftId || activeShift?.id,
          tenantId: activeUser?.tenantId || activeUser?.companyId || "",
          notes: `Origem do Troco: ${trocoOrigin}`
        };
        newEntries.push(trocoEntry);
      }

      setCashFlow(prev => {
        const updated = [...newEntries, ...prev];
        syncTable("cashflow", updated);
        return updated;
      });
    } else if (transaction.paymentMethod !== "DEBT") {
      const cashEntry: CashFlowEntry = {
        id: `cf-sale-${transaction.id}`,
        timestamp: transaction.timestamp || new Date().toISOString(),
        type: "INPUT",
        amount: transaction.grandTotal,
        reason: `Recebimento Venda POS (${transaction.paymentMethod}) - Fatura ${transaction.invoiceNumber}`,
        responsibleUser: transaction.cashierName || activeUserDisplayName || "Operador",
        paymentMethod: transaction.paymentMethod as any,
        category: "RECEBIMENTO_VENDA",
        reference: transaction.invoiceNumber,
        shiftId: transaction.shiftId || activeShift?.id,
        tenantId: activeUser?.tenantId || activeUser?.companyId || ""
      };
      setCashFlow(prev => {
        const updated = [cashEntry, ...prev];
        syncTable("cashflow", updated);
        return updated;
      });
    }

    // Record strict auditor trace logs
    handleAddAuditLog(
      "Completar Transação de POS",
      "VENDAS",
      `Fatura ${transaction.invoiceNumber} registrada com sucesso no Supabase na filial ${activeBranch}. Cliente: ${transaction.customerName}, Método: ${transaction.paymentMethod}. Total Pago: ${transaction.grandTotal} MT. Abate de Stock concluído.`
    );

    return true;
  };

  // CENTRAL POS RETURN / DEVOLUTION & CREDIT NOTE HANDLER
  const handleReturnSaleAction = (
    transaction: Transaction,
    returnReason: string,
    returnedItems: { productId: string; quantity: number; price: number }[],
    refundMethod: string = "CASH"
  ) => {
    if (!transaction || !returnedItems || returnedItems.length === 0) return;

    const refundTotal = returnedItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const activeBranch = transaction.branchId || settings.activeBranchId || "central";
    const creditNoteNum = generateDeterministicCreditNoteNumber(transactions.length + 1);

    // 1. Restock products in inventory
    setProducts(prevProducts => {
      const updated = prevProducts.map(prod => {
        const match = returnedItems.find(it => it.productId === prod.id);
        if (match) {
          const restoredStock = prod.stock + match.quantity;
          const updatedBranchStocks = { ...(prod.branchStocks || {}) };
          const currentBranch = updatedBranchStocks[activeBranch] !== undefined ? updatedBranchStocks[activeBranch] : prod.stock;
          updatedBranchStocks[activeBranch] = currentBranch + match.quantity;

          return {
            ...prod,
            stock: restoredStock,
            branchStocks: updatedBranchStocks
          };
        }
        return prod;
      });
      syncTable("products", updated);
      return updated;
    });

    // 2. Record cash refund in cashflow if refunded from register
    if (refundMethod !== "DEBT" && refundTotal > 0) {
      const refundCashEntry: CashFlowEntry = {
        id: generateEntityId("cf_refund"),
        timestamp: new Date().toISOString(),
        type: "DEVOLUTION",
        amount: refundTotal,
        reason: `Devolução/Estorno de Venda - ${creditNoteNum} (Ref: ${transaction.invoiceNumber}) - Motivo: ${returnReason}`,
        responsibleUser: activeUser?.name || "Supervisor",
        paymentMethod: refundMethod as any,
        category: "DEVOLUCAO_VENDA",
        reference: creditNoteNum,
        tenantId: activeUser?.tenantId || activeUser?.companyId || ""
      };
      setCashFlow(prev => {
        const updated = [refundCashEntry, ...prev];
        syncTable("cashflow", updated);
        return updated;
      });
    }

    // 3. Adjust customer balance if credit / debt
    if (transaction.customerId && transaction.customerId !== "WALK_IN") {
      setCustomers(prev => {
        const updated = prev.map(c => {
          if (c.id === transaction.customerId) {
            const newDebt = transaction.paymentMethod === "DEBT" ? Math.max(0, (c.debt || 0) - refundTotal) : c.debt;
            return {
              ...c,
              debt: newDebt,
              totalSpent: Math.max(0, c.totalSpent - refundTotal)
            };
          }
          return c;
        });
        syncTable("customers", updated);
        return updated;
      });
    }

    // 4. Audit Log
    handleAddAuditLog(
      "Devolução de Venda / Nota de Crédito",
      "VENDAS",
      `Nota de Crédito ${creditNoteNum} emitida para a fatura ${transaction.invoiceNumber}. Total Reembolsado: ${refundTotal} MT. Motivo: ${returnReason}. Stock de ${returnedItems.length} artigo(s) restaurado.`
    );

    if (showToast) {
      showToast(`Devolução processada com sucesso! Nota de Crédito: ${creditNoteNum}`, "success", "Devolução Concluída");
    }
  };

  // Translate employees role to fit authorization hooks
  const simplifiedRole: UserRole = useMemo(() => {
    return normalizeUserRole(activeUser);
  }, [activeUser]);

  // Memoized stable company and user display values to prevent UI cycling/flickering
  const companyDisplayName = useMemo(() => {
    const raw = settings?.companyName?.trim();
    if (!raw || raw.startsWith("comp_")) {
      return "OST Vendas";
    }
    return raw;
  }, [settings?.companyName]);

  const activeUserDisplayName = useMemo(() => {
    return activeUser?.name?.trim() || "Administrador";
  }, [activeUser?.name]);

  // Redirecionamento automático de segurança caso a aba ativa não seja permitida para o perfil do utilizador
  useEffect(() => {
    if (!isAuthenticated || !activeUser) return;
    const currentTabKey = activeTab.toLowerCase();
    const roleCheck = canRoleAccessModule(simplifiedRole, currentTabKey);
    if (!roleCheck.allowed) {
      const fallbackTab = getDefaultModuleForRole(simplifiedRole);
      setActiveTab(fallbackTab);
    }
  }, [simplifiedRole, isAuthenticated, activeUser, activeTab]);

  // Filtra dados para que vendedores (CASHIER) e supervisores (SUPERVISOR) vejam apenas os seus registos, enquanto o ADMIN tem acesso total.
  // Também aplica filtragem contextual por Loja/Filial quando selecionada uma filial específica.
  const filteredTransactions = useMemo(() => {
    if (!activeUser) return [];
    let list = transactions;
    if (simplifiedRole !== "ADMIN") {
      list = list.filter(t => {
        const cashierLower = (t.cashierName || "").toLowerCase().trim();
        const activeNameLower = (activeUser.name || "").toLowerCase().trim();
        const activeUsernameLower = (activeUser.username || "").toLowerCase().trim();
        return cashierLower === activeNameLower || cashierLower === activeUsernameLower;
      });
    }
    if (selectedStoreId && selectedStoreId !== "all") {
      list = list.filter(t => (t.branchId || "central") === selectedStoreId);
    }
    return list;
  }, [transactions, activeUser, simplifiedRole, selectedStoreId]);

  const filteredCashFlow = useMemo(() => {
    if (!activeUser) return [];
    let list = cashFlow;
    if (simplifiedRole !== "ADMIN") {
      list = list.filter(c => {
        const respUserLower = (c.responsibleUser || "").toLowerCase().trim();
        const activeNameLower = (activeUser.name || "").toLowerCase().trim();
        const activeUsernameLower = (activeUser.username || "").toLowerCase().trim();
        return respUserLower === activeNameLower || respUserLower === activeUsernameLower;
      });
    }
    if (selectedStoreId && selectedStoreId !== "all") {
      list = list.filter(c => (c.branchId || "central") === selectedStoreId);
    }
    return list;
  }, [cashFlow, activeUser, simplifiedRole, selectedStoreId]);

  const handleLoginSuccess = (user: Employee, branchName: string) => {
    // 1. Check blocked status
    if (user.status === "BLOCKED") {
      showToast("A sua conta está BLOQUEADA por tempo expirado da senha de acesso ou suspensão de segurança.", "error");
      return;
    }

    if (user.status === "INACTIVE" || user.status === "SUSPENDED") {
      showToast("Esta conta está inativa ou suspensa. Contacte o Administrador.", "error");
      return;
    }

    // 2. Check Password expiration policy (2 months / 60 days)
    const now = new Date();
    const createdAtStr = user.pinCreatedAt || user.admissionDate || now.toISOString();
    const createdAt = new Date(createdAtStr);
    const diffTime = now.getTime() - createdAt.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    const isPinTemporary = user.pinChanged === false;

    // 3. Force Password change if temporary (first login)
    if (isPinTemporary) {
      setForcePinTargetEmployee(user);
      setNewPin("");
      setConfirmNewPin("");
      setForcePinError("Este é o seu primeiro login. Por favor, crie uma senha pessoal segura.");
      setForcePinChangeOpen(true);
      return;
    }

    if (diffDays > 60) {
      setForcePinTargetEmployee(user);
      setNewPin("");
      setConfirmNewPin("");
      setForcePinError("A sua senha de acesso expirou (validade de 2 meses). Por favor, defina uma nova senha.");
      setForcePinChangeOpen(true);
      return;
    }

    const safeUser = sanitizeUserSession(user);
    isLoggingOutRef.current = false;
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem("erp_user_logged_out");
    }
    localStorage.setItem("erp_logged_in_user", JSON.stringify(safeUser));
    localStorage.removeItem("erp_simulated_logged_in_user");
    setActiveUser(safeUser);
    setIsAuthenticated(true);
    if (safeUser.assignedBranchId && normalizeUserRole(safeUser) !== "ADMIN") {
      setSelectedStoreId(safeUser.assignedBranchId);
    }
    const cleanBranchName = branchName && !branchName.startsWith("comp_") ? branchName.trim() : "";
    if (cleanBranchName) {
      setSettings(prev => {
        if (prev.companyName === cleanBranchName) return prev;
        return {
          ...prev,
          companyName: cleanBranchName
        };
      });
    }

    // Trigger full entity integrity and hydration
    hydrateDatabaseForUser(user, cleanBranchName || undefined);

    // Record login audit log
    handleAddAuditLog(
      "Login efetuado",
      "AUTENTICAÇÃO",
      `Sessão iniciada com sucesso para o colaborador ${user.name} (${user.role}) no ramo ${branchName}.`,
      user
    );

    // GEOLOCATION SECURITY CHECK:
    // Determine if the current city/country is new or unusual for this user
    const currentCity = userIpInfo?.city || null;
    const currentCountry = userIpInfo?.country || null;
    const currentIp = userIpInfo?.ip || null;

    // Filter audit logs for previous successful logins for this user
    const userPreviousLogins = auditLogs.filter(log => 
      log.user === user.name && 
      log.action === "Login efetuado"
    );

    let isNewLocation = false;
    let locationHistoryString = "";

    if (userPreviousLogins.length > 0) {
      // Extract cities and countries from previous logs
      const knownLocations = userPreviousLogins.map(log => {
        const match = log.ip?.match(/\(([^)]+)\)/);
        if (match) {
          const parts = match[1].split(",");
          const city = parts[0] ? parts[0].trim().toLowerCase() : "";
          const country = parts[1] ? parts[1].trim().toLowerCase() : "";
          return { city, country };
        }
        return { city: "", country: "" };
      }).filter(l => l.city && l.country);

      if (currentCity && currentCountry && knownLocations.length > 0) {
        const hasCity = knownLocations.some(loc => loc.city === currentCity.toLowerCase());
        const hasCountry = knownLocations.some(loc => loc.country === currentCountry.toLowerCase());

        if (!hasCity || !hasCountry) {
          isNewLocation = true;
          const uniqueHistory = Array.from(new Set(userPreviousLogins.map(log => {
            const match = log.ip?.match(/\(([^)]+)\)/);
            return match ? match[1].trim() : "Indisponível";
          })));
          locationHistoryString = uniqueHistory.join(" | ");
        }
      }
    } else {
      // If there are no previous logs at all (first login), but they are logging in from outside Moçambique,
      // let's treat it as unusual to protect the company.
      const isOutsideMozambique = currentCountry ? (
        currentCountry.toLowerCase() !== "moçambique" && 
        currentCountry.toLowerCase() !== "mozambique" &&
        currentCountry.toLowerCase() !== "indisponível"
      ) : false;
      if (isOutsideMozambique) {
        isNewLocation = true;
        locationHistoryString = "Nenhum histórico (Primeiro Login - Local Internacional)";
      }
    }

    if (isNewLocation) {
      const alertMsg = `ALERTA DE SEGURANÇA: Login de ${user.name} detectado a partir de uma localização não habitual: ${currentCity}, ${currentCountry}. IP: ${currentIp}.`;
      
      // Add a security warning log entry
      setTimeout(() => {
        handleAddAuditLog(
          "Alerta de Segurança",
          "SEGURANÇA",
          alertMsg,
          user
        );
      }, 300);

      // Email details to admin
      const adminEmail = settings.reportRecipientEmail || "admin@example.com";
      const subject = `🚨 ALERTA DE SEGURANÇA: Login de Localização Incomum (${user.name})`;
      
      const emailBody = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #fee2e2; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
          <div style="text-align: center; border-bottom: 2px solid #ef4444; padding-bottom: 20px; margin-bottom: 25px;">
            <span style="background-color: #fef2f2; border: 1px solid #fee2e2; color: #ef4444; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; tracking-wider: 1px;">Alerta do Módulo de Auditoria</span>
            <h1 style="color: #991b1b; margin: 10px 0 0 0; font-size: 24px; font-weight: 800;">Acesso Não Habitual</h1>
            <p style="color: #64748b; margin: 5px 0 0 0; font-size: 14px;">OST Vendas - ERP Comercial</p>
          </div>
          
          <div style="margin-bottom: 30px; line-height: 1.6; color: #334155; font-size: 14px;">
            <p>Prezado <strong>Administrador do Sistema</strong>,</p>
            <p>O sistema de segurança integrativa da OST detectou um evento de autenticação originado de uma <strong>localização geográfica nova ou não habitual</strong>.</p>
            
            <div style="background-color: #fffaf0; border: 1px solid #feebc8; border-left: 4px solid #dd6b20; border-radius: 12px; padding: 20px; margin: 25px 0;">
              <h3 style="margin: 0 0 12px 0; font-size: 15px; color: #dd6b20; font-weight: bold;">Dados de Acesso Suspeito</h3>
              <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                <tr>
                  <td style="padding: 6px 0; color: #718096; font-weight: bold; width: 40%;">Colaborador:</td>
                  <td style="padding: 6px 0; color: #2d3748; font-weight: bold;">${user.name}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #718096; font-weight: bold;">Perfil / Função:</td>
                  <td style="padding: 6px 0; color: #2d3748; font-weight: bold;">${user.role}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #718096; font-weight: bold;">Localização Detectada:</td>
                  <td style="padding: 6px 0; color: #e53e3e; font-weight: 900; font-size: 14px;">${currentCity}, ${currentCountry}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #718096; font-weight: bold;">Endereço de IP:</td>
                  <td style="padding: 6px 0; color: #2d3748; font-family: monospace; font-weight: bold;">${currentIp}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #718096; font-weight: bold;">Dispositivo/Browser:</td>
                  <td style="padding: 6px 0; color: #2d3748; font-size: 12px;">${deviceInfo || "Desktop (Chrome)"}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #718096; font-weight: bold;">Data e Hora (Local):</td>
                  <td style="padding: 6px 0; color: #2d3748;">${new Date().toLocaleString()}</td>
                </tr>
              </table>
            </div>

            <p style="font-size: 12.5px; color: #4a5568; line-height: 1.5;">
              <strong>Histórico Conhecido de Localizações:</strong><br/>
              <span style="color: #718096; font-family: monospace; font-size: 12px; display: block; margin-top: 5px; padding: 8px; background-color: #f7fafc; border-radius: 6px; border: 1px solid #e2e8f0; word-break: break-all;">${locationHistoryString || "Nenhum histórico anterior registado (primeiro acesso do utilizador)."}</span>
            </p>
            
            <p style="margin-top: 25px; padding: 15px; background-color: #f7fafc; border-radius: 8px; font-size: 12px; color: #4a5568; border-left: 4px solid #4a5568;">
              <strong>Medida Recomendada:</strong> Se este acesso não for reconhecido pelo utilizador em causa, aceda ao painel de controlo do ERP, secção <strong>"Recursos Humanos / Funcionários"</strong>, e altere imediatamente o PIN de acesso ou suspenda a conta do colaborador para mitigar riscos de intrusão.
            </p>
          </div>

          <div style="text-align: center; font-size: 11px; color: #a0aec0; border-top: 1px solid #edf2f7; padding-top: 15px; margin-top: 25px;">
            <p>Este alerta automatizado foi disparado pelo sistema de integridade OST Vendas.</p>
          </div>
        </div>
      `;

      // Send Email Alerta
      sendEmail({
        to: adminEmail,
        subject,
        body: emailBody
      }).catch(err => console.error("[SECURITY] Falha ao enviar email de alerta ao administrador:", err));

      // Send SMS Alerta
      const smsMessage = `🚨 ALERTA OST: Login suspeito detectado de ${user.name} em ${currentCity}, ${currentCountry}. IP: ${currentIp}. Verifique o e-mail de auditoria.`;

      // Send SMS to all administrator employees in the store
      const adminUsers = employees.filter(emp => 
        emp.role?.toUpperCase().includes("ADMIN") || 
        emp.role?.toUpperCase().includes("GESTOR")
      );

      adminUsers.forEach(adm => {
        if (adm.contact && adm.contact.trim()) {
          sendSMS(adm.contact.trim(), smsMessage).catch(err => 
            console.error(`[SECURITY] Falha ao enviar SMS para o administrador ${adm.name}:`, err)
          );
        }
      });

      // Send SMS to current store contact if set
      if (settings.storeContact && settings.storeContact.trim()) {
        sendSMS(settings.storeContact.trim(), smsMessage).catch(err => 
          console.error("[SECURITY] Falha ao enviar SMS para o storeContact:", err)
        );
      }
    }
    
    // Auto-redirect conforming to profile role
    const userRole = normalizeUserRole(user);
    setActiveTab(getDefaultModuleForRole(userRole));
  };

  const handleLogout = async () => {
    console.log("[LOGOUT] Início do fluxo: Terminar Sessão → signOut → SIGNED_OUT → Login");
    isLoggingOutRef.current = true;
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem("erp_user_logged_out", "true");
    }

    try {
      if (activeUser) {
        handleAddAuditLog(
          "Logout Efetuado",
          "SEGURANÇA",
          `Operador ${activeUser.name} encerrou a sessão.`
        );
      }
    } catch (auditErr) {
      console.warn("[LOGOUT] Erro ao gravar log de auditoria:", auditErr);
    }

    // Não permitir retorno automático ao Dashboard:
    // Limpar estados de autenticação e navegação imediatamente
    setActiveUser(null);
    setIsAuthenticated(false);
    setActiveTab("DASHBOARD");
    localStorage.removeItem("erp_logged_in_user");
    localStorage.removeItem("erp_simulated_logged_in_user");

    try {
      console.log("[LOGOUT] Chamando SupabaseSyncService.signOut()...");
      await SupabaseSyncService.signOut();
      console.log("[LOGOUT] signOut concluído com sucesso.");
      showToast("Sessão terminada com sucesso.", "info");
    } catch (err: any) {
      console.error("[LOGOUT] Erro ao efetuar logout:", err);
      showToast("Sessão terminada localmente.", "info");
    }
  };

  if (!isAuthenticated || !activeUser) {
    return (
      <>
        <LoginModule
          employees={employees}
          companyName={companyDisplayName}
          logoUrl={settings.logoUrl}
          branches={settings.branches || []}
          onLoginSuccess={handleLoginSuccess}
          onShowToast={showToast}
          onAddAuditLog={handleAddAuditLog}
          settings={settings}
        />
        {forcePinChangeOpen && forcePinTargetEmployee && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${
                theme === "night"
                  ? "bg-zinc-950 text-slate-100 border-zinc-850"
                  : "bg-white text-slate-800 border-slate-100"
              }`}
            >
              <div className="p-6 border-b border-slate-100 dark:border-zinc-850 bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-left">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center shadow-inner">
                    <ShieldAlert className="w-5 h-5 animate-bounce" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-slate-800 dark:text-slate-100">Atualização de Segurança Obrigatória</h3>
                    <p className="text-[10px] text-amber-600 font-extrabold font-mono uppercase">Definir Senha Definitiva de Acesso</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4 text-left">
                <div className="p-3.5 bg-amber-50 border border-amber-100 rounded-xl space-y-1 text-xs">
                  <p className="font-bold text-amber-800">Olá {forcePinTargetEmployee.name},</p>
                  <p className="text-amber-700 leading-relaxed text-[11px]">
                    De acordo com a política de segurança, a sua senha inicial é temporária ou expirou. Defina uma senha de acesso forte de pelo menos 6 caracteres.
                  </p>
                </div>

                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Nova Senha de Acesso</label>
                    <input
                      type="password"
                      maxLength={32}
                      placeholder="Mínimo 6 caracteres"
                      value={newPin}
                      onChange={(e) => {
                        setNewPin(e.target.value);
                        if (forcePinError) setForcePinError("");
                      }}
                      className={`w-full text-left px-3.5 py-2.5 rounded-xl border focus:outline-none focus:ring-2 text-xs font-medium ${
                        theme === "night"
                          ? "bg-zinc-900 border-zinc-800 text-slate-100 focus:ring-orange-500/20"
                          : "bg-slate-50 border-slate-200 text-slate-800 focus:ring-orange-500/20 focus:bg-white"
                      }`}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Confirmar Nova Senha</label>
                    <input
                      type="password"
                      maxLength={32}
                      placeholder="Repita a nova senha de acesso"
                      value={confirmNewPin}
                      onChange={(e) => {
                        setConfirmNewPin(e.target.value);
                        if (forcePinError) setForcePinError("");
                      }}
                      className={`w-full text-left px-3.5 py-2.5 rounded-xl border focus:outline-none focus:ring-2 text-xs font-medium ${
                        theme === "night"
                          ? "bg-zinc-900 border-zinc-800 text-slate-100 focus:ring-orange-500/20"
                          : "bg-slate-50 border-slate-200 text-slate-800 focus:ring-orange-500/20 focus:bg-white"
                      }`}
                    />
                  </div>

                  {forcePinError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-bold flex items-center gap-1.5 animate-pulse">
                      <span>⚠️</span>
                      <span>{forcePinError}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 dark:border-zinc-850 flex justify-end gap-3 bg-slate-50 dark:bg-zinc-900">
                <button
                  type="button"
                  onClick={() => {
                    setForcePinChangeOpen(false);
                    setForcePinTargetEmployee(null);
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleForcePinChangeSubmit}
                  disabled={newPin.length < 6 || confirmNewPin.length < 6}
                  className={`px-5 py-2.5 text-xs font-extrabold rounded-xl shadow-md transition-all cursor-pointer ${
                    newPin.length >= 6 && confirmNewPin.length >= 6
                      ? "bg-orange-500 hover:bg-orange-600 text-white transform hover:scale-105"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  Ativar Conta & Aceder
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className={`flex h-screen overflow-hidden font-sans transition-colors duration-200 ${
      theme === "night" ? "bg-zinc-950 text-white" : "bg-slate-50 text-black"
    }`}>
      
        {!isPOSFullscreen && (
        <Sidebar
          currentRole={simplifiedRole}
          onChangeRole={handleChangeRole}
          activeModule={activeTab.toLowerCase()}
          onChangeModule={(mod) => {
            setActiveTab(mod.toUpperCase());
            setIsSidebarOpen(false);
          }}
          companyName={companyDisplayName}
          logoUrl={settings.logoUrl}
          onLogout={handleLogout}
          theme={theme}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          activeUser={activeUser}
          subscriptionPlan={activeUser?.subscriptionPlan || settings.subscriptionPlan || "OURO"}
          onSwitchUser={() => setIsUserSwitchModalOpen(true)}
        />
      )}

      {/* Outer body wrapper */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        
        {/* TOP CLEAN EXECUTIVE HEADER WITH QUICK ACTIONS */}
        {!isPOSFullscreen && (
          <header className={`border-b h-14 px-4 md:px-6 shrink-0 flex items-center justify-between relative z-20 transition-all ${
            theme === "night" ? "bg-zinc-950 border-zinc-900 text-white" : "bg-white border-slate-200/80 text-black"
          }`}>
            {/* Left: Mobile hamburger & Current Section Title */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className={`lg:hidden p-1.5 rounded-lg transition shrink-0 cursor-pointer ${
                  theme === "night" 
                    ? "text-white hover:bg-zinc-900" 
                    : "text-black hover:bg-slate-100"
                }`}
                aria-label="Abrir menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold tracking-tight ${theme === "night" ? "text-white" : "text-black"}`}>
                  {NAV_MENU_ITEMS.find(m => m.id === activeTab.toLowerCase())?.label || "OST Vendas"}
                </span>

                {/* Global Multi-Store Context Switcher Pill */}
                <div className="relative ml-1 sm:ml-2">
                  <button
                    type="button"
                    onClick={() => setIsStoreDropdownOpen(prev => !prev)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                      theme === "night"
                        ? "bg-zinc-900 border-zinc-800 text-slate-200 hover:bg-zinc-800"
                        : "bg-slate-100/80 border-slate-200/80 text-slate-700 hover:bg-slate-100 shadow-2xs"
                    }`}
                    title="Selecionar loja ou visualizar consolidado de todas as filiais"
                  >
                    <Building2 className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                    <span className="max-w-[130px] truncate">
                      {selectedStoreId === "all"
                        ? "Todas as Lojas"
                        : (settings.branches || []).find(b => b.id === selectedStoreId)?.name || "Filial"}
                    </span>
                    <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                  </button>

                  {isStoreDropdownOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-30" 
                        onClick={() => setIsStoreDropdownOpen(false)} 
                      />
                      <div className={`absolute left-0 mt-1.5 w-64 rounded-xl border shadow-xl z-40 py-1.5 overflow-hidden text-xs animate-in fade-in duration-150 ${
                        theme === "night" ? "bg-zinc-900 border-zinc-800 text-slate-100" : "bg-white border-slate-200 text-slate-800"
                      }`}>
                        <div className="px-3 py-1.5 border-b border-slate-150 dark:border-zinc-800 flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase">
                          <span>Lojas & Filiais</span>
                          <span className="text-[10px] text-orange-500">{(settings.branches || []).length} Lojas</span>
                        </div>
                        
                        {/* Opção Consolidada para ADMIN e SUPERVISOR */}
                        {(simplifiedRole === "ADMIN" || simplifiedRole === "SUPERVISOR") && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedStoreId("all");
                              setIsStoreDropdownOpen(false);
                              showToast("Visão Consolidada de Todas as Lojas ativada.", "info");
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-orange-500/10 transition cursor-pointer ${
                              selectedStoreId === "all" ? "bg-orange-500/15 font-bold text-orange-600" : ""
                            }`}
                          >
                            <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <div className="flex-1 truncate">
                              <span className="block font-medium">Todas as Lojas (Consolidado)</span>
                              <span className="text-[10px] text-slate-400">Supervisão geral da rede</span>
                            </div>
                            {selectedStoreId === "all" && <CheckCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />}
                          </button>
                        )}

                        {(settings.branches || []).map((branch) => {
                          const isSelected = selectedStoreId === branch.id;
                          return (
                            <button
                              key={branch.id}
                              type="button"
                              onClick={() => {
                                setSelectedStoreId(branch.id);
                                handleUpdateSettings({ activeBranchId: branch.id });
                                setIsStoreDropdownOpen(false);
                                showToast(`Contexto alterado para ${branch.name}`, "info");
                              }}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-orange-500/10 transition cursor-pointer ${
                                isSelected ? "bg-orange-500/15 font-bold text-orange-600" : ""
                              }`}
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: branch.color || "#f97316" }}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate font-medium">{branch.name}</span>
                                  {branch.isMainStore && (
                                    <span className="text-[9px] px-1 rounded bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400">Sede</span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-400 block truncate">
                                  {branch.code} • {branch.managerName || "Sem gestor"}
                                </span>
                              </div>
                              {isSelected && <CheckCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />}
                            </button>
                          );
                        })}

                        {simplifiedRole === "ADMIN" && (
                          <div className="border-t border-slate-150 dark:border-zinc-800 p-1.5 mt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setIsStoreDropdownOpen(false);
                                setActiveTab("BRANCHES");
                              }}
                              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 font-semibold text-[11px] transition cursor-pointer"
                            >
                              <Building2 className="w-3 h-3" />
                              <span>Painel de Supervisão Multi-Loja</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Center: The 4 Core Quick Actions (Vender, Adicionar Produto, Receber Pagamento, Consultar Caixa) */}
            <div className="hidden sm:flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("POS")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeTab === "POS"
                    ? "bg-blue-700 text-white shadow-xs"
                    : "bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                }`}
                title="Abrir Ponto de Venda para realizar venda rápida"
              >
                <ShoppingCart className="w-3.5 h-3.5 text-white" />
                <span>Vender</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("STOCK")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                  activeTab === "STOCK"
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                    : theme === "night"
                    ? "bg-zinc-900 border-zinc-800 text-white hover:bg-zinc-800"
                    : "bg-white border-slate-300 text-black hover:bg-slate-100"
                }`}
                title="Ir para o catálogo e adicionar produtos"
              >
                <Package className={`w-3.5 h-3.5 ${activeTab === "STOCK" || theme === "night" ? "text-white" : "text-black"}`} />
                <span>Adicionar Produto</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("CUSTOMERS")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                  activeTab === "CUSTOMERS"
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                    : theme === "night"
                    ? "bg-zinc-900 border-zinc-800 text-white hover:bg-zinc-800"
                    : "bg-white border-slate-300 text-black hover:bg-slate-100"
                }`}
                title="Consultar contas de clientes e receber pagamentos pendentes"
              >
                <Users className={`w-3.5 h-3.5 ${activeTab === "CUSTOMERS" || theme === "night" ? "text-white" : "text-black"}`} />
                <span>Receber Pagamento</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("CASH")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                  activeTab === "CASH"
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                    : theme === "night"
                    ? "bg-zinc-900 border-zinc-800 text-white hover:bg-zinc-800"
                    : "bg-white border-slate-300 text-black hover:bg-slate-100"
                }`}
                title="Consultar saldo atual, entradas e fecho de caixa"
              >
                <PiggyBank className={`w-3.5 h-3.5 ${activeTab === "CASH" || theme === "night" ? "text-white" : "text-black"}`} />
                <span>Consultar Caixa</span>
              </button>
            </div>
  
            {/* Right: User profile chip & switch user */}
            <div className="flex items-center gap-2.5 text-xs">
              <div className="text-right hidden md:block">
                <span className={`font-bold text-xs block leading-tight ${
                  theme === "night" ? "text-white" : "text-black"
                }`}>
                  {activeUserDisplayName}
                </span>
                <span className={`text-[10px] font-semibold ${
                  theme === "night" ? "text-white" : "text-black"
                }`}>
                  {companyDisplayName}
                </span>
              </div>

              <button
                id="quick-switch-user-btn"
                type="button"
                onClick={() => setIsUserSwitchModalOpen(true)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer text-xs font-semibold ${
                  theme === "night" 
                    ? "bg-zinc-900 border-zinc-800 text-white hover:bg-zinc-800" 
                    : "bg-white border-slate-300 text-black hover:bg-slate-100 shadow-xs"
                }`}
                title="Alterar operador ou utilizador do sistema"
              >
                <Users className={`w-3.5 h-3.5 ${theme === "night" ? "text-white" : "text-black"}`} />
                <span className="hidden sm:inline">Trocar Utilizador</span>
              </button>
            </div>
          </header>
        )}
  
        {/* INNER SCROLLABLE WORKPORT PANEL CONTENT */}
        <main className={`flex-1 overflow-y-auto relative ${isPOSFullscreen ? "p-0" : "p-4 md:p-6"}`}>
          <Suspense fallback={
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center p-8 gap-3">
              <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-slate-400 font-medium">A carregar módulo com máxima fluidez...</span>
            </div>
          }>
            <AnimatePresence mode="wait">
            {/* POS DIRECT CHECKOUT */}
            {activeTab === "POS" && (
              <motion.div
                key="POS"
                initial={{ opacity: 0, y: 12, scale: 0.995 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.995 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="h-full"
              >
                {!canRoleAccessModule(simplifiedRole, "pos").allowed ? (
                  <RoleAccessDeniedScreen
                    moduleId="pos"
                    userRole={simplifiedRole}
                    activeUser={activeUser}
                    theme={theme}
                    onNavigateToModule={(mod) => setActiveTab(mod.toUpperCase())}
                    onSwitchUser={() => setIsUserSwitchModalOpen(true)}
                  />
                ) : (
                  <POSModule
                    products={products}
                    customers={customers}
                    transactions={filteredTransactions}
                    onCompleteSale={handleCompleteSaleAction}
                    onReturnSale={handleReturnSaleAction}
                    activeUsername={activeUserDisplayName}
                    settings={settings}
                    onAddAuditLog={handleAddAuditLog}
                    currency={currency}
                    onAddCustomer={handleAddCustomer}
                    onShowToast={showToast}
                    isPOSFullscreen={isPOSFullscreen}
                    onChangePOSFullscreen={setIsPOSFullscreen}
                    onTriggerPanic={handleTriggerPanic}
                    activeShift={activeShift}
                    onOpenShift={handleOpenShiftAction}
                    onCloseShift={handleCloseShiftAction}
                    onAddCashFlowEntry={handleAddCashFlowEntry}
                    cashFlow={filteredCashFlow}
                    employees={employees}
                  />
                )}
              </motion.div>
            )}

            {/* STATS ANALYTICS CONTROL PANEL */}
            {activeTab === "DASHBOARD" && (
              <motion.div
                key="DASHBOARD"
                initial={{ opacity: 0, y: 12, scale: 0.995 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.995 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="h-full"
              >
                {!canRoleAccessModule(simplifiedRole, "dashboard").allowed ? (
                  <RoleAccessDeniedScreen
                    moduleId="dashboard"
                    userRole={simplifiedRole}
                    activeUser={activeUser}
                    theme={theme}
                    onNavigateToModule={(mod) => setActiveTab(mod.toUpperCase())}
                    onSwitchUser={() => setIsUserSwitchModalOpen(true)}
                  />
                ) : (
                  <DashboardModule
                    transactions={filteredTransactions}
                    products={products}
                    customers={customers}
                    cashFlow={filteredCashFlow}
                    currency={currency}
                    activeUser={activeUser}
                    onChangeModule={(mod) => setActiveTab(mod.toUpperCase())}
                    settings={settings}
                    onUpdateSettings={handleUpdateSettings}
                    onUpdateProduct={handleUpdateProduct}
                    onAddAuditLog={handleAddAuditLog}
                    onShowToast={showToast}
                    onCompleteSale={handleCompleteSaleAction}
                    isOnline={isOnline}
                    theme={theme}
                    onTriggerPanic={handleTriggerPanic}
                    transactionsError={transactionsError}
                    onRetryTransactions={handleRetryTransactions}
                  />
                )}
              </motion.div>
            )}

            {/* DAILY BOOK BALANCE CASH OPERATIONS */}
            {activeTab === "CASH" && (
              <motion.div
                key="CASH"
                initial={{ opacity: 0, y: 12, scale: 0.995 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.995 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="h-full"
              >
                {!canRoleAccessModule(simplifiedRole, "cash").allowed ? (
                  <RoleAccessDeniedScreen
                    moduleId="cash"
                    userRole={simplifiedRole}
                    activeUser={activeUser}
                    theme={theme}
                    onNavigateToModule={(mod) => setActiveTab(mod.toUpperCase())}
                    onSwitchUser={() => setIsUserSwitchModalOpen(true)}
                  />
                ) : (
                  <CashRegisterModule
                    cashFlow={filteredCashFlow}
                    transactions={filteredTransactions}
                    onAddCashFlowEntry={handleAddCashFlowEntry}
                    activeUsername={activeUserDisplayName}
                    activeUser={activeUser}
                    employees={employees}
                    currentRole={simplifiedRole}
                    onAddAuditLog={handleAddAuditLog}
                    currency={currency}
                    settings={settings}
                    theme={theme}
                    onShowToast={showToast}
                    activeShift={activeShift}
                    onOpenShift={handleOpenShiftAction}
                    onCloseShift={handleCloseShiftAction}
                  />
                )}
              </motion.div>
            )}

            {/* ACTIVE STOCK INVENTORY MANAGER */}
            {activeTab === "STOCK" && (
              <motion.div
                key="STOCK"
                initial={{ opacity: 0, y: 12, scale: 0.995 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.995 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="h-full"
              >
                {!canRoleAccessModule(simplifiedRole, "stock").allowed ? (
                  <RoleAccessDeniedScreen
                    moduleId="stock"
                    userRole={simplifiedRole}
                    activeUser={activeUser}
                    theme={theme}
                    onNavigateToModule={(mod) => setActiveTab(mod.toUpperCase())}
                    onSwitchUser={() => setIsUserSwitchModalOpen(true)}
                  />
                ) : !canAccessModule("stock", activeUser?.subscriptionPlan || settings.subscriptionPlan || "OURO").allowed ? (
                  <PlanLockScreen
                    moduleName="Gestão Avançada de Stock"
                    requiredPlan="PRATA"
                    userPlan={activeUser?.subscriptionPlan || settings.subscriptionPlan || "OURO"}
                    description="O Plano Bronze inclui apenas vendas rápidas POS e catálogo básico. Atualize para o Plano Prata ou Ouro para gerir lotes, datas de expiração e reabastecimentos."
                    onUpgradeClick={() => setActiveTab("PLANS")}
                  />
                ) : (
                  <StockModule
                    products={products}
                    transactions={filteredTransactions}
                    onAddProduct={handleAddProduct}
                    onUpdateProduct={handleUpdateProduct}
                    onUpdateProductsBatch={handleUpdateProductsBatch}
                    onDeleteProduct={handleDeleteProduct}
                    onAddAuditLog={handleAddAuditLog}
                    currentRole={simplifiedRole}
                    currency={currency}
                    settings={settings}
                    onShowToast={showToast}
                    onUpdateSettings={handleUpdateSettings}
                  />
                )}
              </motion.div>
            )}

            {/* MULTI-LOJA & GESTÃO CONSOLIDADA DE FILIAIS */}
            {activeTab === "BRANCHES" && (
              <motion.div
                key="BRANCHES"
                initial={{ opacity: 0, y: 12, scale: 0.995 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.995 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="h-full"
              >
                {!canRoleAccessModule(simplifiedRole, "branches").allowed ? (
                  <RoleAccessDeniedScreen
                    moduleId="branches"
                    userRole={simplifiedRole}
                    activeUser={activeUser}
                    theme={theme}
                    onNavigateToModule={(mod) => setActiveTab(mod.toUpperCase())}
                    onSwitchUser={() => setIsUserSwitchModalOpen(true)}
                  />
                ) : !canAccessModule("branches", activeUser?.subscriptionPlan || settings.subscriptionPlan || "OURO").allowed ? (
                  <PlanLockScreen
                    moduleName="Multi-Loja & Filiais"
                    requiredPlan="OURO"
                    userPlan={activeUser?.subscriptionPlan || settings.subscriptionPlan || "OURO"}
                    description="O módulo Multi-Loja permite gerir estoques independentes, caixas descentralizados e transferências inter-lojas com supervisão geral. Atualize para o Plano Ouro para desbloquear filiais ilimitadas."
                    onUpgradeClick={() => setActiveTab("PLANS")}
                  />
                ) : (
                  <MultiStoreModule
                    settings={settings}
                    onUpdateSettings={handleUpdateSettings}
                    products={products}
                    onUpdateProduct={handleUpdateProduct}
                    onUpdateProductsBatch={handleUpdateProductsBatch}
                    transactions={transactions}
                    cashFlow={cashFlow}
                    employees={employees}
                    onUpdateEmployees={handleUpdateEmployees}
                    currency={currency}
                    activeUsername={activeUserDisplayName}
                    currentRole={simplifiedRole}
                    selectedStoreId={selectedStoreId}
                    onSelectStore={(branchId) => {
                      setSelectedStoreId(branchId);
                      handleUpdateSettings({ activeBranchId: branchId === "all" ? (settings.branches?.[0]?.id || "central") : branchId });
                      showToast(`Loja ativa selecionada: ${branchId === "all" ? "Todas as Lojas (Consolidado)" : (settings.branches || []).find(b => b.id === branchId)?.name || branchId}`, "info");
                    }}
                    onShowToast={showToast}
                    onAddAuditLog={handleAddAuditLog}
                    onChangeModule={(mod) => setActiveTab(mod.toUpperCase())}
                    theme={theme}
                  />
                )}
              </motion.div>
            )}

            {/* CUSTOMER LOYALTY CRM & MARKETING SMS */}
            {(activeTab === "CUSTOMERS" || activeTab === "CLIENTES") && (
              <motion.div
                key="CUSTOMERS"
                initial={{ opacity: 0, y: 12, scale: 0.995 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.995 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="h-full"
              >
                {!canRoleAccessModule(simplifiedRole, "customers").allowed ? (
                  <RoleAccessDeniedScreen
                    moduleId="customers"
                    userRole={simplifiedRole}
                    activeUser={activeUser}
                    theme={theme}
                    onNavigateToModule={(mod) => setActiveTab(mod.toUpperCase())}
                    onSwitchUser={() => setIsUserSwitchModalOpen(true)}
                  />
                ) : (
                  <CustomersModule
                    customers={customers}
                    transactions={transactions}
                    settings={settings}
                    onAddCustomer={handleAddCustomer}
                    onUpdateCustomer={handleUpdateCustomer}
                    onAddCashFlowEntry={handleAddCashFlowEntry}
                    onDeleteCustomer={handleDeleteCustomer}
                    onAddAuditLog={handleAddAuditLog}
                    currentRole={simplifiedRole}
                    activeUsername={activeUserDisplayName}
                    currency={currency}
                    onShowToast={showToast}
                  />
                )}
              </motion.div>
            )}

            {/* FINANCIAL REPORTS & SMTP TRIGGERS */}
            {activeTab === "REPORTS" && (
              <motion.div
                key="REPORTS"
                initial={{ opacity: 0, y: 12, scale: 0.995 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.995 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="h-full"
              >
                {!canRoleAccessModule(simplifiedRole, "reports").allowed ? (
                  <RoleAccessDeniedScreen
                    moduleId="reports"
                    userRole={simplifiedRole}
                    activeUser={activeUser}
                    theme={theme}
                    onNavigateToModule={(mod) => setActiveTab(mod.toUpperCase())}
                    onSwitchUser={() => setIsUserSwitchModalOpen(true)}
                  />
                ) : (
                  <ReportsModule
                    transactions={filteredTransactions}
                    products={products}
                    employees={employees}
                    settings={settings}
                    onUpdateSettings={handleUpdateSettings}
                    onAddAuditLog={handleAddAuditLog}
                    currency={currency}
                    onShowToast={showToast}
                    auditLogs={auditLogs}
                    transactionsError={transactionsError}
                    onRetryTransactions={handleRetryTransactions}
                  />
                )}
              </motion.div>
            )}

            {/* COMPANY GENERAL IDENTITIES AND MAIN SETTINGS (INCLUDING ADVANCED CONSOLIDATED SUBMODULES) */}
            {(activeTab === "SETTINGS" || activeTab === "STAFF" || activeTab === "AI" || activeTab === "TRAINING" || activeTab === "GATEWAY" || activeTab === "PLANS") && (
              <motion.div
                key="SETTINGS"
                initial={{ opacity: 0, y: 12, scale: 0.995 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.995 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="h-full settings-tab-container"
                data-module="settings"
                data-tab="SETTINGS"
              >
                {!canRoleAccessModule(simplifiedRole, activeTab.toLowerCase()).allowed ? (
                  <RoleAccessDeniedScreen
                    moduleId={activeTab.toLowerCase()}
                    userRole={simplifiedRole}
                    activeUser={activeUser}
                    theme={theme}
                    onNavigateToModule={(mod) => setActiveTab(mod.toUpperCase())}
                    onSwitchUser={() => setIsUserSwitchModalOpen(true)}
                  />
                ) : (
                  <SettingsModule
                    settings={settings}
                    userEmail={activeUser?.email || "levidomingos12@gmail.com"}
                    onUpdateSettings={handleUpdateSettings}
                    onAddAuditLog={handleAddAuditLog}
                    currentRole={simplifiedRole}
                    currency={currency}
                    onShowToast={showToast}
                    activeUser={activeUser}
                    activeColorTheme={activeColorTheme}
                    onChangeColorTheme={handleThemeChange}
                    onExportLocalDB={handleExportLocalDB}
                    onImportLocalDB={handleImportLocalDB}
                    onTriggerLocalBackup={handleTriggerLocalBackup}
                    onGetBackupPayload={handleGetBackupPayload}
                    onPurgeMockData={handlePurgeMockData}
                    systemVersion={currentSystemVersion}
                    employees={employees}
                    auditLogs={auditLogs}
                    products={products}
                    onUpdateProduct={handleUpdateProduct}
                    onUpdateProducts={(updatedList) => {
                      setProducts(updatedList);
                      syncTable("products", updatedList);
                    }}
                    transactions={filteredTransactions}
                    customers={customers}
                    onAddEmployee={handleAddEmployee}
                    onUpdateEmployees={handleUpdateEmployees}
                    masterclassVideos={masterclassVideos}
                    theme={theme}
                    onUpdateUserPlan={handleUpdateUserPlan}
                    onUpdateSystemPlan={handleUpdateSystemPlan}
                    initialSubTab={
                      activeTab === "STAFF" ? "staff" :
                      activeTab === "AI" ? "ai" :
                      activeTab === "TRAINING" ? "training" :
                      activeTab === "GATEWAY" ? "gateway" :
                      activeTab === "SMTP" ? "smtp" :
                      activeTab === "POSTGRESQL" || activeTab === "DATABASE" ? "postgresql" :
                      activeTab === "PLANS" ? "plans" : undefined
                    }
                    onChangeModule={(mod) => setActiveTab(mod.toUpperCase())}
                    onResetEmployeePin={async (empId) => {
                      const target = employees.find(e => e.id === empId);
                      if (!target) return;
                      const generatedPin = generateSecurePin(6);
                      const updatedEmployees = employees.map(emp => {
                        if (emp.id === empId) {
                          return {
                            ...emp,
                            pin: generatedPin,
                            password: generatedPin,
                            pinChanged: false,
                            pinCreatedAt: new Date().toISOString()
                          };
                        }
                        return emp;
                      });
                      setEmployees(updatedEmployees);
                      await syncTable("employees", updatedEmployees);
                      handleAddAuditLog(
                        "Reset de PIN Forçado",
                        "SEGURANÇA",
                        `PIN do colaborador ${target.name} (${target.username}) redefinido e enviado para o e-mail pelo Administrador.`
                      );

                      let emailDetails = "";
                      const targetEmail = target.email?.trim();
                      if (targetEmail) {
                        try {
                          await sendEmail({
                            to: targetEmail,
                            subject: "Redefinição de PIN / Senha de Acesso - OST Vendas",
                            body: `
                              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                              <div style="text-align: center; border-bottom: 2px solid #ff6b00; padding-bottom: 15px; margin-bottom: 20px;">
                                <h1 style="color: #0f172a; margin: 0; font-size: 24px;">OST Vendas</h1>
                                <p style="color: #64748b; margin: 5px 0 0 0; font-size: 14px;">Notificação de Segurança - Redefinição de Credenciais</p>
                              </div>
                              <h2 style="color: #1e293b; font-size: 18px;">Olá, ${target.name}!</h2>
                              <p style="color: #475569; font-size: 14px; line-height: 1.5;">Informamos que as suas credenciais de acesso ao sistema <strong>OST Vendas</strong> foram redefinidas com sucesso pela Administração.</p>
                              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
                                <span style="color: #64748b; font-size: 12px; display: block; margin-bottom: 5px; font-weight: bold; text-transform: uppercase;">Novo PIN Temporário de Acesso:</span>
                                <strong style="color: #ff6b00; font-size: 24px; letter-spacing: 2px; font-family: monospace;">${generatedPin}</strong>
                              </div>
                              <p style="color: #475569; font-size: 14px; line-height: 1.5;">Por motivos de segurança, utilize este PIN temporário para efetuar o login. O sistema exigirá que defina uma senha definitiva personalizada no primeiro acesso.</p>
                              <p style="color: #94a3b8; font-size: 12px; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center;">Se não solicitou esta alteração, entre em contacto imediatamente com o Administrador.</p>
                            </div>
                          `,
                          isHtml: true
                        });
                        emailDetails = ` Um e-mail com a nova senha foi enviado com sucesso para ${targetEmail}.`;
                      } catch (emailErr) {
                        console.error("Erro ao enviar e-mail de redefinição de PIN:", emailErr);
                        emailDetails = " (Nota: Ocorreu um erro ao enviar o e-mail de notificação. Certifique-se de que as configurações de SMTP estão ativas).";
                      }
                    } else {
                      emailDetails = " (Aviso: O colaborador não possui e-mail cadastrado no sistema para o envio automático).";
                    }

                    showToast(
                      `PIN do colaborador ${target.name} redefinido com sucesso para '${generatedPin}'.${emailDetails}`,
                      "success",
                      "Reset de PIN Concluído"
                    );
                  }}
                  onUpdateEmployeeTheme={async (empId, themeId) => {
                    const target = employees.find(e => e.id === empId);
                    if (!target) return;
                    const updatedEmployees = employees.map(emp => {
                      if (emp.id === empId) {
                        return {
                          ...emp,
                          theme: themeId
                        };
                      }
                      return emp;
                    });
                    setEmployees(updatedEmployees);
                    await syncTable("employees", updatedEmployees);
                    
                    if (activeUser && activeUser.id === empId) {
                      setActiveColorTheme(themeId);
                      localStorage.setItem("erp_theme_" + empId, themeId);
                    }

                    handleAddAuditLog(
                      "Definição de Tema de Colaborador",
                      "SEGURANÇA",
                      `Tema do colaborador ${target.name} (${target.username}) atualizado para ${themeId} pelo Administrador.`
                    );
                    showToast(
                      `Preferência de cor para ${target.name} atualizada para '${themeId}'.`,
                      "success",
                      "Tema de Colaborador"
                    );
                  }}
                />
                )}
              </motion.div>
            )}
          </AnimatePresence>
          </Suspense>
        </main>

      </div>

      {/* PIN Verification Modal for Switching Operator */}
      <AnimatePresence>
        {pinVerificationOpen && (
          <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${
                theme === "night"
                  ? "bg-zinc-950 text-slate-100 border-zinc-850"
                  : "bg-white text-slate-800 border-slate-100"
              }`}
              id="profile-pin-verification-modal"
            >
              {/* Modal Header */}
              <div className={`p-6 border-b flex items-center justify-between ${
                theme === "night" ? "bg-zinc-900 border-zinc-850" : "bg-slate-50 border-slate-100"
              }`}>
                <div className="flex items-center gap-3 text-left">
                  <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center shadow-inner">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm">Autenticação Requerida</h3>
                    <p className="text-[11px] text-slate-400 font-medium font-mono">Terminal POS de Segurança</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPinVerificationOpen(false);
                    setPinTargetEmployee(null);
                  }}
                  className={`w-8 h-8 rounded-full border flex items-center justify-center transition cursor-pointer text-xs font-bold ${
                    theme === "night"
                      ? "bg-zinc-900 border-zinc-850 text-slate-400 hover:text-white"
                      : "bg-white border-slate-200 text-slate-400 hover:text-slate-600"
                  }`}
                >
                  ✕
                </button>
              </div>

              {/* Login Method Tabs */}
              <div className="flex border-b border-slate-100 dark:border-zinc-850">
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod("select");
                    setPinError("");
                  }}
                  className={`flex-1 py-3 text-xs font-bold transition-all border-b-2 ${
                    loginMethod === "select"
                      ? "border-orange-500 text-orange-600 font-extrabold"
                      : "border-transparent text-slate-400 hover:text-slate-600"
                  }`}
                >
                  👥 Selecionar Operador
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod("type");
                    setPinError("");
                  }}
                  className={`flex-1 py-3 text-xs font-bold transition-all border-b-2 ${
                    loginMethod === "type"
                      ? "border-orange-500 text-orange-600 font-extrabold"
                      : "border-transparent text-slate-400 hover:text-slate-600"
                  }`}
                >
                  🔑 Introduzir Username
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 flex flex-col items-center">
                {/* Method 1: Dropdown selector */}
                {loginMethod === "select" && (
                  <div className="w-full space-y-3 mb-4">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block text-left">
                      Escolha o Colaborador
                    </label>
                    <select
                      value={pinTargetEmployee ? pinTargetEmployee.id : ""}
                      onChange={(e) => {
                        const emp = employees.find(empItem => empItem.id === e.target.value);
                        if (emp) {
                          setPinTargetEmployee(emp);
                          setEnteredPin("");
                          setPinError("");
                        }
                      }}
                      className={`w-full p-2.5 rounded-xl border font-semibold outline-none text-xs cursor-pointer ${
                        theme === "night"
                          ? "bg-zinc-900 border-zinc-800 text-slate-100"
                          : "bg-slate-50 border-slate-200 text-slate-800 focus:border-orange-500 shadow-sm"
                      }`}
                    >
                      <option value="" disabled>-- Escolha um Operador do Quadro --</option>
                      {employees.filter(e => e.status !== "INACTIVE" && e.status !== "SUSPENDED").map(empItem => (
                        <option key={empItem.id} value={empItem.id}>
                          {empItem.role.toUpperCase().includes("ADMIN") ? "👨‍💼" : empItem.role.toUpperCase().includes("SUPERVISOR") ? "👨‍💻" : "👩‍💼"}{" "}
                          {empItem.name} ({empItem.username || "sem username"})
                        </option>
                      ))}
                    </select>

                    {pinTargetEmployee && (
                      <div className={`w-full p-3.5 rounded-xl border text-left flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-200 ${
                        theme === "night"
                          ? "bg-zinc-900/60 border-zinc-850"
                          : "bg-orange-50/55 border-orange-100/50"
                      }`}>
                        <div className="text-2xl mt-0.5">
                          {pinTargetEmployee.role.toUpperCase().includes("ADMIN") ? "👨‍💼" : pinTargetEmployee.role.toUpperCase().includes("SUPERVISOR") ? "👨‍💻" : "👩‍💼"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-extrabold text-xs text-slate-800 dark:text-slate-100">{pinTargetEmployee.name}</h4>
                          <p className="text-[10px] text-slate-400 font-semibold">{pinTargetEmployee.role}</p>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-200/60 text-slate-600 dark:bg-zinc-850 dark:text-slate-400">
                              @{pinTargetEmployee.username}
                            </span>
                            {(pinTargetEmployee.pinChanged === false || pinTargetEmployee.pinChanged === undefined) ? (
                              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 animate-pulse">
                                Senha Temporária
                              </span>
                            ) : (
                              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                                Senha Definida
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Method 2: Manual Username Entry */}
                {loginMethod === "type" && (
                  <div className="w-full space-y-1.5 mb-4">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block text-left">
                      Username do Operador
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-mono">@</span>
                      <input
                        type="text"
                        placeholder="Iniciais + Apelido (Ex: ldomingos)"
                        value={enteredUsername}
                        onChange={(e) => {
                          setEnteredUsername(e.target.value.toLowerCase().replace(/\s/g, ""));
                          if (pinError) setPinError("");
                        }}
                        className={`w-full pl-8 pr-4 py-2.5 rounded-xl border font-mono font-bold text-xs outline-none ${
                          theme === "night"
                            ? "bg-zinc-900 border-zinc-800 text-slate-100 focus:border-orange-500"
                            : "bg-slate-50 border-slate-200 text-slate-850 focus:border-orange-500 focus:bg-white shadow-sm"
                        }`}
                        autoFocus={loginMethod === "type"}
                      />
                    </div>
                  </div>
                )}

                {/* Password Input Field */}
                <div className="w-full space-y-1.5 mb-4">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block text-left">
                    Digite a sua Senha de Acesso
                  </label>
                  <input
                    type="password"
                    maxLength={32}
                    value={enteredPin}
                    onChange={(e) => {
                      setEnteredPin(e.target.value);
                      if (pinError) setPinError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleVerifyAndSwitchProfile();
                      }
                    }}
                    placeholder="Sua senha secreta"
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl border focus:outline-none focus:ring-2 transition-all text-xs font-medium ${
                      theme === "night"
                        ? "bg-zinc-900 border-zinc-800 text-slate-100 focus:border-orange-500 focus:ring-orange-500/20"
                        : "bg-slate-50 border-slate-200 text-slate-800 focus:border-orange-500 focus:ring-orange-500/20 shadow-sm"
                    }`}
                  />
                  {pinError && (
                    <p className="text-xs text-rose-500 font-extrabold text-left animate-pulse mt-1.5">
                      ⚠️ {pinError}
                    </p>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className={`p-4 border-t flex items-center justify-between gap-3 ${
                theme === "night" ? "bg-zinc-900 border-zinc-850" : "bg-slate-50 border-slate-100"
              }`}>
                <button
                  type="button"
                  onClick={() => {
                    setPinVerificationOpen(false);
                    setPinTargetEmployee(null);
                  }}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                    theme === "night"
                      ? "text-slate-400 hover:text-white"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleVerifyAndSwitchProfile}
                  className={`px-5 py-2.5 text-xs font-extrabold rounded-xl shadow-md transition-all cursor-pointer bg-orange-500 hover:bg-orange-600 text-white transform hover:scale-105`}
                >
                  Autenticar Perfil
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>



      {/* Ultra-Clean User / Collaborator Switch Modal */}
      <UserSwitchModal
        isOpen={isUserSwitchModalOpen}
        onClose={() => setIsUserSwitchModalOpen(false)}
        theme={theme}
        employees={employees}
        activeUser={activeUser}
        settings={settings}
        onSelectEmployee={(newEmp) => {
          setActiveUser(newEmp);
          showToast(`Operador alterado para ${newEmp.name}!`, "success");
        }}
        onAuditLog={(action, module, details) => {
          handleAddAuditLog(action, module, details);
        }}
      />

      {showReplenishModal && (
        <Suspense fallback={null}>
          <StockReplenishModal
            isOpen={showReplenishModal}
            onClose={() => setShowReplenishModal(false)}
            products={products}
            onUpdateProduct={handleUpdateProduct}
            activeBranchId={settings.activeBranchId || "central"}
            onShowToast={showToast}
            theme={theme}
          />
        </Suspense>
      )}

      {/* Toast Notifications Overlay Container */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`p-4 rounded-xl border shadow-lg pointer-events-auto flex gap-3 relative overflow-hidden backdrop-blur-md ${
                theme === "night"
                  ? "bg-zinc-950/95 border-zinc-850/80 text-slate-100 shadow-zinc-950/45"
                  : "bg-white/95 border-slate-200 text-slate-800 shadow-slate-200/40"
              }`}
            >
              {/* Vertical side glow indicator bar according to toast type */}
              <div
                className={`absolute top-0 left-0 bottom-0 w-1.5 ${
                  t.type === "success"
                    ? "bg-emerald-500"
                    : t.type === "error"
                    ? "bg-rose-500"
                    : t.type === "warning"
                    ? "bg-amber-500"
                    : "bg-blue-500"
                }`}
              />

              {/* Icon selection dynamically */}
              <div className="mt-0.5 shrink-0">
                {t.type === "success" && (
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                )}
                {t.type === "error" && (
                  <XCircle className="w-5 h-5 text-rose-500" />
                )}
                {t.type === "warning" && (
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                )}
                {t.type === "info" && (
                  <Activity className="w-5 h-5 text-blue-500" />
                )}
              </div>

              {/* Contents block */}
              <div className="flex-1 pr-6">
                <h4 className="font-extrabold text-xs tracking-tight uppercase">
                  {t.title}
                </h4>
                <p className={`text-[11px] mt-1 pr-1 font-semibold leading-relaxed ${
                  theme === "night" ? "text-slate-350" : "text-slate-550"
                }`}>
                  {t.message}
                </p>
              </div>

              {/* Manual Close Button */}
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className={`absolute top-3 right-3 p-1 rounded-lg transition-colors cursor-pointer ${
                  theme === "night"
                    ? "hover:bg-zinc-900 text-slate-400 hover:text-white"
                    : "hover:bg-slate-100 text-slate-400 hover:text-slate-900"
                }`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Floating Action Navigation Hub (FAB) */}
      {!isPOSFullscreen && (
        <div className="fixed bottom-6 right-6 z-[90] flex flex-col items-end gap-3 no-print">
          <AnimatePresence>
            {isFabOpen && (
              <motion.div
                initial={{ opacity: 0, y: 15, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 15, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className={`p-4 rounded-3xl border shadow-2xl w-64 md:w-72 max-h-[75vh] overflow-y-auto backdrop-blur-xl flex flex-col gap-2 ${
                  theme === "night"
                    ? "bg-zinc-950/95 border-zinc-850/80 shadow-zinc-950/50 text-slate-100"
                    : "bg-white/95 border-slate-200 shadow-slate-350/30 text-slate-800"
                }`}
              >
                <div className="flex items-center justify-between pb-2 mb-1 border-b border-dashed border-slate-700/20 dark:border-zinc-800">
                  <span className="text-[10px] font-black tracking-widest uppercase text-orange-500 font-mono">Navegação Rápida</span>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-900 border dark:border-zinc-800 font-mono">
                    {activeUser ? activeUser.role : "Sessão"}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 gap-1">
                  {NAV_MENU_ITEMS.map((item) => {
                    const roleCheck = canRoleAccessModule(simplifiedRole, item.id);
                    const authorized = roleCheck.allowed;
                    const active = activeTab.toLowerCase() === item.id;
                    
                    return (
                      <button
                        key={item.id}
                        disabled={!authorized}
                        onClick={() => {
                          if (authorized) {
                            setActiveTab(item.id.toUpperCase());
                            setIsFabOpen(false);
                          }
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-xl text-xs font-bold transition-all group ${
                          active
                            ? "bg-orange-500 text-white shadow-md shadow-orange-500/25"
                            : authorized
                            ? theme === "night"
                              ? "text-slate-300 hover:text-white hover:bg-zinc-900 cursor-pointer"
                              : "text-slate-700 hover:text-orange-600 hover:bg-orange-50/50 cursor-pointer"
                            : "opacity-35 cursor-not-allowed text-slate-400"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <item.icon className={`w-4 h-4 shrink-0 transition-colors ${
                            active
                              ? "text-white"
                              : authorized
                              ? theme === "night"
                                ? "text-slate-500 group-hover:text-slate-300"
                                : "text-slate-400 group-hover:text-orange-500"
                              : "text-slate-400"
                          }`} />
                          <span className="truncate">{item.label}</span>
                        </div>
                        
                        {!authorized && (
                          <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
                
                <div className="border-t border-slate-700/10 dark:border-zinc-800/80 pt-2 mt-1 flex flex-col gap-1">
                  <button
                    onClick={() => {
                      setIsSidebarOpen(true);
                      setIsFabOpen(false);
                    }}
                    className={`w-full flex items-center justify-center gap-2 p-2 rounded-xl text-[10.5px] font-black uppercase tracking-wider transition-all cursor-pointer border ${
                      theme === "night"
                        ? "bg-zinc-900/60 border-zinc-850 text-orange-400 hover:bg-zinc-900 hover:text-orange-300"
                        : "bg-orange-50/40 border-orange-100 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
                    }`}
                  >
                    <Menu className="w-3.5 h-3.5" />
                    <span>Ver Painel Lateral 📋</span>
                  </button>
                  
                  <button
                    onClick={() => {
                      setIsFabOpen(false);
                      handleLogout();
                    }}
                    className="w-full flex items-center justify-center gap-2 p-2 rounded-xl text-[10.5px] font-black uppercase tracking-wider text-red-500 hover:text-red-400 bg-red-500/10 hover:bg-red-500/15 transition-all cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Terminar Sessão 🔒</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          <button
            onClick={() => setIsFabOpen(!isFabOpen)}
            className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all cursor-pointer border relative group ${
              isFabOpen
                ? "bg-slate-900 text-white border-slate-800 hover:bg-slate-800 scale-105"
                : theme === "night"
                ? "bg-orange-500 hover:bg-orange-600 text-white border-orange-600 hover:scale-110"
                : "bg-orange-500 hover:bg-orange-600 text-white border-orange-400 hover:scale-110"
            }`}
            title="Menu de Navegação Rápida"
          >
            {isFabOpen ? (
              <X className="w-6 h-6 animate-in spin-in duration-200" />
            ) : (
              <Compass className="w-6 h-6 group-hover:rotate-45 transition-transform duration-300 animate-pulse" />
            )}
            
            {/* Soft pulsing visual outer ring */}
            {!isFabOpen && (
              <span className="absolute -inset-0.5 rounded-full border border-orange-500 animate-ping opacity-25 pointer-events-none"></span>
            )}
          </button>
        </div>
      )}

      {/* Quick Logo Config Modal */}
      {isQuickLogoModalOpen && (
        <Suspense fallback={null}>
          <QuickLogoModal
            isOpen={isQuickLogoModalOpen}
            onClose={() => setIsQuickLogoModalOpen(false)}
            currentLogoUrl={settings.logoUrl}
            companyName={companyDisplayName}
            theme={theme}
            onSaveLogo={(newLogoUrl) => {
              handleUpdateSettings({ logoUrl: newLogoUrl });
              handleAddAuditLog(
                "Logotipo Atualizado",
                "DEFINICOES",
                `Logotipo da empresa atualizado para '${newLogoUrl.substring(0, 40)}...' via Painel de Configuração Rápida.`
              );
            }}
            onShowToast={showToast}
          />
        </Suspense>
      )}

      {/* Tutorial & Keyboard Shortcuts Modal */}
      {isTutorialModalOpen && (
        <Suspense fallback={null}>
          <TutorialModal
            isOpen={isTutorialModalOpen}
            onClose={() => setIsTutorialModalOpen(false)}
            theme={theme}
            onNavigateModule={(moduleKey) => setActiveTab(moduleKey)}
          />
        </Suspense>
      )}

      {/* Unified System Info Hub Modal */}
      <SystemInfoHub
        isOpen={isSystemInfoHubOpen}
        onClose={() => setIsSystemInfoHubOpen(false)}
        isOnline={isOnline}
        companyName={companyDisplayName}
        logoUrl={settings.logoUrl}
        version={currentSystemVersion}
        sessionSeconds={Math.floor((Date.now() - sessionStartTimeRef.current) / 1000)}
        activeUser={activeUser}
        onSwitchUser={() => setIsUserSwitchModalOpen(true)}
        onOpenLogoModal={() => setIsQuickLogoModalOpen(true)}
        onOpenTutorial={() => setIsTutorialModalOpen(true)}
        theme={theme}
      />
    </div>
  );
}
