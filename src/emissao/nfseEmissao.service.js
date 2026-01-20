// src/emissao/nfseEmissao.service.js
import { iniciarSessaoGovBr, emitirNfseNoPortal } from "../bot/nfseEmissaoBot.js";

import {
  insertNfseEmitida,
  listNfseEmitidas,
  getNfseByChave,
  insertEvento,
  markNfseAsCancelada,
} from "./nfseEmissao.model.js";

// ✅ Aba Emissão separada (store próprio)
import { getEmpresaEmissaoById } from "../utils/emissaoEmpresasStore.js";

// ✅ Provider Nacional (API)
import {
  emitirNfseNacional,
  consultarNfseNacional,
  cancelarNfseNacional,
} from "./providers/nacional/nfseNacional.provider.js";

function getProviderName() {
  const raw = String(process.env.NFSE_PROVIDER || "portal").trim().toLowerCase();
  if (["api_nacional", "apinacional", "api-nacional", "nacional", "api"].includes(raw)) return "nacional";
  return "portal";
}

function findEmpresa(empresaId) {
  const idNum = Number(empresaId);
  if (!Number.isFinite(idNum)) return null;
  return getEmpresaEmissaoById(idNum);
}

function getEmpresaCertConfig(empresa) {
  const pfxPath = String(empresa?.certPfxPath || "").trim();
  const passphrase = String(empresa?.certPfxPassphrase || "").trim();
  if (!pfxPath) return null;

  // ✅ AJUSTE MÍNIMO:
  // retorna ambos os formatos (novo + antigo) para compatibilidade total
  return {
    certPfxPath: pfxPath,
    certPfxPassphrase: passphrase,
    pfxPath,
    passphrase,
  };
}

// -----------------------------
// Sessão (somente Portal)
// -----------------------------
export async function salvarSessao({ usuarioEmail, empresaId }) {
  const logs = [];
  const onLog = (m) => logs.push(m);

  const provider = getProviderName();
  if (provider !== "portal") {
    logs.push("NFSE_PROVIDER=api_nacional: não precisa salvar sessão (API).");
    return { sessionExists: true, message: "Modo API ativo. Sessão do portal não é necessária.", logs };
  }

  const r = await iniciarSessaoGovBr({ usuarioEmail, empresaId, onLog });
  return { ...r, logs };
}

// -----------------------------
// Emitir
// -----------------------------
export async function emitirNfse(payload) {
  const logs = [];
  const onLog = (m) => logs.push(m);

  const provider = getProviderName();
  const empresa = findEmpresa(payload.empresaId);

  if (!empresa) {
    throw new Error("Empresa não encontrada no cadastro da aba Emissão (store separado).");
  }

  let r;

  if (provider === "nacional") {
    onLog("Modo emissão: API_NACIONAL (DPS → POST /nfse).");

    const certConfig = getEmpresaCertConfig(empresa);
    if (certConfig) onLog("Certificado: usando PFX vinculado à empresa (aba Emissão).");
    else onLog("⚠️ Certificado da empresa não encontrado. Usando .env (NFSE_CERT_PFX_PATH).");

    r = await emitirNfseNacional({ payload, empresa, certConfig, onLog });
  } else {
    onLog("Modo emissão: PORTAL (RPA/Playwright) [fallback].");
    r = await emitirNfseNoPortal(payload, { onLog });
  }

  const row = {
    usuarioEmail: payload.usuarioEmail,
    empresaId: payload.empresaId,
    empresaNome: payload.empresaNome || empresa?.nome || "",

    tomadorDocumento: payload.tomadorDocumento,
    tomadorNome: payload.tomadorNome,
    tomadorEmail: payload.tomadorEmail || "",

    descricaoServico: payload.descricaoServico,
    valorServico: Number(payload.valorServico || 0),

    status: r.status,
    numeroNota: r.numeroNota || "",
    mensagem: r.mensagem || "",

    pdfPath: r.pdfPath || "",
    xmlPath: r.xmlPath || "",

    provider,
    chaveAcesso: r.chaveAcesso || "",

    rawJson: r.rawJson ? JSON.stringify(r.rawJson) : "",
    rawXml: r.rawXml || "",
  };

  const id = insertNfseEmitida(row);
  return { id, ...r, logs };
}

export function listarNfse({ usuarioEmail, empresaId, limit = 80 }) {
  return listNfseEmitidas({ usuarioEmail, empresaId: empresaId || null, limit });
}

export async function consultarNfsePorChave({ chaveAcesso, usuarioEmail, empresaId }) {
  const logs = [];
  const onLog = (m) => logs.push(m);

  const provider = getProviderName();

  const local = getNfseByChave(chaveAcesso);
  logs.push(local ? "Encontrada no histórico local." : "Não encontrada no histórico local.");

  if (provider !== "nacional") {
    return {
      foundLocal: !!local,
      local,
      provider,
      logs,
      warning: "Consulta online via portal não implementada. Use NFSE_PROVIDER=api_nacional para consultar via API.",
    };
  }

  const empresa = empresaId ? findEmpresa(empresaId) : null;
  const certConfig = empresa ? getEmpresaCertConfig(empresa) : null;

  if (certConfig) onLog("Certificado: usando PFX vinculado à empresa (consulta).");
  else onLog("⚠️ Certificado da empresa não encontrado (consulta). Usando .env (NFSE_CERT_PFX_PATH).");

  const r = await consultarNfseNacional({ chaveAcesso, certConfig, onLog });
  return { provider, foundLocal: !!local, local, ...r, logs };
}

export async function cancelarNfsePorChave({ usuarioEmail, empresaId, chaveAcesso, justificativa }) {
  const logs = [];
  const onLog = (m) => logs.push(m);

  const provider = getProviderName();

  if (provider !== "nacional") {
    const mensagem = "Cancelamento via Portal (RPA) ainda não implementado. Ative NFSE_PROVIDER=api_nacional.";
    insertEvento({
      usuarioEmail,
      empresaId,
      chaveAcesso,
      tipo: "cancelamento",
      justificativa,
      status: "erro",
      mensagem,
      rawJson: JSON.stringify({ provider }),
    });
    return { status: "erro", mensagem, logs };
  }

  const empresa = empresaId ? findEmpresa(empresaId) : null;
  const certConfig = empresa ? getEmpresaCertConfig(empresa) : null;

  if (certConfig) onLog("Certificado: usando PFX vinculado à empresa (cancelamento).");
  else onLog("⚠️ Certificado da empresa não encontrado (cancelamento). Usando .env (NFSE_CERT_PFX_PATH).");

  const r = await cancelarNfseNacional({ chaveAcesso, justificativa, certConfig, onLog });

  insertEvento({
    usuarioEmail,
    empresaId,
    chaveAcesso,
    tipo: "cancelamento",
    justificativa,
    status: r.status === "sucesso" ? "sucesso" : "erro",
    mensagem: r.mensagem || "",
    rawJson: r.rawJson ? JSON.stringify(r.rawJson) : "",
  });

  if (r.status === "sucesso") {
    markNfseAsCancelada({ chaveAcesso, mensagem: r.mensagem || "Cancelada via API." });
  }

  return { ...r, logs };
}
