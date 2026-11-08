import { describe, it, expect } from "vitest";

// ==========================================
// Phase 11: Production Deployment Readiness, Health Checks & System Info
// ==========================================

export interface SystemHealthCheck {
  status: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  uptimeSeconds: number;
  environment: "production" | "development" | "test";
  version: string;
  databaseConnected: boolean;
  activeModules: string[];
  systemLoad: {
    memoryUsageMB: number;
    latencyMs: number;
  };
}

export function performSystemHealthCheck(params: {
  uptimeSeconds: number;
  env?: "production" | "development" | "test";
  version?: string;
  databaseConnected?: boolean;
  latencyMs?: number;
}): SystemHealthCheck {
  const {
    uptimeSeconds,
    env = "production",
    version = "1.0.0",
    databaseConnected = true,
    latencyMs = 12
  } = params;

  let status: "HEALTHY" | "DEGRADED" | "UNHEALTHY" = "HEALTHY";
  if (!databaseConnected) {
    status = "UNHEALTHY";
  } else if (latencyMs > 1000) {
    status = "DEGRADED";
  }

  return {
    status,
    uptimeSeconds,
    environment: env,
    version,
    databaseConnected,
    activeModules: [
      "DASHBOARD",
      "POS",
      "STOCK",
      "CASH_REGISTER",
      "CUSTOMERS_CRM",
      "REPORTS_TAX",
      "STAFF_HR",
      "SETTINGS",
      "TRAINING",
      "SUBSCRIPTIONS"
    ],
    systemLoad: {
      memoryUsageMB: 48.5,
      latencyMs
    }
  };
}

export function formatSessionDuration(totalSeconds: number): string {
  if (totalSeconds < 0) return "00m 00s";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}h ${minutes.toString().padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}s`;
  }
  return `${minutes.toString().padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}s`;
}

export function sanitizeProductionExport<T extends Record<string, any>>(data: T): Partial<T> {
  const sanitized = { ...data };
  
  // Remove or mask sensitive internal fields
  if ("password" in sanitized) delete (sanitized as any).password;
  if ("rawPin" in sanitized) delete (sanitized as any).rawPin;
  if ("geminiApiKey" in sanitized) (sanitized as any).geminiApiKey = "********";
  if ("jwtSecret" in sanitized) (sanitized as any).jwtSecret = "********";

  return sanitized;
}

// ==========================================
// Test Suite: Phase 11 - System Health & Readiness
// ==========================================

describe("Phase 11: Prontidão de Produção, System Info Hub e Health Checks", () => {
  describe("Verificação de Integridade e Health Check do Sistema", () => {
    it("deve reportar status HEALTHY quando o banco de dados estiver conectado e latência baixa", () => {
      const health = performSystemHealthCheck({
        uptimeSeconds: 3600,
        env: "production",
        version: "2.4.0",
        databaseConnected: true,
        latencyMs: 15
      });

      expect(health.status).toBe("HEALTHY");
      expect(health.environment).toBe("production");
      expect(health.databaseConnected).toBe(true);
      expect(health.activeModules.length).toBe(10);
    });

    it("deve reportar status UNHEALTHY se a base de dados falhar", () => {
      const health = performSystemHealthCheck({
        uptimeSeconds: 100,
        databaseConnected: false
      });

      expect(health.status).toBe("UNHEALTHY");
    });
  });

  describe("Formatação de Tempo de Sessão e Atividade", () => {
    it("deve formatar segundos para minutos e segundos com zeros à esquerda", () => {
      expect(formatSessionDuration(125)).toBe("02m 05s");
      expect(formatSessionDuration(59)).toBe("00m 59s");
    });

    it("deve formatar sessões longas com horas", () => {
      expect(formatSessionDuration(3665)).toBe("01h 01m 05s");
    });
  });

  describe("Sanitização de Dados para Exportação Segura", () => {
    it("deve ocultar chaves de API e remover senhas/PINs em claro", () => {
      const rawConfig = {
        companyName: "Loja Teste",
        geminiApiKey: "AIzaSySecretKey123",
        jwtSecret: "SuperSecretToken",
        password: "user_password_123"
      };

      const clean = sanitizeProductionExport(rawConfig);
      expect(clean.geminiApiKey).toBe("********");
      expect(clean.jwtSecret).toBe("********");
      expect((clean as any).password).toBeUndefined();
      expect(clean.companyName).toBe("Loja Teste");
    });
  });
});
