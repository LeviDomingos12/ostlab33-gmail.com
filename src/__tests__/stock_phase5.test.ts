import { describe, it, expect } from "vitest";
import { Product, ProductBatch } from "../types";

// ==========================================
// Phase 5: Stock & Inventory Business Logic
// ==========================================

export function calculateProfitMargin(costPrice: number, salePrice: number): {
  marginPercent: number; // Margem sobre venda
  markupPercent: number; // Markup sobre custo
  profitValue: number;
} {
  const profitValue = salePrice - costPrice;
  const marginPercent = salePrice > 0 ? (profitValue / salePrice) * 100 : 0;
  const markupPercent = costPrice > 0 ? (profitValue / costPrice) * 100 : 0;

  return {
    marginPercent: parseFloat(marginPercent.toFixed(2)),
    markupPercent: parseFloat(markupPercent.toFixed(2)),
    profitValue: parseFloat(profitValue.toFixed(2))
  };
}

export function calculateWeightedAverageCost(
  currentStock: number,
  currentCost: number,
  incomingQuantity: number,
  incomingUnitCost: number
): number {
  const totalStock = currentStock + incomingQuantity;
  if (totalStock <= 0) return incomingUnitCost || currentCost;
  
  const totalValue = (currentStock * currentCost) + (incomingQuantity * incomingUnitCost);
  return parseFloat((totalValue / totalStock).toFixed(2));
}

export function getBatchExpirationStatus(expiryDateStr: string, referenceDate: Date = new Date()): {
  daysLeft: number;
  status: "EXPIRED" | "CRITICAL" | "SAFE" | "NORMAL";
} {
  const expiry = new Date(expiryDateStr);
  const diffTime = expiry.getTime() - referenceDate.getTime();
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let status: "EXPIRED" | "CRITICAL" | "SAFE" | "NORMAL" = "NORMAL";
  if (daysLeft < 0) {
    status = "EXPIRED";
  } else if (daysLeft <= 30) {
    status = "CRITICAL";
  } else if (daysLeft > 90) {
    status = "SAFE";
  }

  return { daysLeft, status };
}

export function deductBatchesStrategy(
  batches: ProductBatch[],
  quantityToDeduct: number,
  strategy: "FIFO" | "LIFO" = "FIFO"
): {
  updatedBatches: ProductBatch[];
  deductedQuantity: number;
  remainingToDeduct: number;
} {
  // Sort batches based on strategy
  const sorted = [...batches].sort((a, b) => {
    const dateA = new Date(a.expiryDate || a.receivedDate).getTime();
    const dateB = new Date(b.expiryDate || b.receivedDate).getTime();
    return strategy === "FIFO" ? dateA - dateB : dateB - dateA;
  });

  let needToDeduct = quantityToDeduct;
  const updatedBatches: ProductBatch[] = [];

  for (const batch of sorted) {
    if (needToDeduct <= 0) {
      updatedBatches.push(batch);
      continue;
    }

    if (batch.quantity <= needToDeduct) {
      needToDeduct -= batch.quantity;
      updatedBatches.push({ ...batch, quantity: 0 });
    } else {
      updatedBatches.push({ ...batch, quantity: batch.quantity - needToDeduct });
      needToDeduct = 0;
    }
  }

  const deductedQuantity = quantityToDeduct - needToDeduct;
  return {
    updatedBatches: updatedBatches.filter(b => b.quantity > 0),
    deductedQuantity,
    remainingToDeduct: needToDeduct
  };
}

export function executeBranchStockTransfer(
  product: Product,
  originBranchId: string,
  destinationBranchId: string,
  quantity: number
): {
  success: boolean;
  updatedProduct?: Product;
  errorMessage?: string;
} {
  const branchStocks = { ...(product.branchStocks || {}) };
  const originStock = branchStocks[originBranchId] ?? product.stock;

  if (originStock < quantity) {
    return {
      success: false,
      errorMessage: `Estoque insuficiente na filial de origem (${originStock} disponível, ${quantity} solicitado)`
    };
  }

  branchStocks[originBranchId] = originStock - quantity;
  branchStocks[destinationBranchId] = (branchStocks[destinationBranchId] || 0) + quantity;

  return {
    success: true,
    updatedProduct: {
      ...product,
      branchStocks
    }
  };
}

export function checkStockAlerts(products: Product[]): {
  outOfStock: Product[];
  lowStock: Product[];
  adequateStock: Product[];
} {
  const outOfStock: Product[] = [];
  const lowStock: Product[] = [];
  const adequateStock: Product[] = [];

  products.forEach(p => {
    if (p.stock <= 0) {
      outOfStock.push(p);
    } else if (p.stock <= p.minStock) {
      lowStock.push(p);
    } else {
      adequateStock.push(p);
    }
  });

  return { outOfStock, lowStock, adequateStock };
}

