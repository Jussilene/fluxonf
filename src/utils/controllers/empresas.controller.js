// src/controllers/empresas.controller.js
// Controller de empresas para execução em lote de NFSe

import {
  listarEmpresas,
  adicionarEmpresa,
  removerEmpresa,
} from "../utils/empresasStore.js";

/**
 * GET /api/empresas
 * Lista todas as empresas cadastradas para o lote.
 */
export async function getEmpresas(req, res) {
  try {
    const empresas = listarEmpresas();
    return res.json({ ok: true, empresas });
  } catch (err) {
    console.error("[EMPRESAS] Erro ao listar empresas:", err);
    return res.status(500).json({
      ok: false,
      message: "Erro ao listar empresas.",
    });
  }
}

/**
 * POST /api/empresas
 * body: { nome, cnpj, loginPortal?, senhaPortal }
 */
export async function createEmpresa(req, res) {
  try {
    const { nome, cnpj, loginPortal, senhaPortal } = req.body || {};

    if (!nome || !cnpj || !senhaPortal) {
      return res.status(400).json({
        ok: false,
        message: "Nome, CNPJ e senha do portal são obrigatórios.",
      });
    }

    const nova = adicionarEmpresa({
      nome,
      cnpj,
      loginPortal,
      senhaPortal,
    });

    return res.status(201).json({ ok: true, empresa: nova });
  } catch (err) {
    console.error("[EMPRESAS] Erro ao criar empresa:", err);
    return res.status(500).json({
      ok: false,
      message: "Erro ao criar empresa.",
    });
  }
}

/**
 * DELETE /api/empresas/:id
 */
export async function deleteEmpresa(req, res) {
  try {
    const { id } = req.params;
    const removed = removerEmpresa(id);

    if (!removed) {
      return res.status(404).json({
        ok: false,
        message: "Empresa não encontrada.",
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("[EMPRESAS] Erro ao remover empresa:", err);
    return res.status(500).json({
      ok: false,
      message: "Erro ao remover empresa.",
    });
  }
}
