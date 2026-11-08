import { Product } from "../types";

export type MarkupBaseType = "cost_price" | "current_price";
export type MarkupCalculationMethod = "markup" | "margin";
export type RoundingStrategy = 
  | "none" 
  | "round_integer" 
  | "round_up" 
  | "round_down"
  | "round_5" 
  | "round_9_ending" 
  | "round_two_decimals";

export interface BulkMarkupOptions {
  /** Percentual a aplicar (ex: 25 para 25%). Pode ser positivo ou negativo */
  markupPercentage: number;
  /** Base de cálculo: 'cost_price' (Markup sobre Preço de Custo) ou 'current_price' (Reajuste sobre Preço de Venda Atual) */
  baseType?: MarkupBaseType;
  /** Método: 'markup' (P = Custo * (1 + %)) ou 'margin' (P = Custo / (1 - %)) */
  calculationMethod?: MarkupCalculationMethod;
  /** Estratégia de arredondamento */
  roundingStrategy?: RoundingStrategy;
  /** Preço mínimo permitido */
  minPrice?: number;
  /** Tratamento quando o produto não tem preço de custo (custo <= 0) */
  fallbackWhenNoCost?: "use_current_price" | "keep_unchanged" | "skip";
  /** Filtro de categoria opcional ('ALL' ou vazio para todas) */
  category?: string;
  /** Lista opcional de IDs de produtos alvo (vazio aplica a toda lista elegível) */
  targetProductIds?: string[];
}

export interface CalculatedProductPrice {
  product: Product;
  originalCostPrice: number;
  originalSalePrice: number;
  newSalePrice: number;
  priceDifference: number; // newSalePrice - originalSalePrice
  percentageChange: number; // ((newSalePrice - originalSalePrice) / originalSalePrice) * 100
  originalMarginPercent: number; // ((originalSalePrice - originalCost) / originalSalePrice) * 100
  newMarginPercent: number; // ((newSalePrice - originalCost) / newSalePrice) * 100
  originalPotentialRevenue: number; // originalSalePrice * stock
  newPotentialRevenue: number; // newSalePrice * stock
  hasCostPrice: boolean;
  isChanged: boolean;
  skipped: boolean;
  skipReason?: string;
}

export interface BulkPricingSummary {
  totalInventoryCount: number;
  eligibleCount: number;
  updatedCount: number;
  skippedCount: number;
  totalOriginalValuation: number;
  totalNewValuation: number;
  potentialRevenueDiff: number;
  averageOldMargin: number;
  averageNewMargin: number;
  averagePriceChangePercent: number;
}

export interface BulkPricingResult {
  items: CalculatedProductPrice[];
  updatedProducts: Product[];
  summary: BulkPricingSummary;
}

/**
 * Aplica regras de arredondamento comercial aos preços calculados.
 */
export function applyRounding(value: number, strategy: RoundingStrategy = "round_integer"): number {
  if (isNaN(value) || !isFinite(value) || value <= 0) return 0;

  switch (strategy) {
    case "none":
      return Number(value.toFixed(2));
    case "round_two_decimals":
      return Math.round((value + Number.EPSILON) * 100) / 100;
    case "round_integer":
      return Math.round(value);
    case "round_up":
      return Math.ceil(value);
    case "round_down":
      return Math.floor(value);
    case "round_5": {
      const rounded = Math.round(value / 5) * 5;
      return rounded < 5 ? 5 : rounded;
    }
    case "round_9_ending": {
      const intVal = Math.round(value);
      if (intVal <= 9) return intVal;
      const lastDigit = intVal % 10;
      if (lastDigit === 9) return intVal;
      if (lastDigit >= 5) {
        return Math.floor(intVal / 10) * 10 + 9;
      } else {
        return Math.max(9, (Math.floor(intVal / 10) - 1) * 10 + 9);
      }
    }
    default:
      return Math.round(value);
  }
}

/**
 * Calcula o preço unitário de um produto com base nas opções de markup.
 */
export function calculateSingleProductPrice(
  product: Product,
  options: BulkMarkupOptions
): { newPrice: number; hasCost: boolean; skipped: boolean; reason?: string } {
  const cost = Number(product.costPrice ?? (product as any).cost ?? (product as any).cost_price ?? 0);
  const current = Number(product.salePrice ?? (product as any).price ?? (product as any).sale_price ?? 0);
  const baseType = options.baseType || "cost_price";
  const method = options.calculationMethod || "markup";
  const percentage = Number(options.markupPercentage) || 0;
  const rounding = options.roundingStrategy || "round_integer";
  const fallback = options.fallbackWhenNoCost || "use_current_price";
  const minPrice = options.minPrice ?? 0;

  const hasCost = cost > 0;
  let rawNewPrice = current;

  if (baseType === "cost_price") {
    if (!hasCost) {
      if (fallback === "skip") {
        return { newPrice: current, hasCost: false, skipped: true, reason: "Sem preço de custo cadastrado" };
      } else if (fallback === "keep_unchanged") {
        return { newPrice: current, hasCost: false, skipped: false };
      } else {
        // Fallback: aplicar percentual sobre o preço de venda atual
        if (current > 0) {
          rawNewPrice = current * (1 + percentage / 100);
        } else {
          return { newPrice: 0, hasCost: false, skipped: true, reason: "Sem custo nem preço atual cadastrado" };
        }
      }
    } else {
      if (method === "margin") {
        // Margem de Lucro Alvo: Preço = Custo / (1 - Margem%)
        if (percentage >= 100) {
          throw new Error("A margem de lucro não pode ser igual ou superior a 100%.");
        }
        rawNewPrice = cost / (1 - percentage / 100);
      } else {
        // Markup Padrão: Preço = Custo * (1 + Markup%)
        rawNewPrice = cost * (1 + percentage / 100);
      }
    }
  } else {
    // Reajuste sobre preço de venda atual
    rawNewPrice = current * (1 + percentage / 100);
  }

  let finalPrice = applyRounding(rawNewPrice, rounding);
  if (minPrice > 0 && finalPrice < minPrice) {
    finalPrice = minPrice;
  }

  return { newPrice: Math.max(0, finalPrice), hasCost, skipped: false };
}

