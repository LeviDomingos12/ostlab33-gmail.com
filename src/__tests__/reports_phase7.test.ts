import { describe, it, expect } from "vitest";
import { Transaction } from "../types";

// ==========================================
// Phase 7: Financial, Tax (VAT/IVA), DRE & ABC Logic
// ==========================================

export interface IncomeStatementDRE {
  grossRevenue: number;         // Faturamento Bruto
  discountsTotal: number;       // (-) Descontos Concedidos
  netRevenue: number;           // (=) Faturamento Líquido
  costOfGoodsSold: number;      // (-) Custo das Mercadorias Vendidas (CMV)
  grossProfit: number;          // (=) Lucro Bruto Comercial
  grossMarginPercent: number;   // Margem Bruta (%)
  operatingExpenses: number;    // (-) Despesas Operacionais de Caixa
  operatingIncome: number;      // (=) Resultado Operacional / Lucro Líquido
  netMarginPercent: number;     // Margem Líquida (%)
}

export function calculateIncomeStatementDRE(
  transactions: Transaction[],
  operatingExpenses: number = 0,
  estimatedCostRate: number = 0.65 // Custo estimado se não houver custo item por item
): IncomeStatementDRE {
  const completedTxs = transactions.filter(t => t.status !== "CANCELLED");

  const grossRevenue = completedTxs.reduce((acc, t) => acc + (t.grandTotal || 0), 0);
  const discountsTotal = completedTxs.reduce((acc, t) => acc + (t.discountTotal || 0), 0);
  const netRevenue = grossRevenue;

  // CMV: Soma de (itens.quantidade * custo) ou taxa estimada
  let costOfGoodsSold = 0;
  completedTxs.forEach(t => {
    if (t.items && t.items.length > 0) {
      t.items.forEach(item => {
        // Se custo unitário estiver disponível, usar; caso contrário aplicar taxa de custo
        const itemCost = (item as any).costPrice ?? (item.price * estimatedCostRate);
        costOfGoodsSold += itemCost * item.quantity;
      });
    } else {
      costOfGoodsSold += t.subtotal * estimatedCostRate;
    }
  });

  const grossProfit = netRevenue - costOfGoodsSold;
  const grossMarginPercent = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
  const operatingIncome = grossProfit - operatingExpenses;
  const netMarginPercent = netRevenue > 0 ? (operatingIncome / netRevenue) * 100 : 0;

  return {
    grossRevenue: parseFloat(grossRevenue.toFixed(2)),
    discountsTotal: parseFloat(discountsTotal.toFixed(2)),
    netRevenue: parseFloat(netRevenue.toFixed(2)),
    costOfGoodsSold: parseFloat(costOfGoodsSold.toFixed(2)),
    grossProfit: parseFloat(grossProfit.toFixed(2)),
    grossMarginPercent: parseFloat(grossMarginPercent.toFixed(2)),
    operatingExpenses: parseFloat(operatingExpenses.toFixed(2)),
    operatingIncome: parseFloat(operatingIncome.toFixed(2)),
    netMarginPercent: parseFloat(netMarginPercent.toFixed(2))
  };
}

export interface VatMozambiqueReport {
  taxableBase16: number;        // Base Tributável à taxa normal (16% IVA Moçambique)
  vatAmount16: number;          // Total de IVA Liquidado (16%)
  exemptSales: number;          // Vendas Isentas / Taxa Zero
  totalSales: number;           // Total Global de Vendas
  transactionCount: number;
}

export function generateVatReportMozambique(transactions: Transaction[]): VatMozambiqueReport {
  const completedTxs = transactions.filter(t => t.status !== "CANCELLED");

  let taxableBase16 = 0;
  let vatAmount16 = 0;
  let exemptSales = 0;
  let totalSales = 0;

  completedTxs.forEach(t => {
    totalSales += t.grandTotal;
    if (t.vatTotal > 0) {
      taxableBase16 += t.subtotal;
      vatAmount16 += t.vatTotal;
    } else {
      exemptSales += t.subtotal;
    }
  });

  return {
    taxableBase16: parseFloat(taxableBase16.toFixed(2)),
    vatAmount16: parseFloat(vatAmount16.toFixed(2)),
    exemptSales: parseFloat(exemptSales.toFixed(2)),
    totalSales: parseFloat(totalSales.toFixed(2)),
    transactionCount: completedTxs.length
  };
}

