// src/routes/empresas.routes.js
// Rotas para gerenciamento de empresas (execução em lote NFSe)

import { Router } from "express";
import {
  getEmpresas,
  createEmpresa,
  deleteEmpresa,
} from "../controllers/empresas.controller.js";

const router = Router();

// Lista empresas
router.get("/", getEmpresas);

// Cria nova empresa
router.post("/", createEmpresa);

// Remove empresa por ID
router.delete("/:id", deleteEmpresa);

export default router;
