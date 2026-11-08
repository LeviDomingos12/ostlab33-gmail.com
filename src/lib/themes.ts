export interface SystemTheme {
  id: string;
  name: string;
  primary: string;       // hex, e.g. "#2563eb"
  hover: string;         // hex, e.g. "#1d4ed8"
  accentBg: string;      // hex/rgba, e.g. "#eff6ff"
  text: string;          // hex, e.g. "#1d4ed8"
  rgb: string;           // "r, g, b" for opacity-based styles
}

export const SYSTEM_THEMES: SystemTheme[] = [
  {
    id: "laranja",
    name: "Laranja OST (Padrão do Sistema)",
    primary: "#f97316",
    hover: "#ea580c",
    accentBg: "#fff7ed",
    text: "#c2410c",
    rgb: "249, 115, 22"
  },
  {
    id: "azul",
    name: "Azul Profissional",
    primary: "#2563eb",
    hover: "#1d4ed8",
    accentBg: "#eff6ff",
    text: "#1d4ed8",
    rgb: "37, 99, 235"
  },
  {
    id: "slate",
    name: "Cinza Neutro (Slate)",
    primary: "#475569",
    hover: "#334155",
    accentBg: "#f8fafc",
    text: "#334155",
    rgb: "71, 85, 105"
  },
  {
    id: "verde",
    name: "Verde Esmeralda",
    primary: "#059669",
    hover: "#047857",
    accentBg: "#ecfdf5",
    text: "#047857",
    rgb: "5, 150, 105"
  },
  {
    id: "indigo",
    name: "Índigo Corporativo",
    primary: "#4f46e5",
    hover: "#4338ca",
    accentBg: "#eef2ff",
    text: "#4338ca",
    rgb: "79, 70, 229"
  }
];

export function applyTheme(themeId: string) {
  const theme = SYSTEM_THEMES.find(t => t.id === themeId) || SYSTEM_THEMES[0];
  
  let styleEl = document.getElementById("system-theme-overrides") as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "system-theme-overrides";
    document.head.appendChild(styleEl);
  }

  const isStandardTheme = theme.id === "laranja";

  styleEl.innerHTML = `
    :root {
      --theme-primary: ${theme.primary};
      --theme-hover: ${theme.hover};
      --theme-accent-bg: ${theme.accentBg};
      --theme-text: ${theme.text};
      --theme-rgb: ${theme.rgb};
    }

    /* Regra de Contraste Estrito: Se fundo escuro -> texto branco; Se fundo claro -> texto preto */
    body:not(.dark) {
      background-color: #f8fafc !important;
      color: #000000 !important;
    }

    body.dark {
      background-color: #09090b !important;
      color: #ffffff !important;
    }

    /* Cards e painéis no tema claro: fundo branco com texto preto */
    body:not(.dark) .bg-white {
      background-color: #ffffff;
      border-color: #e2e8f0;
      color: #000000;
    }

    /* Em modo escuro: todos os fundos escuros exigem letras brancas */
    .dark,
    .dark body,
    .dark .bg-slate-900,
    .dark .bg-slate-950,
    .dark .bg-zinc-900,
    .dark .bg-zinc-950,
    .dark .bg-black,
    .dark aside,
    .dark header,
    .dark main {
      color: #ffffff !important;
    }

    .dark p,
    .dark span:not([class*="bg-"]):not([class*="text-orange"]):not([class*="text-emerald"]):not([class*="text-red"]):not([class*="text-amber"]),
    .dark h1, .dark h2, .dark h3, .dark h4, .dark h5, .dark h6,
    .dark label,
    .dark th,
    .dark td {
      color: #ffffff !important;
    }

    /* Elementos com fundo escuro explícito (ex: botões pretos, cards escuros): texto sempre branco */
    .bg-slate-900,
    .bg-slate-800,
    .bg-zinc-900,
    .bg-zinc-800,
    .bg-black {
      color: #ffffff !important;
    }

    .bg-slate-900 *,
    .bg-slate-800 *,
    .bg-zinc-900 *,
    .bg-zinc-800 *,
    .bg-black * {
      color: #ffffff !important;
    }

    /* Botões principais do sistema: fundo vibrante com texto sempre branco para contraste máximo */
    .bg-orange-500, .bg-orange-600 {
      background-color: ${theme.primary} !important;
      color: #ffffff !important;
      box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05) !important;
      border: none !important;
      transition: background-color 0.15s ease-in-out !important;
    }
    .bg-orange-500:hover, .bg-orange-600:hover, .hover\\:bg-orange-600:hover {
      background-color: ${theme.hover} !important;
      color: #ffffff !important;
      transform: none !important;
    }
    .bg-orange-500 *, .bg-orange-600 * {
      color: #ffffff !important;
    }

    /* Inputs de formulário com contraste perfeito */
    body:not(.dark) input,
    body:not(.dark) select,
    body:not(.dark) textarea {
      color: #000000 !important;
      background-color: #ffffff !important;
    }

    .dark input,
    .dark select,
    .dark textarea {
      color: #ffffff !important;
      background-color: #09090b !important;
    }

    input:focus, select:focus, textarea:focus {
      border-color: ${theme.primary} !important;
      outline: none !important;
      box-shadow: 0 0 0 2px rgba(${theme.rgb}, 0.25) !important;
    }

    /* Badges e destaques do sistema */
    ${isStandardTheme ? `
    /* No padrão original do sistema (Laranja OST), mantém as cores nativas e refinadas */
    .bg-orange-50 {
      background-color: #fff7ed !important;
      color: #c2410c !important;
      border: 1px solid #fed7aa !important;
    }
    .bg-orange-100 {
      background-color: #ffedd5 !important;
      color: #9a3412 !important;
      border: 1px solid #fdba74 !important;
    }
    .text-orange-500 {
      color: #f97316 !important;
    }
    .text-orange-600 {
      color: #ea580c !important;
    }
    .text-orange-700 {
      color: #c2410c !important;
    }
    .border-orange-500, .border-orange-600 {
      border-color: #f97316 !important;
    }
    ` : `
    .bg-orange-50 {
      background-color: rgba(${theme.rgb}, 0.08) !important;
      color: ${theme.hover} !important;
      border: 1px solid rgba(${theme.rgb}, 0.18) !important;
    }
    .bg-orange-100 {
      background-color: rgba(${theme.rgb}, 0.12) !important;
      color: ${theme.hover} !important;
      border: 1px solid rgba(${theme.rgb}, 0.22) !important;
    }
    .text-orange-500, .text-orange-600, .text-orange-700 {
      color: ${theme.primary} !important;
    }
    .hover\\:text-orange-600:hover {
      color: ${theme.hover} !important;
    }
    .border-orange-500, .border-orange-600 {
      border-color: ${theme.primary} !important;
    }
    `}

    /* Focus rings */
    .focus\\:ring-orange-500:focus {
      --tw-ring-color: ${theme.primary} !important;
      border-color: ${theme.primary} !important;
    }
    .focus\\:border-orange-500:focus {
      border-color: ${theme.primary} !important;
    }
  `;
}
