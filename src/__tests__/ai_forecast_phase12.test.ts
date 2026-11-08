import { describe, it, expect } from "vitest";
import { Product, Transaction } from "../types";

// ==========================================
// Phase 12: AI Predictive Forecasting, Demand & Anomaly Logic
// ==========================================

export interface StockForecastResult {
  productId: string;
  productName: string;
  currentStock: number;
  averageDailySales: number;
  estimatedDaysRemaining: number;
  stockoutRisk: "CRITICAL" | "WARNING" | "HEALTHY" | "OVERSTOCK";
  suggestedReorderQuantity: number;
}

export function calculateDemandForecast(
  product: Product,
  recentTransactions: Transaction[],
  daysPeriod: number = 30
): StockForecastResult {
  // Aggregate sales for this product in the period
  let totalSold = 0;
  recentTransactions.forEach(tx => {
    tx.items?.forEach(item => {
      if (item.productId === product.id) {
        totalSold += item.quantity;
      }
    });
  });

  const averageDailySales = daysPeriod > 0 ? parseFloat((totalSold / daysPeriod).toFixed(2)) : 0;
  const currentStock = product.stock || 0;

  let estimatedDaysRemaining = 999;
  if (averageDailySales > 0) {
    estimatedDaysRemaining = Math.floor(currentStock / averageDailySales);
  }

  let stockoutRisk: "CRITICAL" | "WARNING" | "HEALTHY" | "OVERSTOCK" = "HEALTHY";
  if (currentStock <= 0 || estimatedDaysRemaining <= 3) {
    stockoutRisk = "CRITICAL";
  } else if (estimatedDaysRemaining <= 7) {
    stockoutRisk = "WARNING";
  } else if (estimatedDaysRemaining > 45 && currentStock > (product.minStock * 4 || 100)) {
    stockoutRisk = "OVERSTOCK";
  }

  // Suggest reorder up to 3x minStock or 30 days of sales
  const targetStock = product.minStock && product.minStock > 0 ? product.minStock * 3 : Math.max(30, Math.ceil(averageDailySales * 30));
  const suggestedReorderQuantity = Math.max(0, targetStock - currentStock);

  return {
    productId: product.id,
    productName: product.name,
    currentStock,
    averageDailySales,
    estimatedDaysRemaining,
    stockoutRisk,
    suggestedReorderQuantity
  };
}

export interface SalesAnomaly {
  id: string;
  type: "SPIKE" | "DROP" | "MARGIN_ALERT" | "PRICE_DEVIATION";
  productName: string;
  description: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
}

export function detectSalesAnomalies(
  products: Product[],
  transactions: Transaction[]
): SalesAnomaly[] {
  const anomalies: SalesAnomaly[] = [];

  products.forEach(p => {
    // Check for negative or ultra-low margin
    if (p.costPrice && p.salePrice && p.salePrice < p.costPrice) {
      anomalies.push({
        id: `anom_margin_${p.id}`,
        type: "MARGIN_ALERT",
        productName: p.name,
        description: `Preço de venda (${p.salePrice} MT) inferior ao preço de custo (${p.costPrice} MT). Margem negativa.`,
        severity: "HIGH"
      });
    }

    // Check for zero stock with high price
    if (p.stock === 0) {
      anomalies.push({
        id: `anom_stockout_${p.id}`,
        type: "DROP",
        productName: p.name,
        description: `Produto com stock zerado. Risco de perda de receita diária.`,
        severity: "MEDIUM"
      });
    }
  });

  return anomalies;
}

export function buildAiPromptContext(
  products: Product[],
  transactions: Transaction[],
  companyName: string = "Empresa Teste"
): string {
  const totalRevenue = transactions.reduce((acc, t) => acc + (t.grandTotal || 0), 0);
  const totalProducts = products.length;
  const outOfStockCount = products.filter(p => p.stock <= 0).length;

  return `Contexto Operacional para ${companyName}:
- Total de Produtos Catalogados: ${totalProducts}
- Itens Esgotados: ${outOfStockCount}
- Volume de Vendas Acumulado: ${totalRevenue.toFixed(2)} MZN
- Transações Registadas: ${transactions.length}`;
}

// ==========================================
// Test Suite: Phase 12 - AI Forecasting
// ==========================================

