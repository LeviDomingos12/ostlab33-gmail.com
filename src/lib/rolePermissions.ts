import { UserRole, Employee } from "../types";

export interface RoleModulePermission {
  id: string;
  name: string;
  shortLabel: string;
  allowedRoles: UserRole[];
  description: string;
}

export const ROLE_MODULE_PERMISSIONS: Record<string, RoleModulePermission> = {
  dashboard: {
    id: "dashboard",
    name: "Dashboard Inteligente & Indicadores",
    shortLabel: "Dashboard",
    allowedRoles: ["ADMIN", "SUPERVISOR", "AUDITOR", "FINANCEIRO"],
    description: "Visualização de métricas financeiras globais, margens de lucro e gráficos de desempenho empresarial.",
  },
  pos: {
    id: "pos",
    name: "Terminal de Vendas (POS)",
    shortLabel: "Vendas",
    allowedRoles: ["ADMIN", "SUPERVISOR", "CASHIER"],
    description: "Emissão de faturas, recibos e venda rápida no balcão.",
  },
  cash: {
    id: "cash",
    name: "Gestão e Livro de Caixa",
    shortLabel: "Caixa",
    allowedRoles: ["ADMIN", "SUPERVISOR", "CASHIER", "FINANCEIRO"],
    description: "Abertura, fecho de turnos, sangrias, suprimentos e conferência de valores.",
  },
  customers: {
    id: "customers",
    name: "Gestão de Clientes & CRM",
    shortLabel: "Clientes",
    allowedRoles: ["ADMIN", "SUPERVISOR", "CASHIER"],
    description: "Cadastro de clientes, histórico de compras, contas correntes e fidelização.",
  },
  stock: {
    id: "stock",
    name: "Gestão Avançada de Stock",
    shortLabel: "Stock",
    allowedRoles: ["ADMIN", "SUPERVISOR"],
    description: "Controlo de inventário, custos de aquisição, lotes e reposição de artigos.",
  },
  branches: {
    id: "branches",
    name: "Multi-Loja & Filiais",
    shortLabel: "Multi-Loja",
    allowedRoles: ["ADMIN", "SUPERVISOR"],
    description: "Gestão de múltiplas filiais, stocks distribuídos, transferências inter-lojas e supervisão consolidada.",
  },
  reports: {
    id: "reports",
    name: "Relatórios Financeiros & Faturação",
    shortLabel: "Relatórios",
    allowedRoles: ["ADMIN", "SUPERVISOR", "AUDITOR", "FINANCEIRO"],
    description: "Demonstrações financeiras, extratos de vendas, auditoria e mapas fiscais.",
  },
  settings: {
    id: "settings",
    name: "Configurações Gerais do Sistema",
    shortLabel: "Configurações",
    allowedRoles: ["ADMIN"],
    description: "Parâmetros da empresa, integrações, segurança, licenças e cópias de segurança.",
  },
  staff: {
    id: "staff",
    name: "Gestão de Equipa & Colaboradores",
    shortLabel: "Colaboradores",
    allowedRoles: ["ADMIN", "RH"],
    description: "Gestão de colaboradores, atribuição de funções, credenciais e PINs.",
  },
  ai: {
    id: "ai",
    name: "Previsão AI & Análise Preditiva",
    shortLabel: "Previsão AI",
    allowedRoles: ["ADMIN", "SUPERVISOR"],
    description: "Modelos preditivos de vendas com Inteligência Artificial e geração de campanhas.",
  },
  training: {
    id: "training",
    name: "Centro de Formação & Manuais",
    shortLabel: "Formação",
    allowedRoles: ["ADMIN", "SUPERVISOR", "CASHIER", "RH", "FINANCEIRO", "AUDITOR"],
    description: "Vídeos explicativos, manuais e guias operacionais do sistema.",
  },
  gateway: {
    id: "gateway",
    name: "Integração Pagamentos Móveis",
    shortLabel: "Gateway",
    allowedRoles: ["ADMIN"],
    description: "Configuração das APIs do M-Pesa Paga Fácil e e-Mola.",
  },
  plans: {
    id: "plans",
    name: "Planos & Subscrições",
    shortLabel: "Planos",
    allowedRoles: ["ADMIN"],
    description: "Gestão de licenciamento e subscrições do OST Vendas.",
  },
};

