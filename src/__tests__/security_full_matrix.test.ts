import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { commercialRouter } from "../server/safeEndpoints";
import { requireAuth, requireAdmin } from "../server/authMiddleware";
import { FULL_DATABASE_SCHEMA_SQL } from "../lib/databaseSchemaSql";
import { SQL_SCRIPTS } from "../server/postgresService";

describe("Matriz Completa de Testes de Segurança OST Vendas", () => {
  // Configuração do express para testes de endpoints
  const app = express();
  app.use(express.json());

  // Rotas de retaguarda
  app.use("/api/v1", commercialRouter);

  // Rotas administrativas
  app.post("/api/settings", requireAuth, requireAdmin, (req, res) => {
    res.json({ success: true, message: "Settings updated" });
  });

  app.post("/api/admin/clean-mock-data", requireAuth, requireAdmin, (req, res) => {
    res.json({ success: true, message: "Mock data cleaned" });
  });

  app.post("/api/system/reset", requireAuth, requireAdmin, (req, res) => {
    res.json({ success: true, message: "System reset complete" });
  });

  describe("1. Acessos Não Autenticados (Zero Trust)", () => {
    it("deve rejeitar POST /api/v1/sales/process sem token com 401", async () => {
      const res = await request(app).post("/api/v1/sales/process").send({
        items: [{ productId: "p-1", quantity: 1, salePrice: 100 }],
        grandTotal: 100
      });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Token de sessão não fornecido");
    });

    it("deve rejeitar POST /api/v1/stock/replenish sem token com 401", async () => {
      const res = await request(app).post("/api/v1/stock/replenish").send({
        productId: "p-1",
        quantity: 10
      });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("deve rejeitar POST /api/v1/debts/settle sem token com 401", async () => {
      const res = await request(app).post("/api/v1/debts/settle").send({
        debtId: "d-1",
        amount: 50
      });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("deve rejeitar GET /api/v1/auditlogs sem token com 401", async () => {
      const res = await request(app).get("/api/v1/auditlogs");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("deve rejeitar POST /api/settings sem token com 401", async () => {
      const res = await request(app).post("/api/settings").send({ companyName: "Hacked" });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("deve rejeitar POST /api/admin/clean-mock-data sem token com 401", async () => {
      const res = await request(app).post("/api/admin/clean-mock-data").send({});
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("deve rejeitar POST /api/system/reset sem token com 401", async () => {
      const res = await request(app).post("/api/system/reset").send({});
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe("2. Isolamento Real entre Empresas (Multi-Tenant & Anti-Spoofing)", () => {
    it("deve bloquear tentativa de spoofing de tenant via cabeçalho x-tenant-id com 403", async () => {
      // Token para Empresa A (tenant_empresa_a)
      const tokenCompanyA = "test-token-ADMIN-empresa_a";

      const res = await request(app)
        .post("/api/v1/products")
        .set("Authorization", `Bearer ${tokenCompanyA}`)
        .set("x-tenant-id", "tenant_empresa_b") // Tentativa de aceder à Empresa B
        .send({
          name: "Produto Infiltrado",
          price: 100,
          category: "Geral"
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Violação de segurança");
    });

    it("deve bloquear tentativa de spoofing de tenant via corpo da requisição (body.tenant_id) com 403", async () => {
      const tokenCompanyA = "test-token-ADMIN-empresa_a";

      const res = await request(app)
        .post("/api/v1/products")
        .set("Authorization", `Bearer ${tokenCompanyA}`)
        .send({
          tenant_id: "tenant_empresa_b", // Tentativa de adulterar o tenant no payload
          name: "Produto Infiltrado",
          price: 100,
          category: "Geral"
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Violação de segurança");
    });
  });

  describe("3. Permissões por Perfil (RBAC Rigoroso)", () => {
    it("Vendedor (SELLER) NÃO pode modificar stock nem criar produtos", async () => {
      const tokenSeller = "test-token-SELLER-empresa_a";

      const res = await request(app)
        .post("/api/v1/products")
        .set("Authorization", `Bearer ${tokenSeller}`)
        .send({
          name: "Novo Produto",
          price: 50,
          category: "Geral"
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Permissão negada");
    });

    it("Gestor de Stock (STOCK_MANAGER) NÃO pode processar vendas nem liquidar dívidas", async () => {
      const tokenStock = "test-token-STOCK_MANAGER-empresa_a";

      const res = await request(app)
        .post("/api/v1/sales/process")
        .set("Authorization", `Bearer ${tokenStock}`)
        .send({
          items: [{ productId: "p-1", quantity: 1, salePrice: 100 }],
          grandTotal: 100,
          paymentMethod: "CASH"
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Permissão negada");
    });

    it("Operador de Caixa NÃO pode aceder a exportação de backups administrativos", async () => {
      const tokenCashier = "test-token-CASHIER-empresa_a";

      const res = await request(app)
        .get("/api/v1/backups/export")
        .set("Authorization", `Bearer ${tokenCashier}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Apenas administradores");
    });

    it("Administrador tem acesso completo na sua respetiva empresa", async () => {
      const tokenAdmin = "test-token-ADMIN-empresa_a";

      const res = await request(app)
        .get("/api/v1/products")
        .set("Authorization", `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("4. Auditoria de Ficheiros SQL, DDL e Políticas RLS (Zero Insecure Grants)", () => {
    it("FULL_DATABASE_SCHEMA_SQL NÃO deve conter 'allow_all' ativo ou grants para 'anon'", () => {
      // Verifica que não há CREATE POLICY allow_all no SQL
      expect(FULL_DATABASE_SCHEMA_SQL).not.toContain("CREATE POLICY allow_all");
      expect(FULL_DATABASE_SCHEMA_SQL).not.toContain("CREATE POLICY \"allow_all");
      
      // Verifica que não há concessão de privilégios para 'anon'
      expect(FULL_DATABASE_SCHEMA_SQL).not.toContain("TO postgres, authenticated, anon");
      expect(FULL_DATABASE_SCHEMA_SQL).not.toContain("TO anon");
      
      // Verifica que há revogação de acessos anónimos
      expect(FULL_DATABASE_SCHEMA_SQL).toContain("REVOKE ALL ON public.products FROM anon, public;");
      expect(FULL_DATABASE_SCHEMA_SQL).toContain("REVOKE ALL ON public.vendas FROM anon, public;");
      expect(FULL_DATABASE_SCHEMA_SQL).toContain("REVOKE ALL ON public.company_settings FROM anon, public;");
    });

    it("SQL_SCRIPTS em postgresService NÃO deve conceder permissões a PUBLIC", () => {
      const allScripts = Object.values(SQL_SCRIPTS).join("\n");
      expect(allScripts).not.toContain("GRANT ALL ON ALL TABLES IN SCHEMA public TO PUBLIC;");
      expect(allScripts).not.toContain("TO authenticated, anon, public");
    });
  });
});
