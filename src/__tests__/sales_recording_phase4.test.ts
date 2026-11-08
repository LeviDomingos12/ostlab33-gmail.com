import { describe, it, expect, vi, beforeEach } from "vitest";
import { CommercialDataService } from "../services/dataService";
import { SupabaseSyncService } from "../services/supabaseService";
import { Transaction } from "../types";

describe("ETAPA 4: Auditoria e Validação Rigorosa da Gravação de Vendas", () => {
  const sampleTx: Transaction = {
    id: "tx-test-101",
    invoiceNumber: "FT-2026/001",
    timestamp: new Date().toISOString(),
    items: [
      {
        productId: "p1",
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
    cashierName: "Operador de Caixa",
    customerId: "cust-01",
    customerName: "Cliente Teste",
    nuit: "400123456"
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("deve concluir a venda com sucesso quando o PostgreSQL confirmar com success: true", async () => {
    const processSaleAtomicSpy = vi.spyOn(SupabaseSyncService, "processSaleAtomic").mockResolvedValue({
      success: true,
      saleId: sampleTx.id,
      invoiceNumber: sampleTx.invoiceNumber
    });

    const result = await CommercialDataService.saveTransaction(sampleTx);

    expect(processSaleAtomicSpy).toHaveBeenCalledTimes(1);
    expect(processSaleAtomicSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        saleId: sampleTx.id,
        invoiceNumber: sampleTx.invoiceNumber,
        grandTotal: 3000,
        paymentMethod: "CASH"
      })
    );
    expect(result.success).toBe(true);
  });

  it("NUNCA deve retornar success: true se o PostgreSQL rejeitar a venda (ex: Stock insuficiente)", async () => {
    vi.spyOn(SupabaseSyncService, "processSaleAtomic").mockResolvedValue({
      success: false,
      error: 'Stock insuficiente para o artigo "Arroz 25kg". Stock atual: 1, Solicitado: 2'
    });

    await expect(CommercialDataService.saveTransaction(sampleTx)).rejects.toThrow(
      'Stock insuficiente para o artigo "Arroz 25kg"'
    );
  });

  it("NUNCA deve retornar success: true se o PostgreSQL falhar por erro de rede ou RPC", async () => {
    vi.spyOn(SupabaseSyncService, "processSaleAtomic").mockResolvedValue({
      success: false,
      error: "connection timeout to database"
    });

    await expect(CommercialDataService.saveTransaction(sampleTx)).rejects.toThrow(
      "connection timeout to database"
    );
  });

  it("deve garantir que saveTransactionDirect redireciona estritamente para o fluxo atómico oficial", async () => {
    const processSaleAtomicSpy = vi.spyOn(SupabaseSyncService, "processSaleAtomic").mockResolvedValue({
      success: true,
      saleId: sampleTx.id
    });

    const result = await SupabaseSyncService.saveTransactionDirect({
      saleId: sampleTx.id,
      grandTotal: 3000
    });

    expect(processSaleAtomicSpy).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });
});
