import { describe, it, expect } from "vitest";
import { Customer } from "../types";

// ==========================================
// Phase 6: CRM, Credit / Debt & Loyalty Logic
// ==========================================

export function calculateCustomerCreditEligibility(
  customer: Customer,
  purchaseAmount: number
): {
  eligible: boolean;
  currentDebt: number;
  creditLimit: number;
  availableCredit: number;
  resultingDebt: number;
  reason?: string;
} {
  const currentDebt = customer.debt || 0;
  const creditLimit = customer.creditLimit ?? 10000; // Default limit if not specified
  const availableCredit = Math.max(0, creditLimit - currentDebt);
  const resultingDebt = currentDebt + purchaseAmount;

  if (purchaseAmount <= 0) {
    return {
      eligible: false,
      currentDebt,
      creditLimit,
      availableCredit,
      resultingDebt: currentDebt,
      reason: "O valor da compra a crédito deve ser superior a zero."
    };
  }

  if (resultingDebt > creditLimit) {
    return {
      eligible: false,
      currentDebt,
      creditLimit,
      availableCredit,
      resultingDebt,
      reason: `Limite de crédito excedido. Disponível: ${availableCredit.toLocaleString()} MT, Solicitado: ${purchaseAmount.toLocaleString()} MT`
    };
  }

  return {
    eligible: true,
    currentDebt,
    creditLimit,
    availableCredit,
    resultingDebt
  };
}

export function amortizeCustomerDebt(
  customer: Customer,
  paidAmount: number,
  operator: string = "Operador",
  paymentMethod: "CASH" | "MPESA" | "EMOLA" | "POS_BIM" | "TRANSFER" = "CASH"
): {
  updatedCustomer: Customer;
  settledAmount: number;
  remainingDebt: number;
  excessPayment: number;
  cashFlowEntry: {
    amount: number;
    reason: string;
    type: "INPUT";
    responsibleUser: string;
    destination: string;
  };
} {
  const currentDebt = customer.debt || 0;
  const settledAmount = Math.min(currentDebt, paidAmount);
  const remainingDebt = Math.max(0, currentDebt - paidAmount);
  const excessPayment = Math.max(0, paidAmount - currentDebt);

  const updatedCustomer: Customer = {
    ...customer,
    debt: remainingDebt,
    totalSpent: (customer.totalSpent || 0) + settledAmount
  };

  const cashFlowEntry = {
    amount: settledAmount,
    reason: `Amortização de Dívida / Conta Corrente - Cliente: ${customer.name} (Pago via ${paymentMethod})`,
    type: "INPUT" as const,
    responsibleUser: operator,
    destination: "Entrada em Caixa (Cobrança de Dívida)"
  };

  return {
    updatedCustomer,
    settledAmount,
    remainingDebt,
    excessPayment,
    cashFlowEntry
  };
}

export function calculateLoyaltyPoints(
  purchaseAmount: number,
  pointsPer100MT: number = 1
): number {
  if (purchaseAmount <= 0) return 0;
  return Math.floor((purchaseAmount / 100) * pointsPer100MT);
}

export function redeemLoyaltyPoints(
  customer: Customer,
  pointsToRedeem: number,
  pointsValueInMT: number = 1 // 1 ponto = 1 MT
): {
  success: boolean;
  discountAmount: number;
  remainingPoints: number;
  errorMessage?: string;
} {
  const currentPoints = customer.loyaltyPoints || 0;

  if (pointsToRedeem <= 0) {
    return {
      success: false,
      discountAmount: 0,
      remainingPoints: currentPoints,
      errorMessage: "A quantidade de pontos para resgate deve ser positiva."
    };
  }

  if (pointsToRedeem > currentPoints) {
    return {
      success: false,
      discountAmount: 0,
      remainingPoints: currentPoints,
      errorMessage: `Pontos insuficientes. O cliente possui apenas ${currentPoints} pontos.`
    };
  }

  const discountAmount = pointsToRedeem * pointsValueInMT;
  const remainingPoints = currentPoints - pointsToRedeem;

  return {
    success: true,
    discountAmount,
    remainingPoints
  };
}

export function filterCustomersBySegment(
  customers: Customer[],
  segment: "ALL" | "VIP" | "DEBT" | "INACTIVE" | "LOYALTY_HIGH"
): Customer[] {
  switch (segment) {
    case "VIP":
      return customers.filter(c => (c.totalSpent || 0) >= 50000 || (c.loyaltyPoints || 0) >= 500);
    case "DEBT":
      return customers.filter(c => (c.debt || 0) > 0);
    case "INACTIVE":
      return customers.filter(c => !c.lastPurchaseDate || (new Date().getTime() - new Date(c.lastPurchaseDate).getTime()) > 60 * 24 * 60 * 60 * 1000);
    case "LOYALTY_HIGH":
      return customers.filter(c => (c.loyaltyPoints || 0) >= 200);
    case "ALL":
    default:
      return customers;
  }
}

// ==========================================
// Test Suite: Phase 6 - CRM & Loyalty
// ==========================================

