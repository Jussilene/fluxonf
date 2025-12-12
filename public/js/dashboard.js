// public/js/dashboard.js

// ---------------------------
// Proteção básica + usuário
// ---------------------------
const rawUser = localStorage.getItem("nfseUser");

if (!rawUser) {
  window.location.href = "/index.html";
}

let currentUser = {};

try {
  const parsed = JSON.parse(rawUser);
  if (parsed && typeof parsed === "object") {
    currentUser = parsed;
  } else {
    currentUser = { email: String(rawUser) };
  }
} catch (err) {
  currentUser = { email: String(rawUser) };
}

const userNameDisplay = document.getElementById("userNameDisplay");
const userAvatar = document.getElementById("userAvatar");

let nameToShow =
  currentUser.displayName ||
  (currentUser.email ? currentUser.email.split("@")[0] : "Usuário");

if (userNameDisplay) {
  userNameDisplay.textContent = nameToShow;
}

if (userAvatar) {
  userAvatar.textContent = nameToShow.charAt(0).toUpperCase();
}

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("nfseUser");
    window.location.href = "/index.html";
  });
}

// ---------------------------
// Tema claro/escuro (switch)
// ---------------------------
const themeToggleBtn = document.getElementById("themeToggleBtn");
const themeToggleKnob = document.getElementById("themeToggleKnob");
const themeSunIcon = document.getElementById("themeSunIcon");
const themeMoonIcon = document.getElementById("themeMoonIcon");

function applyThemeUI(isDark) {
  document.body.classList.toggle("dark-mode", isDark);
  localStorage.setItem("nfseTheme", isDark ? "dark" : "light");
  if (themeToggleBtn) themeToggleBtn.setAttribute("aria-checked", String(isDark));

  if (themeToggleKnob) {
    themeToggleKnob.classList.toggle("translate-x-[40px]", isDark);

    themeToggleKnob.classList.toggle("bg-slate-900", isDark);
    themeToggleKnob.classList.toggle("border-slate-700", isDark);

    themeToggleKnob.classList.toggle("bg-white", !isDark);
    themeToggleKnob.classList.toggle("border-slate-200", !isDark);
  }

  if (themeSunIcon) {
    themeSunIcon.classList.toggle("text-slate-700", !isDark);
    themeSunIcon.classList.toggle("text-slate-400", isDark);
  }

  if (themeMoonIcon) {
    themeMoonIcon.classList.toggle("text-slate-400", !isDark);
    themeMoonIcon.classList.toggle("text-slate-200", isDark);
  }
}

// estado inicial pelo localStorage/body
(function initTheme() {
  const savedTheme = localStorage.getItem("nfseTheme") || "light";
  const startDark = savedTheme === "dark";
  applyThemeUI(startDark);
})();

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    const willBeDark = !document.body.classList.contains("dark-mode");
    applyThemeUI(willBeDark);
  });
}

// ---------------------------
// Tabs
// ---------------------------
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

function activateTab(tabName) {
  tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle("border-slate-900", isActive);
    btn.classList.toggle("text-slate-900", isActive);
    btn.classList.toggle("bg-slate-100", isActive);
  });

  tabPanels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `tab-${tabName}`);
  });
}

activateTab("download");

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    activateTab(btn.dataset.tab);
  });
});

// ---------------------------
// Logs helpers
// ---------------------------
const logsDownload = document.getElementById("logsDownload");
const logsLote = document.getElementById("logsLote");

function addLog(element, message) {
  if (!element) return;
  const line = document.createElement("div");
  line.textContent = message;
  element.appendChild(line);
  element.scrollTop = element.scrollHeight;
}

function clearLogs(element) {
  if (!element) return;
  element.innerHTML = "";
}

// ---------------------------
// ✅ AJUSTE: esconder campo/botão de "copiar caminho" (se ainda existir no HTML)
// ---------------------------
function hideServerPathUI() {
  const idsToHide = [
    "serverPathManual",
    "copyServerPathManual",
    "serverPathLote",
    "copyServerPathLote",
  ];

  idsToHide.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;

    el.style.display = "none";

    const maybeContainer =
      el.closest(".flex") ||
      el.closest(".grid") ||
      el.closest(".space-y-2") ||
      el.parentElement;

    if (maybeContainer && maybeContainer !== document.body) {
      maybeContainer.style.display = "none";
    }
  });
}

