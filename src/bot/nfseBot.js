// src/bot/nfseBot.js
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { registrarExecucao } from "../models/historico.model.js";

const NFSE_PORTAL_URL =
  process.env.NFSE_PORTAL_URL ||
  "https://www.nfse.gov.br/EmissorNacional/Login?ReturnUrl=%2fEmissorNacional";

const isLinux = process.platform === "linux";

async function launchNFSEBrowser() {
  return await chromium.launch({
    headless: isLinux ? true : false,
    slowMo: isLinux ? 0 : 150,
    args: isLinux
      ? ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
      : [],
  });
}

// --------------------
// Helpers de data
// --------------------
function formatDateBrFromISO(isoDate) {
  if (!isoDate) return null;
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return null;
  return `${day}/${month}/${year}`;
}

function buildPeriodoLabel(dataInicial, dataFinal) {
  const di = dataInicial ? formatDateBrFromISO(dataInicial) : null;
  const df = dataFinal ? formatDateBrFromISO(dataFinal) : null;

  if (!di && !df) return "N/D até N/D";
  if (di && !df) return `${di} até N/D`;
  if (!di && df) return `N/D até ${df}`;
  return `${di} até ${df}`;
}

function parseBrDateToDate(str) {
  if (!str) return null;
  const match = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

function parseIsoToDate(iso) {
  if (!iso) return null;
  const [yyyy, mm, dd] = iso.split("-");
  if (!yyyy || !mm || !dd) return null;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

function periodKey(dataInicial, dataFinal) {
  const di = (dataInicial || "sem-data").slice(0, 10);
  const df = (dataFinal || "sem-data").slice(0, 10);
  return `${di}_a_${df}`;
}

// --------------------
// Logger
// --------------------
function createLogger(onLog) {
  const logs = [];
  const pushLog = (msg) => {
    logs.push(msg);
    if (onLog) onLog(msg);
  };
  return { logs, pushLog };
}

// --------------------
// FS helpers
// --------------------
function ensureDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch (err) {
    console.error("[NFSE] Erro ao criar pasta:", dirPath, err);
  }
}

function extractCnpjLike(str) {
  if (!str) return null;
  const match = str.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
  if (!match) return null;
  return match[1].replace(/\D/g, "");
}

// --------------------
// ✅ estrutura por job (SEM criar pastas de tipo automaticamente)
// downloads/jobs/<periodo>/<timestamp>  (apenas jobDir)
// --------------------
function buildJobPaths(pastaDestino, dataInicial, dataFinal) {
  const baseDir = path.resolve(process.cwd(), pastaDestino || "downloads");
  const jobsRoot = path.join(baseDir, "jobs", periodKey(dataInicial, dataFinal));
  ensureDir(jobsRoot);

  const jobDir = path.join(jobsRoot, String(Date.now()));
  ensureDir(jobDir);

  // ❗ não cria Emitidas/Recebidas/Canceladas aqui
  const emitidasDir = path.join(jobDir, "Emitidas");
  const recebidasDir = path.join(jobDir, "Recebidas");
  const canceladasDir = path.join(jobDir, "Canceladas");

  return { baseDir, jobDir, emitidasDir, recebidasDir, canceladasDir };
}

function getTipoDirFromRoot(rootJobDir, tipoNota) {
  if (tipoNota === "recebidas") return path.join(rootJobDir, "Recebidas");
  if (tipoNota === "canceladas") return path.join(rootJobDir, "Canceladas");
  return path.join(rootJobDir, "Emitidas");
}

// ---------------------------------------------------------------------
// ✅ Canceladas robusto
// Agora funciona com coluna "Situação" sendo ÍCONE (sem texto):
// lê title/tooltip/aria-label/data-original-title ou HTML interno.
// ---------------------------------------------------------------------
function normalizeText(s = "") {
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeStatus(s = "") {
  return normalizeText(s);
}

async function findSituacaoColumnIndex(page) {
  try {
    const headers = page.locator("table thead tr th");
    const count = await headers.count().catch(() => 0);

    for (let i = 0; i < count; i++) {
      const h = normalizeStatus(await headers.nth(i).innerText().catch(() => ""));
      if (h.includes("SITUA") || h.includes("STATUS")) {
        return i;
      }
    }
  } catch {
    // ignore
  }
  return -1;
}

async function readSituacaoSignalsFromCell(cellHandle) {
  // tenta pegar texto + atributos (tooltip) do próprio TD e de elementos internos
  try {
    const payload = await cellHandle.evaluate((cell) => {
      const pickAttrs = (el) => {
        if (!el) return [];
        const out = [];
        const attrs = [
          "title",
          "aria-label",
          "data-original-title",
          "data-bs-original-title",
          "data-tooltip",
        ];
        for (const a of attrs) {
          const v = el.getAttribute && el.getAttribute(a);
          if (v) out.push(v);
        }
        return out;
      };

      const texts = [];
      const attrs = [];

      // texto do TD
      try {
        const t = (cell.innerText || "").trim();
        if (t) texts.push(t);
      } catch {}

      // attrs do TD
      attrs.push(...pickAttrs(cell));

      // procurar elementos com tooltip
      const els = cell.querySelectorAll(
        "[title],[aria-label],[data-original-title],[data-bs-original-title],[data-tooltip]"
      );

      // limita para não explodir
      const max = Math.min(els.length, 15);
      for (let i = 0; i < max; i++) {
        attrs.push(...pickAttrs(els[i]));
      }

      // html bruto (às vezes tem 'cancelada' em classes/labels)
      const html = cell.innerHTML || "";

      return { texts, attrs, html };
    });

    return {
      texts: Array.isArray(payload?.texts) ? payload.texts : [],
      attrs: Array.isArray(payload?.attrs) ? payload.attrs : [],
      html: typeof payload?.html === "string" ? payload.html : "",
    };
  } catch {
    return { texts: [], attrs: [], html: "" };
  }
}

async function isRowCanceladaBySituacaoIdx(rowHandle, situacaoIdx) {
  if (situacaoIdx < 0) {
    return { isCancelled: false, statusRaw: "", statusNorm: "" };
  }

  try {
    const cells = await rowHandle.$$("td");
    const cell = cells?.[situacaoIdx] || null;
    if (!cell) return { isCancelled: false, statusRaw: "", statusNorm: "" };

    // 1) tenta texto direto
    const rawText = ((await cell.innerText().catch(() => "")) || "").trim();

    // 2) se não tem texto, lê tooltip/attrs/html
    const signals = await readSituacaoSignalsFromCell(cell);

    const allParts = [
      rawText,
      ...(signals.texts || []),
      ...(signals.attrs || []),
      signals.html || "",
    ]
      .filter(Boolean)
      .map((x) => String(x));

    const joinedRaw = allParts.join(" | ").trim();
    const norm = normalizeStatus(joinedRaw);

    // regra de cancelada:
    const isCancelled =
      (norm.includes("CANCELAD") || norm.includes("NFS-E CANCELAD") || norm.includes("NFSE CANCELAD")) &&
      !norm.includes("CANCELAR");

    return {
      isCancelled,
      statusRaw: joinedRaw || rawText || "",
      statusNorm: norm || "",
    };
  } catch {
    return { isCancelled: false, statusRaw: "", statusNorm: "" };
  }
}

// ---------------------------------------------------------------------
// PDF robusto (mantido)
// ---------------------------------------------------------------------
function makeAbsoluteUrl(base, href) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

async function safeClickHandle(handle) {
  try {
    await handle.scrollIntoViewIfNeeded().catch(() => {});
  } catch {}
  await handle
    .evaluate((el) => {
      if (!el) return;
      try {
        el.scrollIntoView({ block: "center", inline: "center" });
      } catch {}
      if (el instanceof HTMLElement) el.click();
      else el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    })
    .catch(async () => {
      await handle.click({ force: true }).catch(() => {});
    });
}

async function baixarPdfPorRequest({ context, page, urlPdf, destinoPdf, log }) {
  if (!urlPdf) throw new Error("URL do PDF não encontrada para fallback.");

  const abs = makeAbsoluteUrl(page.url(), urlPdf);
  log?.(`[BOT] (PDF) Tentando fallback via request autenticado: ${abs}`);

  const resp = await context.request.get(abs).catch(() => null);
  if (!resp) throw new Error("Falha ao executar request.get() para o PDF.");

  const ok = resp.ok();
  const status = resp.status();

  if (!ok) {
    throw new Error(`Request do PDF falhou (status ${status}).`);
  }

  const buffer = await resp.body().catch(() => null);
  if (!buffer) throw new Error("Request OK, mas não consegui ler body() do PDF.");

  fs.mkdirSync(path.dirname(destinoPdf), { recursive: true });
  fs.writeFileSync(destinoPdf, buffer);

  log?.(`[BOT] PDF (via request) salvo: ${destinoPdf}`);
  return true;
}

async function baixarPdfRobusto({
  context,
  page,
  clickPdfOption,
  destinoPdf,
  log,
  pdfLinkHandle,
}) {
  fs.mkdirSync(path.dirname(destinoPdf), { recursive: true });

  const downloadPromise = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
  const popupPromise = page.waitForEvent("popup", { timeout: 15000 }).catch(() => null);
  const responsePromise = page
    .waitForResponse(
      (r) => {
        const ct = (r.headers()["content-type"] || "").toLowerCase();
        return ct.includes("application/pdf");
      },
      { timeout: 15000 }
    )
    .catch(() => null);

  await clickPdfOption();

  const first = await Promise.race([
    downloadPromise.then((d) => ({ type: "download", d })),
    popupPromise.then((p) => ({ type: "popup", p })),
    responsePromise.then((r) => ({ type: "response", r })),
    new Promise((r) => setTimeout(() => r({ type: "timeout" }), 16000)),
  ]);

  if (first.type === "response" && first.r) {
    const resp = first.r;
    if (!resp.ok()) throw new Error(`Response do PDF não OK (status ${resp.status()})`);

    const buffer = await resp.body().catch(() => null);
    if (!buffer) throw new Error("Response abriu, mas não consegui ler o body() do PDF.");

    fs.writeFileSync(destinoPdf, buffer);
    log?.(`[BOT] PDF (via response) salvo: ${destinoPdf}`);
    return true;
  }

  if (first.type === "popup" && first.p) {
    const popup = first.p;

    await popup.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    await popup.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    const buffer = await popup.pdf({ format: "A4", printBackground: true }).catch(() => null);

    if (buffer) {
      fs.writeFileSync(destinoPdf, buffer);
      log?.(`[BOT] PDF (via popup.pdf) salvo: ${destinoPdf}`);
      await popup.close().catch(() => {});
      return true;
    }

    const respPdf = await popup
      .waitForResponse(
        (r) => (r.headers()["content-type"] || "").toLowerCase().includes("application/pdf"),
        { timeout: 12000 }
      )
      .catch(() => null);

    if (respPdf && respPdf.ok()) {
      const buf2 = await respPdf.body().catch(() => null);
      if (buf2) {
        fs.writeFileSync(destinoPdf, buf2);
        log?.(`[BOT] PDF (via response no popup) salvo: ${destinoPdf}`);
        await popup.close().catch(() => {});
        return true;
      }
    }

    await popup.close().catch(() => {});
    let href = null;
    try {
      href = pdfLinkHandle ? await pdfLinkHandle.getAttribute("href") : null;
    } catch {}
    return await baixarPdfPorRequest({ context, page, urlPdf: href, destinoPdf, log });
  }

  if (first.type === "download" && first.d) {
    const download = first.d;

    const failure = await download.failure().catch(() => null);

    if (failure) {
      if (String(failure).toLowerCase().includes("canceled")) {
        const resp = await responsePromise.catch(() => null);
        if (resp && resp.ok()) {
          const buffer = await resp.body().catch(() => null);
          if (buffer) {
            fs.writeFileSync(destinoPdf, buffer);
            log?.(`[BOT] PDF (via response após cancelamento) salvo: ${destinoPdf}`);
            return true;
          }
        }

        const pop = await popupPromise.catch(() => null);
        if (pop) {
          await pop.waitForLoadState("domcontentloaded", { timeout: 12000 }).catch(() => {});
          const buffer = await pop.pdf({ format: "A4", printBackground: true }).catch(() => null);
          if (buffer) {
            fs.writeFileSync(destinoPdf, buffer);
            log?.(`[BOT] PDF (via popup após cancelamento) salvo: ${destinoPdf}`);
            await pop.close().catch(() => {});
            return true;
          }
          await pop.close().catch(() => {});
        }

        let href = null;
        try {
          href = pdfLinkHandle ? await pdfLinkHandle.getAttribute("href") : null;
        } catch {}

        const urlFallback = href || (download.url ? download.url() : null) || null;

        return await baixarPdfPorRequest({
          context,
          page,
          urlPdf: urlFallback,
          destinoPdf,
          log,
        });
      }

      throw new Error(`Falha no download do PDF: ${failure}`);
    }

    await download.saveAs(destinoPdf);
    log?.(`[BOT] PDF salvo: ${destinoPdf}`);
    return true;
  }

  let href = null;
  try {
    href = pdfLinkHandle ? await pdfLinkHandle.getAttribute("href") : null;
  } catch {}

  if (href) {
    return await baixarPdfPorRequest({ context, page, urlPdf: href, destinoPdf, log });
  }

  throw new Error("Não houve evento de download/popup/response para o PDF (timeout).");
}

// ---------------------------------------------------------------------
// Helper: clicar e capturar arquivo usando evento de download do Playwright
// ✅ AJUSTE DE PASTAS: só cria a pasta de destino quando realmente vai salvar
// ---------------------------------------------------------------------
async function clickAndCaptureFile({
  page,
  element,
  finalDir,
  tipoNota,
  pushLog,
  extPreferida,
  arquivoIndexRef,
  linhaIndex,
}) {
  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 25000 }).catch(() => null),
      element.evaluate((el) => {
        if (el instanceof HTMLElement) {
          el.click();
        } else {
          el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        }
      }),
    ]);

    if (!download) {
      pushLog(
        `[BOT] Aviso: não foi possível identificar um download ${
          extPreferida || "PDF/XML"
        } após o clique na linha ${linhaIndex}.`
      );
      return false;
    }

    const failure = await download.failure().catch(() => null);
    if (failure) {
      throw new Error(`Falha no download (${extPreferida || "arquivo"}): ${failure}`);
    }

    let originalName = download.suggestedFilename() || "arquivo";
    originalName = originalName.replace(/[/\\]/g, "_");

    let ext = path.extname(originalName).toLowerCase();
    const expectedExt =
      extPreferida === "pdf" ? ".pdf" : extPreferida === "xml" ? ".xml" : null;

    // ✅ Ajuste: se foi pedido XML, mas veio PDF (ou vice-versa), NÃO salva (evita misturar)
    if (expectedExt && ext && ext !== expectedExt) {
      pushLog(
        `[BOT] Aviso: download inesperado na linha ${linhaIndex}. Esperado "${expectedExt}", mas veio "${ext}" (arquivo: "${originalName}"). Ignorando para não misturar.`
      );
      return false;
    }

    // Se não vier extensão, tenta assumir pela preferida
    if (!ext) {
      ext = expectedExt || ".bin";
      originalName += ext;
    }

    const cnpj = extractCnpjLike(originalName) || extractCnpjLike(download.url()) || null;

    arquivoIndexRef.value += 1;
    const index = arquivoIndexRef.value;

    const tipoSlug =
      tipoNota === "recebidas"
        ? "recebidas"
        : tipoNota === "canceladas"
        ? "canceladas"
        : "emitidas";

    const cnpjParte = cnpj || `linha${linhaIndex}`;
    const newName = `${tipoSlug}-${cnpjParte}-${index}${ext}`;
    const savePath = path.join(finalDir, newName);

    // ✅ cria só aqui, quando realmente vai salvar algo
    ensureDir(finalDir);

    await download.saveAs(savePath);

    pushLog(
      `[BOT] Arquivo #${index} capturado na linha ${linhaIndex}. Original: "${originalName}" -> Novo nome: "${newName}". Caminho final: ${savePath}`
    );

    return true;
  } catch (e) {
    pushLog(`[BOT] Erro ao clicar/capturar arquivo na linha ${linhaIndex}: ${e.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------
// ✅ Navegação por tipo
// - Emitidas: /Notas/Emitidas
// - Recebidas: /Notas/Recebidas
// - Canceladas: ficam na lista de Emitidas (Situação=cancelada)
// ---------------------------------------------------------------------
async function navigateToTipo(page, tipoNota, pushLog) {
  const emitidasUrl =
    process.env.NFSE_EMITIDAS_URL || "https://www.nfse.gov.br/EmissorNacional/Notas/Emitidas";

  const recebidasUrl =
    process.env.NFSE_RECEBIDAS_URL || "https://www.nfse.gov.br/EmissorNacional/Notas/Recebidas";

  if (tipoNota === "recebidas") {
    try {
      pushLog('[BOT] Tentando clicar no ícone "NFS-e Recebidas"...');
      await page.click('[title="NFS-e Recebidas"]', { timeout: 8000 });
      await page.waitForURL("**/Notas/Recebidas", { timeout: 15000 }).catch(() => {});
      pushLog("[BOT] Tela de Recebidas aberta.");
      return;
    } catch {
      pushLog("[BOT] Falha ao clicar Recebidas. Tentando URL direta...");
      await page.goto(recebidasUrl, { waitUntil: "networkidle", timeout: 20000 });
      pushLog(`[BOT] URL atual: ${page.url()}`);
      return;
    }
  }

  if (tipoNota === "canceladas") {
    pushLog(
      '[BOT] Tipo "canceladas": portal costuma listar canceladas dentro de "Emitidas" (coluna Situação). Abrindo Emitidas...'
    );
    await page
      .goto(emitidasUrl, { waitUntil: "networkidle", timeout: 20000 })
      .catch(async () => {
        try {
          await page.click('[title="NFS-e Emitidas"]', { timeout: 8000 });
        } catch {}
      });
    pushLog(`[BOT] URL atual (canceladas via emitidas): ${page.url()}`);
    return;
  }

  // emitidas (default)
  try {
    pushLog('[BOT] Tentando clicar no ícone "NFS-e Emitidas"...');
    await page.click('[title="NFS-e Emitidas"]', { timeout: 8000 });
    await page.waitForURL("**/Notas/Emitidas", { timeout: 15000 }).catch(() => {});
    pushLog("[BOT] Tela de Emitidas aberta.");
    return;
  } catch {
    pushLog("[BOT] Falha ao clicar Emitidas. Tentando URL direta...");
    await page.goto(emitidasUrl, { waitUntil: "networkidle", timeout: 20000 });
    pushLog(`[BOT] URL atual: ${page.url()}`);
    return;
  }
}

// ---------------------------------------------------------------------
// ✅ Filtro de datas (portal -> fallback antigo -> fallback tabela)
// ---------------------------------------------------------------------
async function applyDateFilterIfExists(page, dataInicial, dataFinal, pushLog) {
  let usarFiltroNaTabela = false;

  if (dataInicial || dataFinal) {
    // 1) filtro real do portal (labels + Filtrar)
    try {
      const diBr = formatDateBrFromISO(dataInicial);
      const dfBr = formatDateBrFromISO(dataFinal);

      const inputDataInicial = page.locator(
        `xpath=//label[contains(normalize-space(.),"Data Inicial")]/following::input[1]`
      );
      const inputDataFinal = page.locator(
        `xpath=//label[contains(normalize-space(.),"Data Final")]/following::input[1]`
      );

      const hasIni = (await inputDataInicial.count().catch(() => 0)) > 0;
      const hasFim = (await inputDataFinal.count().catch(() => 0)) > 0;

      pushLog(
        `[BOT] Campos de data detectados? Data Inicial=${hasIni ? "sim" : "não"} | Data Final=${
          hasFim ? "sim" : "não"
        }`
      );

      if ((hasIni && diBr) || (hasFim && dfBr)) {
        if (hasIni && diBr) {
          await inputDataInicial.first().click({ delay: 50 });
          await page.keyboard.press("Control+A");
          await page.keyboard.type(diBr, { delay: 25 });
        }

        if (hasFim && dfBr) {
          await inputDataFinal.first().click({ delay: 50 });
          await page.keyboard.press("Control+A");
          await page.keyboard.type(dfBr, { delay: 25 });
        }

        const btnFiltrar = page.getByRole("button", { name: /filtrar/i });

        await Promise.all([
          page.waitForLoadState("networkidle").catch(() => {}),
          btnFiltrar.click({ delay: 50 }).catch(() => {}),
        ]);

        await page.waitForTimeout(800);

        pushLog(
          `[BOT] Filtro de período aplicado no portal (Data Inicial/Data Final): ${buildPeriodoLabel(
            dataInicial,
            dataFinal
          )}.`
        );

        return { usarFiltroNaTabela: false };
      }
    } catch (err) {
      pushLog(
        `[BOT] Não consegui aplicar filtro do portal (labels/Filtrar): ${err.message}. Vou tentar inputs alternativos e/ou filtrar pela coluna "Emissão".`
      );
    }

    // 2) fallback antigo (ids/names)
    try {
      const diBr = formatDateBrFromISO(dataInicial);
      const dfBr = formatDateBrFromISO(dataFinal);

      await page.waitForTimeout(500);

      const dataInicialInput =
        (await page.$(
          'input[id*="DataInicio"], input[name*="DataInicio"], input[id*="DataEmissaoInicial"], input[name*="DataEmissaoInicial"]'
        )) ||
        (await page.$('input[id*="DataCompetenciaInicio"], input[name*="DataCompetenciaInicio"]'));

      const dataFinalInput =
        (await page.$(
          'input[id*="DataFim"], input[name*="DataFim"], input[id*="DataEmissaoFinal"], input[name*="DataEmissaoFinal"]'
        )) || (await page.$('input[id*="DataCompetenciaFim"], input[name*="DataCompetenciaFim"]'));

      if ((dataInicialInput && diBr) || (dataFinalInput && dfBr)) {
        if (dataInicialInput && diBr) await dataInicialInput.fill(diBr);
        if (dataFinalInput && dfBr) await dataFinalInput.fill(dfBr);

        const botaoPesquisar =
          (await page.$(
            'button[type="submit"]:has-text("Pesquisar"), button:has-text("Consultar"), button:has-text("Buscar")'
          )) ||
          (await page.$(
            'input[type="submit"][value*="Pesquisar"], input[type="submit"][value*="Consultar"], input[type="submit"][value*="Buscar"]'
          ));

        if (botaoPesquisar) {
          await botaoPesquisar.click();
          await page.waitForTimeout(1500);
          pushLog(
            `[BOT] Filtro de período aplicado pelos campos (fallback antigo): ${buildPeriodoLabel(
              dataInicial,
              dataFinal
            )}.`
          );
          return { usarFiltroNaTabela: false };
        }

        usarFiltroNaTabela = true;
      } else {
        usarFiltroNaTabela = true;
      }
    } catch (err2) {
      usarFiltroNaTabela = true;
      pushLog(
        `[BOT] Erro ao aplicar filtro por campos (fallback antigo): ${err2.message}. Vou filtrar pela coluna "Emissão".`
      );
    }
  }

  if (usarFiltroNaTabela && (dataInicial || dataFinal)) {
    pushLog("[BOT] Não localizei campos de data. Vou filtrar pela coluna 'Emissão' da tabela.");
  }

  return { usarFiltroNaTabela };
}

