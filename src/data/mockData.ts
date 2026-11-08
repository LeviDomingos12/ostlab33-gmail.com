import { Product, Customer, Transaction, CashFlowEntry, Employee, SystemSettings, AuditLog, Branch } from "../types";

export const initialProducts: Product[] = [];

export const initialCustomers: Customer[] = [];

export const initialEmployees: Employee[] = [];

export const initialCashFlow: CashFlowEntry[] = [];

export const initialAuditLogs: AuditLog[] = [];

// Generates dynamic transactions - returns clean empty list
export const generateMockTransactions = (): Transaction[] => {
  return [];
};

export const initialBranches: Branch[] = [
  {
    id: "central",
    name: "Sede Principal (Maputo)",
    code: "MAP-01",
    city: "Maputo",
    address: "Av. 24 de Julho, nº 1420",
    contact: "+258 84 100 2000",
    managerName: "Levi Domingos",
    isMainStore: true,
    status: "ACTIVE",
    openingHours: "07:30 - 20:30",
    color: "#ea580c"
  },
  {
    id: "filial_matola",
    name: "Filial Matola",
    code: "MAT-02",
    city: "Matola",
    address: "Av. da Matola, nº 450",
    contact: "+258 82 200 3000",
    managerName: "Carlos Manjate",
    isMainStore: false,
    status: "ACTIVE",
    openingHours: "08:00 - 20:00",
    color: "#2563eb"
  },
  {
    id: "filial_beira",
    name: "Filial Beira",
    code: "BEI-03",
    city: "Beira",
    address: "Praça do Município, nº 12",
    contact: "+258 86 300 4000",
    managerName: "Marta Ubisse",
    isMainStore: false,
    status: "ACTIVE",
    openingHours: "08:00 - 19:30",
    color: "#10b981"
  }
];

export const defaultSettings: SystemSettings = {
  companyName: "",
  companyAddress: "",
  companyNuit: "",
  vatDefaultRate: 16,
  currency: "MT",
  logoUrl: "",
  autoBackup: true,
  smsGateway: "",
  smtpServer: "",
  reportRecipientEmail: "",
  alertsRecipientEmail: "",
  reportHour: "02:00",
  reportFrequency: "daily",
  smtpEnabled: false,
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpPassword: "",
  smtpSecure: false,
  slogan: "",
  storeAddress: "",
  storeContact: "",
  defaultVat: 16,
  theme: "laranja",
  smsAlertsEnabled: false,
  smsProviderType: "TWILIO",
  smsTwilioSid: "",
  smsTwilioToken: "",
  smsTwilioFrom: "",
  smsCustomUrl: "",
  smsManagerPhone: "",
  smsStockThreshold: 5,
  printerEnabled: false,
  printerName: "",
  printerConnectionType: "USB",
  printerIpAddress: "",
  printerPort: "",
  printerBaudRate: "",
  printerType: "RECEIPT",
  paperSize: "80MM",
  printerAutoCut: true,
  activeBranchId: "central",
  inventoryStrategy: "FIFO",
  fiscalModeEnabled: true,
  fiscalCertificationNumber: "",
  aiAutoMonitoring: true,
  aiHealthSensitivity: 80,
  branches: initialBranches,
  stockTransfers: [],
  batches: [],
  categoryStockThresholds: {
    "Mercearia": 5,
    "Bebidas": 10,
    "Eletrónicos": 3,
    "Limpeza": 5,
    "Vestuário": 3,
    "Farmácia": 10,
    "Geral": 5
  }
};

export interface MasterclassVideo {
  id: string;
  title: string;
  duration: string;
  description: string;
  thumbnail: string;
  category: "vendas" | "caixa" | "stock" | "relatorios" | "inteligencia" | "integracoes";
  steps: string[];
  instructor?: string;
  youtubeId?: string;
}