/**
 * Normaliza o perfil de acesso a partir do utilizador ativo
 */
export function normalizeUserRole(user?: Employee | null): UserRole {
  if (!user || !user.role) return "CASHIER";
  const raw = user.role.toUpperCase().trim();
  
  if (raw.includes("RH") || raw.includes("RECURSOS HUMANOS")) {
    return "RH";
  }
  if (raw.includes("FINANCEIRO") || raw.includes("CONTABILISTA") || raw.includes("FINANÇAS")) {
    return "FINANCEIRO";
  }
  if (raw.includes("AUDITOR") || raw.includes("AUDITORIA")) {
    return "AUDITOR";
  }
  if (raw.includes("SUPERVISOR") || raw.includes("SUBGERENTE") || raw.includes("ENCARREGADO")) {
    return "SUPERVISOR";
  }
  if (raw.includes("ADMIN") || raw.includes("GESTOR") || raw.includes("GERENTE GERAL") || raw.includes("DIRETOR") || raw.includes("PROPRIETÁRIO")) {
    return "ADMIN";
  }
  // Caixa, Vendedor, Balconista e demais operadores
  return "CASHIER";
}

/**
 * Verifica se um determinado cargo tem permissão para aceder a um módulo
 */
export function canRoleAccessModule(
  role: UserRole | string,
  moduleId: string
): { allowed: boolean; moduleName: string; allowedRoles: UserRole[]; description: string } {
  const normRole: UserRole = typeof role === "string" && ["ADMIN", "SUPERVISOR", "CASHIER", "AUDITOR", "RH", "FINANCEIRO"].includes(role) 
    ? (role as UserRole)
    : normalizeUserRole({ role } as any);

  const rule = ROLE_MODULE_PERMISSIONS[moduleId.toLowerCase()];
  if (!rule) {
    // Se o módulo não estiver cadastrado nas restrições, permite apenas ADMIN por segurança
    return {
      allowed: normRole === "ADMIN",
      moduleName: moduleId,
      allowedRoles: ["ADMIN"],
      description: "Acesso reservado a administradores.",
    };
  }

  const allowed = rule.allowedRoles.includes(normRole);

  return {
    allowed,
    moduleName: rule.name,
    allowedRoles: rule.allowedRoles,
    description: rule.description,
  };
}

/**
 * Retorna o módulo padrão inicial para um dado cargo
 */
export function getDefaultModuleForRole(role: UserRole | string): string {
  const normRole: UserRole = typeof role === "string" && ["ADMIN", "SUPERVISOR", "CASHIER", "AUDITOR", "RH", "FINANCEIRO"].includes(role) 
    ? (role as UserRole)
    : normalizeUserRole({ role } as any);

  switch (normRole) {
    case "CASHIER":
      return "POS";
    case "ADMIN":
    case "SUPERVISOR":
    case "AUDITOR":
    case "FINANCEIRO":
      return "DASHBOARD";
    case "RH":
      return "STAFF";
    default:
      return "POS";
  }
}

/**
 * Retorna a designação amigável do cargo
 */
export function getRoleDisplayName(role: UserRole | string): string {
  switch (role) {
    case "ADMIN":
      return "Administrador";
    case "SUPERVISOR":
      return "Supervisor";
    case "CASHIER":
      return "Caixa / Vendedor";
    case "AUDITOR":
      return "Auditor";
    case "RH":
      return "Recursos Humanos";
    case "FINANCEIRO":
      return "Financeiro";
    default:
      return String(role);
  }
}
