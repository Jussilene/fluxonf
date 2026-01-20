// src/emissao/routes/emissao.routes.js
import { Router } from "express";
import {
  pingEmissao,
  listarEmpresasParaEmissao,

  // ✅ novos (para 100% separado do lote)
  adicionarEmpresaParaEmissao,
  removerEmpresaParaEmissao,

  salvarSessaoEmissao,
  emitirNfse,
  listarEmissoes,
  consultarNfsePorChave,
  cancelarNfse,
  salvarCertificadoPfx,
} from "../nfseEmissao.controller.js";

const router = Router();

router.get("/ping", pingEmissao);

// Empresas (ABA EMISSÃO) — 100% separado do lote
router.get("/empresas", listarEmpresasParaEmissao);
router.post("/empresas", adicionarEmpresaParaEmissao);
router.delete("/empresas/:id", removerEmpresaParaEmissao);

// Salvar PFX por empresa (ABA EMISSÃO)
router.post("/certificado", salvarCertificadoPfx);

// Sessão do portal (RPA) - mantém (se NFSE_USE_PORTAL=true)
router.post("/salvar-sessao", salvarSessaoEmissao);

// Emitir (portal ou API, conforme NFSE_PROVIDER)
router.post("/emitir", emitirNfse);

// Listar emissões gravadas
router.get("/listar", listarEmissoes);

// Consultar NFSe pela chave
router.get("/consultar/:chaveAcesso", consultarNfsePorChave);

// Cancelar NFSe (por chave)
router.post("/cancelar", cancelarNfse);

export default router;