export const masterclassVideos: MasterclassVideo[] = [
  {
    id: "v1",
    title: "Módulo de Vendas (POS): Carrinho Inteligente & Descontos",
    youtubeId: "v_7y791uQ8U",
    duration: "4:15",
    description: "Aprenda a pesquisar produtos no carrinho inteligente de alta velocidade, aplicar descontos imediatos, taxas de IVA e associar clientes para acumular pontos de fidelidade.",
    thumbnail: "💻",
    category: "vendas",
    instructor: "Formador Certificado",
    steps: [
      "Inicie o POS e pesquise produtos digitando o nome ou filtrando pelas categorias principais.",
      "Clique nos produtos para os adicionar ao carrinho inteligente e ajuste as quantidades de forma célere.",
      "Associe o cliente para acumular pontos de fidelidade e aplicar descontos percentuais ou fixos.",
      "Finalize a venda escolhendo o método de pagamento ideal e imprima a factura homologada de imediato."
    ]
  },
  {
    id: "v2",
    title: "Gestão de Caixa: Entradas, Saídas, Sangrias & Fechamento",
    youtubeId: "L2n-fK0Y_jM",
    duration: "3:30",
    description: "Saiba como registrar abertura de caixa com troco inicial, sangrias seguras para o cofre, saídas de despesas miúdas e conferência final do balancete físico.",
    thumbnail: "💰",
    category: "caixa",
    instructor: "Formador Certificado",
    steps: [
      "Abra o caixa informando o valor de troco inicial disponível em gaveta.",
      "Registe movimentos de entrada (suprimentos) ou saídas (sangrias para o cofre e quebras justificadas).",
      "No fecho do turno, conte fisicamente as cédulas e moedas moçambicanas no painel do sistema.",
      "Submeta o balancete de fechamento para homologação imediata pelo supervisor."
    ]
  },
  {
    id: "v3",
    title: "Stock Inteligente: Controle de Lotes (Batch) & Alertas de Validade",
    youtubeId: "rV2W_W-Q67Q",
    duration: "5:00",
    description: "Aprenda a cadastrar produtos com preço de custo/venda, configurar limites mínimos de stock de segurança e controlar datas de validade por lote.",
    thumbnail: "📦",
    category: "stock",
    instructor: "Formador Certificado",
    steps: [
      "Aceda à aba de Stock e crie ou edite um produto com preço de custo e preço de venda.",
      "Configure o stock mínimo crítico para ativar alertas automáticos visuais no painel.",
      "Preencha os lotes com datas de validade para monitorar produtos próximos do vencimento.",
      "Importe o seu inventário de forma massiva utilizando um arquivo CSV estruturado."
    ]
  },
  {
    id: "v4",
    title: "Relatórios Automáticos: Envio SMTP por Email & Análises",
    youtubeId: "8tq1Fw84v2E",
    duration: "3:10",
    description: "Descubra como configurar servidores SMTP de e-mail e programar o envio automatizado de faturamento diário diretamente para a sua caixa de correio eletrônico.",
    thumbnail: "📈",
    category: "relatorios",
    instructor: "Formador Certificado",
    steps: [
      "Aceda ao menu de Definições e ative as configurações do canal SMTP de correio.",
      "Introduza os dados do servidor SMTP (Host, Porta de segurança, Usuário e Senha).",
      "Defina o e-mail administrador do destinatário final nas definições.",
      "Agende a hora do despacho automático ou force um envio de teste para comprovar o recebimento do PDF."
    ]
  },
  {
    id: "v5",
    title: "Previsão Inteligente por IA (AiForecast): Planeamento & Stock",
    youtubeId: "O07M-b7Fj9o",
    duration: "4:45",
    description: "Utilize o Centro de Inteligência Artificial do OST Vendas para analisar o histórico de vendas, projetar faturamento para os próximos meses e obter recomendações automatizadas de compras.",
    thumbnail: "🔮",
    category: "inteligencia",
    instructor: "Formador Certificado",
    steps: [
      "Aceda ao módulo 'Previsão IA' no menu de navegação do sistema.",
      "Gere previsões preditivas alimentadas com as faturas reais contidas na base do Firestore.",
      "Analise as projeções de faturamento e margem estimadas para os próximos 30 dias.",
      "Reveja as sugestões de compra para produtos de alta rotação para evitar roturas de stock."
    ]
  },
  {
    id: "v6",
    title: "Gateways M-Pesa & E-Mola: APIs de Pagamentos Móveis",
    youtubeId: "3P4n9L7bQ8M",
    duration: "3:55",
    description: "Aprenda a integrar chaves de API e shortcodes reais de carteiras móveis em Moçambique, permitindo Push USSD de confirmação direta no ecrã do telemóvel do cliente.",
    thumbnail: "📱",
    category: "integracoes",
    instructor: "Formador Certificado",
    steps: [
      "Aceda às Definições de Gateway e localize as seções M-Pesa e E-Mola.",
      "Introduza a sua Chave de API, Shortcode Comercial e número do canal integrador.",
      "Durante as vendas no POS, selecione M-Pesa ou E-Mola para acionar a notificação Push de pagamento automática.",
      "Acompanhe o estado de liquidação das faturas em tempo real com conciliação bancária imediata."
    ]
  }
];