// ---------------------------------------------------------------------
// MODO SIMULAÇÃO (mantido) – ✅ AJUSTE: não cria pastas de tipo automaticamente
// ---------------------------------------------------------------------
async function runManualDownloadSimulado(params = {}) {
  const { onLog } = params || {};
  const { logs, pushLog } = createLogger(onLog);

  const {
    dataInicial,
    dataFinal,
    tipoNota,
    baixarXml,
    baixarPdf,
    pastaDestino,
    empresaId,
    empresaNome,
    modoExecucao,
    jobDir,
  } = params;

  const periodoLabel = buildPeriodoLabel(dataInicial, dataFinal);

  const jobPaths = buildJobPaths(pastaDestino, dataInicial, dataFinal);

  const rootJobDir = jobDir ? path.resolve(process.cwd(), jobDir) : jobPaths.jobDir;
  ensureDir(rootJobDir);

  const finalDir = getTipoDirFromRoot(rootJobDir, tipoNota);

  pushLog(
    `[BOT] (Debug) Modo SIMULAÇÃO ativo. NFSE_USE_PORTAL = "${
      process.env.NFSE_USE_PORTAL || "não definido"
    }".`
  );
  pushLog("[BOT] Iniciando robô (SIMULAÇÃO)...");
  pushLog(`[BOT] Tipo de nota: ${tipoNota}`);
  pushLog(`[BOT] Período: ${periodoLabel}`);
  pushLog(`[BOT] Pasta final: ${finalDir}`);

  try {
    registrarExecucao({
      empresaId: empresaId || null,
      empresaNome: empresaNome || null,
      tipo: modoExecucao || "manual",
      totalArquivos: 0,
      status: "simulado",
      detalhes: `Simulação - tipoNota=${tipoNota}, período=${periodoLabel}.`,
    });
  } catch (err) {
    console.error("[BOT] Erro ao registrar histórico (simulação):", err);
  }

  return { logs, paths: { jobDir: rootJobDir, finalDir } };
}

