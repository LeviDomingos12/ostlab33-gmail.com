import { describe, it, expect, beforeEach } from "vitest";
import { CashShiftService, ActiveCashShift } from "../services/cashShiftService";
import { Transaction, CashFlowEntry } from "../types";

describe("OST Vendas - Caixa por Turno & Controlo de Trocos", () => {
  beforeEach(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.clear();
    }
  });

  it("1. O operador deve obrigatoriamente abrir o turno e informar o valor inicial do caixa", async () => {
    // Tentar calcular métricas sem turno aberto
    const emptyMetrics = CashShiftService.calculateShiftMetrics(null, [], []);
    expect(emptyMetrics.status).toBe("CLOSED");
    expect(emptyMetrics.initialFloat).toBe(0);

    // Abrir turno com fundo inicial de 2.000 MT
    const shift = await CashShiftService.openShift({
      openingBalance: 2000,
      openedBy: "Operador Teste",
      openingSupervisor: "Supervisor João",
      openingNotes: "Fundo com notas de 100 e 200 MT para troco",
      registerId: "POS-01"
    });

    expect(shift.status).toBe("OPEN");
    expect(shift.openingBalance).toBe(2000);
    expect(shift.openedBy).toBe("Operador Teste");
    expect(shift.registerId).toBe("POS-01");

    const metrics = CashShiftService.calculateShiftMetrics(shift, [], []);
    expect(metrics.status).toBe("OPEN");
    expect(metrics.initialFloat).toBe(2000);
    expect(metrics.expectedCashInDrawer).toBe(2000);
    expect(metrics.initialFloatRemaining).toBe(2000);
    expect(metrics.isInitialFloatExhausted).toBe(false);
  });

  it("2. Cada venda em dinheiro deve registrar valor recebido, valor da venda e troco", () => {
    const shift: ActiveCashShift = {
      id: "TURNO-TEST-1",
      shiftNumber: 1,
      status: "OPEN",
      openingBalance: 1000,
      openedAt: new Date(Date.now() - 3600000).toISOString(),
      openedBy: "Caixa 1",
      registerId: "POS-01"
    };

    // Venda 1: Venda de 350 MT, cliente entregou 500 MT, troco 150 MT
    const tx1: Transaction = {
      id: "tx-1",
      invoiceNumber: "FT A/101",
      timestamp: new Date().toISOString(),
      grandTotal: 350,
      subtotal: 350,
      vatTotal: 0,
      discountTotal: 0,
      amountPaid: 500, // Valor recebido
      changeAmount: 150, // Troco devolvido
      shiftId: shift.id,
      paymentMethod: "CASH",
      cashierName: "Caixa 1",
      items: []
    };

    const metrics = CashShiftService.calculateShiftMetrics(shift, [tx1], []);
    expect(metrics.cashSalesCount).toBe(1);
    expect(metrics.totalCashReceived).toBe(500);
    expect(metrics.totalChangeGiven).toBe(150);
    expect(metrics.netCashSales).toBe(350);

    // Saldo esperado: Fundo (1000) + Venda líquida (350) = 1350 MT
    expect(metrics.expectedCashInDrawer).toBe(1350);
  });

  it("3. Trocos e outras saídas (sangrias) devem ser descontados do saldo do caixa", () => {
    const shift: ActiveCashShift = {
      id: "TURNO-TEST-2",
      shiftNumber: 2,
      status: "OPEN",
      openingBalance: 1500,
      openedAt: new Date(Date.now() - 3600000).toISOString(),
      openedBy: "Caixa 1",
      registerId: "POS-01"
    };

    const tx: Transaction = {
      id: "tx-2",
      invoiceNumber: "FT A/102",
      timestamp: new Date().toISOString(),
      grandTotal: 200,
      subtotal: 200,
      vatTotal: 0,
      discountTotal: 0,
      amountPaid: 500,
      changeAmount: 300, // Troco
      shiftId: shift.id,
      paymentMethod: "CASH",
      cashierName: "Caixa 1",
      items: []
    };

    const sangria: CashFlowEntry = {
      id: "flow-1",
      timestamp: new Date().toISOString(),
      type: "SANGRIA",
      amount: 400, // Retirada para cofre
      reason: "Sangria de segurança",
      responsibleUser: "Caixa 1",
      shiftId: shift.id
    };

    const suprimento: CashFlowEntry = {
      id: "flow-2",
      timestamp: new Date().toISOString(),
      type: "REINFORCEMENT",
      amount: 200, // Reforço manual
      reason: "Suprimento",
      responsibleUser: "Supervisor",
      shiftId: shift.id
    };

    const metrics = CashShiftService.calculateShiftMetrics(shift, [tx], [sangria, suprimento]);
    // Fundo (1500) + Recebido (500) - Troco (300) - Sangria (400) + Suprimento (200) = 1500 MT
    expect(metrics.expectedCashInDrawer).toBe(1500);
    expect(metrics.totalManualExits).toBe(400);
    expect(metrics.totalManualEntries).toBe(200);
  });

  it("4. Quando o valor inicial para troco terminar, o sistema deve identificar e passar a usar os valores recebidos nas novas vendas como troco", () => {
    // Fundo inicial pequeno de 300 MT
    const shift: ActiveCashShift = {
      id: "TURNO-TEST-TROCO",
      shiftNumber: 3,
      status: "OPEN",
      openingBalance: 300,
      openedAt: new Date(Date.now() - 7200000).toISOString(),
      openedBy: "Caixa 1",
      registerId: "POS-01"
    };

    // Venda 1: Troco de 100 MT (Fundo ainda tem 200 MT restantes)
    const tx1: Transaction = {
      id: "tx-troco-1",
      invoiceNumber: "FT A/201",
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      grandTotal: 100,
      subtotal: 100,
      vatTotal: 0,
      discountTotal: 0,
      amountPaid: 200,
      changeAmount: 100,
      shiftId: shift.id,
      paymentMethod: "CASH",
      cashierName: "Caixa 1",
      items: []
    };

    let metrics = CashShiftService.calculateShiftMetrics(shift, [tx1], []);
    expect(metrics.initialFloatRemaining).toBe(200);
    expect(metrics.isInitialFloatExhausted).toBe(false);
    expect(metrics.changeFromInitialFloat).toBe(100);
    expect(metrics.changeFromSales).toBe(0);

    // Venda 2: Troco de 350 MT.
    // Total de troco acumulado = 100 + 350 = 450 MT > 300 MT (fundo esgotado!)
    const tx2: Transaction = {
      id: "tx-troco-2",
      invoiceNumber: "FT A/202",
      timestamp: new Date().toISOString(),
      grandTotal: 150,
      subtotal: 150,
      vatTotal: 0,
      discountTotal: 0,
      amountPaid: 500,
      changeAmount: 350,
      shiftId: shift.id,
      paymentMethod: "CASH",
      cashierName: "Caixa 1",
      items: []
    };

    metrics = CashShiftService.calculateShiftMetrics(shift, [tx1, tx2], []);
    expect(metrics.totalChangeGiven).toBe(450);
    expect(metrics.initialFloatRemaining).toBe(0);
    expect(metrics.isInitialFloatExhausted).toBe(true);
    // 300 MT saíram do fundo inicial
    expect(metrics.changeFromInitialFloat).toBe(300);
    // 150 MT saíram do numerário recebido das vendas
    expect(metrics.changeFromSales).toBe(150);
    expect(metrics.changeStatusLabel).toContain("Fundo Inicial Esgotado");
  });

  it("5. Cada entrada, saída, pagamento e troco deve ficar registado individualmente no histórico de movimentos", () => {
    const shift: ActiveCashShift = {
      id: "TURNO-TEST-MOVEMENTS",
      shiftNumber: 4,
      status: "OPEN",
      openingBalance: 1000,
      openedAt: new Date(Date.now() - 3600000).toISOString(),
      openedBy: "Caixa 1",
      registerId: "POS-01"
    };

    const tx: Transaction = {
      id: "tx-m1",
      invoiceNumber: "FT A/301",
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      grandTotal: 120,
      subtotal: 120,
      vatTotal: 0,
      discountTotal: 0,
      amountPaid: 200,
      changeAmount: 80,
      shiftId: shift.id,
      paymentMethod: "CASH",
      cashierName: "Caixa 1",
      items: []
    };

    const metrics = CashShiftService.calculateShiftMetrics(shift, [tx], []);
    
    // Deve registrar:
    // 1. Movimento de Abertura (Fundo Inicial de 1000 MT) -> saldo 1000 MT
    // 2. Movimento de Pagamento da Venda (+200 MT recebido) -> saldo 1200 MT
    // 3. Movimento de Troco da Venda (-80 MT troco devolvido) -> saldo 1120 MT
    expect(metrics.movements.length).toBe(3);

    const movAbertura = metrics.movements.find(m => m.type === "ABERTURA");
    expect(movAbertura).toBeDefined();
    expect(movAbertura?.amountIn).toBe(1000);
    expect(movAbertura?.balanceAfter).toBe(1000);

    const movPay = metrics.movements.find(m => m.type === "PAGAMENTO_VENDA");
    expect(movPay).toBeDefined();
    expect(movPay?.amountIn).toBe(200);
    expect(movPay?.balanceAfter).toBe(1200);

    const movTroco = metrics.movements.find(m => m.type === "TROCO_VENDA");
    expect(movTroco).toBeDefined();
    expect(movTroco?.amountOut).toBe(80);
    expect(movTroco?.balanceAfter).toBe(1120);
    expect(movTroco?.changeSource).toBe("FUNDO_INICIAL");
  });

  it("6. No fecho do turno, comparar dinheiro contado com saldo esperado e reportar diferença (exato, falta ou sobra)", async () => {
    const shift: ActiveCashShift = {
      id: "TURNO-TEST-FECHO",
      shiftNumber: 5,
      status: "OPEN",
      openingBalance: 1000,
      openedAt: new Date(Date.now() - 3600000).toISOString(),
      openedBy: "Caixa 1",
      registerId: "POS-01"
    };

    const tx: Transaction = {
      id: "tx-f1",
      invoiceNumber: "FT A/401",
      timestamp: new Date().toISOString(),
      grandTotal: 500,
      subtotal: 500,
      vatTotal: 0,
      discountTotal: 0,
      amountPaid: 500,
      changeAmount: 0,
      shiftId: shift.id,
      paymentMethod: "CASH",
      cashierName: "Caixa 1",
      items: []
    };

    // Saldo esperado = 1000 + 500 = 1500 MT

    // Caso A: Conferência Exata (1500 MT contados)
    const resExato = await CashShiftService.closeShift({
      activeShift: shift,
      physicalCount: 1500,
      closedBy: "Caixa 1",
      closingSupervisor: "Supervisor",
      transactions: [tx],
      cashFlow: []
    });
    expect(resExato.difference).toBe(0);
    expect(resExato.differenceType).toBe("EXACT");

    // Caso B: Sobra de Caixa (+100 MT)
    const resSobra = await CashShiftService.closeShift({
      activeShift: shift,
      physicalCount: 1600,
      closedBy: "Caixa 1",
      transactions: [tx],
      cashFlow: []
    });
    expect(resSobra.difference).toBe(100);
    expect(resSobra.differenceType).toBe("SURPLUS");

    // Caso C: Falta de Caixa / Quebra (-200 MT)
    const resFalta = await CashShiftService.closeShift({
      activeShift: shift,
      physicalCount: 1300,
      closedBy: "Caixa 1",
      transactions: [tx],
      cashFlow: []
    });
    expect(resFalta.difference).toBe(-200);
    expect(resFalta.differenceType).toBe("SHORTAGE");
  });
});
