/**
 * @file src/services/adminService.ts
 * Serviço Administrativo para Manutenção, Diagnóstico e Purga de Dados de Exemplo no Supabase e Armazenamento Local.
 */

import { supabase } from "../lib/supabase";
import { authenticatedFetch } from "../lib/apiClient";
import { Product, Customer, Transaction } from "../types";

export interface CleanMockReport {
  timestamp: string;
  purgedProducts: number;
  purgedCustomers: number;
  purgedTransactions: number;
  purgedCashflow: number;
  purgedAuditLogs: number;
  supabaseCleaned: boolean;
  fileDbCleaned: boolean;
  details: string[];
}

export const MOCK_ID_PATTERN = /^(mock|demo|prod-mock|cust-mock|tx-mock|sample|teste|test-|dummy)/i;
export const MOCK_NAME_PATTERN = /\[(mock|demo|exemplo|teste|sample)\]|\((mock|demo|demonstração|exemplo|teste|sample)\)/i;

export function isMockRecord(item: any): boolean {
  if (!item || typeof item !== "object") return false;

  // 1. Flags booleanas explícitas
  if (
    item.isMock === true ||
    item.is_mock === true ||
    item.mock === true ||
    item.isDemo === true ||
    item.is_demo === true ||
    item.isSample === true ||
    item.is_sample === true
  ) {
    return true;
  }

  // 2. Identificador
  if (typeof item.id === "string" && MOCK_ID_PATTERN.test(item.id)) {
    return true;
  }

  // 3. Nomes, códigos ou referências
  const name = item.name || item.nome || item.customerName || item.customer_name || item.invoice_number || item.invoiceNumber || "";
  if (typeof name === "string" && MOCK_NAME_PATTERN.test(name)) {
    return true;
  }

  const code = item.code || item.barcode || item.nuit || item.nif || "";
  if (typeof code === "string" && MOCK_ID_PATTERN.test(code)) {
    return true;
  }

  return false;
}

