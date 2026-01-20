// src/bot/nfseEmissaoBot.js
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const LOGIN_URL = "https://www.nfse.gov.br/EmissorNacional/Login?ReturnUrl=%2fEmissorNacional";
const HOME_URL = "https://www.nfse.gov.br/EmissorNacional";
const EMISSAO_URL = "https://www.nfse.gov.br/EmissorNacional/DF";

const DEBUG_DIR = path.join(process.cwd(), "data", "emissao_debug");

function safe(s) {
  return String(s || "").replace(/[^a-z0-9@._-]/gi, "_");
}

function getStatePath({ usuarioEmail, empresaId }) {
  return path.join(process.cwd(), "data", "sessions", safe(usuarioEmail), `${safe(empresaId)}.json`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function ensureDirForFile(fp) {
  ensureDir(path.dirname(fp));
}

function envHeadless() {
  // NFS_HEADLESS=0 -> false
  const v = String(process.env.NFS_HEADLESS ?? "1").trim();
  return !(v === "0" || v.toLowerCase() === "false");
}

async function saveDebug(page, prefix) {
  try {
    ensureDir(DEBUG_DIR);
    const ts = Date.now();
    await page.screenshot({ path: path.join(DEBUG_DIR, `${prefix}-${ts}.png`), fullPage: true });
    const html = await page.content();
    fs.writeFileSync(path.join(DEBUG_DIR, `${prefix}-${ts}.html`), html, "utf8");
  } catch {}
}

async function fillByLabel(page, labelText, value) {
  const loc = page.getByLabel(labelText, { exact: false });
  if (await loc.count()) {
    await loc.first().fill(String(value));
    return true;
  }

  const label = page.locator(`text=${labelText}`).first();
  if (await label.count()) {
    const container = label.locator("xpath=ancestor::*[self::div or self::section][1]");
    const input = container.locator("input, textarea").first();
    if (await input.count()) {
      await input.fill(String(value));
      return true;
    }
  }
  return false;
}

async function clickByText(page, txt) {
  const btn = page.getByRole("button", { name: new RegExp(txt, "i") });
  if (await btn.count()) {
    await btn.first().click();
    return true;
  }
  const any = page.locator(`text=${txt}`).first();
  if (await any.count()) {
    await any.click();
    return true;
  }
  return false;
}

/**
 * Login assistido: abre navegador para você logar e salva storageState.
 */
export async function iniciarSessaoGovBr({ usuarioEmail, empresaId, onLog = () => {} }) {
  const statePath = getStatePath({ usuarioEmail, empresaId });
  ensureDirForFile(statePath);

  if (fs.existsSync(statePath)) {
    return { sessionExists: true, message: "Sessão já existe. Pode emitir." };
  }

  onLog("Abrindo navegador (login assistido gov.br)...");
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });

  onLog("Faça login manualmente (captcha/2FA se pedir).");
  onLog("Quando entrar no Emissor Nacional, vou salvar a sessão.");

  const OK_SELECTORS = [
    'text="Portal de Gestão NFS-e"',
    'text="Emissão Completa"',
    'text="NFS-e"',
    'a:has-text("Sair")',
    'button:has-text("Emitir")',
  ];

  let logged = false;
  const deadline = Date.now() + 6 * 60 * 1000;

  while (Date.now() < deadline && !logged) {
    for (const sel of OK_SELECTORS) {
      const c = await page.locator(sel).count().catch(() => 0);
      if (c > 0) {
        logged = true;
        break;
      }
    }
    if (!logged) await page.waitForTimeout(1000);
  }

  if (!logged) {
    await saveDebug(page, "login-timeout");
    await browser.close();
    throw new Error("Timeout aguardando login no Emissor Nacional. Verifique captcha/2FA.");
  }

  await context.storageState({ path: statePath });
  await browser.close();

  onLog("Sessão salva com sucesso!");
  return { sessionExists: false, message: "Sessão salva. Agora pode emitir." };
}

/**
 * Emite NFS-e usando a sessão salva.
 */
export async function emitirNfseNoPortal(payload, { onLog = () => {} } = {}) {
  const {
    usuarioEmail,
    empresaId,
    dataCompetencia,
    tomadorDocumento,
    tomadorNome,
    tomadorEmail,
    descricaoServico,
    valorServico,
  } = payload;

  const statePath = getStatePath({ usuarioEmail, empresaId });
  if (!fs.existsSync(statePath)) {
    throw new Error("Sessão não encontrada. Clique em 'Salvar sessão (RPA)' primeiro.");
  }

  const headless = envHeadless();
  onLog(`Iniciando emissão (headless=${headless ? "true" : "false"})...`);

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ storageState: statePath });
  const page = await context.newPage();

  try {
    onLog("Abrindo portal logado...");
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);

    onLog("Indo para Emissão Completa...");
    await page.goto(EMISSAO_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);

    if (dataCompetencia) {
      await fillByLabel(page, "Data de Competência", dataCompetencia);
    }

    onLog("Preenchendo Tomador...");
    await fillByLabel(page, "CPF/CNPJ", tomadorDocumento);
    await fillByLabel(page, "Nome/Razão Social", tomadorNome);
    if (tomadorEmail) await fillByLabel(page, "E-mail", tomadorEmail);

    onLog("Preenchendo Serviço...");
    await fillByLabel(page, "Serviço prestado", descricaoServico);
    await fillByLabel(page, "Valor do Serviço", String(valorServico).replace(",", "."));

    for (let i = 0; i < 4; i++) {
      const clicou = await clickByText(page, "Avançar");
      if (!clicou) break;
      onLog("Avançando...");
      await page.waitForTimeout(1200);
    }

    onLog("Confirmando emissão...");
    const okEmitir = await clickByText(page, "Emitir NFS-e");
    if (!okEmitir) await clickByText(page, "Emitir");

    await page.waitForTimeout(2500);

    const body = await page.textContent("body").catch(() => "");
    const sucesso = /gerada com sucesso/i.test(body || "") || /A NFS-e foi gerada com sucesso/i.test(body || "");

    let numeroNota = "";
    const mNum =
      (body || "").match(/N[ºo]\s*[:\-]?\s*([0-9]+)/i) ||
      (body || "").match(/Número\s*[:\-]?\s*([0-9]+)/i);
    if (mNum?.[1]) numeroNota = mNum[1];

    const mChave = (body || "").match(/Chave de Acesso\s*:\s*([0-9]{30,})/i);
    const chave = mChave?.[1] || "";

    const status = sucesso ? "emitida" : "pendente";
    const mensagem = sucesso
      ? `NFS-e emitida com sucesso${numeroNota ? ` • Nº ${numeroNota}` : ""}${chave ? ` • Chave ${chave}` : ""}`
      : "Fluxo executou, mas não consegui confirmar a emissão na tela (precisa ajuste fino).";

    if (!sucesso) await saveDebug(page, "emitir-nao-confirmou");

    await context.close();
    await browser.close();

    return { status, numeroNota, mensagem, pdfPath: "", xmlPath: "" };
  } catch (e) {
    onLog(`ERRO no bot: ${e?.message || e}`);
    await saveDebug(page, "emitir-erro");
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    return { status: "erro", numeroNota: "", mensagem: e?.message || "Erro ao emitir NFS-e", pdfPath: "", xmlPath: "" };
  }
}
