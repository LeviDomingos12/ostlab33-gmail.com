import { describe, it, expect } from "vitest";
import { Branch, Product, Transaction, CashFlowEntry, Employee, SystemSettings } from "../types";
import { initialBranches, initialProducts, initialEmployees } from "../data/mockData";

describe("Phase 14: Multi-Loja & Supervisão Centralizada (OST Vendas)", () => {
  it("should have initial branches correctly configured with Sede and Filiais", () => {
    expect(initialBranches).toBeDefined();
    expect(initialBranches.length).toBeGreaterThanOrEqual(3);

    const central = initialBranches.find(b => b.id === "central");
    expect(central).toBeDefined();
    expect(central?.name).toContain("Sede Principal");
    expect(central?.isMainStore).toBe(true);
    expect(central?.code).toBe("MAP-01");

    const matola = initialBranches.find(b => b.id === "filial_matola");
    expect(matola).toBeDefined();
    expect(matola?.name).toContain("Matola");
    expect(matola?.status).toBe("ACTIVE");

    const beira = initialBranches.find(b => b.id === "filial_beira");
    expect(beira).toBeDefined();
    expect(beira?.name).toContain("Beira");
    expect(beira?.status).toBe("ACTIVE");
  });

  it("should correctly calculate branch-specific stock versus global stock", () => {
    const testProduct: Product = {
      id: "prod-test-01",
      code: "PRD-01",
      name: "Arroz Premium 25kg",
      category: "Mercearia",
      costPrice: 1200,
      salePrice: 1650,
      stock: 100,
      minStock: 10,
      unit: "Saco",
      supplier: "Distribuidora Central",
      vatRate: 16,
      branchStocks: {
        central: 50,
        filial_matola: 30,
        filial_beira: 20
      }
    };

    const getBranchStock = (p: Product, branchId: string) => {
      return p.branchStocks?.[branchId] !== undefined ? p.branchStocks[branchId] : p.stock;
    };

    expect(getBranchStock(testProduct, "central")).toBe(50);
    expect(getBranchStock(testProduct, "filial_matola")).toBe(30);
    expect(getBranchStock(testProduct, "filial_beira")).toBe(20);
    // Non-configured branch falls back to global stock
    expect(getBranchStock(testProduct, "filial_nampula")).toBe(100);
  });

  it("should correctly perform an inter-branch stock transfer", () => {
    let product: Product = {
      id: "prod-test-02",
      code: "PRD-02",
      name: "Óleo Vegetal 5L",
      category: "Mercearia",
      costPrice: 450,
      salePrice: 650,
      stock: 80,
      minStock: 5,
      unit: "Un",
      supplier: "Distribuidora Central",
      vatRate: 16,
      branchStocks: {
        central: 60,
        filial_matola: 20
      }
    };

    const transferQty = 15;
    const originBranch = "central";
    const destBranch = "filial_matola";

    const originStock = product.branchStocks?.[originBranch] ?? product.stock;
    expect(originStock).toBeGreaterThanOrEqual(transferQty);

    // Apply transfer
    const updatedBranchStocks = { ...(product.branchStocks || {}) };
    updatedBranchStocks[originBranch] = originStock - transferQty;
    const currentDest = updatedBranchStocks[destBranch] ?? 0;
    updatedBranchStocks[destBranch] = currentDest + transferQty;

    product = {
      ...product,
      branchStocks: updatedBranchStocks
    };

    expect(product.branchStocks?.[originBranch]).toBe(45);
    expect(product.branchStocks?.[destBranch]).toBe(35);
    // Total stock preserved across branches
    const totalDistributed = (product.branchStocks?.central || 0) + (product.branchStocks?.filial_matola || 0);
    expect(totalDistributed).toBe(80);
  });

  it("should isolate transactions by store and compute consolidated metrics", () => {
    const transactions: Transaction[] = [
      {
        id: "tx-1",
        invoiceNumber: "FT 2026/001",
        timestamp: new Date().toISOString(),
        subtotal: 5000,
        vatTotal: 0,
        discountTotal: 0,
        grandTotal: 5000,
        amountPaid: 5000,
        changeAmount: 0,
        paymentMethod: "CASH",
        branchId: "central",
        cashierName: "Operador Central",
        items: []
      },
      {
        id: "tx-2",
        invoiceNumber: "FT 2026/002",
        timestamp: new Date().toISOString(),
        subtotal: 3000,
        vatTotal: 0,
        discountTotal: 0,
        grandTotal: 3000,
        amountPaid: 3000,
        changeAmount: 0,
        paymentMethod: "MPESA_PAGA_FACIL",
        branchId: "filial_matola",
        cashierName: "Operador Matola",
        items: []
      },
      {
        id: "tx-3",
        invoiceNumber: "FT 2026/003",
        timestamp: new Date().toISOString(),
        subtotal: 2000,
        vatTotal: 0,
        discountTotal: 0,
        grandTotal: 2000,
        amountPaid: 2000,
        changeAmount: 0,
        paymentMethod: "CASH",
        branchId: "filial_matola",
        cashierName: "Operador Matola",
        items: []
      }
    ];

    // Branch isolation
    const centralSales = transactions.filter(t => (t.branchId || "central") === "central");
    const matolaSales = transactions.filter(t => t.branchId === "filial_matola");

    expect(centralSales.length).toBe(1);
    expect(centralSales[0].grandTotal).toBe(5000);

    expect(matolaSales.length).toBe(2);
    const matolaTotal = matolaSales.reduce((acc, t) => acc + t.grandTotal, 0);
    expect(matolaTotal).toBe(5000);

    // Consolidated metrics
    const totalNetworkRevenue = transactions.reduce((acc, t) => acc + t.grandTotal, 0);
    expect(totalNetworkRevenue).toBe(10000);
    expect(transactions.length).toBe(3);
  });

  it("should isolate cash flow entries by branch", () => {
    const cashFlow: CashFlowEntry[] = [
      {
        id: "cf-1",
        timestamp: new Date().toISOString(),
        type: "INPUT",
        amount: 5000,
        reason: "Venda POS",
        responsibleUser: "Operador 1",
        branchId: "central"
      },
      {
        id: "cf-2",
        timestamp: new Date().toISOString(),
        type: "SANGRIA",
        amount: 1000,
        reason: "Sangria para cofre",
        responsibleUser: "Operador 1",
        branchId: "central"
      },
      {
        id: "cf-3",
        timestamp: new Date().toISOString(),
        type: "INPUT",
        amount: 3500,
        reason: "Venda POS",
        responsibleUser: "Operador 2",
        branchId: "filial_beira"
      }
    ];

    const centralCash = cashFlow.filter(c => (c.branchId || "central") === "central");
    const beiraCash = cashFlow.filter(c => c.branchId === "filial_beira");

    expect(centralCash.length).toBe(2);
    const centralNet = centralCash.reduce((acc, c) => acc + (c.type === "INPUT" ? c.amount : -c.amount), 0);
    expect(centralNet).toBe(4000);

    expect(beiraCash.length).toBe(1);
    expect(beiraCash[0].amount).toBe(3500);
  });

  it("should support staff assignment to specific branches", () => {
    const employees: Employee[] = [
      {
        id: "emp-1",
        name: "Carlos Matola",
        role: "Operador de Caixa",
        contact: "+258841112222",
        salary: 15000,
        admissionDate: "2026-01-10",
        status: "ACTIVE",
        assignedBranchId: "filial_matola",
        allowedBranchIds: ["filial_matola"]
      },
      {
        id: "emp-2",
        name: "Admin Geral",
        role: "Administrador",
        contact: "+258849990000",
        salary: 45000,
        admissionDate: "2026-01-01",
        status: "ACTIVE",
        assignedBranchId: "central",
        allowedBranchIds: ["central", "filial_matola", "filial_beira"]
      }
    ];

    const matolaStaff = employees.filter(e => e.assignedBranchId === "filial_matola");
    expect(matolaStaff.length).toBe(1);
    expect(matolaStaff[0].name).toBe("Carlos Matola");

    const admin = employees.find(e => e.id === "emp-2");
    expect(admin?.allowedBranchIds).toContain("central");
    expect(admin?.allowedBranchIds).toContain("filial_matola");
    expect(admin?.allowedBranchIds).toContain("filial_beira");
  });
});
