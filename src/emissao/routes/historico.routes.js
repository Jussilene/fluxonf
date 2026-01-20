// src/emissao/routes/historico.routes.js
import { Router } from "express";

// ✅ aqui é 2 níveis acima (src/emissao/routes -> src/db)
import db from "../../db/sqlite.js";

const router = Router();

/**
 * GET /api/historico
 * Filtros opcionais:
 *  - ?usuarioEmail=...
 *  - ?limit=...
 */
router.get("/", (req, res) => {
  try {
    const usuarioEmail = (req.query.usuarioEmail || "").toString().trim();
    const limitRaw = Number(req.query.limit ?? 200);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, limitRaw)) : 200;

    let rows = [];

    if (usuarioEmail) {
      const stmt = db.prepare(`
        SELECT
          id,
          usuarioEmail,
          usuarioNome,
          empresaId,
          empresaNome,
          tipo,
          dataHora,
          status,
          arquivosCount,
          detalhes
        FROM historico_execucoes
        WHERE usuarioEmail = ?
        ORDER BY id DESC
        LIMIT ?
      `);
      rows = stmt.all(usuarioEmail, limit);
    } else {
      const stmt = db.prepare(`
        SELECT
          id,
          usuarioEmail,
          usuarioNome,
          empresaId,
          empresaNome,
          tipo,
          dataHora,
          status,
          arquivosCount,
          detalhes
        FROM historico_execucoes
        ORDER BY id DESC
        LIMIT ?
      `);
      rows = stmt.all(limit);
    }

    return res.json({ success: true, items: rows });
  } catch (err) {
    console.error("[HISTORICO] erro ao listar:", err);
    return res.status(500).json({ success: false, error: "Erro ao listar histórico." });
  }
});

/**
 * GET /api/historico/:id
 */
router.get("/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: "ID inválido." });
    }

    const stmt = db.prepare(`
      SELECT
        id,
        usuarioEmail,
        usuarioNome,
        empresaId,
        empresaNome,
        tipo,
        dataHora,
        status,
        arquivosCount,
        detalhes
      FROM historico_execucoes
      WHERE id = ?
      LIMIT 1
    `);

    const row = stmt.get(id);
    if (!row) return res.status(404).json({ success: false, error: "Registro não encontrado." });

    return res.json({ success: true, item: row });
  } catch (err) {
    console.error("[HISTORICO] erro ao buscar:", err);
    return res.status(500).json({ success: false, error: "Erro ao buscar histórico." });
  }
});

export default router;