/**
 * Função principal para calcular preços de produtos com base em percentual de markup
 * aplicado a toda a lista de inventário (ou subconjunto filtrado), viabilizando atualizações
 * em lote de preços em vez de digitação manual individual.
 */
export function calculateProductPricesWithMarkup(
  products: Product[],
  options: BulkMarkupOptions
): BulkPricingResult {
  const targetIdsSet = options.targetProductIds && options.targetProductIds.length > 0
    ? new Set(options.targetProductIds)
    : null;

  const categoryFilter = options.category && options.category !== "ALL" && options.category !== "Todas"
    ? options.category.toLowerCase().trim()
    : null;

  const items: CalculatedProductPrice[] = [];
  const updatedProducts: Product[] = [];

  let totalOriginalValuation = 0;
  let totalNewValuation = 0;
  let totalOldMarginSum = 0;
  let totalNewMarginSum = 0;
  let marginCount = 0;
  let totalPriceChangeSum = 0;
  let changedCount = 0;
  let skippedCount = 0;
  let eligibleCount = 0;

  for (const product of products) {
    // Verificar filtro de categoria
    if (categoryFilter && (product.category || "").toLowerCase().trim() !== categoryFilter) {
      continue;
    }

    // Verificar filtro de IDs selecionados
    if (targetIdsSet && !targetIdsSet.has(product.id)) {
      continue;
    }

    eligibleCount++;

    const cost = Number(product.costPrice ?? (product as any).cost ?? (product as any).cost_price ?? 0);
    const originalSale = Number(product.salePrice ?? (product as any).price ?? (product as any).sale_price ?? 0);
    const stock = Number(product.stock ?? 0);

    const calc = calculateSingleProductPrice(product, options);

    if (calc.skipped) {
      skippedCount++;
      items.push({
        product,
        originalCostPrice: cost,
        originalSalePrice: originalSale,
        newSalePrice: originalSale,
        priceDifference: 0,
        percentageChange: 0,
        originalMarginPercent: originalSale > 0 && cost > 0 ? ((originalSale - cost) / originalSale) * 100 : 0,
        newMarginPercent: originalSale > 0 && cost > 0 ? ((originalSale - cost) / originalSale) * 100 : 0,
        originalPotentialRevenue: originalSale * stock,
        newPotentialRevenue: originalSale * stock,
        hasCostPrice: calc.hasCost,
        isChanged: false,
        skipped: true,
        skipReason: calc.reason
      });
      continue;
    }

    const newSale = calc.newPrice;
    const isChanged = Math.abs(newSale - originalSale) > 0.001;
    const diff = newSale - originalSale;
    const pctChange = originalSale > 0 ? (diff / originalSale) * 100 : 0;

    const oldMargin = originalSale > 0 && cost > 0 ? ((originalSale - cost) / originalSale) * 100 : 0;
    const newMargin = newSale > 0 && cost > 0 ? ((newSale - cost) / newSale) * 100 : 0;

    const origRev = originalSale * stock;
    const newRev = newSale * stock;

    totalOriginalValuation += origRev;
    totalNewValuation += newRev;

    if (cost > 0) {
      totalOldMarginSum += oldMargin;
      totalNewMarginSum += newMargin;
      marginCount++;
    }

    if (isChanged) {
      changedCount++;
      totalPriceChangeSum += pctChange;
    }

    const updatedProduct: Product = {
      ...product,
      salePrice: newSale,
      price: newSale,
      // manter compatibilidade com propriedades alternativas
      ...(product as any).sale_price !== undefined ? { sale_price: newSale } : {}
    };

    items.push({
      product,
      originalCostPrice: cost,
      originalSalePrice: originalSale,
      newSalePrice: newSale,
      priceDifference: diff,
      percentageChange: pctChange,
      originalMarginPercent: oldMargin,
      newMarginPercent: newMargin,
      originalPotentialRevenue: origRev,
      newPotentialRevenue: newRev,
      hasCostPrice: calc.hasCost,
      isChanged,
      skipped: false
    });

    if (isChanged) {
      updatedProducts.push(updatedProduct);
    }
  }

  const summary: BulkPricingSummary = {
    totalInventoryCount: products.length,
    eligibleCount,
    updatedCount: updatedProducts.length,
    skippedCount,
    totalOriginalValuation,
    totalNewValuation,
    potentialRevenueDiff: totalNewValuation - totalOriginalValuation,
    averageOldMargin: marginCount > 0 ? totalOldMarginSum / marginCount : 0,
    averageNewMargin: marginCount > 0 ? totalNewMarginSum / marginCount : 0,
    averagePriceChangePercent: changedCount > 0 ? totalPriceChangeSum / changedCount : 0
  };

  return {
    items,
    updatedProducts,
    summary
  };
}
