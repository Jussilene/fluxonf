// src/emissao/nfseEmissao.controller.js
import fs from "fs";
import path from "path";

import {
  salvarSessao,
  emitirNfse as emitirNfseService,
  listarNfse,
  consultarNfsePorChave as consultarNfsePorChaveService,
  cancelarNfsePorChave as cancelarNfsePorChaveService,
} from "./nfseEmissao.service.js";

// ✅ Store separado da Aba Emissão
import {
  listarEmpresasEmissao,
  adicionarEmpresaEmissao,
  removerEmpresaEmissao,
  atualizarEmpresaEmissaoCertificado,
} from "../utils/emissaoEmpresasStore.js";

export function pingEmissao(req, res) {
  return res.json({ ok: true, module: "emissao", ts: Date.now() });
}

export function listarEmpresasParaEmissao(req, res) {
  try {
    const empresas = listarEmpresasEmissao();
    return res.json({ ok: true, empresas });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Erro ao listar empresas." });
  }
}

// ✅ NOVO: criar empresa na ABA EMISSÃO (100% separado do lote)
export function adicionarEmpresaParaEmissao(req, res) {
  try {
    const { nome, cnpj, municipio } = req.body || {};

    if (!nome || !cnpj) {
      return res.status(400).json({ ok: false, error: "nome e cnpj são obrigatórios." });
    }

    const empresa = adicionarEmpresaEmissao({
      nome: String(nome || "").trim(),
      cnpj: String(cnpj || "").trim(),
      municipio: String(municipio || "").trim(),
    });

    return res.json({ ok: true, empresa });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Erro ao adicionar empresa." });
  }
}

// ✅ NOVO: remover empresa da ABA EMISSÃO (100% separado do lote)
export function removerEmpresaParaEmissao(req, res) {
  try {
    const { id } = req.params || {};
    if (!id) return res.status(400).json({ ok: false, error: "id é obrigatório." });

    const ok = removerEmpresaEmissao(String(id));
    if (!ok) return res.status(404).json({ ok: false, error: "Empresa não encontrada." });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Erro ao remover empresa." });
  }
}

// ✅ salvar certificado A1 (PFX/P12) vinculado à empresa da ABA EMISSÃO
export function salvarCertificadoPfx(req, res) {
  try {
    const { usuarioEmail, empresaId, filename, pfxBase64, passphrase } = req.body || {};

    if (!usuarioEmail || !empresaId) {
      return res.status(400).json({ ok: false, error: "usuarioEmail e empresaId são obrigatórios." });
    }
    if (!pfxBase64 || !passphrase) {
      return res.status(400).json({ ok: false, error: "pfxBase64 e passphrase são obrigatórios." });
    }

    const certsDir = path.resolve(process.cwd(), "certs");
    if (!fs.existsSync(certsDir)) fs.mkdirSync(certsDir, { recursive: true });

    const safeEmpresaId = String(empresaId).replace(/[^0-9A-Za-z_-]/g, "_");
    const ext = String(filename || "").toLowerCase().endsWith(".p12") ? "p12" : "pfx";
    const outPath = path.join(certsDir, `empresa-${safeEmpresaId}.${ext}`);

    const buf = Buffer.from(String(pfxBase64), "base64");
    if (!buf || buf.length < 500) {
      return res.status(400).json({ ok: false, error: "Arquivo inválido (base64 muito pequeno)." });
    }

    fs.writeFileSync(outPath, buf);

    const ok = atualizarEmpresaEmissaoCertificado(String(empresaId), {
      certPfxPath: outPath,
      certPfxPassphrase: String(passphrase),
    });

    if (!ok) {
      return res
        .status(404)
        .json({ ok: false, error: "Empresa não encontrada (Aba Emissão) para vincular o certificado." });
    }

    return res.json({
      ok: true,
      message: `Certificado salvo e vinculado à empresa ${empresaId} (Aba Emissão).`,
      certPfxPath: outPath,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Erro ao salvar certificado." });
  }
}

export async function salvarSessaoEmissao(req, res) {
  try {
    const { usuarioEmail, empresaId } = req.body || {};
    if (!usuarioEmail || !empresaId) {
      return res.status(400).json({ ok: false, error: "usuarioEmail e empresaId são obrigatórios." });
    }

    const r = await salvarSessao({ usuarioEmail, empresaId });
    return res.json({ ok: true, ...r });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Erro ao iniciar sessão." });
  }
}

export async function emitirNfse(req, res) {
  try {
    const p = req.body || {};

    const required = ["usuarioEmail", "empresaId", "tomadorDocumento", "tomadorNome", "descricaoServico", "valorServico"];
    for (const k of required) {
      if (!p[k]) return res.status(400).json({ ok: false, error: `Campo obrigatório ausente: ${k}` });
    }

    const r = await emitirNfseService(p);
    return res.json({ ok: true, ...r });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Erro ao emitir NFS-e." });
  }
}

export async function listarEmissoes(req, res) {
  try {
    const { usuarioEmail, empresaId } = req.query || {};
    if (!usuarioEmail) return res.status(400).json({ ok: false, error: "usuarioEmail é obrigatório." });

    const notas = listarNfse({
      usuarioEmail: String(usuarioEmail),
      empresaId: empresaId ? String(empresaId) : null,
      limit: 80,
    });

    return res.json({ ok: true, notas });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Erro ao listar emissões." });
  }
}

export async function consultarNfsePorChave(req, res) {
  try {
    const { chaveAcesso } = req.params || {};
    const { usuarioEmail, empresaId } = req.query || {};

    if (!chaveAcesso) return res.status(400).json({ ok: false, error: "chaveAcesso é obrigatória." });

    const r = await consultarNfsePorChaveService({
      chaveAcesso: String(chaveAcesso),
      usuarioEmail: usuarioEmail ? String(usuarioEmail) : "",
      empresaId: empresaId ? String(empresaId) : "",
    });

    return res.json({ ok: true, ...r });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Erro ao consultar NFS-e." });
  }
}

export async function cancelarNfse(req, res) {
  try {
    const p = req.body || {};
    const required = ["usuarioEmail", "empresaId", "chaveAcesso", "justificativa"];

    for (const k of required) {
      if (!p[k]) return res.status(400).json({ ok: false, error: `Campo obrigatório ausente: ${k}` });
    }

    const r = await cancelarNfsePorChaveService(p);
    return res.json({ ok: true, ...r });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Erro ao cancelar NFS-e." });
  }
}
