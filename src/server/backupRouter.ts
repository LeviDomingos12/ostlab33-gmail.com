import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { requireAdmin, requireAuth } from "./authMiddleware";

export const backupRouter = Router();

const BACKUPS_DIR = path.join(process.cwd(), "backups");
if (!fs.existsSync(BACKUPS_DIR)) {
  try {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  } catch (err) {
    console.error("Failed to create backups directory:", err);
  }
}

// 1. List Backups
backupRouter.get("/", requireAuth, async (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) {
      return res.json({ backups: [] });
    }

    const files = fs.readdirSync(BACKUPS_DIR);
    const backups = files
      .filter(f => f.endsWith(".json") || f.endsWith(".sql") || f.endsWith(".bak"))
      .map(filename => {
        const filePath = path.join(BACKUPS_DIR, filename);
        const stats = fs.statSync(filePath);
        return {
          filename,
          sizeBytes: stats.size,
          sizeFormatted: `${(stats.size / 1024).toFixed(1)} KB`,
          createdAt: stats.birthtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ backups });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Erro ao listar backups.";
    res.status(500).json({ error: errorMsg });
  }
});

// 2. Download Backup
backupRouter.get("/download/:filename", requireAdmin, (req: Request, res: Response) => {
  try {
    const safeFilename = path.basename(req.params.filename);
    const filePath = path.join(BACKUPS_DIR, safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Ficheiro de backup não encontrado." });
    }

    res.download(filePath);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Erro ao descarregar backup.";
    res.status(500).json({ error: errorMsg });
  }
});

// 3. Delete Backup
backupRouter.delete("/:filename", requireAdmin, (req: Request, res: Response) => {
  try {
    const safeFilename = path.basename(req.params.filename);
    const filePath = path.join(BACKUPS_DIR, safeFilename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ success: true, message: `Backup ${safeFilename} removido com sucesso.` });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Erro ao eliminar backup.";
    res.status(500).json({ error: errorMsg });
  }
});
