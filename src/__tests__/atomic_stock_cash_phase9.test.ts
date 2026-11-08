import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setSupabaseClient } from "../services/supabaseService";
import { CommercialDataService } from "../services/dataService";
import { Transaction } from "../types";

describe("ETAPA 9: Atomicidade de Venda, Stock, Caixa e Auditoria (process_sale_atomic)", () => {
  const mockRpc = vi.fn();
  const fakeClient = {
    rpc: mockRpc
  } as any;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockRpc.mockReset();
    setSupabaseClient(fakeClient);
  });

  afterEach(() => {
    setSupabaseClient(null);
  });

  const validTransaction: Transaction = {
    id: "tx-atomic-001",
    invoiceNumber: "FT-2026/099",
    timestamp: new Date().toISOString(),
    items: [
      {
        productId: "prod-arroz",
        productName: "Arroz 25kg",
        quantity: 2,
        price: 1500,
        vatAmount: 240,
        discountAmount: 0,
        subtotal: 3000
      }
    ],
    subtotal: 3000,
    vatTotal: 240,
    discountTotal: 0,
    grandTotal: 3000,
    paymentMethod: "CASH",
    cashierName: "Operador 01",
    sellerId: "user-001"
  };

  it("ATOMICIDADE COMPLETA: Uma venda concluída atualiza com sucesso vendas, venda_itens, stock, stock_movements, caixa e auditoria", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        success: true,
        sale_id: validTransaction.id,
        invoice_number: validTransaction.invoiceNumber,
        grand_total: 3000,
        message: "Venda e movimentações de inventário processadas com sucesso."
      },
      error: null
    });

    const result = await CommercialDataService.saveTransaction(validTransaction);

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("process_sale_atomic", expect.objectContaining({
      p_sale_id: "tx-atomic-001",
      p_total: 3000,
      p_payment_method: "CASH",
      p_items: expect.arrayContaining([
        expect.objectContaining({ productId: "prod-arroz", quantity: 2 })
      ])
    }));

    expect(result.success).toBe(true);
    expect(result.saleId).toBe("tx-atomic-001");
  });

  it("ROLLBACK EM STOCK INSUFICIENTE: Rejeição deve impedir gravação de venda e atualização de stock", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        success: false,
        error: 'Stock insuficiente para o artigo "Arroz 25kg". Stock atual: 1, Solicitado: 2'
      },
      error: null
    });

    await expect(CommercialDataService.saveTransaction(validTransaction)).rejects.toThrow(
      'Stock insuficiente para o artigo "Arroz 25kg". Stock atual: 1, Solicitado: 2'
    );
  });

  it("ROLLBACK EM ERRO DO POSTGRESQL: NUNCA permitir venda gravada sem stock atualizado ou stock atualizado sem venda", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: {
        message: "deadlock detected or constraint violation in public.process_sale_atomic"
      }
    });

    await expect(CommercialDataService.saveTransaction(validTransaction)).rejects.toThrow(
      "deadlock detected or constraint violation in public.process_sale_atomic"
    );
  });

  it("REGISTO NO CAIXA: Venda em dinheiro deve incluir dados para lançamento no caixa no payload atómico", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        success: true,
        sale_id: "tx-cash-002",
        invoice_number: "FT-2026/100",
        grand_total: 500
      },
      error: null
    });

    const cashTx: Transaction = {
      ...validTransaction,
      id: "tx-cash-002",
      grandTotal: 500,
      paymentMethod: "CASH"
    };

    const res = await CommercialDataService.saveTransaction(cashTx);
    expect(res.success).toBe(true);

    const callArgs = mockRpc.mock.calls[0][1];
    expect(callArgs.p_payment_method).toBe("CASH");
    expect(callArgs.p_total).toBe(500);
    expect(callArgs.p_amount_paid).toBe(500);
  });

  it("AUDITORIA: Venda concluída deve conter identificação do operador e filial para auditoria", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        success: true,
        sale_id: "tx-audit-003",
        invoice_number: "FT-2026/101",
        grand_total: 1200
      },
      error: null
    });

    const auditTx: Transaction = {
      ...validTransaction,
      id: "tx-audit-003",
      cashierName: "Sérgio Manhiça",
      sellerId: "user-sergio-88"
    };

    await CommercialDataService.saveTransaction(auditTx);

    const callArgs = mockRpc.mock.calls[0][1];
    expect(callArgs.p_user_name).toBe("Sérgio Manhiça");
    expect(callArgs.p_user_id).toBe("user-sergio-88");
  });

  it("PREVENÇÃO DE INCONSISTÊNCIA: Em caso de falha de conexão de rede, operação é abortada e lança erro", async () => {
    mockRpc.mockRejectedValueOnce(new Error("Network request failed: timeout to PostgreSQL"));

    await expect(CommercialDataService.saveTransaction(validTransaction)).rejects.toThrow(
      "Network request failed: timeout to PostgreSQL"
    );
  });
});
