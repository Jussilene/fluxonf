// src/bot/nfseBot.js
// Bot de NFSe com dois modos:
// - SIMULAÇÃO (sem Playwright, só logs)
// - PORTAL_NACIONAL (usa Playwright no portal https://www.nfse.gov.br/EmissorNacional)
//
// O modo é controlado pela env NFSE_USE_PORTAL:
//   NFSE_USE_PORTAL=false  -> só simulação
//   NFSE_USE_PORTAL=true   -> tenta usar o portal nacional

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { registrarExecucao } from "../models/historico.model.js"; // <-- HISTÓRICO

const NFSE_PORTAL_URL =
  "https://www.nfse.gov.br/EmissorNacional/Login?ReturnUrl=%2fEmissorNacional";

// ---------------------------------------------------------------------
// ✅ PDF ROBUSTO: captura PDF por download OU popup OU response PDF
// + fallback extra: se download vier "canceled", baixa via request autenticado
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
  // clique mais robusto que evita "not visible"
  await handle
    .evaluate((el) => {
      if (!el) return;
      try {
        el.scrollIntoView({ block: "center", inline: "center" });
      } catch {}
      if (el instanceof HTMLElement) el.click();
      else
        el.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true })
        );
    })
    .catch(async () => {
      // fallback (se evaluate falhar)
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
  pdfLinkHandle, // <-- handle do item do menu (para pegar href)
}) {
  fs.mkdirSync(path.dirname(destinoPdf), { recursive: true });

  // Promises (não “morrem” se um caminho falhar)
  const downloadPromise = page
    .waitForEvent("download", { timeout: 15000 })
    .catch(() => null);

  const popupPromise = page
    .waitForEvent("popup", { timeout: 15000 })
    .catch(() => null);

  const responsePromise = page
    .waitForResponse(
      (r) => {
        const ct = (r.headers()["content-type"] || "").toLowerCase();
        return ct.includes("application/pdf");
      },
      { timeout: 15000 }
    )
    .catch(() => null);

  // clique
  await clickPdfOption();

  // Espera “o que vier primeiro”, mas se vier download cancelado,
  // não para: tenta os outros caminhos e por fim fallback request.
  const first = await Promise.race([
    downloadPromise.then((d) => ({ type: "download", d })),
    popupPromise.then((p) => ({ type: "popup", p })),
    responsePromise.then((r) => ({ type: "response", r })),
    new Promise((r) => setTimeout(() => r({ type: "timeout" }), 16000)),
  ]);

  // ---------------- response (PDF inline) ----------------
  if (first.type === "response" && first.r) {
    const resp = first.r;
    if (!resp.ok()) throw new Error(`Response do PDF não OK (status ${resp.status()})`);

    const buffer = await resp.body().catch(() => null);
    if (!buffer) throw new Error("Response abriu, mas não consegui ler o body() do PDF.");

    fs.writeFileSync(destinoPdf, buffer);
    log?.(`[BOT] PDF (via response) salvo: ${destinoPdf}`);
    return true;
  }

  // ---------------- popup ----------------
  if (first.type === "popup" && first.p) {
    const popup = first.p;

    await popup.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    await popup.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // tenta imprimir como PDF (quando for viewer HTML)
    const buffer = await popup
      .pdf({ format: "A4", printBackground: true })
      .catch(() => null);

    if (buffer) {
      fs.writeFileSync(destinoPdf, buffer);
      log?.(`[BOT] PDF (via popup.pdf) salvo: ${destinoPdf}`);
      await popup.close().catch(() => {});
      return true;
    }

    // fallback: tenta capturar response PDF dentro do popup
    const respPdf = await popup
      .waitForResponse(
        (r) =>
          (r.headers()["content-type"] || "")
            .toLowerCase()
            .includes("application/pdf"),
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
    // último recurso: request pelo href do item do menu
    let href = null;
    try {
      href = pdfLinkHandle ? await pdfLinkHandle.getAttribute("href") : null;
    } catch {}
    return await baixarPdfPorRequest({ context, page, urlPdf: href, destinoPdf, log });
  }

  // ---------------- download ----------------
  if (first.type === "download" && first.d) {
    const download = first.d;

    const failure = await download.failure().catch(() => null);

    // ✅ Se o portal “cancela”, tentamos response/popup (se aconteceram) e, por fim, request
    if (failure) {
      if (String(failure).toLowerCase().includes("canceled")) {
        // tenta ver se mesmo assim veio response pdf em paralelo
        const resp = await responsePromise.catch(() => null);
        if (resp && resp.ok()) {
          const buffer = await resp.body().catch(() => null);
          if (buffer) {
            fs.writeFileSync(destinoPdf, buffer);
            log?.(`[BOT] PDF (via response após cancelamento) salvo: ${destinoPdf}`);
            return true;
          }
        }

        // tenta popup em paralelo
        const pop = await popupPromise.catch(() => null);
        if (pop) {
          await pop.waitForLoadState("domcontentloaded", { timeout: 12000 }).catch(() => {});
          const buffer = await pop
            .pdf({ format: "A4", printBackground: true })
            .catch(() => null);
          if (buffer) {
            fs.writeFileSync(destinoPdf, buffer);
            log?.(`[BOT] PDF (via popup após cancelamento) salvo: ${destinoPdf}`);
            await pop.close().catch(() => {});
            return true;
          }
          await pop.close().catch(() => {});
        }

        // fallback final: request autenticado via href/url
        let href = null;
        try {
          href = pdfLinkHandle ? await pdfLinkHandle.getAttribute("href") : null;
        } catch {}

        // se não tiver href, tenta usar a URL do próprio download
        const urlFallback = href || download.url?.() || null;

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

  // timeout / nada aconteceu → fallback request pelo href
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
// Helper para lançar o navegador (ajustado para servidor Linux)
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// Helpers de datas (para filtro e logs)
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// Função auxiliar de logs
// ---------------------------------------------------------------------
function createLogger(onLog) {
  const logs = [];
  const pushLog = (msg) => {
    logs.push(msg);
    if (onLog) onLog(msg);
  };
  return { logs, pushLog };
}

// ---------------------------------------------------------------------
// Helpers para pastas e nomes de arquivo
// ---------------------------------------------------------------------
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

function buildPaths(pastaDestino, tipoNota) {
  const baseDir = path.resolve(process.cwd(), pastaDestino || "downloads");
  const subDir = tipoNota === "recebidas" ? "Entrada" : "Saida";
  const finalDir = path.join(baseDir, subDir);
  return { baseDir, subDir, finalDir };
}

// ---------------------------------------------------------------------
// MODO 1 – SIMULAÇÃO
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
  } = params;

  const periodoLabel = buildPeriodoLabel(dataInicial, dataFinal);

  const paths = buildPaths(pastaDestino, tipoNota);
  ensureDir(paths.finalDir);

  pushLog(
    `[BOT] (Debug) Modo SIMULAÇÃO ativo. NFSE_USE_PORTAL = "${
      process.env.NFSE_USE_PORTAL || "não definido"
    }".`
  );

  pushLog("[BOT] Iniciando robô de download manual de NFS-e (SIMULAÇÃO)...");
  pushLog(`[BOT] Período selecionado: ${periodoLabel}`);
  pushLog(
    `[BOT] Tipo de nota: ${
      tipoNota === "recebidas"
        ? "Notas Recebidas (Entrada)"
        : "Notas Emitidas (Saída)"
    }`
  );

  const formatos = [baixarXml ? "XML" : null, baixarPdf ? "PDF" : null].filter(
    Boolean
  );
  pushLog(`[BOT] Formatos: ${formatos.join(" + ") || "Nenhum"}`);
  pushLog(`[BOT] Pasta de destino: ${pastaDestino || "downloads"}`);

  pushLog(
    `[BOT] Pasta base de downloads: ${paths.baseDir} | Subpasta: ${paths.subDir} | Final: ${paths.finalDir}`
  );

  pushLog("[BOT] (Simulação) Abrindo navegador automatizado...");
  pushLog("[BOT] (Simulação) Acessando portal da NFS-e...");
  pushLog("[BOT] (Simulação) Aplicando filtros de data e tipo de nota...");
  if (baixarXml) pushLog("[BOT] (Simulação) Baixando arquivos XML...");
  if (baixarPdf) pushLog("[BOT] (Simulação) Baixando arquivos PDF...");
  pushLog("[BOT] (Simulação) Organizando arquivos nas pastas Entrada/Saída...");
  pushLog("[BOT] Download manual concluído com sucesso (simulação).");

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

  return { logs, paths };
}

// ---------------------------------------------------------------------
// Helper: clicar e capturar arquivo usando evento de download do Playwright
// ✅ mais estável com download.saveAs() (evita download.path(): canceled)
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
          el.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true })
          );
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
      throw new Error(
        `Falha no download (${extPreferida || "arquivo"}): ${failure}`
      );
    }

    let originalName = download.suggestedFilename() || "arquivo";
    originalName = originalName.replace(/[/\\]/g, "_");

    let ext = path.extname(originalName);
    if (!ext) {
      ext =
        extPreferida === "pdf"
          ? ".pdf"
          : extPreferida === "xml"
          ? ".xml"
          : ".bin";
      originalName += ext;
    }

    const cnpj =
      extractCnpjLike(originalName) || extractCnpjLike(download.url()) || null;

    arquivoIndexRef.value += 1;
    const index = arquivoIndexRef.value;

    const tipoSlug = tipoNota === "recebidas" ? "recebidas" : "emitidas";
    const cnpjParte = cnpj || `linha${linhaIndex}`;
    const newName = `${tipoSlug}-${cnpjParte}-${index}${ext}`;
    const savePath = path.join(finalDir, newName);

    await download.saveAs(savePath);

    pushLog(
      `[BOT] Arquivo #${index} capturado na linha ${linhaIndex}. Original: "${originalName}" -> Novo nome: "${newName}". Caminho final: ${savePath}`
    );

    return true;
  } catch (e) {
    pushLog(
      `[BOT] Erro ao clicar/capturar arquivo na linha ${linhaIndex}: ${e.message}`
    );
    return false;
  }
}

