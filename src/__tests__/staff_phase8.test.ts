import { describe, it, expect } from "vitest";
import { Employee, UserRole, AuditLog } from "../types";

// ==========================================
// Phase 8: HR, Staff, RBAC & Payroll Logic
// ==========================================

export interface RolePermissions {
  canAccessPos: boolean;
  canAccessStock: boolean;
  canAccessCash: boolean;
  canAccessCustomers: boolean;
  canAccessReports: boolean;
  canAccessStaff: boolean;
  canAccessSettings: boolean;
  canPerformSangria: boolean;
  canApproveRefunds: boolean;
  canChangePrices: boolean;
}

export function getRolePermissions(role: UserRole): RolePermissions {
  switch (role) {
    case "ADMIN":
      return {
        canAccessPos: true,
        canAccessStock: true,
        canAccessCash: true,
        canAccessCustomers: true,
        canAccessReports: true,
        canAccessStaff: true,
        canAccessSettings: true,
        canPerformSangria: true,
        canApproveRefunds: true,
        canChangePrices: true
      };
    case "SUPERVISOR":
      return {
        canAccessPos: true,
        canAccessStock: true,
        canAccessCash: true,
        canAccessCustomers: true,
        canAccessReports: true,
        canAccessStaff: false,
        canAccessSettings: false,
        canPerformSangria: true,
        canApproveRefunds: true,
        canChangePrices: false
      };
    case "AUDITOR":
    case "FINANCEIRO":
      return {
        canAccessPos: false,
        canAccessStock: true,
        canAccessCash: true,
        canAccessCustomers: true,
        canAccessReports: true,
        canAccessStaff: false,
        canAccessSettings: false,
        canPerformSangria: false,
        canApproveRefunds: false,
        canChangePrices: false
      };
    case "RH":
      return {
        canAccessPos: false,
        canAccessStock: false,
        canAccessCash: false,
        canAccessCustomers: false,
        canAccessReports: false,
        canAccessStaff: true,
        canAccessSettings: false,
        canPerformSangria: false,
        canApproveRefunds: false,
        canChangePrices: false
      };
    case "CASHIER":
    default:
      return {
        canAccessPos: true,
        canAccessStock: false,
        canAccessCash: true, // Only daily operations
        canAccessCustomers: true,
        canAccessReports: false,
        canAccessStaff: false,
        canAccessSettings: false,
        canPerformSangria: false, // Requires supervisor
        canApproveRefunds: false,  // Requires supervisor
        canChangePrices: false
      };
  }
}

export function calculateStaffCommission(
  salesTotal: number,
  commissionRatePercent: number = 2.5
): number {
  if (salesTotal <= 0 || commissionRatePercent <= 0) return 0;
  return parseFloat(((salesTotal * commissionRatePercent) / 100).toFixed(2));
}

export function calculatePayrollNetSalary(
  baseSalary: number,
  commissions: number = 0,
  bonuses: number = 0,
  deductions: number = 0, // INSS (3% trabalhador em Moçambique) + adiantamentos
  inssRatePercent: number = 3
): {
  grossSalary: number;
  inssDeduction: number;
  otherDeductions: number;
  netSalary: number;
} {
  const grossSalary = baseSalary + commissions + bonuses;
  const inssDeduction = parseFloat(((baseSalary * inssRatePercent) / 100).toFixed(2));
  const totalDeductions = inssDeduction + deductions;
  const netSalary = Math.max(0, parseFloat((grossSalary - totalDeductions).toFixed(2)));

  return {
    grossSalary,
    inssDeduction,
    otherDeductions: deductions,
    netSalary
  };
}

export function createAuditTrailEntry(
  actor: Employee,
  action: string,
  module: string,
  details: string,
  ipAddress: string = "127.0.0.1"
): AuditLog {
  return {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    user: actor.name,
    userRole: actor.role as UserRole,
    action,
    module,
    details,
    ip: ipAddress
  };
}

// ==========================================
// Test Suite: Phase 8 - Staff & Security
// ==========================================