hideServerPathUI();

// ---------------------------
// ✅ NOVO: baixar ZIP automaticamente quando o backend retornar downloadZipUrl
// ---------------------------
function triggerZipDownload(zipUrl) {
  if (!zipUrl) return;

  const a = document.createElement("a");
  a.href = zipUrl;
  a.download = ""; // deixa o navegador decidir o nome do arquivo
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---------------------------
// Helper: pegar config atual de download (bloco principal)
// ---------------------------
function getDownloadConfig() {
  const dataInicialEl = document.getElementById("dataInicial");
  const dataFinalEl = document.getElementById("dataFinal");
  const baixarXmlEl = document.getElementById("baixarXml");
  const baixarPdfEl = document.getElementById("baixarPdf");
  const pastaDestinoEl = document.getElementById("pastaDestino");

  const manualLoginEl = document.getElementById("manualLoginPortal");
  const manualSenhaEl = document.getElementById("manualSenhaPortal");

  const tipoNotaRadio = document.querySelector("input[name='tipoNota']:checked");
  const tipoNota = tipoNotaRadio ? tipoNotaRadio.value : "emitidas";

  return {
    dataInicial: dataInicialEl ? dataInicialEl.value || null : null,
    dataFinal: dataFinalEl ? dataFinalEl.value || null : null,
    tipoNota,
    baixarXml: !!(baixarXmlEl && baixarXmlEl.checked),
    baixarPdf: !!(baixarPdfEl && baixarPdfEl.checked),
    pastaDestino:
      pastaDestinoEl && pastaDestinoEl.value ? pastaDestinoEl.value : "downloads",
    login: manualLoginEl && manualLoginEl.value.trim() ? manualLoginEl.value.trim() : null,
    senha: manualSenhaEl && manualSenhaEl.value ? manualSenhaEl.value : null,
  };
}

// ---------------------------
// Sincronizar campos do LOTE -> blocos principais
// ---------------------------
const loteDataInicialEl = document.getElementById("loteDataInicial");
const loteDataFinalEl = document.getElementById("loteDataFinal");
const dataInicialEl = document.getElementById("dataInicial");
const dataFinalEl = document.getElementById("dataFinal");

// flags de formatos no lote
const loteBaixarXmlEl = document.getElementById("loteBaixarXml");
const loteBaixarPdfEl = document.getElementById("loteBaixarPdf");

// pasta destino (manual + lote)
const pastaDestinoInput = document.getElementById("pastaDestino");
const lotePastaDestinoInput = document.getElementById("lotePastaDestino");
const loteSelecionarPastaBtn = document.getElementById("loteSelecionarPastaBtn");

function syncLotePeriodoToMain() {
  if (loteDataInicialEl && dataInicialEl) {
    dataInicialEl.value = loteDataInicialEl.value;
  }
  if (loteDataFinalEl && dataFinalEl) {
    dataFinalEl.value = loteDataFinalEl.value;
  }
}

// sincronizar XML/PDF do lote para o bloco principal
function syncLoteFormatosToMain() {
  const mainXml = document.getElementById("baixarXml");
  const mainPdf = document.getElementById("baixarPdf");

  if (loteBaixarXmlEl && mainXml) {
    mainXml.checked = loteBaixarXmlEl.checked;
  }
  if (loteBaixarPdfEl && mainPdf) {
    mainPdf.checked = loteBaixarPdfEl.checked;
  }
}

if (loteDataInicialEl) {
  loteDataInicialEl.addEventListener("change", syncLotePeriodoToMain);
}
if (loteDataFinalEl) {
  loteDataFinalEl.addEventListener("change", syncLotePeriodoToMain);
}

if (loteBaixarXmlEl) {
  loteBaixarXmlEl.addEventListener("change", syncLoteFormatosToMain);
}
if (loteBaixarPdfEl) {
  loteBaixarPdfEl.addEventListener("change", syncLoteFormatosToMain);
}

// Sincronizar tipo de nota do lote com o tipo de nota principal
const loteTipoRadios = document.querySelectorAll("input[name='loteTipoNota']");
const tipoNotaRadios = document.querySelectorAll("input[name='tipoNota']");

function syncLoteTipoToMain() {
  let loteTipo = "emitidas";
  loteTipoRadios.forEach((r) => {
    if (r.checked) loteTipo = r.value;
  });

  tipoNotaRadios.forEach((r) => {
    r.checked = r.value === loteTipo;
  });
}

loteTipoRadios.forEach((r) => {
  r.addEventListener("change", syncLoteTipoToMain);
});

window.addEventListener("DOMContentLoaded", () => {
  if (dataInicialEl && loteDataInicialEl) {
    loteDataInicialEl.value = dataInicialEl.value;
  }
  if (dataFinalEl && loteDataFinalEl) {
    loteDataFinalEl.value = dataFinalEl.value;
  }

  if (tipoNotaRadios.length && loteTipoRadios.length) {
    let mainTipo = "emitidas";
    tipoNotaRadios.forEach((r) => {
      if (r.checked) mainTipo = r.value;
    });
    loteTipoRadios.forEach((r) => {
      r.checked = r.value === mainTipo;
    });
  }

  // XML/PDF do lote começam iguais ao manual
  const mainXml = document.getElementById("baixarXml");
  const mainPdf = document.getElementById("baixarPdf");

  if (mainXml && loteBaixarXmlEl) {
    loteBaixarXmlEl.checked = mainXml.checked;
  }
  if (mainPdf && loteBaixarPdfEl) {
    loteBaixarPdfEl.checked = mainPdf.checked;
  }

  // Pasta do lote começa igual à pasta do manual
  if (pastaDestinoInput && lotePastaDestinoInput) {
    lotePastaDestinoInput.value = pastaDestinoInput.value || "downloads";
  }

  hideServerPathUI();
});

// ---------------------------
// Botões (abrir navegador / pasta / download / lote)
// ---------------------------
const abrirNavegadorBtn = document.getElementById("abrirNavegadorBtn");
if (abrirNavegadorBtn) {
  abrirNavegadorBtn.addEventListener("click", () => {
    const portalUrl =
      "https://www.nfse.gov.br/EmissorNacional/Login?ReturnUrl=%2FEmissorNacional";
    window.open(portalUrl, "_blank", "noopener");

    clearLogs(logsDownload);
    addLog(
      logsDownload,
      "[INFO] Portal da NFS-e aberto em uma nova aba. Faça o login e acompanhe o robô."
    );
  });
}

const selecionarPastaBtn = document.getElementById("selecionarPastaBtn");

if (selecionarPastaBtn && pastaDestinoInput) {
  selecionarPastaBtn.addEventListener("click", () => {
    const atual = pastaDestinoInput.value || "downloads";
    const resposta = window.prompt(
      "Informe o nome da pasta de destino no servidor (ex: downloads):",
      atual
    );
    if (resposta && resposta.trim()) {
      pastaDestinoInput.value = resposta.trim();
      if (lotePastaDestinoInput) {
        lotePastaDestinoInput.value = resposta.trim();
      }
    }
  });
}

// Selecionar pasta específica do lote
if (loteSelecionarPastaBtn && lotePastaDestinoInput) {
  loteSelecionarPastaBtn.addEventListener("click", () => {
    const atual =
      lotePastaDestinoInput.value ||
      (pastaDestinoInput ? pastaDestinoInput.value : "downloads") ||
      "downloads";
    const resposta = window.prompt(
      "Informe o nome da pasta de destino no servidor para o LOTE (ex: downloads):",
      atual
    );
    if (resposta && resposta.trim()) {
      lotePastaDestinoInput.value = resposta.trim();
    }
  });
}

const iniciarDownloadBtn = document.getElementById("iniciarDownloadBtn");
if (iniciarDownloadBtn) {
  iniciarDownloadBtn.addEventListener("click", async () => {
    clearLogs(logsDownload);

    const config = getDownloadConfig();

    if (!config.login || !config.senha) {
      addLog(
        logsDownload,
        "[ERRO] Informe o CNPJ/Login e a Senha do portal antes de iniciar o download manual."
      );
      return;
    }

    addLog(logsDownload, "[INFO] Enviando requisição para o robô de download de NFS-e...");

    try {
      const res = await fetch("/api/nf/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        addLog(logsDownload, `[ERRO] Falha na requisição: ${res.status} ${res.statusText}`);
        return;
      }

      const data = await res.json();

      if (!data.success) {
        addLog(logsDownload, "[ERRO] O robô não conseguiu concluir o download.");
        if (data.error) addLog(logsDownload, `Detalhe: ${data.error}`);
        return;
      }

      if (Array.isArray(data.logs) && data.logs.length > 0) {
        data.logs.forEach((msg) => addLog(logsDownload, msg));
      } else {
        addLog(logsDownload, "[OK] Download concluído. (Sem logs detalhados retornados.)");
      }

      // ✅ baixar ZIP se o backend retornar
      if (data.downloadZipUrl) {
        addLog(logsDownload, `[OK] ZIP gerado. Baixando: ${data.downloadZipUrl}`);
        triggerZipDownload(data.downloadZipUrl);
      } else {
        addLog(logsDownload, "[AVISO] Nenhum ZIP retornado pelo servidor (pode não ter encontrado pasta final).");
      }

      hideServerPathUI();
    } catch (err) {
      console.error(err);
      addLog(logsDownload, "[ERRO] Erro inesperado ao comunicar com o servidor.");
    }
  });
}

const baixarTudoBtn = document.getElementById("baixarTudoBtn");
if (baixarTudoBtn) {
  baixarTudoBtn.addEventListener("click", async () => {
    clearLogs(logsLote);

    syncLotePeriodoToMain();
    syncLoteTipoToMain();
    syncLoteFormatosToMain();

    if (lotePastaDestinoInput && pastaDestinoInput) {
      pastaDestinoInput.value =
        lotePastaDestinoInput.value && lotePastaDestinoInput.value.trim()
          ? lotePastaDestinoInput.value.trim()
          : "downloads";
    }

    const config = getDownloadConfig();

    addLog(logsLote, "[INFO] Enviando requisição para execução em lote (todas as empresas)...");

    try {
      const res = await fetch("/api/nf/lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        addLog(logsLote, `[ERRO] Falha na requisição: ${res.status} ${res.statusText}`);
        if (txt) addLog(logsLote, `Detalhe: ${txt}`);
        return;
      }

      const data = await res.json();

      if (!data.success) {
        addLog(logsLote, "[ERRO] O robô não conseguiu concluir a execução em lote.");
        if (data.error) addLog(logsLote, `Detalhe: ${data.error}`);
        return;
      }

      if (Array.isArray(data.logs) && data.logs.length > 0) {
        data.logs.forEach((msg) => addLog(logsLote, msg));
      } else {
        addLog(logsLote, "[OK] Execução em lote concluída. (Sem logs detalhados retornados.)");
      }

      // ✅ baixar ZIP se o backend retornar
      if (data.downloadZipUrl) {
        addLog(logsLote, `[OK] ZIP do lote gerado. Baixando: ${data.downloadZipUrl}`);
        triggerZipDownload(data.downloadZipUrl);
      } else {
        addLog(logsLote, "[AVISO] Nenhum ZIP retornado pelo servidor (pode não ter encontrado pasta final).");
      }

      hideServerPathUI();
    } catch (err) {
      console.error(err);
      addLog(logsLote, "[ERRO] Erro inesperado ao comunicar com o servidor.");
    }
  });
}

// ---------------------------
// Empresas (vindas da API)
// ---------------------------
const empresasTableBody = document.getElementById("empresasTableBody");
const removerEmpresaBtn = document.getElementById("removerEmpresaBtn");

let empresas = [];
let empresaSelecionadaId = null;

function renderEmpresas() {
  if (!empresasTableBody) return;

  empresasTableBody.innerHTML = "";

  if (empresas.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.className = "px-3 py-3 text-center text-sm text-slate-400";
    td.textContent = "Nenhuma empresa cadastrada.";
    tr.appendChild(td);
    empresasTableBody.appendChild(tr);
    empresaSelecionadaId = null;
    if (removerEmpresaBtn) removerEmpresaBtn.disabled = true;
    return;
  }

  empresas.forEach((emp) => {
    const tr = document.createElement("tr");
    tr.className = "border-t border-slate-100 hover:bg-sky-50 cursor-pointer";
    tr.dataset.id = emp.id;

    tr.innerHTML = `
      <td class="px-3 py-2 text-slate-600">${emp.id}</td>
      <td class="px-3 py-2 text-slate-800">${emp.nome}</td>
      <td class="px-3 py-2 text-slate-600">${emp.cnpj}</td>
    `;

    tr.addEventListener("click", () => {
      empresaSelecionadaId = emp.id;
      Array.from(empresasTableBody.children).forEach((row) => {
        row.classList.remove("bg-sky-100");
      });
      tr.classList.add("bg-sky-100");
      if (removerEmpresaBtn) removerEmpresaBtn.disabled = false;
    });

    empresasTableBody.appendChild(tr);
  });
}

async function loadEmpresasFromAPI() {
  if (!empresasTableBody) return;

  try {
    const res = await fetch("/api/empresas");
    if (!res.ok) {
      console.error("Erro ao carregar empresas:", res.status, res.statusText);
      return;
    }

    const data = await res.json();
    empresas = Array.isArray(data) ? data : [];
    empresaSelecionadaId = null;
    if (removerEmpresaBtn) removerEmpresaBtn.disabled = true;
    renderEmpresas();
  } catch (err) {
    console.error("Erro ao carregar empresas:", err);
  }
}

loadEmpresasFromAPI();

const salvarEmpresaBtn = document.getElementById("salvarEmpresaBtn");
if (salvarEmpresaBtn) {
  salvarEmpresaBtn.addEventListener("click", async () => {
    const nome = document.getElementById("nomeEmpresa").value.trim();
    const cnpj = document.getElementById("cnpjEmpresa").value.trim();
    const senhaPortalEl = document.getElementById("senhaPortal");
    const senhaPortal = senhaPortalEl ? senhaPortalEl.value.trim() : "";
    const feedback = document.getElementById("feedbackEmpresa");

    if (!nome || !cnpj) {
      if (feedback) {
        feedback.textContent = "Preencha nome e CNPJ para salvar.";
        feedback.classList.remove("hidden");
        feedback.classList.remove("text-emerald-600");
        feedback.classList.add("text-rose-600");
      }
      return;
    }

    try {
      const res = await fetch("/api/empresas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, cnpj, senhaPortal }),
      });

      if (!res.ok) {
        if (feedback) {
          feedback.textContent = "Erro ao salvar empresa no servidor.";
          feedback.classList.remove("hidden");
          feedback.classList.remove("text-emerald-600");
          feedback.classList.add("text-rose-600");
        }
        return;
      }

      const novaEmpresa = await res.json();
      empresas.push(novaEmpresa);
      renderEmpresas();

      document.getElementById("nomeEmpresa").value = "";
      document.getElementById("cnpjEmpresa").value = "";
      if (senhaPortalEl) senhaPortalEl.value = "";

      if (feedback) {
        feedback.textContent = "Empresa salva com sucesso (armazenada no backend).";
        feedback.classList.remove("hidden");
        feedback.classList.remove("text-rose-600");
        feedback.classList.add("text-emerald-600");
      }
    } catch (err) {
      console.error("Erro ao salvar empresa:", err);
      if (feedback) {
        feedback.textContent = "Erro inesperado ao comunicar com o servidor.";
        feedback.classList.remove("hidden");
        feedback.classList.remove("text-emerald-600");
        feedback.classList.add("text-rose-600");
      }
    }
  });
}

if (removerEmpresaBtn) {
  removerEmpresaBtn.addEventListener("click", async () => {
    if (!empresaSelecionadaId) return;

    try {
      const res = await fetch(`/api/empresas/${empresaSelecionadaId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        console.error("Erro ao remover empresa:", res.status, res.statusText);
        return;
      }

      empresas = empresas.filter((e) => e.id !== empresaSelecionadaId);
      empresaSelecionadaId = null;
      removerEmpresaBtn.disabled = true;
      renderEmpresas();
    } catch (err) {
      console.error("Erro ao remover empresa:", err);
    }
  });
}