// ---------------------------------------------------------------------
// MODO 2 – PORTAL NACIONAL (Playwright)
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
  } = params;

  const periodoLabel = buildPeriodoLabel(dataInicial, dataFinal);

  const login = loginParam || process.env.NFSE_USER;
  const senha = senhaParam || process.env.NFSE_PASSWORD;

  if (!login || !senha) {
    pushLog(
      "[BOT] Login/senha não informados para esta execução. Voltando para modo SIMULAÇÃO."
    );
    const simResult = await runManualDownloadSimulado({
      ...params,
      modoExecucao,
      onLog,
    });
    return { logs: logs.concat(simResult.logs), paths: simResult.paths };
  }

  const paths = buildPaths(pastaDestino, tipoNota);
  ensureDir(paths.finalDir);

  pushLog(
    `[BOT] Pasta base de downloads: ${paths.baseDir} | Subpasta: ${paths.subDir} | Final: ${paths.finalDir}`
  );

  const browser = await launchNFSEBrowser();

  const context = await browser.newContext({
    acceptDownloads: true,
  });
  const page = await context.newPage();

  const arquivoIndexRef = { value: 0 };
  let teveErro = false;

  try {
    // 1) Abrir tela de login
    pushLog("[BOT] Abrindo portal nacional da NFS-e...");
    await page.goto(NFSE_PORTAL_URL, { waitUntil: "domcontentloaded" });
    pushLog("[BOT] Página de login carregada.");

    // 2) Preencher login
    try {
      await page.fill(
        'input[name="Login"], input[id="Login"], input[type="text"]',
        login
      );
      pushLog("[BOT] Login preenchido.");
    } catch (err) {
      pushLog(
        "[BOT] Não consegui encontrar o campo de login. Ajuste os seletores em src/bot/nfseBot.js (parte do login)."
      );
      throw err;
    }

    // 3) Preencher senha
    try {
      await page.fill(
        'input[name="Senha"], input[id="Senha"], input[type="password"]',
        senha
      );
      pushLog("[BOT] Senha preenchida.");
    } catch (err) {
      pushLog(
        "[BOT] Não consegui encontrar o campo de senha. Ajuste os seletores em src/bot/nfseBot.js (parte da senha)."
      );
      throw err;
    }

    // 4) Clicar no botão de entrar
    try {
      await page.click(
        'button[type="submit"], input[type="submit"], button:has-text("Entrar"), button:has-text("Acessar")'
      );
      pushLog("[BOT] Botão de login clicado. Aguardando resposta...");
    } catch (err) {
      pushLog(
        "[BOT] Não consegui encontrar o botão de login. Ajuste os seletores em src/bot/nfseBot.js (parte do botão)."
      );
      throw err;
    }

    // 5) Esperar a navegação / mudança de tela
    try {
      await Promise.race([
        page.waitForNavigation({ waitUntil: "networkidle", timeout: 15000 }),
        page.waitForTimeout(15000),
      ]);
    } catch {}

    const urlAposLogin = page.url();
    const titulo = await page.title().catch(() => "(sem título)");

    console.log("[NFSE] URL após login:", urlAposLogin);
    console.log("[NFSE] Título após login:", titulo);

    if (urlAposLogin.includes("/Login")) {
      pushLog(
        "[BOT] (Alerta) Ainda estou na tela de Login. O login pode ter falhado ou exigir alguma ação extra (captcha, seleção, etc.)."
      );
    } else {
      pushLog(
        "[BOT] Login aparentemente BEM-SUCEDIDO (URL diferente da tela de Login)."
      );
    }

    pushLog(
      "[BOT] (MVP) Login tentado. Verifique visualmente se entrou no sistema."
    );

    // 6) Ir para "Notas Emitidas" ou "Notas Recebidas"
    const emitidasUrl =
      process.env.NFSE_EMITIDAS_URL ||
      "https://www.nfse.gov.br/EmissorNacional/Notas/Emitidas";

    const recebidasUrl =
      process.env.NFSE_RECEBIDAS_URL ||
      "https://www.nfse.gov.br/EmissorNacional/Notas/Recebidas";

    const targetUrl = tipoNota === "recebidas" ? recebidasUrl : emitidasUrl;

    try {
      if (tipoNota === "recebidas") {
        pushLog(
          '[BOT] Tentando clicar no ícone "NFS-e Recebidas" na barra superior...'
        );
        await page.click('[title="NFS-e Recebidas"]', { timeout: 8000 });
        try {
          await page.waitForURL("**/Notas/Recebidas", { timeout: 15000 });
        } catch {}
        pushLog("[BOT] Clique em NFS-e Recebidas concluído.");
      } else {
        pushLog(
          '[BOT] Tentando clicar no ícone "NFS-e Emitidas" na barra superior...'
        );
        await page.click('[title="NFS-e Emitidas"]', { timeout: 8000 });
        try {
          await page.waitForURL("**/Notas/Emitidas", { timeout: 15000 });
        } catch {}
        pushLog("[BOT] Clique em NFS-e Emitidas concluído.");
      }

      const urlDepoisClique = page.url();
      pushLog(
        `[BOT] URL após clique no menu de notas: ${urlDepoisClique} (pode continuar /EmissorNacional em alguns casos).`
      );
    } catch (errClick) {
      pushLog(
        "[BOT] Não consegui clicar no ícone do menu de notas. Tentando acessar pela URL direta..."
      );
      try {
        await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 20000 });
        const urlNotas = page.url();
        pushLog(
          `[BOT] Tela de notas aparentemente aberta pela URL direta. URL atual: ${urlNotas}`
        );
      } catch (errUrl) {
        pushLog(
          "[BOT] Não consegui abrir a tela de notas nem pelo clique nem pela URL direta. Verifique as configurações."
        );
        throw errUrl;
      }
    }

    // -----------------------------------------------------------------
    // Tentar aplicar filtro de PERÍODO via campos
    // -----------------------------------------------------------------
    let usarFiltroNaTabela = false;

    if (dataInicial || dataFinal) {
      try {
        const diBr = formatDateBrFromISO(dataInicial);
        const dfBr = formatDateBrFromISO(dataFinal);

        await page.waitForTimeout(500);

        const dataInicialInput =
          (await page.$(
            'input[id*="DataInicio"], input[name*="DataInicio"], input[id*="DataEmissaoInicial"], input[name*="DataEmissaoInicial"]'
          )) ||
          (await page.$(
            'input[id*="DataCompetenciaInicio"], input[name*="DataCompetenciaInicio"]'
          ));

        const dataFinalInput =
          (await page.$(
            'input[id*="DataFim"], input[name*="DataFim"], input[id*="DataEmissaoFinal"], input[name*="DataEmissaoFinal"]'
          )) ||
          (await page.$(
            'input[id*="DataCompetenciaFim"], input[name*="DataCompetenciaFim"]'
          ));

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
              `[BOT] Filtro de período aplicado pelos campos: ${buildPeriodoLabel(
                dataInicial,
                dataFinal
              )}.`
            );
          } else {
            usarFiltroNaTabela = true;
          }
        } else {
          usarFiltroNaTabela = true;
        }
      } catch (err) {
        usarFiltroNaTabela = true;
        pushLog(
          `[BOT] Erro ao tentar aplicar filtro de data pelos campos: ${err.message}. Vou filtrar pela coluna "Emissão".`
        );
      }
    }

    if (usarFiltroNaTabela && (dataInicial || dataFinal)) {
      pushLog(
        "[BOT] Não localizei campos de data no formulário. Vou aplicar o filtro diretamente pela coluna 'Emissão' da tabela."
      );
    }

    // 7) Ver se há tabela ou mensagem “Nenhum registro encontrado”
    const textoPagina = (await page.textContent("body").catch(() => "")) || "";

    if (textoPagina.includes("Nenhum registro encontrado")) {
      pushLog(
        "[BOT] Nenhuma nota encontrada (a tela exibiu 'Nenhum registro encontrado')."
      );
    } else {
      await page.waitForSelector("table tbody tr", { timeout: 10000 });
      const rowHandles = await page.$$("table tbody tr");
      const rowCount = rowHandles.length;

      pushLog(`[BOT] Tabela de notas carregada. Linhas encontradas: ${rowCount}.`);

      const dataInicialDate = dataInicial ? parseIsoToDate(dataInicial) : null;
      const dataFinalDate = dataFinal ? parseIsoToDate(dataFinal) : null;

      if (rowCount === 0) {
        pushLog("[BOT] Aviso: nenhuma nota encontrada na tabela para o período informado.");
      } else {
        if (!baixarXml && !baixarPdf) {
          pushLog("[BOT] Nenhum formato selecionado (XML/PDF). Nada será baixado.");
        } else {
          let linhaIndex = 0;

          for (const row of rowHandles) {
            linhaIndex += 1;

            try {
              const allCells = await row.$$("td");
              const acaoCell =
                allCells.length > 0 ? allCells[allCells.length - 1] : null;

              // -----------------------------------------------------------------
              // Filtro pela coluna "Emissão" (primeira coluna), se datas foram informadas
              // -----------------------------------------------------------------
              if (dataInicialDate || dataFinalDate) {
                const emissaoCell = allCells[0] || null;
                let emissaoTexto = "";

                if (emissaoCell) {
                  emissaoTexto =
                    (await emissaoCell.innerText().catch(() => "")) || "";
                  emissaoTexto = emissaoTexto.trim();
                }

                const emissaoDate = parseBrDateToDate(emissaoTexto);

                if (emissaoDate) {
                  if (
                    (dataInicialDate && emissaoDate < dataInicialDate) ||
                    (dataFinalDate && emissaoDate > dataFinalDate)
                  ) {
                    pushLog(
                      `[BOT] Linha ${linhaIndex}: data de emissão ${emissaoTexto} fora do período selecionado. Ignorando linha.`
                    );
                    continue;
                  }
                }
              }

              if (!acaoCell) {
                pushLog(
                  `[BOT] Linha ${linhaIndex}: não encontrei coluna de ações (última coluna).`
                );
                continue;
              }

              const menuWrapper =
                (await acaoCell.$(".menu-suspenso-tabela")) || acaoCell;

              if (linhaIndex === 1) {
                try {
                  const htmlRaw = await menuWrapper.innerHTML();
                  const htmlShort = htmlRaw
                    .replace(/\s+/g, " ")
                    .trim()
                    .slice(0, 350);
                  pushLog(
                    `[BOT] (Debug) HTML do menu suspenso (linha 1, recortado): ${htmlShort}...`
                  );
                } catch {}
              }

              const trigger = await menuWrapper.$(".icone-trigger");
              if (!trigger) {
                pushLog(
                  `[BOT] Linha ${linhaIndex}: não encontrei o ícone do menu suspenso (.icone-trigger).`
                );
                continue;
              }

              await trigger.click({ force: true });
              await page.waitForTimeout(200);

              const menu =
                (await menuWrapper.$(".menu-content")) ||
                (await menuWrapper.$(".list-group"));
              if (!menu) {
                pushLog(
                  `[BOT] Linha ${linhaIndex}: menu suspenso (.menu-content/.list-group) não encontrado após clique.`
                );
                continue;
              }

              // -------- XML --------
              if (baixarXml) {
                let xmlLink =
                  (await menu.$('a:has-text("Download XML")')) ||
                  (await menu.$('a:has-text("XML")')) ||
                  (await menu.$('a[href*="DownloadXml"]')) ||
                  (await menu.$('a[href*="xml"]'));

                if (xmlLink) {
                  pushLog(
                    `[BOT] Linha ${linhaIndex}: clicando na opção "Download XML"...`
                  );
                  await clickAndCaptureFile({
                    page,
                    element: xmlLink,
                    finalDir: paths.finalDir,
                    tipoNota,
                    pushLog,
                    extPreferida: "xml",
                    arquivoIndexRef,
                    linhaIndex,
                  });
                } else {
                  pushLog(
                    `[BOT] Linha ${linhaIndex}: não encontrei item de menu para XML.`
                  );
                }
              }

              // -------- PDF / DANFS --------
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
                  pushLog(
                    `[BOT] Linha ${linhaIndex}: clicando na opção "Download DANFS-e"/PDF...`
                  );

                  // ✅ nome final do PDF (mesmo padrão emitidas/recebidas + linha + índice)
                  const tipoSlug = tipoNota === "recebidas" ? "recebidas" : "emitidas";
                  const destinoPdfPreview = `${tipoSlug}-linha${linhaIndex}-${
                    arquivoIndexRef.value + 1
                  }.pdf`;
                  const destinoPdf = path.join(paths.finalDir, destinoPdfPreview);

                  try {
                    const ok = await baixarPdfRobusto({
                      context,
                      page,
                      destinoPdf,
                      log: (m) => pushLog(m),
                      pdfLinkHandle: pdfLink,
                      clickPdfOption: async () => {
                        // clique robusto (evita not visible + dispara corretamente)
                        await safeClickHandle(pdfLink);
                      },
                    });

                    if (ok) {
                      // só conta o arquivo se realmente salvou
                      arquivoIndexRef.value += 1;
                      pushLog(
                        `[BOT] PDF registrado como arquivo #${arquivoIndexRef.value}.`
                      );
                    }
                  } catch (e) {
                    pushLog(
                      `[BOT] Erro ao clicar/capturar PDF na linha ${linhaIndex}: ${e.message}`
                    );
                  }
                } else {
                  pushLog(
                    `[BOT] Linha ${linhaIndex}: não encontrei item de menu para PDF/DANFS-e.`
                  );
                }
              }

              await page.waitForTimeout(150);
            } catch (linhaErr) {
              pushLog(
                `[BOT] Erro inesperado ao processar a linha ${linhaIndex}: ${linhaErr.message}`
              );
            }
          }
        }
      }
    }

    pushLog(
      `[BOT] Processo de download finalizado. Total de arquivos capturados nesta execução: ${arquivoIndexRef.value}.`
    );
    pushLog(
      "[BOT] (MVP Portal) Login + navegação até tela de notas executados, com captura e organização automática dos arquivos."
    );
  } catch (err) {
    console.error("Erro no robô Playwright (portal nacional):", err);
    pushLog(`[BOT] ERRO durante a execução no portal nacional: ${err.message}`);
    teveErro = true;
  } finally {
    await browser.close();
    pushLog("[BOT] Navegador fechado.");

    try {
      registrarExecucao({
        empresaId: empresaId || null,
        empresaNome: empresaNome || null,
        tipo: modoExecucao || "manual",
        totalArquivos: arquivoIndexRef.value,
        status: teveErro ? "erro" : "sucesso",
        erros: teveErro ? [{ message: "Verificar logs desta execução" }] : null,
        detalhes: `Execução ${
          modoExecucao || "manual"
        } no portal nacional - tipoNota=${tipoNota}, período=${periodoLabel}.`,
      });
    } catch (histErr) {
      console.error("[BOT] Erro ao registrar histórico (portal):", histErr);
    }
  }

  pushLog("[BOT] Fluxo MVP (portal nacional) finalizado.");
  return { logs, paths };
}

