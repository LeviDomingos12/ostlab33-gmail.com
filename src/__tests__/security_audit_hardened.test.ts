import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { 
  sanitizeUserSession, 
  sanitizeSettingsForExport, 
  purgeClientSensitiveStorage 
} from "../lib/security";
import { 
  requireCashierOrAdmin, 
  requireStockOrAdmin 
} from "../server/authMiddleware";

describe("Auditoria de Segurança, Isolamento Multi-Tenant e Sanitização", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const mockLocalStorage = {
      getItem: (k: string) => mockStorage[k] ?? null,
      setItem: (k: string, v: string) => { mockStorage[k] = v; },
      removeItem: (k: string) => { delete mockStorage[k]; },
      clear: () => { mockStorage = {}; },
      key: (i: number) => Object.keys(mockStorage)[i] || null,
      get length() { return Object.keys(mockStorage).length; }
    };
    (globalThis as any).localStorage = mockLocalStorage;
    (globalThis as any).sessionStorage = mockLocalStorage;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Higienização de Sessão e Credenciais (Zero Leaks)", () => {
    it("sanitizeUserSession deve purgar todos os segredos, senhas e PINs", () => {
      const dirtyUser: any = {
        id: "emp-100",
        name: "Operador de Caixa",
        email: "caixa@ostvendas.mz",
        role: "Caixa",
        pin: "1234",
        pinHash: "hash_abcdef123456",
        password: "SuperSecretPassword123!",
        tempPassword: "temporary_change_pw",
        tokenSecret: "secret_signing_key",
        accessToken: "jwt_token_sample",
        refreshToken: "refresh_token_sample",
        apiKey: "api_key_secret_value"
      };

      const cleanUser = sanitizeUserSession(dirtyUser);

      expect(cleanUser).not.toBeNull();
      expect(cleanUser?.id).toBe("emp-100");
      expect(cleanUser?.name).toBe("Operador de Caixa");
      expect((cleanUser as any).pin).toBeUndefined();
      expect((cleanUser as any).pinHash).toBeUndefined();
      expect((cleanUser as any).password).toBeUndefined();
      expect((cleanUser as any).tempPassword).toBeUndefined();
      expect((cleanUser as any).tokenSecret).toBeUndefined();
      expect((cleanUser as any).accessToken).toBeUndefined();
      expect((cleanUser as any).refreshToken).toBeUndefined();
      expect((cleanUser as any).apiKey).toBeUndefined();
    });

    it("sanitizeSettingsForExport deve remover securityPin, senhas SMTP e chaves de terceiros", () => {
      const dirtySettings = {
        companyName: "OST Comércio Geral, Lda",
        currency: "MT",
        securityPin: "9988",
        smtpPassword: "smtp_server_secret_password",
        smsTwilioToken: "twilio_auth_token_secret",
        apiKey: "gemini_api_key_secret"
      };

      const cleanSettings = sanitizeSettingsForExport(dirtySettings);

      expect(cleanSettings.companyName).toBe("OST Comércio Geral, Lda");
      expect(cleanSettings.currency).toBe("MT");
      expect(cleanSettings.securityPin).toBeUndefined();
      expect(cleanSettings.smtpPassword).toBeUndefined();
      expect(cleanSettings.smsTwilioToken).toBeUndefined();
      expect(cleanSettings.apiKey).toBeUndefined();
    });
  });

  describe("2. Expurgador Total de Storage Local (purgeClientSensitiveStorage)", () => {
    it("deve remover PINs, passwords, segredos e filas offline de localStorage e sessionStorage", () => {
      localStorage.setItem("user_pin", "4321");
      localStorage.setItem("admin_pin", "0000");
      localStorage.setItem("password", "leaked_pw");
      localStorage.setItem("google_access_token", "ya29.sample");
      localStorage.setItem("offline_queue", JSON.stringify([{ id: "sale-1" }]));
      localStorage.setItem("erp_offline_sales", JSON.stringify([{ id: "sale-2" }]));
      localStorage.setItem("cached_sales", JSON.stringify([{ id: "sale-3" }]));
      localStorage.setItem("erp_company_settings", JSON.stringify({
        companyName: "Loja Principal",
        securityPin: "5555",
        smtpPassword: "leaked_smtp"
      }));

      purgeClientSensitiveStorage();

      expect(localStorage.getItem("user_pin")).toBeNull();
      expect(localStorage.getItem("admin_pin")).toBeNull();
      expect(localStorage.getItem("password")).toBeNull();
      expect(localStorage.getItem("google_access_token")).toBeNull();
      expect(localStorage.getItem("offline_queue")).toBeNull();
      expect(localStorage.getItem("erp_offline_sales")).toBeNull();
      expect(localStorage.getItem("cached_sales")).toBeNull();

      // Configurações mantidas porém com segredos removidos
      const cleanSettings = JSON.parse(localStorage.getItem("erp_company_settings") || "{}");
      expect(cleanSettings.companyName).toBe("Loja Principal");
      expect(cleanSettings.securityPin).toBeUndefined();
      expect(cleanSettings.smtpPassword).toBeUndefined();
    });
  });

  describe("3. Controlo de Acesso Baseado em Papéis (RBAC)", () => {
    it("requireCashierOrAdmin deve autorizar ADMIN, SUPERVISOR, CASHIER e SELLER", () => {
      const allowedRoles = ["ADMIN", "SUPERVISOR", "CASHIER", "SELLER"] as const;

      allowedRoles.forEach((role) => {
        let called = false;
        const req: any = {
          user: { id: "u-1", role, tenantId: "tenant-a" }
        };
        const res: any = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn()
        };
        const next = () => { called = true; };

        requireCashierOrAdmin(req, res, next);
        expect(called).toBe(true);
      });
    });

    it("requireCashierOrAdmin deve bloquear papéis sem permissão comercial (ex: STOCK_MANAGER)", () => {
      let called = false;
      const req: any = {
        user: { id: "u-2", role: "STOCK_MANAGER", tenantId: "tenant-a" }
      };
      let statusSent = 0;
      let errorBody: any = null;
      const res: any = {
        status: (code: number) => {
          statusSent = code;
          return {
            json: (b: any) => { errorBody = b; }
          };
        }
      };
      const next = () => { called = true; };

      requireCashierOrAdmin(req, res, next);
      expect(called).toBe(false);
      expect(statusSent).toBe(403);
      expect(errorBody?.error).toContain("Permissão negada");
    });

    it("requireStockOrAdmin deve bloquear CASHIER ou SELLER para mutações de stock", () => {
      let called = false;
      const req: any = {
        user: { id: "u-3", role: "CASHIER", tenantId: "tenant-a" }
      };
      let statusSent = 0;
      const res: any = {
        status: (code: number) => {
          statusSent = code;
          return { json: vi.fn() };
        }
      };
      const next = () => { called = true; };

      requireStockOrAdmin(req, res, next);
      expect(called).toBe(false);
      expect(statusSent).toBe(403);
    });

    it("requireStockOrAdmin deve autorizar STOCK_MANAGER e ADMIN", () => {
      ["ADMIN", "SUPERVISOR", "STOCK_MANAGER"].forEach((role: any) => {
        let called = false;
        const req: any = {
          user: { id: "u-4", role, tenantId: "tenant-a" }
        };
        const res: any = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn()
        };
        const next = () => { called = true; };

        requireStockOrAdmin(req, res, next);
        expect(called).toBe(true);
      });
    });
  });
});
