import { describe, it, expect } from "vitest";
import { 
  calculateProductPricesWithMarkup, 
  calculateSingleProductPrice, 
  applyRounding 
} from "../lib/pricingUtils";
import { Product } from "../types";

describe("pricingUtils: Bulk Markup and Price Calculations", () => {
  const mockInventory: Product[] = [
    {
      id: "prod-1",
      code: "ARR-01",
      name: "Arroz 25kg",
      category: "Mercearia",
      supplier: "Distribuidora A",
      vatRate: 16,
      costPrice: 1000,
      salePrice: 1200,
      stock: 10,
      minStock: 2
    },
    {
      id: "prod-2",
      code: "OLE-01",
      name: "Óleo 5L",
      category: "Mercearia",
      supplier: "Distribuidora B",
      vatRate: 16,
      costPrice: 400,
      salePrice: 450,
      stock: 20,
      minStock: 5
    },
    {
      id: "prod-3",
      code: "BEB-01",
      name: "Refrigerante 2L",
      category: "Bebidas",
      supplier: "Distribuidora C",
      vatRate: 16,
      costPrice: 60,
      salePrice: 80,
      stock: 50,
      minStock: 10
    },
    {
      id: "prod-4",
      code: "NO-COST",
      name: "Produto Sem Custo",
      category: "Diversos",
      supplier: "Distribuidora D",
      vatRate: 16,
      costPrice: 0,
      salePrice: 100,
      stock: 5,
      minStock: 1
    }
  ];

  it("calculates product price accurately based on cost markup percentage", () => {
    // 30% markup on cost 1000 -> 1300
    const res = calculateSingleProductPrice(mockInventory[0], {
      markupPercentage: 30,
      baseType: "cost_price",
      calculationMethod: "markup",
      roundingStrategy: "round_integer"
    });

    expect(res.newPrice).toBe(1300);
    expect(res.hasCost).toBe(true);
    expect(res.skipped).toBe(false);
  });

  it("applies markup across the entire inventory list in bulk without manual entry", () => {
    const result = calculateProductPricesWithMarkup(mockInventory, {
      markupPercentage: 25,
      baseType: "cost_price",
      calculationMethod: "markup",
      roundingStrategy: "round_integer",
      fallbackWhenNoCost: "use_current_price"
    });

    expect(result.items.length).toBe(4);
    expect(result.summary.eligibleCount).toBe(4);
    
    // Prod 1: Cost 1000 * 1.25 = 1250 (old sale 1200)
    const p1 = result.items.find(i => i.product.id === "prod-1")!;
    expect(p1.newSalePrice).toBe(1250);
    expect(p1.priceDifference).toBe(50);
    expect(p1.newMarginPercent).toBe(20); // (1250 - 1000) / 1250 = 20%

    // Prod 2: Cost 400 * 1.25 = 500 (old sale 450)
    const p2 = result.items.find(i => i.product.id === "prod-2")!;
    expect(p2.newSalePrice).toBe(500);
    expect(p2.priceDifference).toBe(50);

    // Prod 3: Cost 60 * 1.25 = 75 (old sale 80)
    const p3 = result.items.find(i => i.product.id === "prod-3")!;
    expect(p3.newSalePrice).toBe(75);

    // Prod 4: No cost, fallback to current price * 1.25 = 125
    const p4 = result.items.find(i => i.product.id === "prod-4")!;
    expect(p4.newSalePrice).toBe(125);

    // Updated products array contains all modified products ready for bulk DB upsert
    expect(result.updatedProducts.length).toBe(4);
    expect(result.updatedProducts[0].salePrice).toBe(1250);
    expect(result.updatedProducts[0].price).toBe(1250);
  });

  it("calculates price using target profit margin method (P = Cost / (1 - Margin%))", () => {
    // Target margin of 50% on cost 1000 -> 1000 / 0.5 = 2000
    const res = calculateSingleProductPrice(mockInventory[0], {
      markupPercentage: 50,
      baseType: "cost_price",
      calculationMethod: "margin",
      roundingStrategy: "round_integer"
    });

    expect(res.newPrice).toBe(2000);
  });

  it("applies bulk markup with category filtering", () => {
    const result = calculateProductPricesWithMarkup(mockInventory, {
      markupPercentage: 20,
      baseType: "cost_price",
      category: "Bebidas"
    });

    expect(result.summary.eligibleCount).toBe(1);
    expect(result.items.length).toBe(1);
    expect(result.items[0].product.name).toBe("Refrigerante 2L");
  });

  it("applies bulk markup to specific target product IDs", () => {
    const result = calculateProductPricesWithMarkup(mockInventory, {
      markupPercentage: 10,
      baseType: "cost_price",
      targetProductIds: ["prod-1", "prod-2"]
    });

    expect(result.summary.eligibleCount).toBe(2);
    expect(result.items.length).toBe(2);
  });

  it("supports rounding strategies properly", () => {
    // Round to 5
    expect(applyRounding(22, "round_5")).toBe(20);
    expect(applyRounding(23, "round_5")).toBe(25);
    expect(applyRounding(148, "round_5")).toBe(150);

    // Round integer
    expect(applyRounding(145.4, "round_integer")).toBe(145);
    expect(applyRounding(145.6, "round_integer")).toBe(146);

    // Ending in 9
    expect(applyRounding(192, "round_9_ending")).toBe(189);
    expect(applyRounding(196, "round_9_ending")).toBe(199);
  });

  it("correctly calculates inventory valuation changes in summary", () => {
    const result = calculateProductPricesWithMarkup(mockInventory, {
      markupPercentage: 25,
      baseType: "cost_price",
      calculationMethod: "markup"
    });

    // Old valuation:
    // prod-1: 1200 * 10 = 12000
    // prod-2: 450 * 20 = 9000
    // prod-3: 80 * 50 = 4000
    // prod-4: 100 * 5 = 500
    // Total old: 25500
    expect(result.summary.totalOriginalValuation).toBe(25500);

    // New valuation:
    // prod-1: 1250 * 10 = 12500
    // prod-2: 500 * 20 = 10000
    // prod-3: 75 * 50 = 3750
    // prod-4: 125 * 5 = 625
    // Total new: 26875
    expect(result.summary.totalNewValuation).toBe(26875);
    expect(result.summary.potentialRevenueDiff).toBe(1375);
  });
});
