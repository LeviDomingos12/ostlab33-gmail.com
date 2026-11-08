import { describe, it, expect, vi } from "vitest";
import {
  calculateRelativeLuminance,
  getLuminance,
  isDarkBackground,
  getContrastTextColor,
  isProblematicColorOnDark,
  applyAutomatedContrastAdjustment,
  setupAutomatedContrastObserver
} from "../lib/contrast";

describe("Verificação de Contraste Automatizada e Luminância (WCAG 2.1)", () => {
  describe("1. Cálculo Matemático de Luminância Relativa", () => {
    it("deve retornar 0 para preto absoluto (rgb(0,0,0) e #000000)", () => {
      expect(calculateRelativeLuminance(0, 0, 0)).toBe(0);
      expect(getLuminance("#000000")).toBe(0);
      expect(getLuminance("black")).toBe(0);
    });

    it("deve retornar 1 para branco absoluto (rgb(255,255,255) e #ffffff)", () => {
      expect(calculateRelativeLuminance(255, 255, 255)).toBeCloseTo(1, 4);
      expect(getLuminance("#ffffff")).toBeCloseTo(1, 4);
      expect(getLuminance("white")).toBeCloseTo(1, 4);
    });

    it("deve calcular corretamente a luminância de paletas escuras (zinc-950, slate-900)", () => {
      const lumZinc950 = getLuminance("#09090b");
      const lumSlate900 = getLuminance("#0f172a");

      expect(lumZinc950).toBeLessThan(0.05);
      expect(lumSlate900).toBeLessThan(0.05);
    });

    it("deve calcular corretamente a luminância de paletas claras (slate-50, #f8fafc)", () => {
      const lumLight = getLuminance("#f8fafc");
      expect(lumLight).toBeGreaterThan(0.9);
    });
  });

  describe("2. Ajuste Dinâmico de Cor de Fonte (Branca para Escuros, Preta para Claros)", () => {
    it("deve identificar fundos pretos e escuros como dark (isDarkBackground = true)", () => {
      expect(isDarkBackground("#000000")).toBe(true);
      expect(isDarkBackground("black")).toBe(true);
      expect(isDarkBackground("#09090b")).toBe(true);
      expect(isDarkBackground("#18181b")).toBe(true);
      expect(isDarkBackground("#0f172a")).toBe(true);
    });

    it("deve identificar fundos brancos e claros como light (isDarkBackground = false)", () => {
      expect(isDarkBackground("#ffffff")).toBe(false);
      expect(isDarkBackground("white")).toBe(false);
      expect(isDarkBackground("#f8fafc")).toBe(false);
      expect(isDarkBackground("#f1f5f9")).toBe(false);
    });

    it("deve retornar cor BRANCA (#ffffff) estritamente para paletas e fundos pretos/escuros", () => {
      expect(getContrastTextColor("#000000")).toBe("#ffffff");
      expect(getContrastTextColor("black")).toBe("#ffffff");
      expect(getContrastTextColor("#09090b")).toBe("#ffffff");
      expect(getContrastTextColor("#18181b")).toBe("#ffffff");
      expect(getContrastTextColor("#020617")).toBe("#ffffff");
      expect(getContrastTextColor("rgba(0, 0, 0, 0.9)")).toBe("#ffffff");
    });

    it("deve retornar cor PRETA (#000000) para paletas e fundos claros", () => {
      expect(getContrastTextColor("#ffffff")).toBe("#000000");
      expect(getContrastTextColor("white")).toBe("#000000");
      expect(getContrastTextColor("#f8fafc")).toBe("#000000");
      expect(getContrastTextColor("#f1f5f9")).toBe("#000000");
    });
  });

  describe("3. Detecção e Prevenção de Letras Cinzentas ou Vermelhas em Fundo Escuro", () => {
    it("deve classificar cinzentos (slate-400, zinc-500) como problemáticos em fundo preto", () => {
      expect(isProblematicColorOnDark("#94a3b8")).toBe(true); // slate-400
      expect(isProblematicColorOnDark("#71717a")).toBe(true); // zinc-500
      expect(isProblematicColorOnDark("#a1a1aa")).toBe(true); // zinc-400
    });

    it("deve classificar tons avermelhados de baixo contraste como problemáticos em fundo preto", () => {
      expect(isProblematicColorOnDark("#f87171")).toBe(true); // red-400
      expect(isProblematicColorOnDark("#ef4444")).toBe(true); // red-500
      expect(isProblematicColorOnDark("#f43f5e")).toBe(true); // rose-500
    });

    it("NÃO deve classificar branco puro (#ffffff) como problemático", () => {
      expect(isProblematicColorOnDark("#ffffff")).toBe(false);
      expect(isProblematicColorOnDark("white")).toBe(false);
      expect(isProblematicColorOnDark("rgb(255, 255, 255)")).toBe(false);
    });
  });

  describe("4. Engine Automatizada de Ajuste no DOM", () => {
    it("deve transformar automaticamente textos cinzentos ou vermelhos em branco quando dentro de recipientes escuros", () => {
      const mockChildGray = {
        classList: {
          contains: (cls: string) => false,
          [Symbol.iterator]: function* () {
            yield "text-slate-400";
          }
        },
        dataset: {} as Record<string, string>,
        style: {
          setProperty: vi.fn()
        }
      };

      const mockChildRed = {
        classList: {
          contains: (cls: string) => false,
          [Symbol.iterator]: function* () {
            yield "text-red-400";
          }
        },
        dataset: {} as Record<string, string>,
        style: {
          setProperty: vi.fn()
        }
      };

      const mockChildWhite = {
        classList: {
          contains: (cls: string) => false,
          [Symbol.iterator]: function* () {
            yield "text-white";
          }
        },
        dataset: {} as Record<string, string>,
        style: {
          setProperty: vi.fn()
        }
      };

      const mockDarkContainer = {
        querySelectorAll: vi.fn().mockReturnValue([mockChildGray, mockChildRed, mockChildWhite])
      };

      const mockRoot = {
        querySelectorAll: vi.fn().mockReturnValue([mockDarkContainer])
      };

      const adjusted = applyAutomatedContrastAdjustment(mockRoot as any);
      expect(adjusted).toBe(2);
      expect(mockChildGray.style.setProperty).toHaveBeenCalledWith("color", "#ffffff", "important");
      expect(mockChildGray.dataset.contrastEnforced).toBe("white");

      expect(mockChildRed.style.setProperty).toHaveBeenCalledWith("color", "#ffffff", "important");
      expect(mockChildRed.dataset.contrastEnforced).toBe("white");

      expect(mockChildWhite.style.setProperty).not.toHaveBeenCalled();
    });

    it("deve manipular setupAutomatedContrastObserver de forma segura em ambiente sem DOM", () => {
      const cleanup = setupAutomatedContrastObserver();
      expect(typeof cleanup).toBe("function");
      cleanup();
    });
  });
});
