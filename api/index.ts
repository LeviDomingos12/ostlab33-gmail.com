/**
 * @file api/index.ts
 * Ponto de entrada unificado para ambientes Serverless (Vercel).
 * Delega integralmente todas as rotas e segurança para o backend unificado de server.ts.
 */

import { app } from "../server";

export default app;
