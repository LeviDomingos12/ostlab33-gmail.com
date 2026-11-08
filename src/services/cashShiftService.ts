import { Transaction, CashFlowEntry, CashClosure } from "../types";
import { CommercialDataService } from "./dataService";
import { generateEntityId } from "../lib/deterministic";

export const LOCAL_STORAGE_ACTIVE_SHIFT_KEY = "ost_active_cash_shift";
export const LOCAL_STORAGE_SHIFT_COUNTER_KEY = "ost_cash_shift_counter";

export interface ActiveCashShift {
  id: string;
  shiftNumber: number;
  status: "OPEN" | "CLOSED";
  openingBalance: number;
  openedAt: string;
  openedBy: string;
  openingSupervisor?: string;
  openingNotes?: string;
  registerId: string;
  branchId?: string;
  closedAt?: string;
  closedBy?: string;
  closingSupervisor?: string;
  closingNotes?: string;
}

export interface ShiftChronologicalMovement {
  id: string;
  timestamp: string;
  type: "ABERTURA" | "PAGAMENTO_VENDA" | "TROCO_VENDA" | "SUPRIMENTO" | "SANGRIA" | "DESPESA" | "VENDA_DIGITAL";
  categoryLabel: string;
  description: string;
  amountIn: number;
  amountOut: number;
  netImpact: number;
  balanceAfter: number;
  changeSource?: "FUNDO_INICIAL" | "VENDAS_ACUMULADAS" | "MISTO" | "N/A";
  reference?: string;
  operator: string;
  paymentMethod?: string;
}

export interface ShiftMetricsSummary {
  shiftId: string;
  status: "OPEN" | "CLOSED";
  registerId: string;
  operator: string;
  openedAt: string;
  
  // Fundo inicial
  initialFloat: number;
  
  // Vendas em Dinheiro
  cashSalesCount: number;
  totalCashReceived: number;
  totalChangeGiven: number;
  netCashSales: number;
  
  // Análise do Troco (Fundo Inicial vs. Vendas)
  changeFromInitialFloat: number;
  changeFromSales: number;
  initialFloatRemaining: number;
  isInitialFloatExhausted: boolean;
  changeStatusLabel: string;
  
  // Entradas e Saídas Manuais
  reinforcements: number;
  inputs: number;
  totalManualEntries: number;
  sangrias: number;
  expenses: number;
  totalManualExits: number;
  
  // Saldo Físico Esperado na Gaveta
  expectedCashInDrawer: number;
  
  // Vendas Eletrónicas / Digitais
  mpesaSales: number;
  emolaSales: number;
  posCardSales: number;
  transferSales: number;
  totalDigitalSales: number;
  
  // Totais Gerais do Turno
  totalSalesCount: number;
  totalSalesAmount: number;
  
  // Movimentos Cronológicos Individuais
  movements: ShiftChronologicalMovement[];
}

