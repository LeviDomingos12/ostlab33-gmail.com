import { Router, Request, Response } from "express";
import { requireAdmin } from "./authMiddleware";

export const securityRouter = Router();

// In-Memory Rate Limit Metrics & Logs Store
interface RateLimitViolation {
  id: string;
  ip: string;
  endpoint: string;
  timestamp: string;
  method: string;
  category: "general" | "ai" | "email" | "db";
}

const rateLimitMetrics = {
  totalRequestsProcessed: 0,
  totalBlocked429: 0,
  recentViolations: [] as RateLimitViolation[],
};

// Dynamic Rate Limit Configurations
const defaultRateLimitConfig = {
  profile: "tolerant" as "strict" | "balanced" | "tolerant" | "custom",
  generalMax: 10000,
  generalWindowMs: 15 * 60 * 1000,
  aiMax: 300,
  aiWindowMs: 60 * 1000,
  emailMax: 150,
  emailWindowMs: 5 * 60 * 1000,
  dbMax: 3000,
  dbWindowMs: 60 * 1000,
  enabled: true
};

let currentRateLimitConfig = { ...defaultRateLimitConfig };

export function getRateLimitConfig() {
  return currentRateLimitConfig;
}

export function saveRateLimitConfig(config: Partial<typeof defaultRateLimitConfig>) {
  currentRateLimitConfig = { ...defaultRateLimitConfig, ...config };
}

// Firewall & Security System Config
export interface FirewallConfig {
  enabled: boolean;
  securityHeadersEnabled: boolean;
  sanitizerEnabled: boolean;
  bruteForceProtectionEnabled: boolean;
  blacklistedIps: string[];
  whitelistedIps: string[];
  whitelistOnlyMode: boolean;
}

const defaultFirewallConfig: FirewallConfig = {
  enabled: true,
  securityHeadersEnabled: true,
  sanitizerEnabled: true,
  bruteForceProtectionEnabled: true,
  blacklistedIps: [],
  whitelistedIps: [],
  whitelistOnlyMode: false
};

let currentFirewallConfig: FirewallConfig = { ...defaultFirewallConfig };

export function getFirewallConfig(): FirewallConfig {
  return currentFirewallConfig;
}

export function saveFirewallConfig(config: Partial<FirewallConfig>) {
  currentFirewallConfig = { ...defaultFirewallConfig, ...config };
}

// Auth Brute Force Lockout Store
export interface LockoutRecord {
  ip: string;
  failedCount: number;
  firstFailedAt: string;
  lockedUntil: string | null;
}

const lockoutsMemoryStore: Record<string, LockoutRecord> = {};

export function getLockoutsStore(): Record<string, LockoutRecord> {
  return lockoutsMemoryStore;
}

// 1. Get Rate Limit Status
securityRouter.get("/rate-limit-status", (_req: Request, res: Response) => {
  res.json({
    config: currentRateLimitConfig,
    metrics: {
      totalRequestsProcessed: rateLimitMetrics.totalRequestsProcessed,
      totalBlocked429: rateLimitMetrics.totalBlocked429,
      recentViolations: rateLimitMetrics.recentViolations.slice(-50)
    }
  });
});

// 2. Update Rate Limit Config
securityRouter.post("/rate-limit-config", requireAdmin, (req: Request, res: Response) => {
  try {
    const config = req.body;
    saveRateLimitConfig(config);
    res.json({ success: true, message: "Configurações de Rate Limiting atualizadas com sucesso.", config: currentRateLimitConfig });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Erro ao atualizar rate limit.";
    res.status(500).json({ error: errorMsg });
  }
});

// 3. Get Firewall Status
securityRouter.get("/firewall-status", (_req: Request, res: Response) => {
  res.json({
    config: currentFirewallConfig,
    activeLockouts: Object.values(lockoutsMemoryStore).filter(l => l.lockedUntil && new Date(l.lockedUntil) > new Date())
  });
});

// 4. Update Firewall Config
securityRouter.post("/firewall-config", requireAdmin, (req: Request, res: Response) => {
  try {
    saveFirewallConfig(req.body);
    res.json({ success: true, message: "Configurações do Firewall atualizadas.", config: currentFirewallConfig });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Erro ao atualizar firewall.";
    res.status(500).json({ error: errorMsg });
  }
});

// 5. Add IP Rule
securityRouter.post("/ip-rules/add", requireAdmin, (req: Request, res: Response) => {
  try {
    const { ip, listType } = req.body;
    if (!ip || !listType) {
      return res.status(400).json({ error: "IP e listType (blacklist | whitelist) são obrigatórios." });
    }

    if (listType === "blacklist") {
      if (!currentFirewallConfig.blacklistedIps.includes(ip)) {
        currentFirewallConfig.blacklistedIps.push(ip);
      }
    } else if (listType === "whitelist") {
      if (!currentFirewallConfig.whitelistedIps.includes(ip)) {
        currentFirewallConfig.whitelistedIps.push(ip);
      }
    }

    res.json({ success: true, message: `IP ${ip} adicionado à ${listType}.`, config: currentFirewallConfig });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Erro ao adicionar regra de IP.";
    res.status(500).json({ error: errorMsg });
  }
});

// 6. Remove IP Rule
securityRouter.post("/ip-rules/remove", requireAdmin, (req: Request, res: Response) => {
  try {
    const { ip, listType } = req.body;
    if (listType === "blacklist") {
      currentFirewallConfig.blacklistedIps = currentFirewallConfig.blacklistedIps.filter(i => i !== ip);
    } else if (listType === "whitelist") {
      currentFirewallConfig.whitelistedIps = currentFirewallConfig.whitelistedIps.filter(i => i !== ip);
    }
    res.json({ success: true, message: `IP ${ip} removido da ${listType}.`, config: currentFirewallConfig });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Erro ao remover regra de IP.";
    res.status(500).json({ error: errorMsg });
  }
});

// 7. Unlock IP
securityRouter.post("/unlock-ip", requireAdmin, (req: Request, res: Response) => {
  try {
    const { ip } = req.body;
    if (ip && lockoutsMemoryStore[ip]) {
      delete lockoutsMemoryStore[ip];
    }
    res.json({ success: true, message: `IP ${ip} desbloqueado com sucesso.` });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Erro ao desbloquear IP.";
    res.status(500).json({ error: errorMsg });
  }
});
