import { SubscriptionPlan } from "../types";

export const PLAN_RANKS: Record<SubscriptionPlan, number> = {
  BRONZE: 1,
  PRATA: 2,
  OURO: 3,
};

export interface ModuleAccessRule {
  id: string;
  name: string;
  requiredPlan: SubscriptionPlan;
  description: string;
}

export const MODULE_PLAN_RULES: Record<string, ModuleAccessRule> = {
  dashboard: {
    id: "dashboard",
    name: "Dashboard Inteligente",
    requiredPlan: "BRONZE",
    description: "Visão geral de vendas e métricas básicas de desempenho.",
  },
  pos: {
    id: "pos",
    name: "Vendas (POS)",
    requiredPlan: "BRONZE",
    description: "Caixa registadora e faturação para vendas no balcão.",
  },
  cash: {
    id: "cash",
    name: "Gestão de Caixa",
    requiredPlan: "BRONZE",
    description: "Abertura, fecho e lançamentos diários de caixa.",
  },
  customers: {
    id: "customers",
    name: "Gestão de Clientes",
    requiredPlan: "BRONZE",
    description: "Registo e consulta do histórico de compras dos clientes.",
  },
  reports: {
    id: "reports",
    name: "Relatórios & Faturação",
    requiredPlan: "BRONZE",
    description: "Relatórios financeiros de vendas e listagem de recibos.",
  },
  training: {
    id: "training",
    name: "Centro de Formação",
    requiredPlan: "BRONZE",
    description: "Guias, vídeos e manuais de formação para operadores.",
  },
  plans: {
    id: "plans",
    name: "Planos & Subscrições",
    requiredPlan: "BRONZE",
    description: "Gestão do plano ativo e consulta de recursos comerciais.",
  },
  stock: {
    id: "stock",
    name: "Gestão Avançada de Stock",
    requiredPlan: "PRATA",
    description: "Controlo avançado de lotes, datas de expiração e pontos de encomenda.",
  },
  gateway: {
    id: "gateway",
    name: "Integração Mobile Money",
    requiredPlan: "PRATA",
    description: "Integração direta de pagamentos móveis M-Pesa e e-Mola (Paga Fácil).",
  },
  staff: {
    id: "staff",
    name: "Equipa & Auditoria D3",
    requiredPlan: "PRATA",
    description: "Gestão de colaboradores e registo de logs de auditoria detalhados.",
  },
  settings: {
    id: "settings",
    name: "Configurações Gerais",
    requiredPlan: "PRATA",
    description: "Definições do sistema, dados da empresa e parâmetros fiscais.",
  },
  branches: {
    id: "branches",
    name: "Multi-Loja & Filiais",
    requiredPlan: "OURO",
    description: "Gestão centralizada de múltiplas lojas, stocks isolados e transferências inter-filiais.",
  },
  ai: {
    id: "ai",
    name: "Previsão AI Premium",
    requiredPlan: "OURO",
    description: "Modelos preditivos avançados com Inteligência Artificial e Gerador de Flyers.",
  },
};

export function canAccessModule(
  moduleId: string,
  userPlan: SubscriptionPlan = "OURO"
): { allowed: boolean; requiredPlan: SubscriptionPlan; moduleName: string; description: string } {
  const rule = MODULE_PLAN_RULES[moduleId.toLowerCase()];
  if (!rule) {
    return { allowed: true, requiredPlan: "BRONZE", moduleName: moduleId, description: "" };
  }

  const userRank = PLAN_RANKS[userPlan] || 3;
  const requiredRank = PLAN_RANKS[rule.requiredPlan] || 1;

  return {
    allowed: userRank >= requiredRank,
    requiredPlan: rule.requiredPlan,
    moduleName: rule.name,
    description: rule.description,
  };
}
