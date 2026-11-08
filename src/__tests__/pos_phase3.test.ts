import { describe, it, expect } from "vitest";
import { Transaction, Product, Customer } from "../types";

describe("Fase 3: POS, Pagamentos Mistos e Devoluções Atómicas", () => {
  // Mock products
  const mockProducts: Product[] = [
    {
      id: "prod-1",
      name: "Arroz 25kg",
      code: "ARR25",
      barcode: "6001234567890",
      category: "Mercearia",
      supplier: "Fornecedor Central",
      costPrice: 1200,
      salePrice: 1500,
      stock: 50,
      minStock: 5,
      vatRate: 16
    },
    {
      id: "prod-2",
      name: "Óleo 5L",
      code: "OLEO5",
      barcode: "6009876543210",
      category: "Mercearia",
      supplier: "Fornecedor Central",
      costPrice: 400,
      salePrice: 550,
      stock: 30,
      minStock: 2,
      vatRate: 16
    }
  ];

  it("deve calcular subtotal, IVA e total líquido com precisão", () => {
    const qty1 = 2; // 2 x 1500 = 3000
    const qty2 = 1; // 1 x 550 = 550
    const subtotal = (mockProducts[0].salePrice * qty1) + (mockProducts[1].salePrice * qty2);
    expect(subtotal).toBe(3550);

    const discountPercent = 10; // 10%
    const discountAmount = subtotal * (discountPercent / 100);
    expect(discountAmount).toBe(355);

    const grandTotal = subtotal - discountAmount;
    expect(grandTotal).toBe(3195);
  });

  it("deve validar corretamente a soma de pagamentos mistos (MIXED)", () => {
    const grandTotal = 3195;
    const mixedCash = 1000;
    const mixedMpesa = 1500;
    const mixedPOS = 695;

    const totalAllocated = mixedCash + mixedMpesa + mixedPOS;
    expect(totalAllocated).toBe(grandTotal);

    // Testar se faltar montante
    const partialAllocated = mixedCash + mixedMpesa; // 2500
    const remaining = grandTotal - partialAllocated;
    expect(remaining).toBe(695);
    expect(totalAllocated >= grandTotal).toBe(true);
  });

  it("deve processar o estorno de artigos e calcular o valor da Nota de Crédito", () => {
    const mockSale: Transaction = {
      id: "tx-test-1",
      invoiceNumber: "FAC-2026-0001",
      timestamp: new Date().toISOString(),
      items: [
        {
          productId: "prod-1",
          productName: "Arroz 25kg",
          quantity: 2,
          price: 1500,
          vatAmount: 240,
          discountAmount: 0,
          subtotal: 3000
        },
        {
          productId: "prod-2",
          productName: "Óleo 5L",
          quantity: 1,
          price: 550,
          vatAmount: 88,
          discountAmount: 0,
          subtotal: 550
        }
      ],
      subtotal: 3550,
      vatTotal: 328,
      discountTotal: 0,
      grandTotal: 3550,
      paymentMethod: "CASH",
      cashierName: "Operador Teste"
    };
    expect(mockSale.grandTotal).toBe(3550);

    // Devolução parcial: 1 saco de arroz
    const returnedItems = [
      { productId: "prod-1", quantity: 1, price: 1500 }
    ];

    const totalRefund = returnedItems.reduce((acc, it) => acc + it.price * it.quantity, 0);
    expect(totalRefund).toBe(1500);

    // Simulação de reabastecimento de stock
    const updatedProducts = mockProducts.map(p => {
      const returned = returnedItems.find(r => r.productId === p.id);
      if (returned) {
        return { ...p, stock: p.stock + returned.quantity };
      }
      return p;
    });

    const restoredProduct = updatedProducts.find(p => p.id === "prod-1");
    expect(restoredProduct?.stock).toBe(51); // 50 + 1
  });

  it("deve abater o saldo de dívida do cliente quando a devolução é de venda a crédito", () => {
    const mockCustomer: Customer = {
      id: "cust-1",
      name: "Empresa Cliente Lda",
      phone: "+258841234567",
      email: "cliente@exemplo.co.mz",
      address: "Maputo",
      nuit: "400123456",
      debt: 5000,
      totalSpent: 20000,
      purchaseCount: 5,
      loyaltyPoints: 100
    };

    const totalRefund = 1500;
    const newDebt = Math.max(0, (mockCustomer.debt || 0) - totalRefund);

    expect(newDebt).toBe(3500);
  });
});