export interface AbcProductClassification {
  productId: string;
  productName: string;
  totalRevenue: number;
  quantitySold: number;
  revenuePercentage: number;
  cumulativePercentage: number;
  categoryABC: "A" | "B" | "C"; // A = Top 80% receita, B = Próximos 15%, C = Últimos 5%
}

export function calculateAbcCurveAnalysis(transactions: Transaction[]): AbcProductClassification[] {
  const completedTxs = transactions.filter(t => t.status !== "CANCELLED");
  const productTotals: Record<string, { name: string; revenue: number; quantity: number }> = {};

  completedTxs.forEach(t => {
    (t.items || []).forEach(item => {
      if (!productTotals[item.productId]) {
        productTotals[item.productId] = {
          name: item.productName,
          revenue: 0,
          quantity: 0
        };
      }
      productTotals[item.productId].revenue += item.subtotal || (item.price * item.quantity);
      productTotals[item.productId].quantity += item.quantity;
    });
  });

  const productList = Object.entries(productTotals).map(([productId, data]) => ({
    productId,
    productName: data.name,
    totalRevenue: data.revenue,
    quantitySold: data.quantity
  }));

  // Ordenar por receita decrescente
  productList.sort((a, b) => b.totalRevenue - a.totalRevenue);

  const totalGlobalRevenue = productList.reduce((acc, p) => acc + p.totalRevenue, 0);
  let cumulative = 0;

  return productList.map(p => {
    const revenuePercentage = totalGlobalRevenue > 0 ? (p.totalRevenue / totalGlobalRevenue) * 100 : 0;
    cumulative += revenuePercentage;

    let categoryABC: "A" | "B" | "C" = "C";
    if (cumulative <= 80 || revenuePercentage >= 30) {
      categoryABC = "A";
    } else if (cumulative <= 95) {
      categoryABC = "B";
    } else {
      categoryABC = "C";
    }

    return {
      productId: p.productId,
      productName: p.productName,
      totalRevenue: parseFloat(p.totalRevenue.toFixed(2)),
      quantitySold: p.quantitySold,
      revenuePercentage: parseFloat(revenuePercentage.toFixed(2)),
      cumulativePercentage: parseFloat(cumulative.toFixed(2)),
      categoryABC
    };
  });
}

export function generateSaftXmlHeader(companyNuit: string, companyName: string): string {
  const currentDate = new Date().toISOString().split("T")[0];
  return `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:MZ_1.01_01">
  <Header>
    <AuditFileVersion>1.01_01</AuditFileVersion>
    <CompanyID>${companyNuit}</CompanyID>
    <TaxRegistrationNumber>${companyNuit}</TaxRegistrationNumber>
    <TaxAccountingBasis>Faturacao</TaxAccountingBasis>
    <CompanyName>${companyName}</CompanyName>
    <FiscalYear>${new Date().getFullYear()}</FiscalYear>
    <StartDate>${currentDate}</StartDate>
    <EndDate>${currentDate}</EndDate>
    <CurrencyCode>MZN</CurrencyCode>
  </Header>
</AuditFile>`;
}

// ==========================================
// Test Suite: Phase 7 - Reports, Tax & DRE
// ==========================================

