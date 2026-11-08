import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SupabaseSyncService, setSupabaseClient } from "../services/supabaseService";

describe("ETAPA 5: Auditoria da RPC de Vendas (process_sale_atomic)", () => {
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

  it("deve enviar o contrato oficial exato de parâmetros para a RPC process_sale_atomic", async () => {
    mockRpc.mockResolvedValue({
      data: { success: true, sale_id: "sale-999", invoice_number: "FT-2026/999" },
      error: null
    });

    const params = {
      saleId: "sale-999",
      invoiceNumber: "FT-2026/999",
      customerId: "cust-123",
      customerName: "Supermercado Maputo",
      customerNuit: "400987654",
      userId: "user-op-55",
      userName: "Armando Operador",
      paymentMethod: "CASH",
      subtotal: 5000,
      discountTotal: 200,
      vatTotal: 768,
      grandTotal: 4800,
      amountPaid: 5000,
      changeAmount: 200,
      items: [
        {
          productId: "prod-1",
          productName: "Farinha Nacional",
          quantity: 4,
          salePrice: 1200,
          costPrice: 900,
          vatRate: 16
        }
      ],
      notes: "Entrega urgente ao armazém",
      idempotencyKey: "idem-sale-999"
    };

    const res = await SupabaseSyncService.processSaleAtomic(params);

    expect(res.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(
      "process_sale_atomic",
      expect.objectContaining({
        p_sale_id: "sale-999",
        p_company_id: "ost-tenant-001",
        p_user_id: "user-op-55",
        p_items: [
          {
            productId: "prod-1",
            productName: "Farinha Nacional",
            quantity: 4,
            salePrice: 1200,
            costPrice: 900,
            vatRate: 16
          }
        ],
        p_payment_method: "CASH",
        p_total: 4800,
        p_idempotency_key: "idem-sale-999",
        p_invoice_number: "FT-2026/999",
        p_customer_id: "cust-123",
        p_customer_name: "Supermercado Maputo",
        p_customer_nuit: "400987654",
        p_user_name: "Armando Operador",
        p_subtotal: 5000,
        p_discount_total: 200,
        p_vat_total: 768,
        p_amount_paid: 5000,
        p_change_amount: 200,
        p_notes: "Entrega urgente ao armazém"
      })
    );
  });

  it("NÃO deve executar fallback para versões legadas em caso de erro da RPC", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Could not find the function public.process_sale_atomic in schema cache" }
    });

    const res = await SupabaseSyncService.processSaleAtomic({
      saleId: "sale-err-01",
      invoiceNumber: "FT-01",
      paymentMethod: "CASH",
      subtotal: 100,
      discountTotal: 0,
      vatTotal: 16,
      grandTotal: 100,
      amountPaid: 100,
      changeAmount: 0,
      items: []
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("schema cache");
    // Garante que o RPC foi chamado estritamente uma única vez e nenhum fallback antigo foi executado
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it("deve retornar o erro autêntico do PostgreSQL quando a função retornar success: false", async () => {
    mockRpc.mockResolvedValue({
      data: { success: false, error: "Stock insuficiente para o artigo Óleo 5L" },
      error: null
    });

    const res = await SupabaseSyncService.processSaleAtomic({
      saleId: "sale-err-02",
      invoiceNumber: "FT-02",
      paymentMethod: "CASH",
      subtotal: 500,
      discountTotal: 0,
      vatTotal: 80,
      grandTotal: 500,
      amountPaid: 500,
      changeAmount: 0,
      items: []
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe("Stock insuficiente para o artigo Óleo 5L");
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
