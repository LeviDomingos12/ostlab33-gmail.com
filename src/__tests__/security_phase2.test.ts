import { describe, it, expect } from "vitest";
import { 
  hashSecurityPin, 
  verifySecurityPin, 
  sanitizeUserSession, 
  sanitizeEmployeesForExport, 
  sanitizeSettingsForExport, 
  purgeClientSensitiveStorage 
} from "../lib/security";
import { canRoleAccessModule, normalizeUserRole, getDefaultModuleForRole } from "../lib/rolePermissions";
import { Employee } from "../types";
import { getGoogleAccessToken } from "../lib/gmail";

describe("Fase 2 - Segurança & Arquitetura", () => {
  describe("Criptografia e Hashing Seguro de PINs", () => {
    it("deve gerar um hash SHA-256 consistente para um PIN fornecido", async () => {
      const pin = "123456";
      const hash1 = await hashSecurityPin(pin);
      const hash2 = await hashSecurityPin(pin);

      expect(hash1).toBeDefined();
      expect(hash1.length).toBeGreaterThan(10);
      expect(hash1).toBe(hash2);
    });

    it("deve retornar vazio se o PIN for nulo ou vazio", async () => {
      const emptyHash = await hashSecurityPin("");
      expect(emptyHash).toBe("");
    });

    it("deve verificar corretamente PIN coincidente com o hash armazenado", async () => {
      const pin = "889900";
      const hash = await hashSecurityPin(pin);

      const isValid = await verifySecurityPin("889900", hash);
      const isInvalid = await verifySecurityPin("112233", hash);

      expect(isValid).toBe(true);
      expect(isInvalid).toBe(false);
    });

    it("deve suportar PINs legados durante o período de transição/migração", async () => {
      const plainPin = "4321";
      const isValid = await verifySecurityPin("4321", plainPin);
      expect(isValid).toBe(true);
    });
  });

  describe("Higienização de Sessão do Utilizador (Proteção de Storage)", () => {
    it("deve remover PIN, password e dados sensíveis antes de persistir a sessão", () => {
      const rawUser: Employee = {
        id: "emp-101",
        name: "Carlos Silva",
        role: "Operador de Caixa",
        contact: "841234567",
        salary: 18000,
        admissionDate: "2026-01-01",
        status: "ACTIVE",
        pin: "secret_pin_123",
        password: "secret_password_456"
      };

      const safeUser = sanitizeUserSession(rawUser);

      expect(safeUser).not.toBeNull();
      expect(safeUser?.id).toBe("emp-101");
      expect(safeUser?.name).toBe("Carlos Silva");
      expect((safeUser as any).pin).toBeUndefined();
      expect((safeUser as any).password).toBeUndefined();
    });

    it("deve lidar de forma segura com utilizador nulo ou indefinido", () => {
      expect(sanitizeUserSession(null)).toBeNull();
      expect(sanitizeUserSession(undefined)).toBeNull();
    });
  });

  describe("Matriz de Permissões e RBAC", () => {
    it("deve normalizar corretamente funções de utilizador", () => {
      expect(normalizeUserRole({ role: "Administrador Geral" } as any)).toBe("ADMIN");
      expect(normalizeUserRole({ role: "Supervisor de Loja" } as any)).toBe("SUPERVISOR");
      expect(normalizeUserRole({ role: "Operador de Caixa" } as any)).toBe("CASHIER");
      expect(normalizeUserRole({ role: "Gestor de Recursos Humanos" } as any)).toBe("RH");
      expect(normalizeUserRole({ role: "Contabilista Financeiro" } as any)).toBe("FINANCEIRO");
      expect(normalizeUserRole({ role: "Auditor Fiscal" } as any)).toBe("AUDITOR");
    });

    it("deve restringir acesso a módulos confidenciais a operadores de caixa", () => {
      const posAccess = canRoleAccessModule("CASHIER", "pos");
      const cashAccess = canRoleAccessModule("CASHIER", "cash");
      const settingsAccess = canRoleAccessModule("CASHIER", "settings");
      const staffAccess = canRoleAccessModule("CASHIER", "staff");
      const dashboardAccess = canRoleAccessModule("CASHIER", "dashboard");

      expect(posAccess.allowed).toBe(true);
      expect(cashAccess.allowed).toBe(true);
      expect(settingsAccess.allowed).toBe(false);
      expect(staffAccess.allowed).toBe(false);
      expect(dashboardAccess.allowed).toBe(false);
    });

    it("deve conceder acesso total a administradores", () => {
      const modules = ["dashboard", "pos", "stock", "cash", "customers", "reports", "settings", "staff", "gateway", "plans"];
      for (const mod of modules) {
        const check = canRoleAccessModule("ADMIN", mod);
        expect(check.allowed).toBe(true);
      }
    });

    it("deve retornar o módulo padrão apropriado para cada cargo", () => {
      expect(getDefaultModuleForRole("CASHIER")).toBe("POS");
      expect(getDefaultModuleForRole("ADMIN")).toBe("DASHBOARD");
      expect(getDefaultModuleForRole("RH")).toBe("STAFF");
    });
  });

  describe("ETAPA 10 — Auditoria e Limpeza de Dados Sensíveis", () => {
    it("sanitizeEmployeesForExport: deve eliminar pin, password, tempPassword e tokenSecret de todos os colaboradores", () => {
      const employees: Employee[] = [
        {
          id: "emp-1",
          name: "João",
          role: "ADMIN",
          contact: "840000001",
          salary: 50000,
          admissionDate: "2026-01-01",
          status: "ACTIVE",
          pin: "4321",
          password: "super_secret_pw",
          email: "joao@empresa.co.mz"
        },
        {
          id: "emp-2",
          name: "Maria",
          role: "CASHIER",
          contact: "840000002",
          salary: 20000,
          admissionDate: "2026-01-01",
          status: "ACTIVE",
          pin: "1234",
          email: "maria@empresa.co.mz"
        }
      ];

      const exported = sanitizeEmployeesForExport(employees);

      expect(exported.length).toBe(2);
      expect((exported[0] as any).pin).toBeUndefined();
      expect((exported[0] as any).password).toBeUndefined();
      expect((exported[1] as any).pin).toBeUndefined();
      expect((exported[1] as any).password).toBeUndefined();
      expect(exported[0].name).toBe("João");
      expect(exported[1].name).toBe("Maria");
    });

    it("sanitizeSettingsForExport: deve remover securityPin, smtpPassword e tokens das configurações em snapshots", () => {
      const rawSettings: any = {
        companyName: "Loja Teste",
        companyNuit: "400000000",
        securityPin: "9999",
        smtpPassword: "smtp_secret_pass",
        smsTwilioToken: "twilio_auth_secret",
        vatDefaultRate: 16
      };

      const sanitized = sanitizeSettingsForExport(rawSettings);

      expect(sanitized.securityPin).toBeUndefined();
      expect(sanitized.smtpPassword).toBeUndefined();
      expect(sanitized.smsTwilioToken).toBeUndefined();
      expect(sanitized.companyName).toBe("Loja Teste");
      expect(sanitized.vatDefaultRate).toBe(16);
    });

    it("purgeClientSensitiveStorage: deve expurgar tokens, senhas, PINs e snapshots residuais", () => {
      // Simular chaves em mock localStorage para ambiente Node
      const mockStorage: Record<string, string> = {};
      const mockLocalStorage = {
        getItem: (k: string) => mockStorage[k] ?? null,
        setItem: (k: string, v: string) => { mockStorage[k] = v; },
        removeItem: (k: string) => { delete mockStorage[k]; },
        clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); },
        key: (i: number) => Object.keys(mockStorage)[i] || null,
        get length() { return Object.keys(mockStorage).length; }
      };

      const originalLocalStorage = (globalThis as any).localStorage;
      (globalThis as any).localStorage = mockLocalStorage;

      try {
        mockLocalStorage.setItem("password", "insecure_123");
        mockLocalStorage.setItem("google_access_token", "ya29.sample_token");
        mockLocalStorage.setItem("erp_cache_snapshot_global", '{"data": "leaked"}');
        mockLocalStorage.setItem("erp_logged_in_user", JSON.stringify({
          id: "emp-active",
          name: "Admin",
          role: "ADMIN",
          pin: "9999",
          password: "secret_login_pw"
        }));

        purgeClientSensitiveStorage();

        expect(mockLocalStorage.getItem("password")).toBeNull();
        expect(mockLocalStorage.getItem("google_access_token")).toBeNull();
        expect(mockLocalStorage.getItem("erp_cache_snapshot_global")).toBeNull();

        const sanitizedUser = JSON.parse(mockLocalStorage.getItem("erp_logged_in_user") || "{}");
        expect(sanitizedUser.id).toBe("emp-active");
        expect(sanitizedUser.pin).toBeUndefined();
        expect(sanitizedUser.password).toBeUndefined();
      } finally {
        (globalThis as any).localStorage = originalLocalStorage;
      }
    });

    it("Garantia Google & Gmail: getGoogleAccessToken nunca armazena tokens no localStorage e expurga resíduos", async () => {
      const mockStorage: Record<string, string> = {
        google_access_token: "leaked_old_token",
        google_token: "leaked_google_token",
        gmail_token: "leaked_gmail_token",
        provider_token: "leaked_provider_token"
      };

      const mockLocalStorage = {
        getItem: (k: string) => mockStorage[k] ?? null,
        setItem: (k: string, v: string) => { mockStorage[k] = v; },
        removeItem: (k: string) => { delete mockStorage[k]; },
        clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); },
        key: (i: number) => Object.keys(mockStorage)[i] || null,
        get length() { return Object.keys(mockStorage).length; }
      };

      const originalLocalStorage = (globalThis as any).localStorage;
      (globalThis as any).localStorage = mockLocalStorage;

      try {
        await getGoogleAccessToken();

        // O token NUNCA deve ser gravado e resíduos prévios DEVEM ter sido eliminados
        expect(mockLocalStorage.getItem("google_access_token")).toBeNull();
        expect(mockLocalStorage.getItem("google_token")).toBeNull();
        expect(mockLocalStorage.getItem("gmail_token")).toBeNull();
        expect(mockLocalStorage.getItem("provider_token")).toBeNull();
      } finally {
        (globalThis as any).localStorage = originalLocalStorage;
      }
    });
  });
});
