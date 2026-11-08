import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CommercialDataService } from "../services/dataService";
import { SupabaseSyncService, setSupabaseClient } from "../services/supabaseService";

describe("ETAPA 7: Correção da Leitura das Vendas (Sem mascarar erro como zero vendas)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setSupabaseClient(null);
  });

  function createMockClient(queryResult: { data: any; error: any }) {
    const queryBuilder: any = {
      order: vi.fn().mockImplementation(() => queryBuilder),
      gte: vi.fn().mockImplementation(() => queryBuilder),
      then: vi.fn().mockImplementation((onfulfilled: any, onrejected: any) =>
        Promise.resolve(queryResult).then(onfulfilled, onrejected)
      ),
      catch: vi.fn().mockImplementation((onrejected: any) =>
        Promise.resolve(queryResult).catch(onrejected)
      )
    };

    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(queryBuilder)
      })
    } as any;
  }

  it("SEM VENDAS: PostgreSQL retorna lista vazia -> Aplicação recebe [] sem erros", async () => {
    const mockClient = createMockClient({ data: [], error: null });
    setSupabaseClient(mockClient);

    const result = await CommercialDataService.fetchTransactions();
    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("COM VENDAS: PostgreSQL retorna vendas reais -> Aplicação recebe as vendas reais", async () => {
    const mockSalesData = [
      {
        id: "venda-001",
        invoice_number: "FT-2026/001",
        customer_name: "Empresa ABC Lda",
        customer_id: "c-123",
        grand_total: 5000,
        subtotal: 4200,
        vat_total: 800,
        discount_total: 0,
        payment_method: "M-PESA",
        operator_name: "Caixa 01",
        items: [{ productId: "p1", productName: "Item 1", quantity: 2, price: 2100 }],
        timestamp: "2026-03-29T10:00:00.000Z",
        payment_status: "PAID",
        idempotency_key: "idem-key-001"
      }
    ];

    const mockClient = createMockClient({ data: mockSalesData, error: null });
    setSupabaseClient(mockClient);

    const result = await CommercialDataService.fetchTransactions();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("venda-001");
    expect(result[0].invoiceNumber).toBe("FT-2026/001");
    expect(result[0].grandTotal).toBe(5000);
    expect(result[0].paymentMethod).toBe("M-PESA");
    expect(result[0].idempotencyKey).toBe("idem-key-001");
  });

  it("ERRO POSTGRESQL: NUNCA deve mascarar erro como [] (zero vendas); deve lançar erro real", async () => {
    const mockClient = createMockClient({
      data: null,
      error: {
        message: "connection timeout to PostgreSQL server",
        code: "57P01"
      }
    });
    setSupabaseClient(mockClient);

    // Deve lançar erro real e NUNCA retornar []
    await expect(CommercialDataService.fetchTransactions()).rejects.toThrow(
      /Erro ao ler vendas do PostgreSQL: connection timeout/
    );
  });

  it("ERRO EM VENDAS 24H: fetchRecentTransactions24h deve propagar o erro real e não mascarar", async () => {
    const mockClient = createMockClient({
      data: null,
      error: {
        message: "relation 'vendas' does not exist",
        code: "42P01"
      }
    });
    setSupabaseClient(mockClient);

    await expect(CommercialDataService.fetchRecentTransactions24h()).rejects.toThrow(
      /relation 'vendas' does not exist/
    );
  });

  it("AUDITORIA: SupabaseSyncService.fetchTransactions deve lançar erro quando a base falhar", async () => {
    const mockClient = createMockClient({
      data: null,
      error: {
        message: "permission denied for table vendas",
        code: "42501"
      }
    });
    setSupabaseClient(mockClient);

    await expect(SupabaseSyncService.fetchTransactions()).rejects.toThrow(
      /permission denied for table vendas/
    );
  });

  it("SCHEMA CACHE PGRST205: Quando tabela 'vendas' não está no schema cache, retorna [] inicial de forma graciosa", async () => {
    const mockClient = createMockClient({
      data: null,
      error: {
        message: "Could not find the table 'public.vendas' in the schema cache",
        code: "PGRST205"
      }
    });
    setSupabaseClient(mockClient);

    const result = await CommercialDataService.fetchTransactions();
    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
  });
});
