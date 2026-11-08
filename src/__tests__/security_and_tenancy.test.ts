import { describe, it, expect } from "vitest";
import { productSchema, saleProcessSchema, replenishStockSchema, debtPaymentSchema, sanitizeInputData } from "../server/validation";

describe("Validation & Security Rules", () => {
  describe("Product Schema Validation", () => {
    it("should accept valid product payload", () => {
      const valid = {
        name: "Coca-Cola 330ml",
        price: 50,
        cost: 35,
        stock: 100,
        category: "Bebidas",
        code: "BEB-001"
      };
      const res = productSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it("should reject negative prices", () => {
      const invalid = {
        name: "Artigo Inválido",
        price: -10,
        stock: 5
      };
      const res = productSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it("should reject negative stock", () => {
      const invalid = {
        name: "Artigo Sem Stock",
        price: 20,
        stock: -5
      };
      const res = productSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });
  });

  describe("Sale Processing Schema Validation", () => {
    it("should reject sale with empty items", () => {
      const sale = {
        items: [],
        grandTotal: 100
      };
      const res = saleProcessSchema.safeParse(sale);
      expect(res.success).toBe(false);
    });

    it("should reject sale with negative item quantity or price", () => {
      const sale = {
        items: [
          {
            productId: "prod-1",
            quantity: -2,
            salePrice: 50
          }
        ]
      };
      const res = saleProcessSchema.safeParse(sale);
      expect(res.success).toBe(false);
    });

    it("should accept valid sale payload", () => {
      const sale = {
        saleId: "sale-123",
        invoiceNumber: "FAC-2026-001",
        paymentMethod: "Dinheiro",
        items: [
          {
            productId: "prod-1",
            name: "Sumo 1L",
            quantity: 2,
            salePrice: 100
          }
        ],
        grandTotal: 200,
        amountPaid: 200
      };
      const res = saleProcessSchema.safeParse(sale);
      expect(res.success).toBe(true);
    });
  });

  describe("Stock Replenishment Schema Validation", () => {
    it("should reject replenishment with zero or negative quantity", () => {
      const invalid = {
        productId: "prod-1",
        quantity: 0
      };
      const res = replenishStockSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it("should accept valid replenishment", () => {
      const valid = {
        productId: "prod-1",
        quantity: 50,
        costPrice: 40,
        reason: "Encomenda Fornecedor #102"
      };
      const res = replenishStockSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });
  });

  describe("Debt Settlement Schema Validation", () => {
    it("should reject debt payment with zero or negative amount", () => {
      const invalid = {
        debtId: "debt-1",
        customerId: "cust-1",
        amount: 0,
        paymentMethod: "Dinheiro"
      };
      const res = debtPaymentSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it("should accept valid debt settlement", () => {
      const valid = {
        debtId: "debt-1",
        customerId: "cust-1",
        amount: 500,
        paymentMethod: "Dinheiro",
        notes: "Pagamento parcial acordado"
      };
      const res = debtPaymentSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });
  });

  describe("Sanitize Input Data (XSS & Injection Protection)", () => {
    it("should sanitize script tags from input strings", () => {
      const dirty = "<script>alert('xss')</script>Normal Text";
      const cleaned = sanitizeInputData(dirty);
      expect(cleaned).not.toContain("<script>");
    });

    it("should recursively sanitize nested objects", () => {
      const dirtyObj = {
        title: "Test <script>evil()</script>",
        user: {
          bio: "Hello <iframe src='malicious'></iframe>world"
        }
      };
      const cleaned = sanitizeInputData(dirtyObj);
      expect(cleaned.title).not.toContain("<script>");
      expect(cleaned.user.bio).not.toContain("<iframe");
    });
  });
});