export const CashShiftService = {
  /**
   * Obtém o turno de caixa ativo (sincronizado PostgreSQL/Supabase + LocalStorage)
   */
  async getActiveShift(): Promise<ActiveCashShift | null> {
    try {
      // 1. Tentar ler do Supabase / PostgreSQL
      const remote = await CommercialDataService.fetchActiveCashShift();
      if (remote && remote.status === "OPEN") {
        const active: ActiveCashShift = {
          id: (remote as any).id && (remote as any).id !== "current_shift" ? (remote as any).id : `TURNO-${(remote.openedAt || new Date().toISOString()).slice(0, 10).replace(/-/g, "")}`,
          shiftNumber: (remote as any).shiftNumber || 1,
          status: "OPEN",
          openingBalance: Number(remote.openingBalance || 0),
          openedAt: remote.openedAt || new Date().toISOString(),
          openedBy: remote.openedBy || "Operador",
          openingSupervisor: remote.openingSupervisor || "",
          openingNotes: remote.openingNotes || "",
          registerId: (remote as any).registerId || "POS-01"
        };
        // Sincronizar cache local
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem(LOCAL_STORAGE_ACTIVE_SHIFT_KEY, JSON.stringify(active));
        }
        return active;
      }
    } catch (err) {
      console.warn("[CashShiftService] Falha ao ler turno ativo do servidor:", err);
    }

    // 2. Fallback para LocalStorage se o servidor não tiver ou estiver offline
    if (typeof window !== "undefined" && window.localStorage) {
      const stored = window.localStorage.getItem(LOCAL_STORAGE_ACTIVE_SHIFT_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.status === "OPEN") {
            return parsed;
          }
        } catch {
          // JSON inválido
        }
      }
    }

    return null;
  },

  /**
   * Salva o estado do turno ativo em ambos os armazenamentos
   */
  async saveShiftState(shift: ActiveCashShift | null): Promise<void> {
    if (typeof window !== "undefined" && window.localStorage) {
      if (shift) {
        window.localStorage.setItem(LOCAL_STORAGE_ACTIVE_SHIFT_KEY, JSON.stringify(shift));
      } else {
        window.localStorage.removeItem(LOCAL_STORAGE_ACTIVE_SHIFT_KEY);
      }
    }

    if (shift) {
      try {
        await CommercialDataService.saveActiveCashShift({
          status: shift.status,
          openingBalance: shift.openingBalance,
          openedAt: shift.openedAt,
          openedBy: shift.openedBy,
          openingSupervisor: shift.openingSupervisor,
          openingNotes: shift.openingNotes
        });
      } catch (err) {
        console.warn("[CashShiftService] Aviso ao persistir turno no PostgreSQL:", err);
      }
    } else {
      try {
        await CommercialDataService.saveActiveCashShift({
          status: "CLOSED",
          openingBalance: 0,
          openedAt: new Date().toISOString(),
          openedBy: "Sistema"
        });
      } catch {
        // Ignorar
      }
    }
  },

  /**
   * Abre um novo turno de caixa com verificação do fundo inicial
   */
  async openShift(params: {
    openingBalance: number;
    openedBy: string;
    openingSupervisor?: string;
    openingNotes?: string;
    registerId?: string;
  }): Promise<ActiveCashShift> {
    const now = new Date().toISOString();
    
    // Obter próximo número sequencial de turno
    let nextNum = 1;
    if (typeof window !== "undefined" && window.localStorage) {
      const storedCount = window.localStorage.getItem(LOCAL_STORAGE_SHIFT_COUNTER_KEY);
      if (storedCount) {
        nextNum = (parseInt(storedCount, 10) || 0) + 1;
      }
      window.localStorage.setItem(LOCAL_STORAGE_SHIFT_COUNTER_KEY, nextNum.toString());
    }

    const shiftId = generateEntityId("TURNO");
    const activeShift: ActiveCashShift = {
      id: shiftId,
      shiftNumber: nextNum,
      status: "OPEN",
      openingBalance: Math.max(0, Number(params.openingBalance || 0)),
      openedAt: now,
      openedBy: params.openedBy || "Operador",
      openingSupervisor: params.openingSupervisor || "",
      openingNotes: params.openingNotes || "",
      registerId: params.registerId || "POS-01"
    };

    await this.saveShiftState(activeShift);
    return activeShift;
  },

  /**
   * Encerra o turno de caixa atual, calcula divergência e emite fecho
   */
  async closeShift(params: {
    activeShift: ActiveCashShift;
    physicalCount: number;
    closedBy: string;
    closingSupervisor?: string;
    closingNotes?: string;
    transactions: Transaction[];
    cashFlow: CashFlowEntry[];
    denominations?: Record<string, number>;
  }): Promise<{ closure: CashClosure; difference: number; differenceType: "EXACT" | "SURPLUS" | "SHORTAGE" }> {
    const { activeShift, physicalCount, closedBy, closingSupervisor, closingNotes, transactions, cashFlow, denominations } = params;
    const now = new Date().toISOString();

    const metrics = this.calculateShiftMetrics(activeShift, transactions, cashFlow);
    const theoreticalBalance = metrics.expectedCashInDrawer;
    const difference = physicalCount - theoreticalBalance;
    const differenceType = difference === 0 ? "EXACT" : difference > 0 ? "SURPLUS" : "SHORTAGE";

    const closure: CashClosure = {
      id: generateEntityId("FECHO"),
      shiftId: activeShift.id,
      shiftNumber: activeShift.shiftNumber,
      registerId: activeShift.registerId,
      openedAt: activeShift.openedAt,
      closedAt: now,
      openedBy: activeShift.openedBy,
      closedBy: closedBy || activeShift.openedBy,
      openingSupervisor: activeShift.openingSupervisor,
      closingSupervisor: closingSupervisor || activeShift.openingSupervisor,
      openingBalance: activeShift.openingBalance,
      theoreticalBalance,
      physicalBalance: physicalCount,
      difference,
      differenceType,
      denominations,
      closingNotes: closingNotes || (difference === 0 ? "Turno conferido com sucesso. Caixa exato." : difference > 0 ? `Sobra de caixa de ${difference} MT.` : `Falta de caixa de ${Math.abs(difference)} MT.`),
      reconciliation: {
        cashSales: metrics.netCashSales,
        mpesaSales: metrics.mpesaSales,
        emolaSales: metrics.emolaSales,
        posCardSales: metrics.posCardSales,
        transferSales: metrics.transferSales,
        reinforcements: metrics.reinforcements,
        inputs: metrics.inputs,
        sangrias: metrics.sangrias,
        expenses: metrics.expenses,
        devolutions: 0,
        quebras: difference < 0 ? Math.abs(difference) : 0,
        totalSales: metrics.totalSalesAmount
      }
    };

    // Salvar fecho nos fechos históricos
    try {
      await CommercialDataService.saveCashClosure(closure);
    } catch (err) {
      console.warn("[CashShiftService] Aviso ao persistir fecho no PostgreSQL:", err);
    }

    // Encerrar turno ativo
    await this.saveShiftState(null);

    return { closure, difference, differenceType };
  },

  /**
   * Motor de Reconciliação e Métricas do Turno
   * Calcula Fundo Inicial, Pagamentos Recebidos, Trocos Entregues, Esgotamento do Fundo Inicial e Saldo na Gaveta
   */
  calculateShiftMetrics(
    shift: ActiveCashShift | null,
    transactions: Transaction[] = [],
    cashFlow: CashFlowEntry[] = []
  ): ShiftMetricsSummary {
    if (!shift || shift.status !== "OPEN") {
      return {
        shiftId: shift?.id || "NENHUM",
        status: "CLOSED",
        registerId: shift?.registerId || "POS-01",
        operator: shift?.openedBy || "Nenhum",
        openedAt: shift?.openedAt || "",
        initialFloat: 0,
        cashSalesCount: 0,
        totalCashReceived: 0,
        totalChangeGiven: 0,
        netCashSales: 0,
        changeFromInitialFloat: 0,
        changeFromSales: 0,
        initialFloatRemaining: 0,
        isInitialFloatExhausted: true,
        changeStatusLabel: "Turno Fechado",
        reinforcements: 0,
        inputs: 0,
        totalManualEntries: 0,
        sangrias: 0,
        expenses: 0,
        totalManualExits: 0,
        expectedCashInDrawer: 0,
        mpesaSales: 0,
        emolaSales: 0,
        posCardSales: 0,
        transferSales: 0,
        totalDigitalSales: 0,
        totalSalesCount: 0,
        totalSalesAmount: 0,
        movements: []
      };
    }

    const shiftStartTime = new Date(shift.openedAt).getTime();
    const initialFloat = Number(shift.openingBalance || 0);

    // Filtrar transações do turno ativo
    const shiftTransactions = transactions.filter(t => {
      if ((t.status as string) === "CANCELLED" || (t as any).status === "REFUNDED") return false;
      if (t.shiftId && t.shiftId === shift.id) return true;
      if (!t.timestamp) return false;
      const tTime = new Date(t.timestamp).getTime();
      return tTime >= shiftStartTime;
    });

    // Filtrar lançamentos manuais de fluxo de caixa do turno ativo
    const shiftCashFlow = cashFlow.filter(f => {
      if (f.shiftId && f.shiftId === shift.id) return true;
      if (!f.timestamp) return false;
      const fTime = new Date(f.timestamp).getTime();
      return fTime >= shiftStartTime;
    });

    let cashSalesCount = 0;
    let totalCashReceived = 0;
    let totalChangeGiven = 0;
    let netCashSales = 0;

    let mpesaSales = 0;
    let emolaSales = 0;
    let posCardSales = 0;
    let transferSales = 0;

    // Ordenar transações cronologicamente para acompanhar o esgotamento do fundo inicial
    const sortedTx = [...shiftTransactions].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    sortedTx.forEach(t => {
      const method = (t.paymentMethod || "").toUpperCase();
      const grandTotal = Number(t.grandTotal || 0);

      if (method === "CASH" || method.includes("DINHEIRO")) {
        cashSalesCount++;
        const received = Number(t.amountPaid || grandTotal);
        const change = Number(t.changeAmount || Math.max(0, received - grandTotal));
        
        totalCashReceived += received;
        totalChangeGiven += change;
        netCashSales += grandTotal;
      } else if (method === "MIXED") {
        // Venda Mista pode conter componente em dinheiro
        const mixedDetails = t.paymentDetails || "";
        const cashMatch = mixedDetails.match(/Dinheiro:\s*([\d.]+)/i);
        const mixedCash = cashMatch ? Number(cashMatch[1]) : 0;
        if (mixedCash > 0) {
          cashSalesCount++;
          totalCashReceived += mixedCash;
          netCashSales += mixedCash;
        }
        if (mixedDetails.toLowerCase().includes("mpesa")) mpesaSales += (grandTotal - mixedCash);
        else if (mixedDetails.toLowerCase().includes("pos")) posCardSales += (grandTotal - mixedCash);
        else mpesaSales += (grandTotal - mixedCash);
      } else if (method.includes("MPESA") || method.includes("M-PESA")) {
        mpesaSales += grandTotal;
      } else if (method.includes("EMOLA") || method.includes("E-MOLA")) {
        emolaSales += grandTotal;
      } else if (method.includes("CARD") || method.includes("POS") || method.includes("CARTAO") || method.includes("CARTÃO")) {
        posCardSales += grandTotal;
      } else if (method.includes("TRANSFER") || method.includes("BANCO")) {
        transferSales += grandTotal;
      } else {
        // Fallback como dinheiro
        cashSalesCount++;
        totalCashReceived += grandTotal;
        netCashSales += grandTotal;
      }
    });

    const totalDigitalSales = mpesaSales + emolaSales + posCardSales + transferSales;
    const totalSalesCount = shiftTransactions.length;
    const totalSalesAmount = netCashSales + totalDigitalSales;

    // Análise do Troco: Fundo Inicial vs. Vendas
    const changeFromInitialFloat = Math.min(initialFloat, totalChangeGiven);
    const changeFromSales = Math.max(0, totalChangeGiven - initialFloat);
    const initialFloatRemaining = Math.max(0, initialFloat - totalChangeGiven);
    const isInitialFloatExhausted = totalChangeGiven >= initialFloat;

    let changeStatusLabel = "Fundo Inicial Intacto";
    if (totalChangeGiven > 0 && !isInitialFloatExhausted) {
      changeStatusLabel = `Fundo Inicial em Uso (${initialFloatRemaining.toLocaleString()} MT restantes)`;
    } else if (isInitialFloatExhausted && initialFloat > 0) {
      changeStatusLabel = "Fundo Inicial Esgotado — A usar Numerário das Vendas";
    } else if (initialFloat === 0) {
      changeStatusLabel = "Sem Fundo Inicial — Trocos suportados pelas Vendas";
    }

    // Entradas e Saídas manuais de caixa (excluindo os lançamentos automáticos de vendas e trocos)
    let reinforcements = 0;
    let inputs = 0;
    let sangrias = 0;
    let expenses = 0;

    shiftCashFlow.forEach(f => {
      // Ignorar se for lançamento automático derivado de venda ou troco para não duplicar valores
      if (f.category === "RECEBIMENTO_VENDA" || f.id.startsWith("cf-pay-") || f.id.startsWith("cf-sale-")) {
        return;
      }
      if (f.category === "TROCO_DEVOLVIDO" || f.id.startsWith("cf-troco-")) {
        return;
      }

      const amt = Number(f.amount || 0);
      const r = (f.reason || "").toLowerCase();
      if (f.type === "REINFORCEMENT") {
        reinforcements += amt;
      } else if (f.type === "INPUT") {
        inputs += amt;
      } else if (f.type === "SANGRIA" || (f.type === "EXPENSE" && (r.includes("sangria") || r.includes("retirada") || r.includes("cofre")))) {
        sangrias += amt;
      } else if (f.type === "EXPENSE") {
        expenses += amt;
      }
    });

    const totalManualEntries = reinforcements + inputs;
    const totalManualExits = sangrias + expenses;

    // Saldo Teórico Esperado na Gaveta:
    // Fundo Inicial + Vendas Líquidas em Dinheiro (ou Total Recebido - Total Trocos) + Entradas Manuais - Saídas Manuais
    const expectedCashInDrawer = initialFloat + netCashSales + totalManualEntries - totalManualExits;

    // Construção da Linha de Movimentos Cronológicos Individuais
    const movements: ShiftChronologicalMovement[] = [];

    // 1. Movimento Inicial: Abertura do Turno
    movements.push({
      id: `mov-abertura-${shift.id}`,
      timestamp: shift.openedAt,
      type: "ABERTURA",
      categoryLabel: "Fundo Inicial",
      description: `Abertura de Turno #${shift.shiftNumber} com Fundo de Maneio`,
      amountIn: initialFloat,
      amountOut: 0,
      netImpact: initialFloat,
      balanceAfter: initialFloat,
      changeSource: "N/A",
      operator: shift.openedBy,
      paymentMethod: "CASH"
    });

    // 2. Transações e Fluxos combinados e ordenados cronologicamente
    let progressiveFloatRemaining = initialFloat;
    let progressiveBalance = initialFloat;

    interface RawMovementEvent {
      id: string;
      timestamp: string;
      type: "SALE" | "FLOW";
      data: any;
    }

    const rawEvents: RawMovementEvent[] = [];

    sortedTx.forEach(t => {
      rawEvents.push({
        id: `event-tx-${t.id}`,
        timestamp: t.timestamp,
        type: "SALE",
        data: t
      });
    });

    shiftCashFlow.forEach(f => {
      // Ignorar duplicados de venda já tratados pela transação
      if (f.category === "RECEBIMENTO_VENDA" || f.id.startsWith("cf-pay-") || f.id.startsWith("cf-sale-")) return;
      if (f.category === "TROCO_DEVOLVIDO" || f.id.startsWith("cf-troco-")) return;
      rawEvents.push({
        id: `event-flow-${f.id}`,
        timestamp: f.timestamp,
        type: "FLOW",
        data: f
      });
    });

    rawEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    rawEvents.forEach(evt => {
      if (evt.type === "SALE") {
        const t = evt.data as Transaction;
        const method = (t.paymentMethod || "").toUpperCase();
        const isCash = method === "CASH" || method.includes("DINHEIRO");

        if (isCash) {
          const grandTotal = Number(t.grandTotal || 0);
          const received = Number(t.amountPaid || grandTotal);
          const change = Number(t.changeAmount || Math.max(0, received - grandTotal));

          // Entrada do valor recebido
          progressiveBalance += received;
          movements.push({
            id: `mov-pay-${t.id}`,
            timestamp: t.timestamp,
            type: "PAGAMENTO_VENDA",
            categoryLabel: "Recebimento de Venda",
            description: `Venda #${t.invoiceNumber} - Pagamento Recebido em Numerário`,
            amountIn: received,
            amountOut: 0,
            netImpact: received,
            balanceAfter: progressiveBalance,
            changeSource: "N/A",
            reference: t.invoiceNumber,
            operator: t.cashierName || shift.openedBy,
            paymentMethod: "CASH"
          });

          // Se houve troco, registrar a saída do troco
          if (change > 0) {
            let changeSource: "FUNDO_INICIAL" | "VENDAS_ACUMULADAS" | "MISTO" = "FUNDO_INICIAL";
            let sourceDesc = "";

            if (progressiveFloatRemaining >= change) {
              changeSource = "FUNDO_INICIAL";
              progressiveFloatRemaining -= change;
              sourceDesc = `Fundo Inicial (${progressiveFloatRemaining.toLocaleString()} MT rest.)`;
            } else if (progressiveFloatRemaining > 0) {
              changeSource = "MISTO";
              const fromInitial = progressiveFloatRemaining;
              const fromSales = change - progressiveFloatRemaining;
              progressiveFloatRemaining = 0;
              sourceDesc = `Misto (${fromInitial.toLocaleString()} MT Fundo + ${fromSales.toLocaleString()} MT Vendas)`;
            } else {
              changeSource = "VENDAS_ACUMULADAS";
              sourceDesc = "Vendas Acumuladas (Fundo Inicial Esgotado)";
            }

            progressiveBalance -= change;
            movements.push({
              id: `mov-troco-${t.id}`,
              timestamp: new Date(new Date(t.timestamp).getTime() + 100).toISOString(),
              type: "TROCO_VENDA",
              categoryLabel: "Troco Devolvido",
              description: `Venda #${t.invoiceNumber} - Troco Devolvido ao Cliente (${sourceDesc})`,
              amountIn: 0,
              amountOut: change,
              netImpact: -change,
              balanceAfter: progressiveBalance,
              changeSource,
              reference: t.invoiceNumber,
              operator: t.cashierName || shift.openedBy,
              paymentMethod: "CASH"
            });
          }
        } else {
          // Venda Digital (não afeta o numerário da gaveta)
          movements.push({
            id: `mov-digital-${t.id}`,
            timestamp: t.timestamp,
            type: "VENDA_DIGITAL",
            categoryLabel: `Venda ${t.paymentMethod}`,
            description: `Venda #${t.invoiceNumber} - Pagamento Eletrónico via ${t.paymentMethod}`,
            amountIn: Number(t.grandTotal || 0),
            amountOut: 0,
            netImpact: 0, // Não altera numerário da gaveta
            balanceAfter: progressiveBalance,
            changeSource: "N/A",
            reference: t.invoiceNumber,
            operator: t.cashierName || shift.openedBy,
            paymentMethod: t.paymentMethod
          });
        }
      } else {
        // Movimento manual de fluxo de caixa (Sangria, Suprimento, Despesa)
        const f = evt.data as CashFlowEntry;
        const amt = Number(f.amount || 0);
        const isInput = f.type === "REINFORCEMENT" || f.type === "INPUT";
        const net = isInput ? amt : -amt;
        progressiveBalance += net;

        movements.push({
          id: `mov-flow-${f.id}`,
          timestamp: f.timestamp,
          type: f.type === "REINFORCEMENT" || f.type === "INPUT" ? "SUPRIMENTO" : f.type === "SANGRIA" ? "SANGRIA" : "DESPESA",
          categoryLabel: f.type === "REINFORCEMENT" ? "Suprimento" : f.type === "SANGRIA" ? "Sangria" : "Despesa Operacional",
          description: f.reason || (isInput ? "Reforço manual de caixa" : "Retirada / Sangria de caixa"),
          amountIn: isInput ? amt : 0,
          amountOut: !isInput ? amt : 0,
          netImpact: net,
          balanceAfter: progressiveBalance,
          changeSource: "N/A",
          reference: f.reference,
          operator: f.responsibleUser || shift.openedBy,
          paymentMethod: f.paymentMethod || "CASH"
        });
      }
    });

    return {
      shiftId: shift.id,
      status: shift.status,
      registerId: shift.registerId,
      operator: shift.openedBy,
      openedAt: shift.openedAt,
      initialFloat,
      cashSalesCount,
      totalCashReceived,
      totalChangeGiven,
      netCashSales,
      changeFromInitialFloat,
      changeFromSales,
      initialFloatRemaining,
      isInitialFloatExhausted,
      changeStatusLabel,
      reinforcements,
      inputs,
      totalManualEntries,
      sangrias,
      expenses,
      totalManualExits,
      expectedCashInDrawer,
      mpesaSales,
      emolaSales,
      posCardSales,
      transferSales,
      totalDigitalSales,
      totalSalesCount,
      totalSalesAmount,
      movements
    };
  }
};
