import { describe, it, expect } from "vitest";

// ==========================================
// Phase 13: Marketing, Promo Flyers & WhatsApp Broadcast
// ==========================================

export interface PromoDiscountCalculation {
  originalPrice: number;
  promoPrice: number;
  discountAmount: number;
  discountPercentage: number;
  savingsDescription: string;
}

export function calculatePromoDiscount(
  originalPrice: number,
  promoPrice: number
): PromoDiscountCalculation {
  if (originalPrice <= 0 || promoPrice >= originalPrice) {
    return {
      originalPrice,
      promoPrice,
      discountAmount: 0,
      discountPercentage: 0,
      savingsDescription: "Sem desconto"
    };
  }

  const discountAmount = parseFloat((originalPrice - promoPrice).toFixed(2));
  const discountPercentage = Math.round((discountAmount / originalPrice) * 100);

  return {
    originalPrice,
    promoPrice,
    discountAmount,
    discountPercentage,
    savingsDescription: `Poupe ${discountAmount.toFixed(2)} MT (-${discountPercentage}%)`
  };
}

export function formatWhatsAppBroadcastMessage(
  companyName: string,
  slogan: string,
  products: { name: string; originalPrice: number; promoPrice: number }[],
  contactPhone: string,
  currency: string = "MT"
): string {
  let message = `🔥 *${companyName.toUpperCase()} - ${slogan}* 🔥\n\n`;
  message += `Confira as nossas super ofertas válidas por tempo limitado:\n\n`;

  products.forEach(p => {
    const discount = Math.round(((p.originalPrice - p.promoPrice) / p.originalPrice) * 100);
    message += `🛒 *${p.name}*\n`;
    message += `   De ~${p.originalPrice.toFixed(2)} ${currency}~ por apenas *${p.promoPrice.toFixed(2)} ${currency}* (-${discount}%)\n\n`;
  });

  message += `📍 Visite a nossa loja hoje mesmo ou faça a sua encomenda!\n`;
  message += `📞 Contacto / WhatsApp: ${contactPhone}\n`;
  message += `_Promoção sujeita à disponibilidade de stock._`;

  return message;
}

export interface FlyerCanvasDimensions {
  width: number;
  height: number;
  aspectRatio: string;
  isHighRes: boolean;
}

export function getFlyerDimensions(format: "STORY" | "SQUARE" | "POSTER_A4"): FlyerCanvasDimensions {
  switch (format) {
    case "STORY": // 9:16 (Instagram / WhatsApp Status)
      return { width: 1080, height: 1920, aspectRatio: "9:16", isHighRes: true };
    case "SQUARE": // 1:1 (Feed)
      return { width: 1080, height: 1080, aspectRatio: "1:1", isHighRes: true };
    case "POSTER_A4": // A4 Print Ready
    default:
      return { width: 1240, height: 1754, aspectRatio: "A4", isHighRes: true };
  }
}

// ==========================================
// Test Suite: Phase 13 - Marketing & Flyers
// ==========================================

describe("Phase 13: Gerador de Panfletos Promocionais, Marketing Digital e WhatsApp Broadcast", () => {
  describe("Cálculo de Descontos Promocionais", () => {
    it("deve calcular porcentagem e valor economizado com precisão", () => {
      // De 320 MT por 270 MT -> Poupança de 50 MT (~16% desc)
      const discount = calculatePromoDiscount(320, 270);

      expect(discount.originalPrice).toBe(320);
      expect(discount.promoPrice).toBe(270);
      expect(discount.discountAmount).toBe(50);
      expect(discount.discountPercentage).toBe(16);
      expect(discount.savingsDescription).toContain("Poupe 50.00 MT (-16%)");
    });

    it("deve retornar 0% quando o preço promocional for igual ou maior que o original", () => {
      const discount = calculatePromoDiscount(320, 350);
      expect(discount.discountAmount).toBe(0);
      expect(discount.discountPercentage).toBe(0);
    });
  });

  describe("Formatação de Mensagem de Transmissão para WhatsApp", () => {
    it("deve formatar texto de transmissão com negrito, riscado e apelo promocional", () => {
      const msg = formatWhatsAppBroadcastMessage(
        "Supermercado Central",
        "MEGA SALDÃO DE FIM DO MÊS",
        [
          { name: "Açúcar Branco 5kg", originalPrice: 320, promoPrice: 270 },
          { name: "Óleo 5L", originalPrice: 650, promoPrice: 580 }
        ],
        "+258 84 123 4567",
        "MT"
      );

      expect(msg).toContain("SUPERMERCADO CENTRAL");
      expect(msg).toContain("MEGA SALDÃO DE FIM DO MÊS");
      expect(msg).toContain("Açúcar Branco 5kg");
      expect(msg).toContain("De ~320.00 MT~ por apenas *270.00 MT*");
      expect(msg).toContain("+258 84 123 4567");
    });
  });

  describe("Dimensionamento de Canvas para Panfletos e Mídias Sociais", () => {
    it("deve retornar resolução 1080x1920 para formato Story / WhatsApp Status", () => {
      const dims = getFlyerDimensions("STORY");
      expect(dims.width).toBe(1080);
      expect(dims.height).toBe(1920);
      expect(dims.aspectRatio).toBe("9:16");
    });

    it("deve retornar resolução 1080x1080 para formato Feed Quadrado", () => {
      const dims = getFlyerDimensions("SQUARE");
      expect(dims.width).toBe(1080);
      expect(dims.height).toBe(1080);
      expect(dims.aspectRatio).toBe("1:1");
    });

    it("deve retornar formato A4 de alta resolução para impressão de cartazes de gôndola", () => {
      const dims = getFlyerDimensions("POSTER_A4");
      expect(dims.width).toBe(1240);
      expect(dims.height).toBe(1754);
      expect(dims.aspectRatio).toBe("A4");
    });
  });
});