// ---------------------------------------------------------------------
// MODO PORTAL (Playwright)
// ✅ AJUSTE: só cria a pasta (Emitidas/Recebidas/Canceladas) se houver download real
// ---------------------------------------------------------------------
async function runManualDownloadPortal(params = {}) {
  const { onLog } = params || {};
  const { logs, pushLog } = createLogger(onLog);

  const {
    dataInicial,
    dataFinal,
    tipoNota,
    baixarXml,
    baixarPdf,
    pastaDestino,
    login: loginParam,
    senha: senhaParam,
    empresaId,
    empresaNome,
    modoExecucao,
    jobDir,
  } = params;

  const periodoLabel = buildPeriodoLabel(dataInicial, dataFinal);

  const login = loginParam || process.env.NFSE_USER;
  const senha = senhaParam || process.env.NFSE_PASSWORD;

  if (!login || !senha) {
    pushLog("[BOT] Login/senha não informados. Voltando para SIMULAÇÃO.");
    const simResult = await runManualDownloadSimulado({ ...params, modoExecucao, onLog });
    return { logs: logs.concat(simResult.logs), paths: simResult.paths };
  }

  const jobPaths = buildJobPaths(pastaDestino, dataInicial, dataFinal);

  const rootJobDir = jobDir ? path.resolve(process.cwd(), jobDir) : jobPaths.jobDir;
  ensureDir(rootJobDir);

  // ✅ NÃO cria as 3 pastas aqui.
  // Só define qual seria a pasta final (e cria quando realmente salvar algum arquivo).
  const finalDir = getTipoDirFromRoot(rootJobDir, tipoNota);

  pushLog(`[BOT] JobDir: ${rootJobDir}`);
  pushLog(`[BOT] Tipo: ${tipoNota} | Pasta final: ${finalDir}`);

  const browser = await launchNFSEBrowser();
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  const arquivoIndexRef = { value: 0 };
  let teveErro = false;

  try {
    // 1) Abrir login
    pushLog("[BOT] Abrindo portal nacional da NFS-e...");
    await page.goto(NFSE_PORTAL_URL, { waitUntil: "domcontentloaded" });
    pushLog("[BOT] Página de login carregada.");

    // 2) Login
    await page.fill('input[name="Login"], input[id="Login"], input[type="text"]', login);
    pushLog("[BOT] Login preenchido.");

    await page.fill('input[name="Senha"], input[id="Senha"], input[type="password"]', senha);
    pushLog("[BOT] Senha preenchida.");

    await page.click(
      'button[type="submit"], input[type="submit"], button:has-text("Entrar"), button:has-text("Acessar")'
    );
    pushLog("[BOT] Botão de login clicado. Aguardando...");

    await Promise.race([
      page.waitForNavigation({ waitUntil: "networkidle", timeout: 15000 }),
      page.waitForTimeout(15000),
    ]).catch(() => {});

    if (page.url().includes("/Login")) {
      pushLog("[BOT] (Alerta) Ainda na tela de login. Pode ter captcha/seleção extra.");
    } else {
      pushLog("[BOT] Login OK (URL mudou).");
    }

    // 3) Navega para o tipo
    await navigateToTipo(page, tipoNota, pushLog);

    // 4) Filtro de data
    const { usarFiltroNaTabela } = await applyDateFilterIfExists(
      page,
      dataInicial,
      dataFinal,
      pushLog
    );

    // ✅ Situação/Status:
    // - canceladas: usado para INCLUIR somente canceladas
    // - emitidas: usado para EXCLUIR canceladas do meio
    let situacaoIdx = -1;

    if (tipoNota === "canceladas") {
      situacaoIdx = await findSituacaoColumnIndex(page);
      if (situacaoIdx < 0) {
        pushLog(
          '[BOT] ⚠️ Não encontrei coluna "Situação/Status". Para evitar erro, canceladas ficará vazio nesta execução.'
        );
      } else {
        pushLog(`[BOT] Coluna Situação/Status detectada (idx=${situacaoIdx}).`);
      }
    }

    // ✅ NOVO (sem quebrar nada): em "emitidas", pula linhas canceladas
    let situacaoIdxEmitidas = -1;
    if (tipoNota === "emitidas") {
      situacaoIdxEmitidas = await findSituacaoColumnIndex(page);
      if (situacaoIdxEmitidas >= 0) {
        pushLog(
          `[BOT] Coluna Situação/Status detectada para filtro de emitidas (idx=${situacaoIdxEmitidas}). Canceladas serão ignoradas em Emitidas.`
        );
      } else {
        pushLog(
          `[BOT] (Info) Não encontrei coluna Situação/Status para filtro de emitidas. Seguindo sem filtrar canceladas em Emitidas.`
        );
      }
    }

    // 5) Validar “nenhum registro”
    const textoPagina = (await page.textContent("body").catch(() => "")) || "";
    if (textoPagina.includes("Nenhum registro encontrado")) {
      pushLog("[BOT] Nenhuma nota encontrada (Nenhum registro encontrado).");
      pushLog(`[BOT] Página atual validada: ${page.url()}`);
    } else {
      await page.waitForSelector("table tbody tr", { timeout: 10000 });
      const rowHandles = await page.$$("table tbody tr");
      const rowCount = rowHandles.length;

      pushLog(`[BOT] Tabela carregada. Linhas: ${rowCount}.`);

      const dataInicialDate = dataInicial ? parseIsoToDate(dataInicial) : null;
      const dataFinalDate = dataFinal ? parseIsoToDate(dataFinal) : null;

      if (rowCount === 0) {
        pushLog("[BOT] Nenhuma nota na tabela para o período.");
      } else {
        if (!baixarXml && !baixarPdf) {
          pushLog("[BOT] Nenhum formato selecionado (XML/PDF). Nada será baixado.");
        } else {
          let linhaIndex = 0;

          for (const row of rowHandles) {
            linhaIndex += 1;

            try {
              const allCells = await row.$$("td");

              // fallback por coluna Emissão
              if (usarFiltroNaTabela && (dataInicialDate || dataFinalDate)) {
                const emissaoCell = allCells[0] || null;
                let emissaoTexto = "";

                if (emissaoCell) {
                  emissaoTexto = ((await emissaoCell.innerText().catch(() => "")) || "").trim();
                }

                const emissaoDate = parseBrDateToDate(emissaoTexto);

                if (emissaoDate) {
                  if (
                    (dataInicialDate && emissaoDate < dataInicialDate) ||
                    (dataFinalDate && emissaoDate > dataFinalDate)
                  ) {
                    pushLog(
                      `[BOT] Linha ${linhaIndex}: emissão ${emissaoTexto} fora do período. Ignorando.`
                    );
                    continue;
                  }
                }
              }

              // ✅ CANCELADAS: filtra pela coluna Situação/Status (ícone/tooltip)
              if (tipoNota === "canceladas") {
                if (situacaoIdx < 0) continue;

                const r = await isRowCanceladaBySituacaoIdx(row, situacaoIdx);

                pushLog(
                  `[BOT] Linha ${linhaIndex}: Situação="${r.statusNorm || "?"}" (raw="${
                    r.statusRaw || ""
                  }")`
                );

                if (!r.isCancelled) continue;

                pushLog(`[BOT] Linha ${linhaIndex}: nota CANCELADA detectada. Processando...`);
              }

              // ✅ EMITIDAS: ignorar canceladas no meio
              if (tipoNota === "emitidas" && situacaoIdxEmitidas >= 0) {
                const rEmi = await isRowCanceladaBySituacaoIdx(row, situacaoIdxEmitidas);
                if (rEmi.isCancelled) {
                  pushLog(
                    `[BOT] Linha ${linhaIndex}: (Emitidas) nota CANCELADA detectada na lista. Ignorando para não misturar.`
                  );
                  continue;
                }
              }

              const acaoCell = allCells.length > 0 ? allCells[allCells.length - 1] : null;

              if (!acaoCell) {
                pushLog(`[BOT] Linha ${linhaIndex}: não encontrei coluna de ações.`);
                continue;
              }

              const menuWrapper = (await acaoCell.$(".menu-suspenso-tabela")) || acaoCell;
              const trigger = await menuWrapper.$(".icone-trigger");
              if (!trigger) {
                pushLog(
                  `[BOT] Linha ${linhaIndex}: não encontrei o ícone do menu (.icone-trigger).`
                );
                continue;
              }

              await trigger.click({ force: true });
              await page.waitForTimeout(200);

              const menu =
                (await menuWrapper.$(".menu-content")) || (await menuWrapper.$(".list-group"));
              if (!menu) {
                pushLog(`[BOT] Linha ${linhaIndex}: menu suspenso não encontrado após clique.`);
                continue;
              }

              // XML
              if (baixarXml) {
                let xmlLink =
                  (await menu.$('a:has-text("Download XML")')) ||
                  (await menu.$('a:has-text("XML")')) ||
                  (await menu.$('a[href*="DownloadXml"]')) ||
                  (await menu.$('a[href*="xml"]'));

                if (xmlLink) {
                  pushLog(`[BOT] Linha ${linhaIndex}: baixando XML...`);
                  await clickAndCaptureFile({
                    page,
                    element: xmlLink,
                    finalDir,
                    tipoNota,
                    pushLog,
                    extPreferida: "xml",
                    arquivoIndexRef,
                    linhaIndex,
                  });
                } else {
                  pushLog(`[BOT] Linha ${linhaIndex}: XML não encontrado no menu.`);
                }
              }

              // PDF
              if (baixarPdf) {
                let pdfLink =
                  (await menu.$('a:has-text("Download DANFS-e")')) ||
                  (await menu.$('a:has-text("Download DANFS")')) ||
                  (await menu.$('a:has-text("DANFS-e")')) ||
                  (await menu.$('a:has-text("DANFS")')) ||
                  (await menu.$('a:has-text("PDF")')) ||
                  (await menu.$('a[href*="DANFS"]')) ||
                  (await menu.$('a[href*="pdf"]'));

                if (pdfLink) {
                  pushLog(`[BOT] Linha ${linhaIndex}: baixando PDF...`);

                  const tipoSlug =
                    tipoNota === "recebidas"
                      ? "recebidas"
                      : tipoNota === "canceladas"
                      ? "canceladas"
                      : "emitidas";

                  const destinoPdfPreview = `${tipoSlug}-linha${linhaIndex}-${arquivoIndexRef.value + 1}.pdf`;
                  const destinoPdf = path.join(finalDir, destinoPdfPreview);

                  try {
                    const ok = await baixarPdfRobusto({
                      context,
                      page,
                      destinoPdf,
                      log: (m) => pushLog(m),
                      pdfLinkHandle: pdfLink,
                      clickPdfOption: async () => {
                        await safeClickHandle(pdfLink);
                      },
                    });

                    if (ok) {
                      // ✅ aqui a pasta também já foi criada pelo mkdirSync do baixarPdfRobusto
                      arquivoIndexRef.value += 1;
                      pushLog(`[BOT] PDF registrado como arquivo #${arquivoIndexRef.value}.`);
                    }
                  } catch (e) {
                    pushLog(`[BOT] Erro ao capturar PDF na linha ${linhaIndex}: ${e.message}`);
                  }
                } else {
                  pushLog(`[BOT] Linha ${linhaIndex}: PDF/DANFS não encontrado no menu.`);
                }
              }

              await page.waitForTimeout(150);
            } catch (linhaErr) {
              pushLog(`[BOT] Erro ao processar linha ${linhaIndex}: ${linhaErr.message}`);
            }
          }
        }
      }
    }

    pushLog(`[BOT] Finalizado (${tipoNota}). Total capturado: ${arquivoIndexRef.value}.`);
  } catch (err) {
    console.error("Erro no robô Playwright:", err);
    pushLog(`[BOT] ERRO: ${err.message}`);
    teveErro = true;
  } finally {
    await browser.close().catch(() => {});
    pushLog("[BOT] Navegador fechado.");

    try {
      registrarExecucao({
        empresaId: empresaId || null,
        empresaNome: empresaNome || null,
        tipo: modoExecucao || "manual",
        totalArquivos: arquivoIndexRef.value,
        status: teveErro ? "erro" : "sucesso",
        erros: teveErro ? [{ message: "Verificar logs desta execução" }] : null,
        detalhes: `Portal nacional - tipoNota=${tipoNota}, período=${periodoLabel}.`,
      });
    } catch (histErr) {
      console.error("[BOT] Erro ao registrar histórico:", histErr);
    }
  }

  return { logs, paths: { jobDir: rootJobDir, finalDir } };
}

