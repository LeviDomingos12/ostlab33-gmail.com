import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SupabaseSyncService, setSupabaseClient } from "../services/supabaseService";
import { CommercialDataService } from "../services/dataService";
import { Transaction } from "../types";

describe("ETAPA 6: Tratamento Rigoroso de Idempotência e Prevenção de Vendas Duplicadas", () => {
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

  it("deve retornar o resultado idempotente da operação existente quando o PostgreSQL indicar venda já processada", async () => {
    // Simula a resposta do PostgreSQL quando a venda já existia
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        sale_id: "sale-idem-123",
        invoice_number: "FT-2026/100",
        grand_total: 2500,
        idempotent: true,
        message: "Venda já processada anteriormente (idempotente). Nenhuma alteração efetuada."
      },
      error: null
    });

    const tx: Transaction = {
      id: "sale-idem-123",
      idempotencyKey: "sale-idem-123",
      invoiceNumber: "FT-2026/100",
      timestamp: new Date().toISOString(),
      subtotal: 2500,
      vatTotal: 0,
      discountTotal: 0,
      grandTotal: 2500,
      paymentMethod: "CASH",
      cashierName: "Operador Teste",
      items: [
        {
          productId: "p1",
          productName: "Artigo A",
          quantity: 2,
          price: 1250,
          vatAmount: 0,
          discountAmount: 0,
          subtotal: 2500
        }
      ]
    };

    const res = await CommercialDataService.saveTransaction(tx);

    expect(res.success).toBe(true);
    expect(res.idempotent).toBe(true);
    expect(res.saleId).toBe("sale-idem-123");
    expect(res.invoiceNumber).toBe("FT-2026/100");
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it("deve colapsar dois cliques simultâneos com a mesma chave (duplo clique) para uma única chamada RPC", async () => {
    let resolveRpc: (val: any) => void;
    const rpcPromise = new Promise((resolve) => {
      resolveRpc = resolve;
    });

    mockRpc.mockImplementation(() => rpcPromise);

    const salePayload = {
      saleId: "sale-double-click-999",
      idempotencyKey: "sale-double-click-999",
      invoiceNumber: "FT-2026/999",
      paymentMethod: "CASH",
      subtotal: 1000,
      discountTotal: 0,
      vatTotal: 160,
      grandTotal: 1000,
      amountPaid: 1000,
      changeAmount: 0,
      items: [
        {
          productId: "prod-x",
          productName: "Artigo X",
          quantity: 1,
          salePrice: 1000,
          costPrice: 700,
          vatRate: 16
        }
      ]
    };

    // Dois cliques simultâneos (duplo clique) disparados concorrentemente
    const click1Promise = SupabaseSyncService.processSaleAtomic(salePayload);
    const click2Promise = SupabaseSyncService.processSaleAtomic(salePayload);

    // O RPC só deve ter sido invocado UMA única vez
    expect(mockRpc).toHaveBeenCalledTimes(1);

    // Resolver a chamada ao PostgreSQL
    resolveRpc!({
      data: {
        success: true,
        sale_id: "sale-double-click-999",
        invoice_number: "FT-2026/999"
      },
      error: null
    });

    const [res1, res2] = await Promise.all([click1Promise, click2Promise]);

    // Ambos os chamadores recebem sucesso e o mesmo ID de venda, mas apenas 1 venda foi enviada ao PostgreSQL
    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    expect(res1.saleId).toBe("sale-double-click-999");
    expect(res2.saleId).toBe("sale-double-click-999");
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it("não deve permitir criar outra venda nem atualizar dados se a venda já estiver concluída", async () => {
    // Primeira chamada: venda nova registada
    mockRpc.mockResolvedValueOnce({
      data: {
        success: true,
        sale_id: "sale-unique-01",
        invoice_number: "FT-001",
        grand_total: 500
      },
      error: null
    });

    const res1 = await SupabaseSyncService.processSaleAtomic({
      saleId: "sale-unique-01",
      idempotencyKey: "idem-key-01",
      invoiceNumber: "FT-001",
      paymentMethod: "CASH",
      subtotal: 500,
      discountTotal: 0,
      vatTotal: 0,
      grandTotal: 500,
      amountPaid: 500,
      changeAmount: 0,
      items: []
    });

    expect(res1.success).toBe(true);
    expect(res1.idempotent).toBe(false);

    // Segunda chamada (subsequente com mesma chave): PostgreSQL retorna registo existente como idempotente
    mockRpc.mockResolvedValueOnce({
      data: {
        success: true,
        sale_id: "sale-unique-01",
        invoice_number: "FT-001",
        grand_total: 500,
        idempotent: true,
        message: "Venda já processada anteriormente (idempotente). Nenhuma alteração efetuada."
      },
      error: null
    });

    const res2 = await SupabaseSyncService.processSaleAtomic({
      saleId: "sale-unique-01",
      idempotencyKey: "idem-key-01",
      invoiceNumber: "FT-001",
      paymentMethod: "CASH",
      subtotal: 800, // Tentativa de alterar valor
      discountTotal: 0,
      vatTotal: 0,
      grandTotal: 800,
      amountPaid: 800,
      changeAmount: 0,
      items: []
    });

    expect(res2.success).toBe(true);
    expect(res2.idempotent).toBe(true);
    expect(res2.saleId).toBe("sale-unique-01");
    expect(res2.invoiceNumber).toBe("FT-001");
  });
});
