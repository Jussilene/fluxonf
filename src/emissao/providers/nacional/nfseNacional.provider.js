// src/emissao/providers/nacional/nfseNacional.provider.js
import fs from "fs";
import path from "path";
import https from "https";
import tls from "tls";
import zlib from "zlib";
import archiver from "archiver";
import { PassThrough } from "stream";

import { buildDpsXmlMinimal } from "../../xml/dpsBuilder.js";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Normaliza baseUrl para SEMPRE ficar no padrão:
 *   https://.../API/SefinNacional
 */
function normalizeBaseUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return s;

  let u = s.replace(/\/+$/g, "");

  if (/\/SefinNacional$/i.test(u)) {
    u = u.replace(/\/SefinNacional$/i, "/API/SefinNacional");
  } else if (!/\/API\/SefinNacional$/i.test(u)) {
    u = u.replace(/\/+$/g, "") + "/API/SefinNacional";
  }

  u = u.replace(/(\/API\/SefinNacional)+/gi, "/API/SefinNacional");
  return u.replace(/\/+$/g, "");
}

function getConfig({ certConfig } = {}) {
  const baseUrl =
    normalizeBaseUrl(process.env.NFSE_API_BASE_URL) ||
    "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional";

  const danfseBaseUrl =
    String(process.env.NFSE_DANFSE_BASE_URL || "").trim() ||
    "https://adn.producaorestrita.nfse.gov.br/danfse";

  const pfxPath =
    String(certConfig?.certPfxPath || certConfig?.pfxPath || "").trim() ||
    String(process.env.NFSE_CERT_PFX_PATH || "").trim();

  const passphrase =
    String(certConfig?.certPfxPassphrase || certConfig?.passphrase || "").trim() ||
    String(process.env.NFSE_CERT_PFX_PASSPHRASE || "").trim();

  const zipMode = String(process.env.NFSE_API_ZIP_MODE || "gzip").trim().toLowerCase();

  if (!pfxPath) throw new Error("NFSE_CERT_PFX_PATH não configurado (nem na empresa, nem no .env).");
  if (!fs.existsSync(pfxPath)) throw new Error(`Certificado PFX não encontrado em: ${pfxPath}`);

  return { baseUrl, danfseBaseUrl, pfxPath, passphrase, zipMode };
}

function makeHttpsAgent({ pfxPath, passphrase }, onLog = () => {}) {
  const pfxBuf = fs.readFileSync(pfxPath);

  // ✅ AJUSTE MÍNIMO: valida o PFX antes da request (senha errada / PFX inválido)
  try {
    tls.createSecureContext({ pfx: pfxBuf, passphrase: passphrase || undefined });
  } catch (e) {
    throw new Error(
      `Falha ao carregar PFX no Node (senha incorreta ou PFX inválido). ` +
        `Arquivo: ${pfxPath}. Motivo: ${e?.message || e}`
    );
  }

  onLog?.(`[NFSE] Usando PFX: ${pfxPath}`);

  return new https.Agent({
    pfx: pfxBuf,
    passphrase: passphrase || undefined,
    keepAlive: true,
  });
}

async function httpRequest({ url, method = "GET", headers = {}, body = null, agent }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);

    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        servername: u.hostname,
        port: u.port || 443,
        path: u.pathname + (u.search || ""),
        method,
        headers,
        agent,
        minVersion: "TLSv1.2",
      },
      (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const text = buf.toString("utf8");
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            headers: res.headers,
            buffer: buf,
            text,
          });
        });
      }
    );

    // DEBUG TLS opcional
    if (process.env.NFSE_DEBUG_TLS === "1") {
      req.on("socket", (socket) => {
        socket.on("secureConnect", () => {
          try {
            const local = socket.getCertificate?.() || null;
            const peer = socket.getPeerCertificate?.() || null;

            if (local && Object.keys(local).length) {
              console.log("[NFSE_DEBUG_TLS] Local cert subject:", local.subject);
              console.log("[NFSE_DEBUG_TLS] Local cert issuer:", local.issuer);
              console.log("[NFSE_DEBUG_TLS] Local cert valid_to:", local.valid_to);
            } else {
              console.log("[NFSE_DEBUG_TLS] Local cert: (VAZIO) — request provavelmente não está apresentando cert.");
            }

            if (peer && Object.keys(peer).length) {
              console.log("[NFSE_DEBUG_TLS] Server cert subject:", peer.subject);
              console.log("[NFSE_DEBUG_TLS] Server cert issuer:", peer.issuer);
              console.log("[NFSE_DEBUG_TLS] Server cert valid_to:", peer.valid_to);
            }
          } catch (e) {
            console.log("[NFSE_DEBUG_TLS] erro ao inspecionar TLS:", e?.message || e);
          }
        });
      });
    }

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// -------- DPS helpers --------