// ---------------------------------------------------------------------
// Função usada pelo backend – escolhe modo conforme .env
// ---------------------------------------------------------------------
export async function runManualDownload(params = {}) {
  const usePortal = process.env.NFSE_USE_PORTAL === "true";

  if (usePortal) {
    return runManualDownloadPortal({ ...params, modoExecucao: params.modoExecucao || "manual" });
  }

  return runManualDownloadSimulado({ ...params, modoExecucao: params.modoExecucao || "manual" });
}

// ---------------------------------------------------------------------
// Execução em LOTE
// Agora aceita processarTipos: ["emitidas","recebidas","canceladas"]
// ✅ AJUSTE: dentro de cada empresa, só cria pasta do(s) tipo(s) realmente executado(s) e que baixou arquivo
// ---------------------------------------------------------------------
export async function runLoteDownload(empresas = [], options = {}) {
  const {
    onLog,
    baixarXml = true,
    baixarPdf = true,
    tipoNota = "emitidas",
    dataInicial,
    dataFinal,
    pastaDestino,
    processarTipos,
  } = options || {};

  const { logs, pushLog } = createLogger(onLog);
  const usePortal = process.env.NFSE_USE_PORTAL === "true";

  // ✅ Ajuste: normaliza + remove duplicados
  const tiposRaw =
    Array.isArray(processarTipos) && processarTipos.length ? processarTipos : [tipoNota];
  const tipos = [...new Set(tiposRaw.map((t) => String(t).trim().toLowerCase()).filter(Boolean))];

  pushLog(`[BOT] Iniciando execução em lote (${usePortal ? "REAL (portal)" : "SIMULAÇÃO"})...`);
  pushLog(`[BOT] Tipos no lote: ${tipos.join(", ")}`);
  pushLog(`[BOT] Período: ${buildPeriodoLabel(dataInicial, dataFinal)}`);

  if (!Array.isArray(empresas) || empresas.length === 0) {
    pushLog("[BOT] Nenhuma empresa cadastrada para executar em lote.");
    return { logs, paths: {} };
  }

  const loteJobPaths = buildJobPaths(pastaDestino, dataInicial, dataFinal);
  pushLog(`[BOT] Lote JobDir: ${loteJobPaths.jobDir}`);

  for (const emp of empresas) {
    pushLog("--------------------------------------------------------------");
    pushLog(`[BOT] Empresa: ${emp.nome} (CNPJ: ${emp.cnpj})`);

    const login = emp.loginPortal || emp.cnpj || null;
    const senha = emp.senhaPortal || null;

    if (usePortal && (!login || !senha)) {
      pushLog("[BOT] Login/senha da empresa não configurados. Pulando.");
      continue;
    }

    // ✅ Só cria a pasta da empresa (não cria Emitidas/Recebidas/Canceladas aqui)
    const empresaDir = path.join(
      loteJobPaths.jobDir,
      `${String(emp.nome || "empresa").replace(/[^\w\-]+/g, "_")}_${String(
        emp.cnpj || emp.id || ""
      ).slice(-8)}`
    );
    ensureDir(empresaDir);

    for (const t of tipos) {
      if (usePortal) {
        await runManualDownloadPortal({
          dataInicial,
          dataFinal,
          tipoNota: t,
          baixarXml,
          baixarPdf,
          pastaDestino,
          login,
          senha,
          empresaId: emp.id || emp.cnpj,
          empresaNome: emp.nome,
          modoExecucao: "lote",
          onLog: (msg) => pushLog(msg),
          jobDir: empresaDir,
        });
      } else {
        await runManualDownloadSimulado({
          dataInicial,
          dataFinal,
          tipoNota: t,
          baixarXml,
          baixarPdf,
          pastaDestino,
          empresaId: emp.id || emp.cnpj,
          empresaNome: emp.nome,
          modoExecucao: "lote",
          onLog: (msg) => pushLog(msg),
          jobDir: empresaDir,
        });
      }
    }
  }

  pushLog("--------------------------------------------------------------");
  pushLog(`[BOT] Execução em lote finalizada.`);

  return { logs, paths: { jobDir: loteJobPaths.jobDir } };
}