export function calculateBlindInventoryDiscrepancy(
  theoreticalStock: number,
  physicalCount: number,
  unitCost: number
): {
  diffQuantity: number;
  financialImpact: number;
  type: "MATCH" | "SHORTAGE" | "SURPLUS";
} {
  const diffQuantity = physicalCount - theoreticalStock;
  const financialImpact = diffQuantity * unitCost;

  let type: "MATCH" | "SHORTAGE" | "SURPLUS" = "MATCH";
  if (diffQuantity < 0) type = "SHORTAGE";
  if (diffQuantity > 0) type = "SURPLUS";

  return {
    diffQuantity,
    financialImpact: parseFloat(financialImpact.toFixed(2)),
    type
  };
}

// ==========================================
// Test Suite: Phase 5 - Stock & Inventory
// ==========================================

describe("Phase 5: Gestão Avançada de Stock, Lotes, Validades e Fornecedores", () => {
  describe("Cálculos de Margem de Lucro e Markup", () => {
    it("deve calcular corretamente a margem de lucro e o markup para produto padrão", () => {
      // Custo: 100 MT, Venda: 150 MT -> Lucro: 50 MT
      // Margem sobre venda: (50/150)*100 = 33.33%
      // Markup sobre custo: (50/100)*100 = 50%
      const result = calculateProfitMargin(100, 150);
      expect(result.profitValue).toBe(50);
      expect(result.marginPercent).toBe(33.33);
      expect(result.markupPercent).toBe(50);
    });

    it("deve lidar com preço de venda igual a zero de forma segura", () => {
      const result = calculateProfitMargin(50, 0);
      expect(result.profitValue).toBe(-50);
      expect(result.marginPercent).toBe(0);
    });
  });

  describe("Custo Médio Ponderado (CMP) na Recepção de Fornecedor", () => {
    it("deve calcular o novo custo médio ponderado após nova entrada de mercadoria", () => {
      // Estoque atual: 100 un a 10 MT (Total: 1000 MT)
      // Nova entrada: 50 un a 13 MT (Total: 650 MT)
      // Total estoque: 150 un, Total valor: 1650 MT -> CMP = 1650 / 150 = 11 MT
      const newCost = calculateWeightedAverageCost(100, 10, 50, 13);
      expect(newCost).toBe(11);
    });

    it("deve manter o custo unitário de entrada se o estoque anterior for zero", () => {
      const newCost = calculateWeightedAverageCost(0, 0, 20, 250);
      expect(newCost).toBe(250);
    });
  });

  describe("Gestão de Validades e Status de Lotes", () => {
    const fixedToday = new Date("2026-08-28T00:00:00Z");

    it("deve marcar lote como EXPIRED se a data de validade já passou", () => {
      const result = getBatchExpirationStatus("2026-08-15", fixedToday);
      expect(result.status).toBe("EXPIRED");
      expect(result.daysLeft).toBeLessThan(0);
    });

    it("deve marcar lote como CRITICAL se faltar <= 30 dias para vencer", () => {
      const result = getBatchExpirationStatus("2026-09-15", fixedToday);
      expect(result.status).toBe("CRITICAL");
      expect(result.daysLeft).toBeGreaterThan(0);
      expect(result.daysLeft).toBeLessThanOrEqual(30);
    });

    it("deve marcar lote como SAFE se faltar mais de 90 dias", () => {
      const result = getBatchExpirationStatus("2027-01-01", fixedToday);
      expect(result.status).toBe("SAFE");
      expect(result.daysLeft).toBeGreaterThan(90);
    });
  });

  describe("Dedução de Lotes (FIFO vs LIFO)", () => {
    const mockBatches: ProductBatch[] = [
      {
        id: "b1",
        productId: "p1",
        productName: "Leite 1L",
        batchCode: "LOT-001",
        quantity: 10,
        initialQuantity: 10,
        expiryDate: "2026-09-01",
        costPrice: 50,
        receivedDate: "2026-08-01"
      },
      {
        id: "b2",
        productId: "p1",
        productName: "Leite 1L",
        batchCode: "LOT-002",
        quantity: 20,
        initialQuantity: 20,
        expiryDate: "2026-10-01",
        costPrice: 52,
        receivedDate: "2026-08-10"
      }
    ];

    it("no modelo FIFO deve deduzir primeiro o lote mais próximo do vencimento", () => {
      const result = deductBatchesStrategy(mockBatches, 15, "FIFO");
      expect(result.deductedQuantity).toBe(15);
      expect(result.remainingToDeduct).toBe(0);
      // O lote b1 (10 un) foi esgotado, sobram 15 un do lote b2 (20 - 5 = 15)
      expect(result.updatedBatches.length).toBe(1);
      expect(result.updatedBatches[0].id).toBe("b2");
      expect(result.updatedBatches[0].quantity).toBe(15);
    });

    it("no modelo LIFO deve deduzir primeiro o lote mais recente/tardio", () => {
      const result = deductBatchesStrategy(mockBatches, 15, "LIFO");
      expect(result.deductedQuantity).toBe(15);
      expect(result.remainingToDeduct).toBe(0);
      // No LIFO, b2 (20 un) é deduzido primeiro (20 - 15 = 5) e b1 permanece intacto (10)
      expect(result.updatedBatches.length).toBe(2);
      const b1 = result.updatedBatches.find(b => b.id === "b1");
      const b2 = result.updatedBatches.find(b => b.id === "b2");
      expect(b1?.quantity).toBe(10);
      expect(b2?.quantity).toBe(5);
    });
  });

  describe("Transferência entre Filiais / Multi-Armazém", () => {
    const mockProduct: Product = {
      id: "prod-100",
      name: "Arroz 25kg",
      code: "ARR25",
      category: "Cereais",
      supplier: "Fornecedor Central",
      costPrice: 1200,
      salePrice: 1600,
      vatRate: 16,
      stock: 100,
      minStock: 10,
      branchStocks: {
        "branch-maputo": 50,
        "branch-matola": 20
      }
    };

    it("deve transferir com sucesso quando houver estoque suficiente na origem", () => {
      const result = executeBranchStockTransfer(mockProduct, "branch-maputo", "branch-matola", 15);
      expect(result.success).toBe(true);
      expect(result.updatedProduct?.branchStocks?.["branch-maputo"]).toBe(35);
      expect(result.updatedProduct?.branchStocks?.["branch-matola"]).toBe(35);
    });

    it("deve bloquear transferência se a filial de origem não tiver estoque suficiente", () => {
      const result = executeBranchStockTransfer(mockProduct, "branch-matola", "branch-maputo", 50);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("Estoque insuficiente");
    });
  });

  describe("Classificação de Alertas de Ruptura de Stock", () => {
    const mockProducts: Product[] = [
      { id: "1", name: "P1", code: "C1", category: "G", supplier: "S", costPrice: 10, salePrice: 15, vatRate: 16, stock: 0, minStock: 5 },
      { id: "2", name: "P2", code: "C2", category: "G", supplier: "S", costPrice: 10, salePrice: 15, vatRate: 16, stock: 3, minStock: 5 },
      { id: "3", name: "P3", code: "C3", category: "G", supplier: "S", costPrice: 10, salePrice: 15, vatRate: 16, stock: 25, minStock: 5 }
    ];

    it("deve categorizar produtos corretamente em Esgotado, Stock Baixo e Adequado", () => {
      const alerts = checkStockAlerts(mockProducts);
      expect(alerts.outOfStock.length).toBe(1);
      expect(alerts.outOfStock[0].name).toBe("P1");
      expect(alerts.lowStock.length).toBe(1);
      expect(alerts.lowStock[0].name).toBe("P2");
      expect(alerts.adequateStock.length).toBe(1);
      expect(alerts.adequateStock[0].name).toBe("P3");
    });
  });

  describe("Contagem Cega & Apuramento de Quebras/Sobras no Inventário Físico", () => {
    it("deve calcular quebra física e impacto financeiro negativo", () => {
      // Teórico: 50, Físico contado: 42 -> Quebra de 8 unidades a 100 MT cada = -800 MT
      const result = calculateBlindInventoryDiscrepancy(50, 42, 100);
      expect(result.diffQuantity).toBe(-8);
      expect(result.financialImpact).toBe(-800);
      expect(result.type).toBe("SHORTAGE");
    });

    it("deve calcular sobra física e impacto financeiro positivo", () => {
      // Teórico: 50, Físico contado: 55 -> Sobra de 5 unidades a 100 MT cada = +500 MT
      const result = calculateBlindInventoryDiscrepancy(50, 55, 100);
      expect(result.diffQuantity).toBe(5);
      expect(result.financialImpact).toBe(500);
      expect(result.type).toBe("SURPLUS");
    });

    it("deve retornar MATCH quando a contagem física for exata", () => {
      const result = calculateBlindInventoryDiscrepancy(50, 50, 100);
      expect(result.diffQuantity).toBe(0);
      expect(result.financialImpact).toBe(0);
      expect(result.type).toBe("MATCH");
    });
  });
});
