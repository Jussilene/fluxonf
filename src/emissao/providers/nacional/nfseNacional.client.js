// src/emissao/providers/nacional/nfseNacional.client.js
import fs from "fs";
import https from "https";

function normalizeBaseUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return s;
  let u = s.replace(/\/+$/g, "");

  if (/\/SefinNacional$/i.test(u)) {
    u = u.replace(/\/SefinNacional$/i, "/API/SefinNacional");
  } else if (!/\/API\/SefinNacional$/i.test(u)) {
    u = u + "/API/SefinNacional";
  }
  u = u.replace(/(\/API\/SefinNacional)+/gi, "/API/SefinNacional");
  return u.replace(/\/+$/g, "");
}

function getBaseUrl() {
  // compat: NFSE_API_BASE_URL (novo) ou NFSE_NACIONAL_BASE_URL (antigo)
  const raw = process.env.NFSE_API_BASE_URL || process.env.NFSE_NACIONAL_BASE_URL;
  return normalizeBaseUrl(raw) || "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional";
}

function getHttpsAgent() {
  const pfxPath = process.env.NFSE_CERT_PFX_PATH;

  // compat: NFSE_CERT_PFX_PASSPHRASE (novo) ou NFSE_CERT_PFX_PASS (antigo)
  const passphrase = process.env.NFSE_CERT_PFX_PASSPHRASE || process.env.NFSE_CERT_PFX_PASS;

  if (!pfxPath) return null;

  const pfx = fs.readFileSync(pfxPath);
  return new https.Agent({
    pfx,
    passphrase: passphrase || undefined,
    keepAlive: true,
  });
}

async function httpJson(path, { method = "GET", headers = {}, body, onLog = () => {} } = {}) {
  const base = getBaseUrl();
  const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  const agent = getHttpsAgent();
  const opts = {
    method,
    headers: {
      Accept: "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    agent,
  };

  onLog(`${method} ${url}`);
  const res = await fetch(url, opts);

  const txt = await res.text().catch(() => "");
  let json = null;
  try {
    json = txt ? JSON.parse(txt) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg = (json && (json.message || json.mensagem || json.error)) || txt || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.bodyText = txt;
    err.bodyJson = json;
    throw err;
  }

  return json ?? { ok: true };
}

async function httpXml(path, { method = "POST", xml, headers = {}, onLog = () => {} } = {}) {
  const base = getBaseUrl();
  const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  const agent = getHttpsAgent();
  const opts = {
    method,
    headers: {
      Accept: "application/xml, text/xml, */*",
      "Content-Type": "application/xml; charset=utf-8",
      ...headers,
    },
    body: xml || "",
    agent,
  };

  onLog(`${method} ${url} (XML)`);
  const res = await fetch(url, opts);

  const txt = await res.text().catch(() => "");
  if (!res.ok) {
    const err = new Error(txt || `HTTP ${res.status}`);
    err.status = res.status;
    err.bodyText = txt;
    throw err;
  }

  return txt;
}

export const nfseNacionalClient = {
  httpJson,
  httpXml,
};