describe("Phase 7: Relatórios Financeiros, DRE, IVA (Moçambique) e Curva ABC", () => {
  const sampleTransactions: Transaction[] = [
    {
      id: "tx-1",
      invoiceNumber: "FT-2026/001",
      timestamp: "2026-08-20T10:00:00Z",
      customerName: "Cliente A",
      items: [
        {
          productId: "p1",
          productName: "Saco de Arroz 25kg",
          quantity: 10,
          price: 1500,
          vatAmount: 2400,
          discountAmount: 0,
          subtotal: 15000
        }
      ],
      subtotal: 15000,
      vatTotal: 2400, // 16% IVA
      discountTotal: 0,
      grandTotal: 17400,
      paymentMethod: "MPESA_PAGA_FACIL",
      cashierName: "Operador 1"
    },
    {
      id: "tx-2",
      invoiceNumber: "FT-2026/002",
      timestamp: "2026-08-21T14:30:00Z",
      customerName: "Cliente B",
      items: [
        {
          productId: "p2",
          productName: "Óleo Alimentar 5L",
          quantity: 5,
          price: 600,
          vatAmount: 480,
          discountAmount: 100,
          subtotal: 3000
        }
      ],
      subtotal: 3000,
      vatTotal: 480,
      discountTotal: 100,
      grandTotal: 3380,
      paymentMethod: "CASH",
      cashierName: "Operador 2"
    },
    {
      id: "tx-3",
      invoiceNumber: "FT-2026/003",
      timestamp: "2026-08-22T09:15:00Z",
      customerName: "Cliente Isento",
      items: [
        {
          productId: "p3",
          productName: "Pão de Forma (Isento IVA)",
          quantity: 20,
          price: 50,
          vatAmount: 0,
          discountAmount: 0,
          subtotal: 1000
        }
      ],
      subtotal: 1000,
      vatTotal: 0, // Isento
      discountTotal: 0,
      grandTotal: 1000,
      paymentMethod: "POS_CARD",
      cashierName: "Operador 1"
    }
  ];

  describe("Demonstração do Resultado do Exercício (DRE)", () => {
    it("deve apurar faturamento líquido, CMV, lucro bruto e margem operacional", () => {
      // Total faturamento: 17400 + 3380 + 1000 = 21780 MT
      // Despesas operacionais: 2500 MT
      const dre = calculateIncomeStatementDRE(sampleTransactions, 2500, 0.60);

      expect(dre.grossRevenue).toBe(21780);
      expect(dre.discountsTotal).toBe(100);
      expect(dre.grossProfit).toBeGreaterThan(0);
      expect(dre.operatingExpenses).toBe(2500);
      expect(dre.operatingIncome).toBe(dre.grossProfit - 2500);
      expect(dre.grossMarginPercent).toBeGreaterThan(0);
    });
  });

  describe("Mapa Fiscal de IVA (Moçambique Modelo M/01)", () => {
    it("deve segregar base tributável a 16%, total de IVA liquidado e operações isentas", () => {
      const vatReport = generateVatReportMozambique(sampleTransactions);

      // Base tributável (tx-1: 15000, tx-2: 3000) = 18000 MT
      // IVA Liquidado (tx-1: 2400, tx-2: 480) = 2880 MT
      // Vendas isentas (tx-3) = 1000 MT
      // Total faturado: 21780 MT
      expect(vatReport.taxableBase16).toBe(18000);
      expect(vatReport.vatAmount16).toBe(2880);
      expect(vatReport.exemptSales).toBe(1000);
      expect(vatReport.totalSales).toBe(21780);
      expect(vatReport.transactionCount).toBe(3);
    });
  });

  describe("Análise e Curva ABC de Produtos", () => {
    it("deve classificar os produtos por importância no faturamento (A, B, C)", () => {
      const abc = calculateAbcCurveAnalysis(sampleTransactions);

      expect(abc.length).toBe(3);
      // Produto p1 gerou 15000 MT de 19000 MT (~78.9%) -> Categoria A
      expect(abc[0].productId).toBe("p1");
      expect(abc[0].categoryABC).toBe("A");
      expect(abc[0].revenuePercentage).toBeGreaterThan(70);

      // Produto p2 gerou 3000 MT -> Categoria B ou C
      expect(abc[1].productId).toBe("p2");
      // Produto p3 gerou 1000 MT -> Categoria C
      expect(abc[2].productId).toBe("p3");
    });
  });

  describe("Exportação SAF-T (Standard Audit File for Tax - Moçambique)", () => {
    it("deve gerar cabeçalho XML SAF-T MZ conforme especificação tributária da AT", () => {
      const xml = generateSaftXmlHeader("400123456", "Supermercado Maputo Lda");

      expect(xml).toContain("StandardAuditFile-Tax:MZ");
      expect(xml).toContain("<CompanyID>400123456</CompanyID>");
      expect(xml).toContain("<CompanyName>Supermercado Maputo Lda</CompanyName>");
      expect(xml).toContain("<CurrencyCode>MZN</CurrencyCode>");
    });
  });
});
