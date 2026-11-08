import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  BookOpen,
  Keyboard,
  ShoppingBag,
  Package,
  HelpCircle,
  Search,
  Sparkles,
  CheckCircle2,
  Zap,
  Printer,
  ShieldCheck,
  CreditCard,
  Layers,
  ArrowRight
} from "lucide-react";

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: string;
  onNavigateModule?: (moduleKey: string) => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
  category: "Geral" | "Vendas / POS" | "Caixa" | "Navegação";
}

const SHORTCUTS: ShortcutItem[] = [
  { keys: ["F1"], description: "Abrir Guia do Utilizador / Manual do Sistema", category: "Geral" },
  { keys: ["Ctrl", "K"], description: "Pesquisa Rápida Global de Produtos e Clientes", category: "Geral" },
  { keys: ["Alt", "T"], description: "Alternar Tema Visual (Modo Claro / Modo Noturno)", category: "Geral" },
  { keys: ["Esc"], description: "Fechar Modais e Janelas Suspensas Ativas", category: "Geral" },
  
  { keys: ["F2"], description: "Adicionar Item Rápido ao Carrinho de Venda", category: "Vendas / POS" },
  { keys: ["Ctrl", "S"], description: "Finalizar Venda / Abrir Janela de Pagamento", category: "Vendas / POS" },
  { keys: ["Ctrl", "P"], description: "Imprimir Recibo / Factura do Cliente", category: "Vendas / POS" },
  { keys: ["Ctrl", "D"], description: "Aplicar Desconto Rápido no Carrinho", category: "Vendas / POS" },

  { keys: ["F4"], description: "Navegar Direto para o Módulo Ponto de Venda (POS)", category: "Navegação" },
  { keys: ["F8"], description: "Navegar para o Módulo de Caixa e Registros", category: "Navegação" },
  { keys: ["F9"], description: "Navegar para a Gestão de Stock e Inventário", category: "Navegação" },
  { keys: ["F10"], description: "Navegar para o Painel de Relatórios e Finanças", category: "Navegação" },
];