describe("Phase 8: Gestão de Recursos Humanos, Folha Salarial, RBAC e Auditoria de Segurança", () => {
  describe("Matriz de Controle de Acesso Baseado em Funções (RBAC)", () => {
    it("Admin deve possuir acesso total e irrestrito ao sistema", () => {
      const perms = getRolePermissions("ADMIN");
      expect(perms.canAccessPos).toBe(true);
      expect(perms.canAccessStock).toBe(true);
      expect(perms.canAccessCash).toBe(true);
      expect(perms.canAccessReports).toBe(true);
      expect(perms.canAccessStaff).toBe(true);
      expect(perms.canAccessSettings).toBe(true);
      expect(perms.canApproveRefunds).toBe(true);
    });

    it("Operador de Caixa não deve ter acesso a Configurações, RH ou Relatórios Gerenciais", () => {
      const perms = getRolePermissions("CASHIER");
      expect(perms.canAccessPos).toBe(true);
      expect(perms.canAccessStock).toBe(false);
      expect(perms.canAccessReports).toBe(false);
      expect(perms.canAccessStaff).toBe(false);
      expect(perms.canAccessSettings).toBe(false);
      expect(perms.canPerformSangria).toBe(false);
      expect(perms.canApproveRefunds).toBe(false);
    });

    it("Auditor deve ter acesso a relatórios e livros sem acesso de operador POS", () => {
      const perms = getRolePermissions("AUDITOR");
      expect(perms.canAccessStock).toBe(true);
      expect(perms.canAccessCash).toBe(true);
      expect(perms.canAccessPos).toBe(false);
      expect(perms.canAccessReports).toBe(true);
    });
  });

  describe("Cálculo de Comissões e Folha Salarial (Moçambique)", () => {
    it("deve calcular comissões de vendas com precisão", () => {
      // Vendas: 100,000 MT a 3% de comissão -> 3,000 MT
      const commission = calculateStaffCommission(100000, 3);
      expect(commission).toBe(3000);
    });

    it("deve processar folha de pagamento com dedução de INSS (3%) e adiantamentos", () => {
      // Salário Base: 25,000 MT
      // Comissões: 5,000 MT
      // Bônus: 2,000 MT
      // Salário Bruto: 32,000 MT
      // INSS (3% sobre base 25,000): 750 MT
      // Adiantamentos: 1,500 MT
      // Salário Líquido: 32,000 - 750 - 1,500 = 29,750 MT
      const payroll = calculatePayrollNetSalary(25000, 5000, 2000, 1500, 3);

      expect(payroll.grossSalary).toBe(32000);
      expect(payroll.inssDeduction).toBe(750);
      expect(payroll.otherDeductions).toBe(1500);
      expect(payroll.netSalary).toBe(29750);
    });
  });

  describe("Trilha de Auditoria e Logs de Segurança", () => {
    const mockAdmin: Employee = {
      id: "emp-1",
      name: "Administrador Central",
      email: "admin@empresa.co.mz",
      role: "ADMIN",
      contact: "841112233",
      salary: 45000,
      admissionDate: "2024-01-01",
      status: "ACTIVE",
      pin: "9999"
    };

    it("deve gerar entrada de log de auditoria com carimbo de tempo, IP e identificação do autor", () => {
      const entry = createAuditTrailEntry(
        mockAdmin,
        "SANGRIAS_AUTORIZADAS",
        "CASH_REGISTER",
        "Autorizou sangria no valor de 10,000 MZN para o cofre",
        "192.168.1.50"
      );

      expect(entry.user).toBe("Administrador Central");
      expect(entry.userRole).toBe("ADMIN");
      expect(entry.action).toBe("SANGRIAS_AUTORIZADAS");
      expect(entry.module).toBe("CASH_REGISTER");
      expect(entry.details).toContain("10,000 MZN");
      expect(entry.ip).toBe("192.168.1.50");
      expect(entry.timestamp).toBeDefined();
    });
  });
});
