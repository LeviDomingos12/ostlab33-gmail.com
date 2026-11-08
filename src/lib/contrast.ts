/**
 * @file src/lib/contrast.ts
 * Utilitário de Luminância e Ajuste Dinâmico Automatizado de Contraste (WCAG 2.1).
 * 
 * Funcionalidades:
 * 1. Cálculo matemático de luminância relativa segundo o padrão WCAG 2.1.
 * 2. Determinação dinâmica de cor de texto ideal (#ffffff para fundos escuros, #000000 para fundos claros).
 * 3. Prevenção e correção de letras cinzentas ou vermelhas sobre fundos pretos ou imagens escuras (evita irritação ocular).
 * 4. Engine automatizada com MutationObserver que monitoriza e ajusta o contraste de componentes em runtime,
 *    eliminando a necessidade de CSS hardcoded para cada elemento individual.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
  a?: number;
}

/**
 * Converte qualquer representação de cor CSS (hex, rgb, rgba, nomes comuns) para RGB.
 */
export function parseColorToRgb(colorStr: string): RGB | null {
  if (!colorStr || typeof colorStr !== "string") return null;
  const c = colorStr.trim().toLowerCase();

  // Cores nomeadas comuns
  if (c === "black" || c === "#000" || c === "#000000") return { r: 0, g: 0, b: 0, a: 1 };
  if (c === "white" || c === "#fff" || c === "#ffffff") return { r: 255, g: 255, b: 255, a: 1 };
  if (c === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

  // Paleta Tailwind comum (atalhos rápidos)
  const tailwindHexMap: Record<string, string> = {
    "zinc-950": "#09090b",
    "zinc-900": "#18181b",
    "slate-950": "#020617",
    "slate-900": "#0f172a",
    "neutral-950": "#0a0a0a",
    "neutral-900": "#171717",
    "gray-950": "#030712",
    "gray-900": "#111827",
    "orange-500": "#f97316",
    "red-500": "#ef4444",
    "red-400": "#f87171",
    "slate-400": "#94a3b8",
    "zinc-400": "#a1a1aa"
  };

  for (const [key, hex] of Object.entries(tailwindHexMap)) {
    if (c === key || c.includes(key)) {
      return parseColorToRgb(hex);
    }
  }

  // Hex: #rgb ou #rrggbb ou #rrggbbaa
  if (c.startsWith("#")) {
    const hex = c.substring(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
      return { r, g, b, a };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
  }

  // rgb(...) ou rgba(...)
  const rgbMatch = c.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
      a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1
    };
  }

  return null;
}

/**
 * Calcula a luminância relativa (WCAG 2.1) no intervalo [0, 1].
 * 0 = preto absoluto, 1 = branco absoluto.
 */
