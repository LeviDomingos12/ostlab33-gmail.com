import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { commercialRouter } from "../server/safeEndpoints";
import { FULL_DATABASE_SCHEMA_SQL } from "../lib/databaseSchemaSql";

describe("Testes Negativos de Segurança: Autenticação, Perfis e Isolamento Multi-Tenant", () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", commercialRouter);

  describe("1. Acessos Anónimos e Não Autenticados (Negação Total)", () => {
    it("deve rejeitar acesso anónimo a listagem de produtos com 401", async () => {
      const res = await request(app).get("/api/v1/products");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Acesso não autorizado");
    });

    it("deve rejeitar acesso anónimo a listagem de clientes com 401", async () => {
      const res = await request(app).get("/api/v1/customers");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Acesso não autorizado");
    });

    it("deve rejeitar acesso anónimo a processamento de vendas com 401", async () => {
      const res = await request(app).post("/api/v1/sales/process").send({
        items: [{ productId: "p1", quantity: 1, salePrice: 100 }],
        paymentMethod: "CASH"
      });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("deve rejeitar token malformatado ou sem prefixo Bearer com 401", async () => {
      const res = await request(app)
        .get("/api/v1/products")
        .set("Authorization", "InvalidTokenFormat");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("deve rejeitar token vazio com 401", async () => {
      const res = await request(app)
        .get("/api/v1/products")
        .set("Authorization", "Bearer ");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe("2. Utilizadores Sem Perfil Válido ou Sem Role Autorizado", () => {
    it("deve rejeitar utilizador com papel não reconhecido (ex: HACKER) com 403", async () => {
      const tokenInvalidRole = "test-token-HACKER-empresa_a";
      const res = await request(app)
        .get("/api/v1/products")
        .set("Authorization", `Bearer ${tokenInvalidRole}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Acesso negado: Perfil de utilizador sem papel (role) autorizado");
    });

    it("deve rejeitar utilizador sem tenant vinculado com 403", async () => {
      const tokenNoTenant = "test-token-ADMIN-";
      const res = await request(app)
        .get("/api/v1/products")
        .set("Authorization", `Bearer ${tokenNoTenant}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Acesso negado: Utilizador sem organização/empresa (tenant) válida");
    });
  });

  describe("3. Detecção e Bloqueio de Tenants Falsificados (Anti-Spoofing)", () => {
    const tokenTenantA = "test-token-ADMIN-empresa_a";

    it("deve rejeitar tentativa de spoofing via header x-tenant-id com 403", async () => {
      const res = await request(app)
        .get("/api/v1/products")
        .set("Authorization", `Bearer ${tokenTenantA}`)
        .set("x-tenant-id", "tenant_empresa_vitima");

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Violação de segurança: Tenant fornecido pelo cliente");
    });

    it("deve rejeitar tentativa de spoofing via body.tenant_id com 403", async () => {
      const res = await request(app)
        .post("/api/v1/products")
        .set("Authorization", `Bearer ${tokenTenantA}`)
        .send({
          name: "Produto Ilegítimo",
          price: 50,
          tenant_id: "tenant_empresa_vitima"
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Violação de segurança: Tenant fornecido pelo cliente");
    });

    it("deve rejeitar tentativa de spoofing via query param tenant_id com 403", async () => {
      const res = await request(app)
        .get("/api/v1/products?tenant_id=tenant_empresa_vitima")
        .set("Authorization", `Bearer ${tokenTenantA}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Violação de segurança: Tenant fornecido pelo cliente");
    });

    it("deve rejeitar tentativa de spoofing via body.p_tenant_id com 403", async () => {
      const res = await request(app)
        .post("/api/v1/products")
        .set("Authorization", `Bearer ${tokenTenantA}`)
        .send({
          name: "Produto Ilegítimo",
          price: 50,
          p_tenant_id: "tenant_empresa_vitima"
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Violação de segurança: Tenant fornecido pelo cliente");
    });

    it("deve rejeitar tentativa de spoofing via header x-company-id com 403", async () => {
      const res = await request(app)
        .get("/api/v1/products")
        .set("Authorization", `Bearer ${tokenTenantA}`)
        .set("x-company-id", "tenant_empresa_vitima");

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Violação de segurança: Tenant fornecido pelo cliente");
    });

    it("deve rejeitar tentativa de spoofing via query param company_id com 403", async () => {
      const res = await request(app)
        .get("/api/v1/products?company_id=tenant_empresa_vitima")
        .set("Authorization", `Bearer ${tokenTenantA}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Violação de segurança: Tenant fornecido pelo cliente");
    });

    it("deve rejeitar tentativa de spoofing via body.company_id com 403", async () => {
      const res = await request(app)
        .post("/api/v1/products")
        .set("Authorization", `Bearer ${tokenTenantA}`)
        .send({
          name: "Produto Ilegítimo",
          price: 50,
          company_id: "tenant_empresa_vitima"
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Violação de segurança: Tenant fornecido pelo cliente");
    });

    it("deve rejeitar tentativa de spoofing via body.p_company_id com 403", async () => {
      const res = await request(app)
        .post("/api/v1/products")
        .set("Authorization", `Bearer ${tokenTenantA}`)
        .send({
          name: "Produto Ilegítimo",
          price: 50,
          p_company_id: "tenant_empresa_vitima"
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Violação de segurança: Tenant fornecido pelo cliente");
    });
  });

  describe("4. Isolamento Estrito entre Empresas e Contratos de RPC", () => {
    it("current_tenant_id() deve ser autoritativa e não permitir controle por claims de JWT ou variáveis de sessão de clientes", () => {
      // Garante que current_tenant_id consulta public.get_my_company_id() para identidades autenticadas
      expect(FULL_DATABASE_SCHEMA_SQL).toContain("IF auth.uid() IS NOT NULL THEN");
      expect(FULL_DATABASE_SCHEMA_SQL).toContain("RETURN public.get_my_company_id();");

      // Garante que auth.jwt()->>'company_id' NÃO é confiado
      expect(FULL_DATABASE_SCHEMA_SQL).not.toContain("auth.jwt()->>'company_id'");
      expect(FULL_DATABASE_SCHEMA_SQL).not.toContain("auth.jwt()->>'tenant_id'");

      // Revogação de permissões a utilizadores anónimos e ao público
      expect(FULL_DATABASE_SCHEMA_SQL).toContain("REVOKE EXECUTE ON FUNCTION public.current_tenant_id() FROM anon, public;");
      expect(FULL_DATABASE_SCHEMA_SQL).toContain("GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated, service_role, postgres;");
    });

    it("as funções RPC em FULL_DATABASE_SCHEMA_SQL devem validar correspondência entre o tenant e a identidade autenticada", () => {
      // Verifica que a RPC process_sale_atomic rejeita tenants não autorizados
      expect(FULL_DATABASE_SCHEMA_SQL).toContain("v_tenant_id := public.get_my_company_id();");
      expect(FULL_DATABASE_SCHEMA_SQL).toContain("Acesso negado: Tenant especificado pelo cliente não corresponde à identidade autenticada.");
    });

    it("todas as RPCs SECURITY DEFINER devem rejeitar chamadas sem identidade autenticada ou credenciais de serviço verificadas", () => {
      // Rejeição estrita de chamadas não autenticadas em todas as 4 RPCs de escrita crítica
      expect(FULL_DATABASE_SCHEMA_SQL).toContain("Acesso negado: Chamada a procedimento sem identidade autenticada ou credenciais de serviço devidamente verificadas.");
      
      // Validação de credenciais de serviço autorizadas (service_role, postgres, supabase_admin)
      expect(FULL_DATABASE_SCHEMA_SQL).toContain("ELSIF v_is_service THEN");
      expect(FULL_DATABASE_SCHEMA_SQL).toContain("COALESCE(auth.role(), '') = 'service_role'");
    });

    it("as permissões em FULL_DATABASE_SCHEMA_SQL revogam estritamente privilégios de 'anon' e 'public' em todas as funções SECURITY DEFINER", () => {
      expect(FULL_DATABASE_SCHEMA_SQL).toContain("REVOKE EXECUTE ON FUNCTION public.process_sale_atomic FROM anon, public;");
      expect(FULL_DATABASE_SCHEMA_SQL).toContain("GRANT EXECUTE ON FUNCTION public.process_sale_atomic TO postgres, authenticated, service_role;");

      expect(FULL_DATABASE_SCHEMA_SQL).toContain("REVOKE EXECUTE ON FUNCTION public.replenish_stock_atomic FROM anon, public;");
      expect(FULL_DATABASE_SCHEMA_SQL).toContain("GRANT EXECUTE ON FUNCTION public.replenish_stock_atomic TO postgres, authenticated, service_role;");

      expect(FULL_DATABASE_SCHEMA_SQL).toContain("REVOKE EXECUTE ON FUNCTION public.settle_debt_payment_atomic FROM anon, public;");
      expect(FULL_DATABASE_SCHEMA_SQL).toContain("GRANT EXECUTE ON FUNCTION public.settle_debt_payment_atomic TO postgres, authenticated, service_role;");

      expect(FULL_DATABASE_SCHEMA_SQL).toContain("REVOKE EXECUTE ON FUNCTION public.record_sale_return_atomic FROM anon, public;");
      expect(FULL_DATABASE_SCHEMA_SQL).toContain("GRANT EXECUTE ON FUNCTION public.record_sale_return_atomic TO postgres, authenticated, service_role;");

      expect(FULL_DATABASE_SCHEMA_SQL).toContain("REVOKE EXECUTE ON FUNCTION public.get_my_company_id() FROM anon, public;");
      expect(FULL_DATABASE_SCHEMA_SQL).toContain("REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM anon, public;");
    });
  });
});
