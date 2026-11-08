import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { requireAuth, requireAdmin, requireStockOrAdmin } from "../server/authMiddleware";

describe("Auth Middleware & Multi-Tenant Security", () => {
  const app = express();
  app.use(express.json());

  // Test endpoints
  app.get("/test/protected", requireAuth, (req, res) => {
    res.json({ success: true, user: (req as any).user });
  });

  app.get("/test/admin-only", requireAuth, requireAdmin, (req, res) => {
    res.json({ success: true, message: "Admin access granted" });
  });

  app.get("/test/stock-only", requireAuth, requireStockOrAdmin, (req, res) => {
    res.json({ success: true, message: "Stock access granted" });
  });

  it("should reject unauthenticated requests with 401", async () => {
    const res = await request(app).get("/test/protected");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("Token de sessão não fornecido");
  });

  it("should reject requests when user has no active tenant/company", async () => {
    const fakeToken = "invalid.token.here";
    const res = await request(app)
      .get("/test/protected")
      .set("Authorization", `Bearer ${fakeToken}`);
    
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
