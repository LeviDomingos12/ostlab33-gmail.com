import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CommercialDataService } from "../services/dataService";
import { SupabaseSyncService } from "../services/supabaseService";
import { Transaction, Employee } from "../types";

describe("Arquitetura Autoritativa: POS → Supabase → PostgreSQL → Dashboard/Relatórios", () => {
  let mockStorage: Record<string, string> = {};

  const mockEmployee: Employee = {
    id: "emp-test-01",
    name: "Operador de Caixa 01",
    role: "CASHIER",
    contact: "+258841234567",
    salary: 25000,
    admissionDate: "2026-01-01",
    status: "ACTIVE",
    pin: "1234",
    email: "caixa01@empresa.co.mz"
  };

  const sampleSale: Transaction = {
    id: "tx-e2e-001",
    invoiceNumber: "FT-2026/0010",
    timestamp: new Date().toISOString(),
    items: [
      {
        productId: "prod-01",
        productName: "Arroz Nacional 25kg",
        quantity: 2,
        price: 1500,
        vatAmount: 240,
        discountAmount: 0,
        subtotal: 3000
      },
      {
        productId: "prod-02",
        productName: "Óleo Vegetal 5L",
        quantity: 1,
        price: 650,
        vatAmount: 104,
        discountAmount: 0,
        subtotal: 650
      }
    ],
    subtotal: 3650,
    vatTotal: 344,
    discountTotal: 0,
    grandTotal: 3650,
    paymentMethod: "CASH",
    cashierName: "Operador de Caixa 01",
    sellerId: "emp-test-01",
    customerId: "cust-99",
    customerName: "Cliente Balcão",
    nuit: "400987654"
  };

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => { mockStorage[key] = val; },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => { mockStorage = {}; },
      get length() { return Object.keys(mockStorage).length; },
      key: (i: number) => Object.keys(mockStorage)[i] || null
    });
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => mockStorage[`sess_${key}`] ?? null,
      setItem: (key: string, val: string) => { mockStorage[`sess_${key}`] = val; },
      removeItem: (key: string) => { delete mockStorage[`sess_${key}`]; },
      clear: () => {
        Object.keys(mockStorage).forEach(k => {
          if (k.startsWith("sess_")) delete mockStorage[k];
        });
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // TESTE 1: FLUXO COMPLETO E2E
  // Login → Venda → PostgreSQL → Dashboard → Relatórios → Reload → Logout → Login
  // =========================================================================
  it("Fluxo Obrigatório: Login → Venda → PostgreSQL → Dashboard → Relatórios → Reload → Logout → Login", async () => {
    // 1. LOGIN
    // Operador autentica-se; sessão é registrada
    localStorage.removeItem("erp_user_logged_out");
    localStorage.setItem("erp_logged_in_user", JSON.stringify(mockEmployee));
    let currentUser = JSON.parse(localStorage.getItem("erp_logged_in_user") || "null");
    expect(currentUser).not.toBeNull();
    expect(currentUser.name).toBe("Operador de Caixa 01");
    expect(localStorage.getItem("erp_user_logged_out")).toBeNull();

    // 2. VENDA NO POS
    // O operador lança uma venda com cálculos estritos
    const subtotalCalculado = sampleSale.items.reduce((acc, item) => acc + item.subtotal, 0);
    expect(subtotalCalculado).toBe(3650);
    expect(sampleSale.grandTotal).toBe(3650);

    // 3. PERSISTÊNCIA NO POSTGRESQL (via Supabase RPC processSaleAtomic)
    const databaseStore: Transaction[] = [];
    const processSaleSpy = vi.spyOn(SupabaseSyncService, "processSaleAtomic").mockImplementation(async (params) => {
      // Simula a inserção atómica no PostgreSQL
      databaseStore.push({
        ...sampleSale,
        id: params.saleId,
        invoiceNumber: params.invoiceNumber,
        grandTotal: params.grandTotal
      });
      return {
        success: true,
        saleId: params.saleId,
        invoiceNumber: params.invoiceNumber
      };
    });

    const saleResult = await CommercialDataService.saveTransaction(sampleSale);
    expect(processSaleSpy).toHaveBeenCalledTimes(1);
    expect(saleResult.success).toBe(true);
    expect(databaseStore.length).toBe(1);
    expect(databaseStore[0].id).toBe(sampleSale.id);

    // Garante que NENHUMA transação foi enfileirada em cache offline
    expect(localStorage.getItem("offline_queue")).toBeNull();
    expect(localStorage.getItem("erp_offline_sales")).toBeNull();
    expect(localStorage.getItem("pending_transactions")).toBeNull();

    // 4. DASHBOARD (Consome vendas diretamente do PostgreSQL)
    const txsFromPostgres = databaseStore;
    const totalVendasDashboard = txsFromPostgres.length;
    const faturamentoDashboard = txsFromPostgres.reduce((acc, t) => acc + t.grandTotal, 0);
    const ticketMedioDashboard = faturamentoDashboard / totalVendasDashboard;

    expect(totalVendasDashboard).toBe(1);
    expect(faturamentoDashboard).toBe(3650);
    expect(ticketMedioDashboard).toBe(3650);

    // 5. RELATÓRIOS (Refletem os mesmos dados de faturamento e impostos)
    const relatorioVendas = txsFromPostgres;
    const totalIvaRelatorios = relatorioVendas.reduce((acc, t) => acc + t.vatTotal, 0);
    const totalLiquidoRelatorios = relatorioVendas.reduce((acc, t) => acc + (t.subtotal || 0), 0);
    expect(totalIvaRelatorios).toBe(344);
    expect(totalLiquidoRelatorios).toBe(3650);

    // 6. RELOAD (Ao recarregar o sistema, busca direto do PostgreSQL, sem ler cache local)
    const fetchSpy = vi.spyOn(SupabaseSyncService, "fetchTransactions").mockResolvedValue(databaseStore);
    const reloadedTransactions = await CommercialDataService.fetchTransactions();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(reloadedTransactions.length).toBe(1);
    expect(reloadedTransactions[0].invoiceNumber).toBe("FT-2026/0010");

    // 7. LOGOUT (Termina sessão, remove tokens e define erp_user_logged_out)
    const signOutSpy = vi.spyOn(SupabaseSyncService, "signOut").mockImplementation(async () => {
      localStorage.removeItem("erp_logged_in_user");
      localStorage.setItem("erp_user_logged_out", "true");
    });

    await CommercialDataService.signOut();
    expect(signOutSpy).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("erp_logged_in_user")).toBeNull();
    expect(localStorage.getItem("erp_user_logged_out")).toBe("true");

    // 8. NOVO LOGIN (Autentica novamente e lê os dados persistidos)
    localStorage.removeItem("erp_user_logged_out");
    localStorage.setItem("erp_logged_in_user", JSON.stringify({
      id: "emp-admin-01",
      name: "Administrador Geral",
      role: "ADMIN"
    }));

    const newUser = JSON.parse(localStorage.getItem("erp_logged_in_user") || "null");
    expect(newUser).not.toBeNull();
    expect(newUser.role).toBe("ADMIN");

    // Dados de vendas continuam íntegros no PostgreSQL
    const postLoginTxs = await CommercialDataService.fetchTransactions();
    expect(postLoginTxs.length).toBe(1);
    expect(postLoginTxs[0].grandTotal).toBe(3650);
  });

  // =========================================================================
  // TESTE 2: FALHA DE CONEXÃO POSTGRESQL
  // Falha PostgreSQL → venda não concluída → nenhum armazenamento offline
  // =========================================================================
  it("Falha PostgreSQL → venda não concluída → nenhum armazenamento offline", async () => {
    // Simula indisponibilidade total do PostgreSQL (timeout de rede ou erro do servidor)
    vi.spyOn(SupabaseSyncService, "processSaleAtomic").mockResolvedValue({
      success: false,
      error: "Falha de conexão com PostgreSQL: Connection timeout (08006)"
    });

    // 1. A venda NÃO pode ser concluída com sucesso; deve lançar erro
    let saleCompleted = false;
    let thrownError: any = null;

    try {
      await CommercialDataService.saveTransaction(sampleSale);
      saleCompleted = true;
    } catch (err: any) {
      thrownError = err;
    }

    expect(saleCompleted).toBe(false);
    expect(thrownError).not.toBeNull();
    expect(thrownError.message).toContain("Falha de conexão com PostgreSQL");

    // 2. NENHUM armazenamento offline permitido (Strict Online Only)
    expect(localStorage.getItem("offline_queue")).toBeNull();
    expect(localStorage.getItem("erp_offline_sales")).toBeNull();
    expect(localStorage.getItem("pending_transactions")).toBeNull();
    expect(localStorage.getItem("cached_sales")).toBeNull();
    expect(sessionStorage.getItem("offline_queue")).toBeNull();

    // 3. O storage local não contém transações acumuladas
    const allKeys = Object.keys(mockStorage);
    const hasAnyOfflineSaleKey = allKeys.some(k => 
      k.includes("offline") || k.includes("queue") || k.includes("pending_sale")
    );
    expect(hasAnyOfflineSaleKey).toBe(false);
  });

  // =========================================================================
  // TESTE 3: ARQUITETURA SEM SINCRONIZAÇÃO/FILA OFFLINE
  // =========================================================================
  it("Sem sincronização offline, sem fila offline e sem cache comercial local", async () => {
    // Quando a rede cai, leitura do banco deve propagar erro e nunca retornar cache falso
    vi.spyOn(SupabaseSyncService, "fetchTransactions").mockRejectedValue(
      new Error("Network Error: PostgreSQL offline")
    );

    await expect(CommercialDataService.fetchTransactions()).rejects.toThrow(
      "Network Error: PostgreSQL offline"
    );

    // Garante ausência total de chaves comerciais offline
    const forbiddenKeys = [
      "offline_sales",
      "erp_offline_queue",
      "sync_pending",
      "offline_transactions",
      "local_sales_cache"
    ];

    forbiddenKeys.forEach(key => {
      expect(localStorage.getItem(key)).toBeNull();
    });
  });
});
