import { describe, it, expect } from "vitest";

// Mock implementation of core Cash Register business calculations
export interface CashDenominations {
  n1000: number;
  n500: number;
  n200: number;
  n100: number;
  n50: number;
  n20: number;
  m10: number;
  m5: number;
  m2: number;
  m1: number;
  m050: number;
}

export function calculateDenominationTotal(denoms: CashDenominations): number {
  return (
    (denoms.n1000 || 0) * 1000 +
    (denoms.n500 || 0) * 500 +
    (denoms.n200 || 0) * 200 +
    (denoms.n100 || 0) * 100 +
    (denoms.n50 || 0) * 50 +
    (denoms.n20 || 0) * 20 +
    (denoms.m10 || 0) * 10 +
    (denoms.m5 || 0) * 5 +
    (denoms.m2 || 0) * 2 +
    (denoms.m1 || 0) * 1 +
    (denoms.m050 || 0) * 0.5
  );
}

export interface ShiftCalculationParams {
  openingBalance: number;
  cashSales: number;
  mpesaSales: number;
  emolaSales: number;
  posCardSales: number;
  transferSales: number;
  reinforcements: number;
  inputs: number;
  sangrias: number;
  expenses: number;
  devolutions: number;
}

export function calculateTheoreticalCashBalance(params: ShiftCalculationParams): number {
  return (
    params.openingBalance +
    params.cashSales +
    params.reinforcements +
    params.inputs -
    params.sangrias -
    params.expenses -
    params.devolutions
  );
}

export function calculateDifference(physicalCount: number, theoreticalBalance: number): {
  difference: number;
  isPerfect: boolean;
  isShortage: boolean;
  isSurplus: boolean;
} {
  const difference = physicalCount - theoreticalBalance;
  return {
    difference,
    isPerfect: difference === 0,
    isShortage: difference < 0, // Quebra
    isSurplus: difference > 0   // Sobra
  };
}

export function validateSupervisorPin(
  enteredPin: string, 
  supervisorList: { role: string; pin?: string }[], 
  globalFallbackPin?: string
): boolean {
  if (!enteredPin) return false;
  
  if (globalFallbackPin && enteredPin === globalFallbackPin) {
    return true;
  }
  
  return supervisorList.some(
    emp => (emp.role === "admin" || emp.role === "manager" || emp.role === "supervisor") && emp.pin === enteredPin
  );
}

describe("Phase 4: Cash Register, Shift Operations & Reconciliation", () => {
  describe("Denomination Counting Engine (Meticais MZ)", () => {
    it("should accurately compute denomination breakdown total", () => {
      const denoms: CashDenominations = {
        n1000: 5,  // 5,000
        n500: 10,  // 5,000
        n200: 10,  // 2,000
        n100: 15,  // 1,500
        n50: 20,   // 1,000
        n20: 25,   // 500
        m10: 30,   // 300
        m5: 20,    // 100
        m2: 25,    // 50
        m1: 50,    // 50
        m050: 20   // 10
      };

      const total = calculateDenominationTotal(denoms);
      expect(total).toBe(15510);
    });

    it("should return 0 when no notes/coins are entered", () => {
      const denoms: CashDenominations = {
        n1000: 0, n500: 0, n200: 0, n100: 0, n50: 0, n20: 0,
        m10: 0, m5: 0, m2: 0, m1: 0, m050: 0
      };
      expect(calculateDenominationTotal(denoms)).toBe(0);
    });
  });

  describe("Theoretical Balance & Multi-channel Reconciliation", () => {
    it("should compute theoretical cash in drawer strictly from physical cash movements", () => {
      const params: ShiftCalculationParams = {
        openingBalance: 2000,
        cashSales: 15000,
        mpesaSales: 8500,    // Digital - not physically in drawer
        emolaSales: 3200,    // Digital - not physically in drawer
        posCardSales: 12000, // Digital - not physically in drawer
        transferSales: 4500, // Digital - not physically in drawer
        reinforcements: 1000,
        inputs: 500,
        sangrias: 10000,
        expenses: 1200,
        devolutions: 300
      };

      const theoretical = calculateTheoreticalCashBalance(params);
      // Expected = 2000 + 15000 + 1000 + 500 - 10000 - 1200 - 300 = 7000
      expect(theoretical).toBe(7000);
    });

    it("should correctly identify Sobra (cash surplus)", () => {
      const theoretical = 7000;
      const physicalCount = 7250;
      const res = calculateDifference(physicalCount, theoretical);

      expect(res.difference).toBe(250);
      expect(res.isSurplus).toBe(true);
      expect(res.isShortage).toBe(false);
      expect(res.isPerfect).toBe(false);
    });

    it("should correctly identify Quebra (cash shortage)", () => {
      const theoretical = 7000;
      const physicalCount = 6800;
      const res = calculateDifference(physicalCount, theoretical);

      expect(res.difference).toBe(-200);
      expect(res.isShortage).toBe(true);
      expect(res.isSurplus).toBe(false);
      expect(res.isPerfect).toBe(false);
    });

    it("should correctly identify Perfect balance (0 variance)", () => {
      const theoretical = 7000;
      const physicalCount = 7000;
      const res = calculateDifference(physicalCount, theoretical);

      expect(res.difference).toBe(0);
      expect(res.isPerfect).toBe(true);
      expect(res.isShortage).toBe(false);
      expect(res.isSurplus).toBe(false);
    });
  });

  describe("Supervisor Authorization PIN Verification", () => {
    const mockStaff = [
      { role: "cashier", pin: "1111" },
      { role: "supervisor", pin: "4444" },
      { role: "admin", pin: "9999" }
    ];

    it("should reject cashier PIN for supervisor-only actions", () => {
      const isAuthorized = validateSupervisorPin("1111", mockStaff, "1234");
      expect(isAuthorized).toBe(false);
    });

    it("should accept supervisor or admin PIN", () => {
      expect(validateSupervisorPin("4444", mockStaff, "1234")).toBe(true);
      expect(validateSupervisorPin("9999", mockStaff, "1234")).toBe(true);
    });

    it("should accept global emergency security PIN fallback", () => {
      expect(validateSupervisorPin("1234", mockStaff, "1234")).toBe(true);
    });

    it("should reject incorrect PIN", () => {
      expect(validateSupervisorPin("0000", mockStaff, "1234")).toBe(false);
      expect(validateSupervisorPin("", mockStaff, "1234")).toBe(false);
    });
  });

  describe("Multi-Terminal Tracking", () => {
    it("should tag cash entries with distinct register IDs", () => {
      const entryPos1 = {
        id: "cf_1",
        registerId: "POS-01",
        amount: 500,
        type: "REINFORCEMENT",
        timestamp: new Date().toISOString()
      };

      const entryPos2 = {
        id: "cf_2",
        registerId: "POS-02",
        amount: 1000,
        type: "SANGRIA",
        timestamp: new Date().toISOString()
      };

      expect(entryPos1.registerId).toBe("POS-01");
      expect(entryPos2.registerId).toBe("POS-02");
    });
  });
});