export function calculateRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(val => {
    const s = Math.max(0, Math.min(255, val)) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Obtém a luminância de qualquer string de cor CSS.
 */
export function getLuminance(color: string): number {
  const rgb = parseColorToRgb(color);
  if (!rgb) return 0;
  return calculateRelativeLuminance(rgb.r, rgb.g, rgb.b);
}

/**
 * Avalia se o fundo é considerado escuro.
 * Limiar padrão = 0.45 (garante que tons escuros de cinzento, azul marinho, preto e castanho usem branco).
 */
export function isDarkBackground(color: string, threshold = 0.45): boolean {
  return getLuminance(color) < threshold;
}

/**
 * Retorna a cor de fonte de maior contraste:
 * - '#ffffff' para fundos escuros
 * - '#000000' para fundos claros
 */
export function getContrastTextColor(backgroundColor: string, threshold = 0.45): "#ffffff" | "#000000" {
  return isDarkBackground(backgroundColor, threshold) ? "#ffffff" : "#000000";
}

/**
 * Identifica se uma cor de texto específica sobre fundo escuro é problemática
 * (cinzentos opacos ou avermelhados de baixo contraste que causam cansaço visual).
 */
export function isProblematicColorOnDark(textColor: string): boolean {
  const rgb = parseColorToRgb(textColor);
  if (!rgb) return false;

  // Branco puro ou quase puro é ideal
  if (rgb.r >= 245 && rgb.g >= 245 && rgb.b >= 245) return false;

  // Cinzentos: pouca saturação e brilho não-máximo
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  const isGrayish = (max - min) < 40 && max < 235;

  // Vermelhos / rosados com pouco contraste sobre fundo escuro
  const isReddish = rgb.r > rgb.g + 35 && rgb.r > rgb.b + 35 && rgb.r < 250;

  return isGrayish || isReddish;
}

/**
 * Classes Tailwind problemáticas em fundos escuros que geram texto cinzento ou vermelho de baixa legibilidade.
 */
const PROBLEMATIC_DARK_TEXT_CLASSES = [
  "text-slate-400", "text-slate-500", "text-slate-600",
  "text-zinc-400", "text-zinc-500", "text-zinc-600",
  "text-gray-400", "text-gray-500", "text-gray-600",
  "text-neutral-400", "text-neutral-500",
  "text-red-400", "text-red-500", "text-rose-400", "text-rose-500"
];

/**
 * Executa a verificação e ajuste automatizado de contraste no DOM.
 * Encontra elementos com fundos escuros, pretos ou sobre imagens e ajusta
 * dinamicamente a cor da fonte para branco puro (#ffffff), evitando irritação visual.
 */
export function applyAutomatedContrastAdjustment(root?: any): number {
  if (!root && typeof document === "undefined") return 0;
  const target = root || document;

  let adjustmentsCount = 0;

  // 1. Recipientes com fundo escuro, preto ou imagens com paletas escuras
  const darkContainers = target.querySelectorAll(
    '[class*="bg-black"], [class*="bg-zinc-950"], [class*="bg-zinc-900"], ' +
    '[class*="bg-slate-950"], [class*="bg-slate-900"], [class*="bg-neutral-950"], ' +
    '[class*="bg-neutral-900"], [data-dark="true"], [data-theme="dark"], ' +
    '.dark, [class*="bg-gradient-to-b from-slate-900"], [class*="bg-gradient-to-b from-purple-950"], ' +
    '[class*="bg-gradient-to-b from-zinc-950"], [class*="bg-black/"], [class*="bg-zinc-950/"], ' +
    '[id="quick-logo-config-modal"], [ref="flyerRef"]'
  );

  darkContainers.forEach((container: any) => {
    // Procura elementos de texto dentro do recipiente escuro
    const textElements: any[] = Array.from(container.querySelectorAll(
      'h1, h2, h3, h4, h5, h6, p, span, label, div, a, th, td, small, strong, b'
    ));

    textElements.forEach((el: any) => {
      // Se já foi ajustado ou tem classes protegidas (como botões coloridos específicos), pula
      if (el?.dataset?.contrastEnforced === "white") return;
      if (el?.classList?.contains && (el.classList.contains("bg-orange-500") || el.classList.contains("bg-green-600"))) return;

      // Verificar se possui classes conhecidas de texto cinzento ou vermelho
      const classList: string[] = el.classList ? Array.from(el.classList as Iterable<string>) : [];
      const hasProblematicClass = classList.some((cls: string) => PROBLEMATIC_DARK_TEXT_CLASSES.includes(cls));

      // Se possui classe cinzenta/vermelha dentro de fundo escuro, força branco puro
      if (hasProblematicClass) {
        el.style.setProperty("color", "#ffffff", "important");
        el.dataset.contrastEnforced = "white";
        adjustmentsCount++;
        return;
      }

      // Verificação dinâmica computada caso não haja classe Tailwind explícita
      if (typeof window !== "undefined") {
        try {
          const compColor = window.getComputedStyle(el).color;
          if (isProblematicColorOnDark(compColor)) {
            el.style.setProperty("color", "#ffffff", "important");
            el.dataset.contrastEnforced = "white";
            adjustmentsCount++;
          }
        } catch {}
      }
    });
  });

  return adjustmentsCount;
}

let observerInstance: MutationObserver | null = null;
let rafHandle: number | null = null;

/**
 * Inicializa o observador contínuo de contraste.
 * Sempre que novos elementos forem adicionados (ex: modais, cartazes, catálogo de produtos),
 * ajusta dinamicamente a legibilidade sem impacto na performance (throttled via requestAnimationFrame).
 */
export function setupAutomatedContrastObserver(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  // Execução inicial
  applyAutomatedContrastAdjustment(document);

  if (observerInstance) {
    observerInstance.disconnect();
  }

  const scheduleCheck = () => {
    if (rafHandle !== null) return;
    rafHandle = window.requestAnimationFrame(() => {
      rafHandle = null;
      applyAutomatedContrastAdjustment(document);
    });
  };

  observerInstance = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const m of mutations) {
      if (m.type === "childList" && m.addedNodes.length > 0) {
        shouldScan = true;
        break;
      }
      if (m.type === "attributes" && (m.attributeName === "class" || m.attributeName === "style")) {
        shouldScan = true;
        break;
      }
    }
    if (shouldScan) {
      scheduleCheck();
    }
  });

  observerInstance.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "data-theme", "data-dark"]
  });

  return () => {
    if (observerInstance) {
      observerInstance.disconnect();
      observerInstance = null;
    }
    if (rafHandle !== null) {
      window.cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
  };
}