// ---------------------------------------------------------------------
// Função usada pelo backend – escolhe modo conforme .env
// ---------------------------------------------------------------------
export async function runManualDownload(params = {}) {
  const usePortal = process.env.NFSE_USE_PORTAL === "true";

  console.log(
    "[NFSE] runManualDownload -> NFSE_USE_PORTAL =",
    process.env.NFSE_USE_PORTAL,
    "=> usePortal:",
    usePortal
  );

  if (usePortal) {
    return runManualDownloadPortal({ ...params, modoExecucao: "manual" });
  }

  return runManualDownloadSimulado({ ...params, modoExecucao: "manual" });
}

// ---------------------------------------------------------------------
// Execução em LOTE (REAL quando NFSE_USE_PORTAL=true)
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
  } = options || {};

  const { logs, pushLog } = createLogger(onLog);
  const usePortal = process.env.NFSE_USE_PORTAL === "true";

  const paths = buildPaths(pastaDestino, tipoNota);
  ensureDir(paths.finalDir);

  pushLog(
    `[BOT] Iniciando execução em lote (${
      usePortal ? "MODO REAL (portal nacional)" : "SIMULAÇÃO"
    })...`
  );

  pushLog(
    `[BOT] Pasta base de downloads: ${paths.baseDir} | Subpasta: ${paths.subDir} | Final: ${paths.finalDir}`
  );

  if (!Array.isArray(empresas) || empresas.length === 0) {
    pushLog("[BOT] Nenhuma empresa cadastrada para executar em lote.");
    return { logs, paths };
  }

  for (const emp of empresas) {
    pushLog("--------------------------------------------------------------");
    pushLog(`[BOT] Processando empresa: ${emp.nome} (CNPJ: ${emp.cnpj})...`);

    if (usePortal) {
      const login = emp.loginPortal || emp.cnpj || null;
      const senha = emp.senhaPortal || null;

      if (!login || !senha) {
        pushLog(
          "[BOT] Login/senha da empresa não configurados. Pulando esta empresa no lote (sem simulação)."
        );
        continue;
      }

      await runManualDownloadPortal({
        dataInicial,
        dataFinal,
        tipoNota,
        baixarXml,
        baixarPdf,
        pastaDestino,
        login,
        senha,
        empresaId: emp.id || emp.cnpj,
        empresaNome: emp.nome,
        modoExecucao: "lote",
        onLog: (msg) => pushLog(msg),
      });
    } else {
      await runManualDownloadSimulado({
        dataInicial,
        dataFinal,
        tipoNota,
        baixarXml,
        baixarPdf,
        pastaDestino,
        empresaId: emp.id || emp.cnpj,
        empresaNome: emp.nome,
        modoExecucao: "lote",
        onLog: (msg) => pushLog(msg),
      });
    }
  }

  pushLog("--------------------------------------------------------------");
  pushLog(
    `[BOT] Execução em lote finalizada com sucesso (${
      usePortal ? "modo REAL / portal" : "simulação"
    }).`
  );

  return { logs, paths };
}