describe("Phase 12: Co-Piloto de IA Preditiva, Previsão de Demanda e Deteção de Anomalias", () => {
  const mockProduct: Product = {
    id: "prod-101",
    name: "Arroz Macaroca 25kg",
    code: "ARR-25KG",
    supplier: "Distribuidora Nacional",
    barcode: "6001234567890",
    category: "Cereais",
    salePrice: 1850,
    costPrice: 1500,
    stock: 10,
    minStock: 15,
    vatRate: 16
  };

  const mockTransactions: Transaction[] = [
    {
      id: "tx-1",
      invoiceNumber: "FT 2026/001",
      timestamp: "2026-08-20T10:00:00Z",
      grandTotal: 3700,
      subtotal: 3189.65,
      vatTotal: 510.35,
      discountTotal: 0,
      cashierName: "Maria Operadora",
      paymentMethod: "CASH",
      status: "COMPLETED",
      items: [{ productId: "prod-101", productName: "Arroz Macaroca 25kg", quantity: 2, price: 1850, vatAmount: 510.35, discountAmount: 0, subtotal: 3700 }]
    },
    {
      id: "tx-2",
      invoiceNumber: "FT 2026/002",
      timestamp: "2026-08-22T14:00:00Z",
      grandTotal: 5550,
      subtotal: 4784.48,
      vatTotal: 765.52,
      discountTotal: 0,
      cashierName: "Maria Operadora",
      paymentMethod: "MPESA_PAGA_FACIL",
      status: "COMPLETED",
      items: [{ productId: "prod-101", productName: "Arroz Macaroca 25kg", quantity: 3, price: 1850, vatAmount: 765.52, discountAmount: 0, subtotal: 5550 }]
    }
  ];

  describe("Cálculo e Previsão de Demanda de Stock", () => {
    it("deve calcular a média de vendas diárias e estimar dias restantes de stock", () => {
      // 5 unidades vendidas em 10 dias = 0.5 un/dia.
      // Stock atual de 10 unidades -> 10 / 0.5 = 20 dias restantes
      const forecast = calculateDemandForecast(mockProduct, mockTransactions, 10);

      expect(forecast.productId).toBe("prod-101");
      expect(forecast.averageDailySales).toBe(0.5);
      expect(forecast.estimatedDaysRemaining).toBe(20);
      expect(forecast.stockoutRisk).toBe("HEALTHY");
      // targetStock (minStock 15 * 3 = 45) - currentStock (10) = 35
      expect(forecast.suggestedReorderQuantity).toBe(35);
    });

    it("deve classificar como CRITICAL quando o stock restante for para 3 dias ou menos", () => {
      const lowStockProd: Product = {
        ...mockProduct,
        id: "prod-101",
        stock: 1
      };
      const forecast = calculateDemandForecast(lowStockProd, mockTransactions, 5); // 5 vendidas em 5 dias = 1/dia -> 1 dia restante
      expect(forecast.stockoutRisk).toBe("CRITICAL");
    });
  });

  describe("Deteção Automática de Anomalias Comerciais", () => {
    it("deve detetar anomalia de margem negativa se preço de venda for menor que o custo", () => {
      const badMarginProduct: Product = {
        ...mockProduct,
        id: "prod-bad",
        name: "Óleo Alimentar 5L",
        salePrice: 450,
        costPrice: 500, // Custo maior que venda
        stock: 20
      };

      const anomalies = detectSalesAnomalies([badMarginProduct], []);
      const marginAnomaly = anomalies.find(a => a.type === "MARGIN_ALERT");

      expect(marginAnomaly).toBeDefined();
      expect(marginAnomaly?.severity).toBe("HIGH");
      expect(marginAnomaly?.description).toContain("Preço de venda (450 MT) inferior ao preço de custo (500 MT)");
    });
  });

  describe("Construção de Contexto Operacional para Prompt de IA", () => {
    it("deve gerar resumo estruturado do catálogo e faturamento para a IA", () => {
      const context = buildAiPromptContext([mockProduct], mockTransactions, "Mercearia Polana");
      expect(context).toContain("Mercearia Polana");
      expect(context).toContain("Total de Produtos Catalogados: 1");
      expect(context).toContain("9250.00 MZN"); // 3700 + 5550
    });
  });
});
