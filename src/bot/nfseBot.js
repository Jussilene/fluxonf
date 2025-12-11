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
// Helper para lançar o navegador (ajustado para servidor Linux)
// ---------------------------------------------------------------------
const isLinux = process.platform === "linux";

// Sempre lançar o navegador do robô com as opções certas
async function launchNFSEBrowser() {
  return await chromium.launch({
    // no servidor (Linux) SEMPRE em headless
    headless: isLinux ? true : false,
    // no servidor: rápido (0) | no Windows: devagar para visualização
    slowMo: isLinux ? 0 : 150,
    args: isLinux
      ? [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ]
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
    modoExecucao, // "manual" | "lote"
  } = params;

  const periodoLabel = buildPeriodoLabel(dataInicial, dataFinal);

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

  pushLog("[BOT] (Simulação) Abrindo navegador automatizado...");
  pushLog("[BOT] (Simulação) Acessando portal da NFS-e...");
  pushLog("[BOT] (Simulação) Aplicando filtros de data e tipo de nota...");
  if (baixarXml) pushLog("[BOT] (Simulação) Baixando arquivos XML...");
  if (baixarPdf) pushLog("[BOT] (Simulação) Baixando arquivos PDF...");
  pushLog("[BOT] (Simulação) Organizando arquivos nas pastas Entrada/Saída...");
  pushLog("[BOT] Download manual concluído com sucesso (simulação).");

  // registra histórico também no modo simulado
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

  return logs;
}

// ---------------------------------------------------------------------
// Helper: clicar e capturar arquivo usando evento de download do Playwright
// ---------------------------------------------------------------------
async function clickAndCaptureFile({
  page,
  element,
  finalDir,
  tipoNota,
  pushLog,
  extPreferida, // "pdf" | "xml" | null
  arquivoIndexRef, // { value: number }
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

    const tempPath = await download.path();
    if (!tempPath) {
      pushLog(
        `[BOT] Aviso: Playwright não retornou caminho de arquivo para o download da linha ${linhaIndex}.`
      );
      return false;
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

    fs.copyFileSync(tempPath, savePath);

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
    modoExecucao, // "manual" | "lote"
  } = params;

  const periodoLabel = buildPeriodoLabel(dataInicial, dataFinal);

  // prioridade: 1) credenciais passadas no params  2) fallback para .env
  const login = loginParam || process.env.NFSE_USER;
  const senha = senhaParam || process.env.NFSE_PASSWORD;

  if (!login || !senha) {
    pushLog(
      "[BOT] Login/senha não informados para esta execução. Voltando para modo SIMULAÇÃO."
    );
    const simLogs = await runManualDownloadSimulado({
      ...params,
      modoExecucao,
      onLog,
    });
    return logs.concat(simLogs);
  }

  // ------------------------------------------------------
  // Pastas de destino (Entrada / Saida)
  // ------------------------------------------------------
  const baseDir = path.resolve(process.cwd(), pastaDestino || "downloads");
  const subDir = tipoNota === "recebidas" ? "Entrada" : "Saida";
  const finalDir = path.join(baseDir, subDir);
  ensureDir(finalDir);

  pushLog(
    `[BOT] Pasta base de downloads: ${baseDir} | Subpasta: ${subDir} | Final: ${finalDir}`
  );

  // *** AQUI usamos o helper para lançar o navegador ***
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
    await page.goto(NFSE_PORTAL_URL, {
      waitUntil: "domcontentloaded",
    });
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
        await page.goto(targetUrl, {
          waitUntil: "networkidle",
          timeout: 20000,
        });
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

        await page.waitForTimeout(500); // antes 1000

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
          if (dataInicialInput && diBr) {
            await dataInicialInput.fill(diBr);
          }
          if (dataFinalInput && dfBr) {
            await dataFinalInput.fill(dfBr);
          }

          const botaoPesquisar =
            (await page.$(
              'button[type="submit"]:has-text("Pesquisar"), button:has-text("Consultar"), button:has-text("Buscar")'
            )) ||
            (await page.$(
              'input[type="submit"][value*="Pesquisar"], input[type="submit"][value*="Consultar"], input[type="submit"][value*="Buscar"]'
            ));

          if (botaoPesquisar) {
            await botaoPesquisar.click();
            await page.waitForTimeout(1500); // antes 3000
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
    const textoPagina =
      (await page.textContent("body").catch(() => "")) || "";

    if (textoPagina.includes("Nenhum registro encontrado")) {
      pushLog(
        "[BOT] Nenhuma nota encontrada (a tela exibiu 'Nenhum registro encontrado')."
      );
    } else {
      await page.waitForSelector("table tbody tr", { timeout: 10000 });
      const rowHandles = await page.$$("table tbody tr");
      const rowCount = rowHandles.length;

      pushLog(
        `[BOT] Tabela de notas carregada. Linhas encontradas: ${rowCount}.`
      );

      const dataInicialDate = dataInicial ? parseIsoToDate(dataInicial) : null;
      const dataFinalDate = dataFinal ? parseIsoToDate(dataFinal) : null;

      if (rowCount === 0) {
        pushLog(
          "[BOT] Aviso: nenhuma nota encontrada na tabela para o período informado."
        );
      } else {
        if (!baixarXml && !baixarPdf) {
          pushLog(
            "[BOT] Nenhum formato selecionado (XML/PDF). Nada será baixado."
          );
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
              await page.waitForTimeout(200); // antes 400

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
                    finalDir,
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
                  await clickAndCaptureFile({
                    page,
                    element: pdfLink,
                    finalDir,
                    tipoNota,
                    pushLog,
                    extPreferida: "pdf",
                    arquivoIndexRef,
                    linhaIndex,
                  });
                } else {
                  pushLog(
                    `[BOT] Linha ${linhaIndex}: não encontrei item de menu para PDF/DANFS-e.`
                  );
                }
              }

              await page.waitForTimeout(150); // antes 300
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
    pushLog(
      `[BOT] ERRO durante a execução no portal nacional: ${err.message}`
    );
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
  return logs;
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
// Execução em LOTE (agora REAL quando NFSE_USE_PORTAL=true)
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

  pushLog(
    `[BOT] Iniciando execução em lote (${
      usePortal ? "MODO REAL (portal nacional)" : "SIMULAÇÃO"
    })...`
  );

  if (!Array.isArray(empresas) || empresas.length === 0) {
    pushLog("[BOT] Nenhuma empresa cadastrada para executar em lote.");
    return logs;
  }

  for (const emp of empresas) {
    pushLog(
      "--------------------------------------------------------------"
    );
    pushLog(
      `[BOT] Processando empresa: ${emp.nome} (CNPJ: ${emp.cnpj})...`
    );

    if (usePortal) {
      // Aqui o lote só roda REAL se a empresa tiver login/senha configurados
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
        onLog: (msg) => {
          pushLog(msg);
        },
      });
    } else {
      // Modo simulado global
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
        onLog: (msg) => {
          pushLog(msg);
        },
      });
    }
  }

  pushLog(
    "--------------------------------------------------------------"
  );
  pushLog(
    `[BOT] Execução em lote finalizada com sucesso (${
      usePortal ? "modo REAL / portal" : "simulação"
    }).`
  );

  return logs;
}

