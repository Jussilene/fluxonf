// src/routes/historico.routes.js
import { Router } from "express";
import { listarHistorico } from "../models/historico.model.js";

const router = Router();

/**
 * GET /api/historico
 * Filtros opcionais: ?empresaId=...&tipo=...&dataDe=...&dataAte=...
 */
router.get("/", (req, res) => {
  try {
    const { empresaId, tipo, dataDe, dataAte } = req.query;

    const historico = listarHistorico({
      empresaId,
      tipo,
      dataDe,
      dataAte,
    });

    res.json({ ok: true, historico });
  } catch (err) {
    console.error("Erro ao listar histórico:", err);
    res.status(500).json({ ok: false, error: "Erro ao listar histórico" });
  }
});

export default router;