function resolveDpsXml({ payload, empresa, onLog }) {
  if (payload?.dpsXml && String(payload.dpsXml).trim().startsWith("<")) {
    onLog("DPS XML recebido via payload.dpsXml (recomendado).");
    return String(payload.dpsXml).trim();
  }

  onLog("⚠️ payload.dpsXml não veio. Gerando DPS mínimo (com município/IBGE quando disponível).");
  return buildDpsXmlMinimal({ payload, empresa });
}

function tryExtractChave(xml) {
  const m =
    xml.match(/<chave[^>]*>([^<]+)<\/chave>/i) ||
    xml.match(/<chaveAcesso[^>]*>([^<]+)<\/chaveAcesso>/i) ||
    xml.match(/Chave\s*[:\-]?\s*([0-9A-Za-z]{30,})/i);
  return m?.[1] ? String(m[1]).trim() : "";
}

function tryExtractNumero(xml) {
  const m =
    xml.match(/<numero[^>]*>(\d+)<\/numero>/i) ||
    xml.match(/<nNFSe[^>]*>(\d+)<\/nNFSe>/i) ||
    xml.match(/Número\s*[:\-]?\s*(\d+)/i);
  return m?.[1] ? String(m[1]).trim() : "";
}

function saveFiles({ chaveAcesso, xml, pdfBuffer }) {
  const outDir = path.join(process.cwd(), "data", "nfse_emitidas");
  ensureDir(outDir);

  const safeChave = (chaveAcesso || "sem-chave").replace(/[^a-zA-Z0-9_-]/g, "_");
  const xmlPath = path.join(outDir, `${safeChave}.xml`);
  fs.writeFileSync(xmlPath, xml, "utf8");

  let pdfPath = "";
  if (pdfBuffer && pdfBuffer.length > 1000) {
    pdfPath = path.join(outDir, `${safeChave}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);
  }

  return { xmlPath, pdfPath };
}

async function zipPkzipSingleFileB64({ filename, contentBuf }) {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });

    const stream = new PassThrough();
    const chunks = [];

    stream.on("data", (d) => chunks.push(d));
    stream.on("error", reject);
    stream.on("finish", () => {
      try {
        const buf = Buffer.concat(chunks);
        resolve(buf.toString("base64"));
      } catch (e) {
        reject(e);
      }
    });

    archive.on("error", reject);
    archive.on("warning", (err) => {
      if (err?.code === "ENOENT") return;
      reject(err);
    });

    archive.pipe(stream);
    archive.append(contentBuf, { name: filename });
    archive.finalize();
  });
}

// -------- API methods --------

export async function emitirNfseNacional({ payload, empresa, certConfig, onLog = () => {} }) {
  const cfg = getConfig({ certConfig });
  const agent = makeHttpsAgent(cfg, onLog);

  const dpsXml = resolveDpsXml({ payload, empresa, onLog });

  const endpoint = `${cfg.baseUrl.replace(/\/$/, "")}/nfse`;
  onLog(`API: POST ${endpoint}`);

  const xmlBuf = Buffer.from(dpsXml, "utf8");

  let b64 = "";
  let mode = cfg.zipMode;

  if (mode === "gzip") {
    const gz = zlib.gzipSync(xmlBuf);
    b64 = gz.toString("base64");
    onLog("Compactação: gzip (NFSE_API_ZIP_MODE=gzip).");
  } else if (mode === "none") {
    b64 = xmlBuf.toString("base64");
    onLog("Compactação: none (NFSE_API_ZIP_MODE=none) — debug.");
  } else {
    b64 = await zipPkzipSingleFileB64({ filename: "dps.xml", contentBuf: xmlBuf });
    onLog("Compactação: ZIP PK (archiver) → dpsXmlZipB64.");
  }

  onLog(`Payload B64 size: ${b64.length}`);

  const bodyObj =
    mode === "gzip"
      ? { dpsXmlGzipBase64: b64, dpsXmlZipB64: b64 }
      : mode === "none"
      ? { dpsXmlBase64: b64, dpsXmlZipB64: b64 }
      : { dpsXmlZipB64: b64 };

  const bodyJson = JSON.stringify(bodyObj);

  const headers = {
    Accept: "*/*",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(bodyJson, "utf8"),
  };

  const resp = await httpRequest({
    url: endpoint,
    method: "POST",
    headers,
    body: bodyJson,
    agent,
  });

  if (!resp.ok) {
    onLog(`❌ Falha API emissão: HTTP ${resp.status}`);
    onLog(`↩️ Resposta (primeiros 900 chars): ${String(resp.text || "").slice(0, 900)}`);
    return {
      status: "erro",
      mensagem: `Erro API emissão (HTTP ${resp.status}).`,
      numeroNota: "",
      chaveAcesso: "",
      rawJson: { status: resp.status, headers: resp.headers, body: resp.text?.slice(0, 4000) },
      rawXml: "",
      pdfPath: "",
      xmlPath: "",
    };
  }

  const xmlRet = resp.text || "";
  const chaveAcesso = tryExtractChave(xmlRet);
  const numeroNota = tryExtractNumero(xmlRet);

  onLog(`✅ API retornou XML (${xmlRet.length} chars)`);
  if (chaveAcesso) onLog(`Chave: ${chaveAcesso}`);
  if (numeroNota) onLog(`Número: ${numeroNota}`);

  let pdfBuf = null;
  if (chaveAcesso) {
    try {
      const danfseUrl = `${cfg.danfseBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(chaveAcesso)}`;
      onLog(`Baixando DANFSE: ${danfseUrl}`);
      const danfse = await httpRequest({
        url: danfseUrl,
        method: "GET",
        headers: { Accept: "application/pdf" },
        agent: undefined,
      });
      if (danfse.ok && danfse.buffer?.length) pdfBuf = danfse.buffer;
      else onLog(`⚠️ Não consegui baixar DANFSE (HTTP ${danfse.status}).`);
    } catch (e) {
      onLog(`⚠️ Erro ao baixar DANFSE: ${e?.message || e}`);
    }
  }

  const { xmlPath, pdfPath } = saveFiles({ chaveAcesso, xml: xmlRet, pdfBuffer: pdfBuf });

  return {
    status: "emitida",
    mensagem: `NFS-e emitida via API${numeroNota ? ` • Nº ${numeroNota}` : ""}`,
    numeroNota,
    chaveAcesso,
    rawJson: { httpStatus: resp.status, contentType: resp.headers?.["content-type"] || "" },
    rawXml: xmlRet,
    xmlPath,
    pdfPath,
  };
}

export async function consultarNfseNacional({ chaveAcesso, certConfig, onLog = () => {} }) {
  const cfg = getConfig({ certConfig });
  const agent = makeHttpsAgent(cfg, onLog);

  const endpoint = `${cfg.baseUrl.replace(/\/$/, "")}/nfse/${encodeURIComponent(chaveAcesso)}`;
  onLog(`API: GET ${endpoint}`);

  const resp = await httpRequest({
    url: endpoint,
    method: "GET",
    headers: { Accept: "*/*" },
    agent,
  });

  if (!resp.ok) {
    return {
      status: "erro",
      mensagem: `Erro ao consultar (HTTP ${resp.status}).`,
      rawJson: { status: resp.status, headers: resp.headers, body: resp.text?.slice(0, 4000) },
      rawXml: "",
    };
  }

  const xmlRet = resp.text || "";
  return {
    status: "sucesso",
    mensagem: "Consulta realizada via API.",
    rawJson: { httpStatus: resp.status },
    rawXml: xmlRet,
  };
}

export async function cancelarNfseNacional({ chaveAcesso, justificativa, certConfig, onLog = () => {} }) {
  const cfg = getConfig({ certConfig });
  const agent = makeHttpsAgent(cfg, onLog);

  const endpoint = `${cfg.baseUrl.replace(/\/$/, "")}/nfse/${encodeURIComponent(chaveAcesso)}/cancelamento`;
  onLog(`API: POST ${endpoint}`);

  const payloadXml = `<?xml version="1.0" encoding="UTF-8"?>
<EventoCancelamento>
  <chaveAcesso>${String(chaveAcesso || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</chaveAcesso>
  <justificativa>${String(justificativa || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</justificativa>
</EventoCancelamento>`;

  const xmlBuf = Buffer.from(payloadXml, "utf8");

  const pedidoRegistroEventoXmlZipB64 = await zipPkzipSingleFileB64({
    filename: "cancelamento.xml",
    contentBuf: xmlBuf,
  });

  onLog(`ZIP(cancelamento) B64 size: ${pedidoRegistroEventoXmlZipB64.length}`);

  const bodyJson = JSON.stringify({ pedidoRegistroEventoXmlZipB64 });

  const headers = {
    Accept: "*/*",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(bodyJson, "utf8"),
  };

  const resp = await httpRequest({ url: endpoint, method: "POST", headers, body: bodyJson, agent });

  if (!resp.ok) {
    return {
      status: "erro",
      mensagem: `Erro ao cancelar (HTTP ${resp.status}).`,
      rawJson: { status: resp.status, headers: resp.headers, body: resp.text?.slice(0, 4000) },
    };
  }

  return {
    status: "sucesso",
    mensagem: "Cancelamento enviado via API.",
    rawJson: { httpStatus: resp.status, body: resp.text?.slice(0, 4000) || "" },
  };
}