export const AdminService = {
  /**
   * Percorre e remove todos os registos identificados como mock/exemplo nas coleções do Supabase:
   * 'products', 'customers', 'transactions', 'produtos', 'clientes', 'vendas', 'caixa'.
   */
  async cleanSupabaseCollections(): Promise<CleanMockReport> {
    const report: CleanMockReport = {
      timestamp: new Date().toISOString(),
      purgedProducts: 0,
      purgedCustomers: 0,
      purgedTransactions: 0,
      purgedCashflow: 0,
      purgedAuditLogs: 0,
      supabaseCleaned: false,
      fileDbCleaned: false,
      details: []
    };

    console.log("[AdminService] 🧹 Iniciando varredura e purga nas coleções do Supabase...");

    // 1. Tabela oficial 'products'
    for (const table of ["products"]) {
      try {
        const { data, error } = await supabase.from(table).select("*");
        if (!error && Array.isArray(data) && data.length > 0) {
          const mockItems = data.filter(item => isMockRecord(item));
          if (mockItems.length > 0) {
            const ids = mockItems.map(m => m.id);
            // Remover dependências em cascata se existirem
            try { await supabase.from("venda_itens").delete().in("product_id", ids); } catch (e) {}
            try { await supabase.from("stock_movements").delete().in("product_id", ids); } catch (e) {}
            const { error: delErr } = await supabase.from(table).delete().in("id", ids);
            if (!delErr) {
              report.purgedProducts += ids.length;
              report.details.push(`Supabase (${table}): Removidos ${ids.length} registos de teste.`);
            }
          }
        }
      } catch (err: any) {
        console.warn(`[AdminService] Aviso ao verificar ${table}:`, err.message);
      }
    }

    // 2. Tabela 'clientes' / 'customers'
    for (const table of ["clientes", "customers"]) {
      try {
        const { data, error } = await supabase.from(table).select("*");
        if (!error && Array.isArray(data) && data.length > 0) {
          const mockItems = data.filter(item => isMockRecord(item));
          if (mockItems.length > 0) {
            const ids = mockItems.map(m => m.id);
            try { await supabase.from("customer_debts").delete().in("customer_id", ids); } catch (e) {}
            try { await supabase.from("debt_payments").delete().in("customer_id", ids); } catch (e) {}
            const { error: delErr } = await supabase.from(table).delete().in("id", ids);
            if (!delErr) {
              report.purgedCustomers += ids.length;
              report.details.push(`Supabase (${table}): Removidos ${ids.length} clientes de teste.`);
            }
          }
        }
      } catch (err: any) {
        console.warn(`[AdminService] Aviso ao verificar ${table}:`, err.message);
      }
    }

    // 3. Tabela 'vendas' / 'transactions'
    for (const table of ["vendas", "transactions"]) {
      try {
        const { data, error } = await supabase.from(table).select("*");
        if (!error && Array.isArray(data) && data.length > 0) {
          const mockItems = data.filter(item => isMockRecord(item));
          if (mockItems.length > 0) {
            const ids = mockItems.map(m => m.id);
            try { await supabase.from("venda_itens").delete().in("sale_id", ids); } catch (e) {}
            const { error: delErr } = await supabase.from(table).delete().in("id", ids);
            if (!delErr) {
              report.purgedTransactions += ids.length;
              report.details.push(`Supabase (${table}): Removidas ${ids.length} transações de teste.`);
            }
          }
        }
      } catch (err: any) {
        console.warn(`[AdminService] Aviso ao verificar ${table}:`, err.message);
      }
    }

    // 4. Tabela 'caixa'
    try {
      const { data, error } = await supabase.from("caixa").select("*");
      if (!error && Array.isArray(data) && data.length > 0) {
        const mockItems = data.filter(item => isMockRecord(item));
        if (mockItems.length > 0) {
          const ids = mockItems.map(m => m.id);
          const { error: delErr } = await supabase.from("caixa").delete().in("id", ids);
          if (!delErr) {
            report.purgedCashflow += ids.length;
            report.details.push(`Supabase (caixa): Removidos ${ids.length} lançamentos de caixa de teste.`);
          }
        }
      }
    } catch (err: any) {
      console.warn("[AdminService] Aviso ao verificar caixa:", err.message);
    }

    report.supabaseCleaned = true;
    return report;
  },

  /**
   * Executa a purga de dados mock/demo através da API administrativa do servidor
   * e diretamente no Supabase se houver conexão ativa.
   */
  async purgeMockData(userName?: string): Promise<{ success: boolean; message: string; report: CleanMockReport }> {
    let report: CleanMockReport = {
      timestamp: new Date().toISOString(),
      purgedProducts: 0,
      purgedCustomers: 0,
      purgedTransactions: 0,
      purgedCashflow: 0,
      purgedAuditLogs: 0,
      supabaseCleaned: false,
      fileDbCleaned: false,
      details: []
    };

    // 1. Tentar executar via API do servidor (que limpa arquivos locais e Supabase com service role)
    try {
      const response = await authenticatedFetch("/api/admin/clean-mock-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: userName || "Administrador" })
      });

      if (response.ok) {
        const json = await response.json();
        if (json.report) {
          report = json.report;
        }
      }
    } catch (e) {
      console.warn("[AdminService] Aviso na API do servidor, executando via client Supabase:", e);
    }

    // 2. Executar também varredura direta via client Supabase
    try {
      const directSbReport = await this.cleanSupabaseCollections();
      report.purgedProducts += directSbReport.purgedProducts;
      report.purgedCustomers += directSbReport.purgedCustomers;
      report.purgedTransactions += directSbReport.purgedTransactions;
      report.purgedCashflow += directSbReport.purgedCashflow;
      report.supabaseCleaned = true;
      report.details.push(...directSbReport.details);
    } catch (sbErr: any) {
      console.warn("[AdminService] Erro na limpeza direta Supabase:", sbErr.message);
    }

    return {
      success: true,
      message: `Varredura concluída. Foram purgados ${report.purgedProducts} produtos, ${report.purgedCustomers} clientes e ${report.purgedTransactions} transações de exemplo.`,
      report
    };
  },

  /**
   * Executa um Reset Comercial Completo de Fábrica:
   * 1. Solicita ao backend (/api/system/reset) o backup de segurança e a limpeza de ficheiros JSON.
   * 2. Limpa dados de demonstração no Supabase.
   * 3. Elimina chaves de sessão e histórico em localStorage/sessionStorage.
   * 4. Encerra a sessão Supabase Auth.
   */
  async executeFullCommercialReset(userName?: string): Promise<{ success: boolean; message: string }> {
    try {
      // 1. Backend reset
      try {
        await authenticatedFetch("/api/system/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userName: userName || "Administrador", reason: "Commercialization Factory Reset" })
        });
      } catch (e) {
        console.warn("[AdminService] Backend reset notice:", e);
      }

      // 2. Supabase clean
      await this.purgeMockData(userName);

      // 3. Supabase Auth Signout
      try {
        await supabase.auth.signOut();
      } catch (e) {}

      // 4. Wipe all browser storage
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {}

      return {
        success: true,
        message: "O sistema foi completamente reiniciado e limpo para comercialização. A recarregar..."
      };
    } catch (err: any) {
      return {
        success: false,
        message: "Erro ao reiniciar o sistema: " + (err.message || "Erro desconhecido")
      };
    }
  },

  /**
   * Filtra uma lista de produtos em memória, removendo itens de exemplo
   */
  filterRealProducts(products: Product[]): Product[] {
    return products.filter(p => !isMockRecord(p));
  },

  /**
   * Filtra uma lista de clientes em memória, removendo itens de exemplo
   */
  filterRealCustomers(customers: Customer[]): Customer[] {
    return customers.filter(c => !isMockRecord(c));
  },

  /**
   * Filtra uma lista de transações em memória, removendo itens de exemplo
   */
  filterRealTransactions(transactions: Transaction[]): Transaction[] {
    return transactions.filter(t => !isMockRecord(t));
  }
};

