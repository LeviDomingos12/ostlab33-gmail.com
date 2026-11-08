/**
 * Script de Execução Direta: Varredura e Limpeza das coleções 'products', 'customers' e 'transactions' no Supabase
 */
import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";
import { isMockRecord } from "../src/services/adminService";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Erro: Variáveis obrigatórias SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não encontradas.");
  console.error("Para executar scripts de limpeza administrativa, forneça as credenciais de serviço no ambiente.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runClean() {
  console.log("=================================================================");
  console.log("🚀 EXECUTANDO VARREDURA E LIMPEZA DE MOCK DATA NO SUPABASE");
  console.log(`📡 URL Supabase: ${SUPABASE_URL}`);
  console.log("=================================================================\n");

  const tablesToScan = [
    { name: "products", label: "Produtos (products)" },
    { name: "produtos", label: "Produtos (produtos)" },
    { name: "customers", label: "Clientes (customers)" },
    { name: "clientes", label: "Clientes (clientes)" },
    { name: "transactions", label: "Vendas (transactions)" },
    { name: "vendas", label: "Vendas (vendas)" },
    { name: "caixa", label: "Caixa (caixa)" }
  ];

  let totalRemoved = 0;

  for (const table of tablesToScan) {
    try {
      const { data, error } = await supabase.from(table.name).select("*");
      if (error) {
        console.log(`ℹ️ Tabela '${table.name}' não acessível ou inexistente: ${error.message}`);
        continue;
      }

      if (!Array.isArray(data) || data.length === 0) {
        console.log(`✅ [${table.label}]: 0 registos encontrados (coleção limpa).`);
        continue;
      }

      const mockItems = data.filter(item => isMockRecord(item));
      const realItems = data.filter(item => !isMockRecord(item));

      console.log(`📊 [${table.label}]: Total: ${data.length} | Reais: ${realItems.length} | Mock: ${mockItems.length}`);

      if (mockItems.length > 0) {
        const ids = mockItems.map(m => m.id);
        
        // Limpar dependências se aplicável
        if (table.name === "produtos" || table.name === "products") {
          try { await supabase.from("venda_itens").delete().in("product_id", ids); } catch (e) {}
          try { await supabase.from("stock_movements").delete().in("product_id", ids); } catch (e) {}
        } else if (table.name === "clientes" || table.name === "customers") {
          try { await supabase.from("customer_debts").delete().in("customer_id", ids); } catch (e) {}
          try { await supabase.from("debt_payments").delete().in("customer_id", ids); } catch (e) {}
        } else if (table.name === "vendas" || table.name === "transactions") {
          try { await supabase.from("venda_itens").delete().in("sale_id", ids); } catch (e) {}
        }

        const { error: delError } = await supabase.from(table.name).delete().in("id", ids);
        if (delError) {
          console.error(`❌ Erro ao remover mock de ${table.name}: ${delError.message}`);
        } else {
          totalRemoved += ids.length;
          console.log(`🗑️ Removidos ${ids.length} registos de mock da tabela '${table.name}'.`);
        }
      }
    } catch (e: any) {
      console.warn(`⚠️ Exceção ao inspecionar ${table.name}:`, e.message);
    }
  }

  console.log("\n=================================================================");
  console.log(`🏁 VARREDURA CONCLUÍDA: ${totalRemoved} registros mock removidos no total.`);
  console.log("✨ Apenas dados reais de utilizadores e empresas permanecem no banco de dados.");
  console.log("=================================================================");
}

runClean().catch(console.error);