describe("Phase 6: Gestão de Clientes, Contas Correntes, Crédito/Dívidas e Fidelização", () => {
  const mockCustomer: Customer = {
    id: "cust-101",
    name: "Empresa Construções Maputo Lda",
    email: "financeiro@construcoes.co.mz",
    phone: "+258 84 123 4567",
    address: "Av. 24 de Julho, Maputo",
    nuit: "400987654",
    debt: 3500,
    creditLimit: 15000,
    totalSpent: 45000,
    purchaseCount: 12,
    loyaltyPoints: 350,
    lastPurchaseDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] // Compra recente (5 dias atrás)
  };

  describe("Avaliação de Limite de Crédito / Venda a Prazo", () => {
    it("deve aprovar compra a crédito dentro do limite disponível", () => {
      // Dívida atual: 3500, Limite: 15000 -> Disponível: 11500
      // Compra: 5000 -> Nova dívida: 8500 <= 15000 (Aprovado)
      const evaluation = calculateCustomerCreditEligibility(mockCustomer, 5000);
      expect(evaluation.eligible).toBe(true);
      expect(evaluation.availableCredit).toBe(11500);
      expect(evaluation.resultingDebt).toBe(8500);
    });

    it("deve recusar compra a crédito que exceda o limite contratado", () => {
      // Compra: 12000 -> Nova dívida: 15500 > 15000 (Recusado)
      const evaluation = calculateCustomerCreditEligibility(mockCustomer, 12000);
      expect(evaluation.eligible).toBe(false);
      expect(evaluation.resultingDebt).toBe(15500);
      expect(evaluation.reason).toContain("Limite de crédito excedido");
    });
  });

  describe("Amortização e Quitação de Dívida de Conta Corrente", () => {
    it("deve liquidar dívida parcial e emitir lançamento de caixa correspondente", () => {
      // Dívida: 3500 MT, Pagamento parcial: 2000 MT
      const result = amortizeCustomerDebt(mockCustomer, 2000, "Caixa Central", "MPESA");

      expect(result.settledAmount).toBe(2000);
      expect(result.remainingDebt).toBe(1500);
      expect(result.updatedCustomer.debt).toBe(1500);
      expect(result.cashFlowEntry.amount).toBe(2000);
      expect(result.cashFlowEntry.type).toBe("INPUT");
      expect(result.cashFlowEntry.reason).toContain("Empresa Construções Maputo Lda");
    });

    it("deve quitar integralmente a dívida e identificar eventual troco/excesso", () => {
      // Dívida: 3500 MT, Pagamento: 4000 MT
      const result = amortizeCustomerDebt(mockCustomer, 4000, "Supervisor", "CASH");

      expect(result.settledAmount).toBe(3500);
      expect(result.remainingDebt).toBe(0);
      expect(result.excessPayment).toBe(500);
      expect(result.updatedCustomer.debt).toBe(0);
    });
  });

  describe("Programa de Fidelização (Loyalty Points)", () => {
    it("deve calcular pontos de fidelização ganhos em compras (1 ponto a cada 100 MT)", () => {
      expect(calculateLoyaltyPoints(2500)).toBe(25);
      expect(calculateLoyaltyPoints(950)).toBe(9);
      expect(calculateLoyaltyPoints(50)).toBe(0);
    });

    it("deve resgatar pontos com sucesso quando o cliente tem saldo suficiente", () => {
      // Saldo: 350 pontos, Resgate: 100 pontos (100 MT desconto)
      const result = redeemLoyaltyPoints(mockCustomer, 100, 1);
      expect(result.success).toBe(true);
      expect(result.discountAmount).toBe(100);
      expect(result.remainingPoints).toBe(250);
    });

    it("deve rejeitar resgate de pontos superior ao saldo acumulado", () => {
      const result = redeemLoyaltyPoints(mockCustomer, 500, 1);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("Pontos insuficientes");
    });
  });

  describe("Segmentação de Carteira de Clientes", () => {
    const customerList: Customer[] = [
      mockCustomer, // Dívida: 3500, Gastos: 45000, Pontos: 350
      {
        id: "cust-102",
        name: "Cliente VIP 1",
        email: "vip@mz.com",
        phone: "840000001",
        debt: 0,
        totalSpent: 65000,
        purchaseCount: 20,
        loyaltyPoints: 600,
        lastPurchaseDate: new Date().toISOString(),
        address: "Maputo",
        nuit: "400111222"
      },
      {
        id: "cust-103",
        name: "Cliente Inativo",
        email: "inativo@mz.com",
        phone: "840000002",
        debt: 0,
        totalSpent: 1200,
        purchaseCount: 1,
        loyaltyPoints: 10,
        lastPurchaseDate: "2025-01-01", // > 60 dias
        address: "Matola",
        nuit: "400333444"
      }
    ];

    it("deve filtrar clientes com dívidas ativas", () => {
      const debtCustomers = filterCustomersBySegment(customerList, "DEBT");
      expect(debtCustomers.length).toBe(1);
      expect(debtCustomers[0].id).toBe("cust-101");
    });

    it("deve filtrar clientes VIP por volume de compras ou pontos", () => {
      const vipCustomers = filterCustomersBySegment(customerList, "VIP");
      expect(vipCustomers.length).toBe(1);
      expect(vipCustomers[0].id).toBe("cust-102");
    });

    it("deve filtrar clientes inativos para campanhas de reengajamento", () => {
      const inactiveCustomers = filterCustomersBySegment(customerList, "INACTIVE");
      expect(inactiveCustomers.length).toBe(1);
      expect(inactiveCustomers[0].id).toBe("cust-103");
    });
  });
});