export const TutorialModal: React.FC<TutorialModalProps> = ({
  isOpen,
  onClose,
  theme = "daily",
  onNavigateModule
}) => {
  const [activeTab, setActiveTab] = useState<"quickstart" | "shortcuts" | "pos_guide" | "stock_guide" | "faq">("quickstart");
  const [shortcutSearch, setShortcutSearch] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isNight = theme === "night";

  const handlePrintTutorial = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      window.print();
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="pt">
      <head>
        <meta charset="UTF-8">
        <title>OST Vendas ERP - Guia de Atalhos & Tutorial</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 25px;
            color: #1e293b;
            line-height: 1.5;
          }
          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2px solid #f97316;
            padding-bottom: 12px;
            margin-bottom: 20px;
          }
          .title {
            font-size: 22px;
            font-weight: 800;
            color: #0f172a;
            margin: 0;
          }
          .subtitle {
            font-size: 12px;
            color: #64748b;
            margin-top: 4px;
          }
          .badge {
            background: #ffedd5;
            color: #c2410c;
            padding: 5px 12px;
            border-radius: 9999px;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            border: 1px solid #fed7aa;
          }
          .section-title {
            font-size: 13px;
            font-weight: 800;
            color: #ea580c;
            margin-top: 24px;
            margin-bottom: 12px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            font-size: 12px;
          }
          th, td {
            padding: 8px 12px;
            text-align: left;
            border-bottom: 1px solid #e2e8f0;
          }
          th {
            background-color: #f8fafc;
            font-weight: 700;
            color: #475569;
            text-transform: uppercase;
            font-size: 10px;
          }
          kbd {
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            padding: 2px 7px;
            font-family: monospace;
            font-weight: 800;
            font-size: 11px;
            color: #0f172a;
            box-shadow: 0 1px 1px rgba(0,0,0,0.1);
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 20px;
          }
          .card {
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 12px;
            background: #f8fafc;
          }
          .card-num {
            font-weight: 900;
            color: #ea580c;
            font-size: 13px;
            margin-bottom: 4px;
          }
          .card-title {
            font-weight: 700;
            font-size: 12px;
            margin-bottom: 4px;
            color: #0f172a;
          }
          .card-desc {
            font-size: 11px;
            color: #475569;
          }
          .footer {
            margin-top: 30px;
            padding-top: 12px;
            border-top: 1px solid #cbd5e1;
            font-size: 10px;
            color: #94a3b8;
            display: flex;
            justify-content: space-between;
          }
          @media print {
            body { margin: 10px; }
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">OST VENDAS ERP — Guia Rápido & Atalhos de Teclado</h1>
            <div class="subtitle">Manual Oficial de Instruções e Atalhos para Operadores do Sistema</div>
          </div>
          <div class="badge">Atalhos (F1)</div>
        </div>

        <div class="section-title">⌨️ Tabela Completa de Atalhos de Teclado</div>
        <table>
          <thead>
            <tr>
              <th style="width: 25%;">Categoria</th>
              <th style="width: 50%;">Descrição da Função</th>
              <th style="width: 25%;">Teclas de Atalho</th>
            </tr>
          </thead>
          <tbody>
            ${SHORTCUTS.map(s => `
              <tr>
                <td><strong>${s.category}</strong></td>
                <td>${s.description}</td>
                <td>${s.keys.map(k => `<kbd>${k}</kbd>`).join(' + ')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="section-title">🚀 Passo a Passo Rápido de Operação</div>
        <div class="grid">
          <div class="card">
            <div class="card-num">Passo 01</div>
            <div class="card-title">Abertura de Caixa</div>
            <div class="card-desc">Verifique e insira o saldo inicial de caixa no módulo "Caixa" antes de iniciar as vendas.</div>
          </div>
          <div class="card">
            <div class="card-num">Passo 02</div>
            <div class="card-title">Vendas & Recibos</div>
            <div class="card-desc">Use o leitor de código de barras no POS, aplique descontos e pressione Ctrl+S para finalizar a venda.</div>
          </div>
          <div class="card">
            <div class="card-num">Passo 03</div>
            <div class="card-title">Gestão de Inventário</div>
            <div class="card-desc">Controle datas de validade de lotes e acompanhe os alertas de stock mínimo em tempo real.</div>
          </div>
        </div>

        <div class="footer">
          <span>OST Vendas ERP — Sistema de Facturação e Gestão Comercial</span>
          <span>Documento Impresso em: ${new Date().toLocaleString("pt-MZ")}</span>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const filteredShortcuts = SHORTCUTS.filter(s =>
    s.description.toLowerCase().includes(shortcutSearch.toLowerCase()) ||
    s.keys.join(" ").toLowerCase().includes(shortcutSearch.toLowerCase()) ||
    s.category.toLowerCase().includes(shortcutSearch.toLowerCase())
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-3 sm:p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className={`w-full max-w-4xl h-[88vh] max-h-[780px] rounded-2xl border shadow-2xl overflow-hidden flex flex-col relative ${
            isNight ? "bg-zinc-950 text-slate-100 border-zinc-800" : "bg-white text-slate-800 border-slate-200"
          }`}
          id="tutorial-guide-modal"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-100 dark:border-zinc-850 bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-transparent flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center shadow-lg shadow-orange-500/20">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-black text-base sm:text-lg tracking-tight text-slate-900 dark:text-slate-100">
                    Tutorial & Guia do Utilizador
                  </h2>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/25 uppercase tracking-wider">
                    OST Vendas ERP
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Instruções práticas, atalhos de teclado e fluxos essenciais de trabalho
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrintTutorial}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 font-extrabold text-xs border border-orange-500/20 transition-all cursor-pointer"
                title="Imprimir Guia de Atalhos"
              >
                <Printer className="w-4 h-4 text-orange-500" />
                <span className="hidden sm:inline">Imprimir Tutorial</span>
              </button>

              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                title="Fechar Tutorial (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Navigation Tabs Bar */}
          <div className="px-5 pt-3 border-b border-slate-200 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/40 flex items-center gap-2 overflow-x-auto custom-scrollbar shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("quickstart")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-bold text-xs transition-all whitespace-nowrap border-b-2 ${
                activeTab === "quickstart"
                  ? "border-orange-500 text-orange-600 dark:text-orange-400 bg-white dark:bg-zinc-950 shadow-xs"
                  : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Zap className="w-4 h-4 text-amber-500" />
              <span>Início Rápido</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("shortcuts")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-bold text-xs transition-all whitespace-nowrap border-b-2 ${
                activeTab === "shortcuts"
                  ? "border-orange-500 text-orange-600 dark:text-orange-400 bg-white dark:bg-zinc-950 shadow-xs"
                  : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Keyboard className="w-4 h-4 text-orange-500" />
              <span>Atalhos de Teclado</span>
              <span className="text-[10px] bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.2 rounded-md font-mono">
                F1
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("pos_guide")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-bold text-xs transition-all whitespace-nowrap border-b-2 ${
                activeTab === "pos_guide"
                  ? "border-orange-500 text-orange-600 dark:text-orange-400 bg-white dark:bg-zinc-950 shadow-xs"
                  : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <ShoppingBag className="w-4 h-4 text-emerald-500" />
              <span>Ponto de Venda (POS)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("stock_guide")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-bold text-xs transition-all whitespace-nowrap border-b-2 ${
                activeTab === "stock_guide"
                  ? "border-orange-500 text-orange-600 dark:text-orange-400 bg-white dark:bg-zinc-950 shadow-xs"
                  : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Package className="w-4 h-4 text-blue-500" />
              <span>Stock & Lotes</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("faq")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-bold text-xs transition-all whitespace-nowrap border-b-2 ${
                activeTab === "faq"
                  ? "border-orange-500 text-orange-600 dark:text-orange-400 bg-white dark:bg-zinc-950 shadow-xs"
                  : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <HelpCircle className="w-4 h-4 text-purple-500" />
              <span>Dúvidas Frequentes</span>
            </button>
          </div>

          {/* Main Body Content */}
          <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
            {/* TAB 1: QUICKSTART */}
            {activeTab === "quickstart" && (
              <div className="space-y-6">
                <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                  isNight ? "bg-orange-950/20 border-orange-500/20" : "bg-orange-50/70 border-orange-200"
                }`}>
                  <div className="space-y-1">
                    <h3 className="text-sm font-black text-orange-800 dark:text-orange-300 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500" />
                      <span>Bem-vindo ao OST Vendas!</span>
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      O seu sistema completo de facturação, ponto de venda, gestão de stock e controlo financeiro.
                    </p>
                  </div>
                  {onNavigateModule && (
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateModule("POS");
                        onClose();
                      }}
                      className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-600 text-white font-extrabold text-xs rounded-xl shadow-md hover:from-orange-600 hover:to-amber-700 transition-all flex items-center gap-1.5 shrink-0"
                    >
                      <span>Ir para o POS (Vendas)</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Step 1 */}
                  <div className={`p-4 rounded-2xl border flex flex-col justify-between space-y-3 ${
                    isNight ? "bg-zinc-900/60 border-zinc-800" : "bg-slate-50 border-slate-200"
                  }`}>
                    <div className="space-y-2">
                      <div className="w-8 h-8 rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400 font-black text-sm flex items-center justify-center border border-orange-500/20">
                        01
                      </div>
                      <h4 className="font-extrabold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <ShoppingBag className="w-4 h-4 text-orange-500" />
                        <span>Abrir e Registar Caixa</span>
                      </h4>
                      <p className="text-[11.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Antes de realizar vendas, confirme o saldo inicial do caixa no módulo <b>Caixa</b>. No fim do turno, faça o fecho cego e fecho de turno.
                      </p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className={`p-4 rounded-2xl border flex flex-col justify-between space-y-3 ${
                    isNight ? "bg-zinc-900/60 border-zinc-800" : "bg-slate-50 border-slate-200"
                  }`}>
                    <div className="space-y-2">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-black text-sm flex items-center justify-center border border-emerald-500/20">
                        02
                      </div>
                      <h4 className="font-extrabold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <CreditCard className="w-4 h-4 text-emerald-500" />
                        <span>Vendas e Facturação POS</span>
                      </h4>
                      <p className="text-[11.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Selecione produtos por código de barras ou nome, aplique descontos, escolha o método de pagamento (Numerário, M-Pesa, E-Mola, POS/TPA) e imprima o recibo.
                      </p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className={`p-4 rounded-2xl border flex flex-col justify-between space-y-3 ${
                    isNight ? "bg-zinc-900/60 border-zinc-800" : "bg-slate-50 border-slate-200"
                  }`}>
                    <div className="space-y-2">
                      <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 font-black text-sm flex items-center justify-center border border-blue-500/20">
                        03
                      </div>
                      <h4 className="font-extrabold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <Package className="w-4 h-4 text-blue-500" />
                        <span>Gestão de Inventário e Lotes</span>
                      </h4>
                      <p className="text-[11.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Registe produtos, controle a validade dos lotes, defina alertas de stock mínimo e dê entrada automática de encomendas dos fornecedores.
                      </p>
                    </div>
                  </div>
                </div>

                <div className={`p-4 rounded-2xl border ${
                  isNight ? "bg-zinc-900/40 border-zinc-800" : "bg-white border-slate-200"
                }`}>
                  <h4 className="font-extrabold text-xs text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-500" />
                    <span>Recursos Recomendados para Configuração Inicial</span>
                  </h4>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <li className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-zinc-900">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>Definir NUIT da empresa e IVA (Definições)</span>
                    </li>
                    <li className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-zinc-900">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>Carregar Logotipo Institucional (Atalho no Topo)</span>
                    </li>
                    <li className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-zinc-900">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>Configurar Impressora Térmica 80mm ou PDF A4</span>
                    </li>
                    <li className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-zinc-900">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>Cadastrar Colaboradores e Permissões de Acesso</span>
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* TAB 2: KEYBOARD SHORTCUTS */}
            {activeTab === "shortcuts" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Pesquisar atalho por tecla ou acção..."
                      value={shortcutSearch}
                      onChange={(e) => setShortcutSearch(e.target.value)}
                      className={`w-full pl-9 pr-3 py-2 rounded-xl border text-xs outline-none focus:border-orange-500 ${
                        isNight ? "bg-zinc-900 border-zinc-800 text-slate-100" : "bg-white border-slate-200 text-slate-800"
                      }`}
                    />
                  </div>
                  <span className="text-xs text-slate-400 font-semibold">
                    {filteredShortcuts.length} Atalhos Registados
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredShortcuts.map((item, index) => (
                    <div
                      key={index}
                      className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                        isNight
                          ? "bg-zinc-900/60 border-zinc-800 hover:border-zinc-700"
                          : "bg-slate-50/80 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-orange-600 dark:text-orange-400 block">
                          {item.category}
                        </span>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          {item.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {item.keys.map((k, kIdx) => (
                          <React.Fragment key={kIdx}>
                            {kIdx > 0 && <span className="text-xs text-slate-400 font-bold">+</span>}
                            <kbd className="px-2.5 py-1 rounded-lg text-xs font-mono font-extrabold bg-slate-200 dark:bg-zinc-800 text-slate-800 dark:text-slate-100 shadow-xs border border-slate-300 dark:border-zinc-700">
                              {k}
                            </kbd>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 3: POS GUIDE */}
            {activeTab === "pos_guide" && (
              <div className="space-y-5">
                <div className={`p-4 rounded-2xl border ${
                  isNight ? "bg-zinc-900/50 border-zinc-800" : "bg-emerald-50/50 border-emerald-200"
                }`}>
                  <h3 className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300 flex items-center gap-2 mb-1">
                    <ShoppingBag className="w-4 h-4 text-emerald-500" />
                    <span>Como Utilizar o Ponto de Venda (POS)</span>
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    O módulo de POS permite atendimento ultra-rápido ao cliente com suporte a leitura de código de barras e recibos em tempo real.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className={`p-4 rounded-2xl border space-y-1.5 ${
                    isNight ? "bg-zinc-900/40 border-zinc-800" : "bg-white border-slate-200"
                  }`}>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span>1. Selecção de Produtos e Carrinho</span>
                    </h4>
                    <p className="text-[11.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      Utilize o leitor de código de barras físico conectado via USB/Bluetooth ou digite o nome/código na barra de pesquisa. Clique no produto para incrementar a quantidade.
                    </p>
                  </div>

                  <div className={`p-4 rounded-2xl border space-y-1.5 ${
                    isNight ? "bg-zinc-900/40 border-zinc-800" : "bg-white border-slate-200"
                  }`}>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                      <span>2. Identificação do Cliente e Descontos</span>
                    </h4>
                    <p className="text-[11.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      Selecione um cliente registado para associar histórico de compras ou conta corrente de dívida. É possível aplicar desconto percentual ou em valor fixo mediante autorização.
                    </p>
                  </div>

                  <div className={`p-4 rounded-2xl border space-y-1.5 ${
                    isNight ? "bg-zinc-900/40 border-zinc-800" : "bg-white border-slate-200"
                  }`}>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                      <span>3. Finalização e Emissão de Recibo</span>
                    </h4>
                    <p className="text-[11.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      Clique em <b>Finalizar Venda</b> (ou pressione <kbd className="px-1 bg-slate-200 dark:bg-zinc-800 rounded font-mono text-[10px]">Ctrl+S</kbd>). O troco é calculado automaticamente. O recibo térmico de 80mm ou PDF A4 é gerado instantaneamente.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: STOCK GUIDE */}
            {activeTab === "stock_guide" && (
              <div className="space-y-5">
                <div className={`p-4 rounded-2xl border ${
                  isNight ? "bg-zinc-900/50 border-zinc-800" : "bg-blue-50/50 border-blue-200"
                }`}>
                  <h3 className="text-xs font-extrabold text-blue-800 dark:text-blue-300 flex items-center gap-2 mb-1">
                    <Package className="w-4 h-4 text-blue-500" />
                    <span>Controlo Inteligente de Inventário e Lotes</span>
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Mantenha o catálogo atualizado, evite perdas por expiração e sincronize stocks entre filiais.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isNight ? "bg-zinc-900/40 border-zinc-800" : "bg-white border-slate-200"
                  }`}>
                    <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800 dark:text-slate-200">
                      <Layers className="w-4 h-4 text-amber-500" />
                      <span>Gestão de Lotes & Validade</span>
                    </div>
                    <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
                      Para produtos perecíveis, crie lotes indicando data de expiração. O sistema alerta automaticamente com antecedência para promoções ou liquidações.
                    </p>
                  </div>

                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isNight ? "bg-zinc-900/40 border-zinc-800" : "bg-white border-slate-200"
                  }`}>
                    <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800 dark:text-slate-200">
                      <Printer className="w-4 h-4 text-orange-500" />
                      <span>Impressão de Etiquetas de Código de Barras</span>
                    </div>
                    <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
                      Gere e imprima folhas de etiquetas de código de barras (EAN-13 / CODE128) diretamente no sistema para colar nas prateleiras e embalagens.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: FAQ */}
            {activeTab === "faq" && (
              <div className="space-y-4">
                <div className={`p-4 rounded-2xl border space-y-1.5 ${
                  isNight ? "bg-zinc-900/40 border-zinc-800" : "bg-white border-slate-200"
                }`}>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-orange-500 shrink-0" />
                    <span>O sistema funciona sem conexão à internet (Offline)?</span>
                  </h4>
                  <p className="text-[11.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    O sistema opera em modo seguro com sincronização contínua para garantir a integridade em tempo real com o servidor central protegido. É necessária uma ligação ativa à internet para emitir vendas com total segurança e conformidade fiscal.
                  </p>
                </div>

                <div className={`p-4 rounded-2xl border space-y-1.5 ${
                  isNight ? "bg-zinc-900/40 border-zinc-800" : "bg-white border-slate-200"
                }`}>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-orange-500 shrink-0" />
                    <span>Como posso alterar as informações da empresa e logotipo no recibo?</span>
                  </h4>
                  <p className="text-[11.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Pode clicar no botão de atalho <b>Logotipo</b> no topo superior da tela ou ir a <b>Definições &gt; Dados Institucionais</b> para definir o nome, NUIT, endereço, telefone e imagem do logotipo.
                  </p>
                </div>

                <div className={`p-4 rounded-2xl border space-y-1.5 ${
                  isNight ? "bg-zinc-900/40 border-zinc-800" : "bg-white border-slate-200"
                }`}>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-orange-500 shrink-0" />
                    <span>Como faço uma cópia de segurança (Backup) dos meus dados?</span>
                  </h4>
                  <p className="text-[11.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Aceda ao módulo de <b>Definições &gt; Cópia de Segurança &amp; Dados</b> para descarregar o ficheiro de backup completo ou executar sincronização na nuvem.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Floating Print Tutorial FAB Button */}
          <div className="absolute bottom-18 right-6 z-30 pointer-events-auto">
            <button
              type="button"
              onClick={handlePrintTutorial}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-600 via-amber-600 to-orange-500 hover:from-orange-500 hover:to-amber-500 text-white font-extrabold text-xs rounded-full shadow-2xl shadow-orange-500/40 border border-amber-300/40 transition-all hover:scale-105 active:scale-95 cursor-pointer group"
              title="Imprimir Cópia em Papel / PDF do Guia e Atalhos"
              id="floating-print-tutorial-btn"
            >
              <Printer className="w-4 h-4 text-amber-200 group-hover:rotate-12 transition-transform" />
              <span>Imprimir Guia de Atalhos</span>
            </button>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-100 dark:border-zinc-850 bg-slate-50/50 dark:bg-zinc-900/50 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Dica: Pressione <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 font-mono text-[10px]">F1</kbd> em qualquer lugar para abrir esta ajuda</span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95"
            >
              Compreendido
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default TutorialModal;
