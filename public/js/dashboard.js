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

// ✅ headers padrão (multi-tenant)
function apiHeaders(extra = {}) {
  const email = (currentUser?.email || "").toString().trim();
  const h = { ...extra };
  if (email) h["x-user-email"] = email;
  return h;
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
// esconder UI de caminho (se existir)
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
// baixar ZIP automaticamente
// ---------------------------
function triggerZipDownload(zipUrl) {
  if (!zipUrl) return;

  const a = document.createElement("a");
  a.href = zipUrl;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---------------------------
// ✅ leitura de "tipos"
// ---------------------------
function getSelectedTipos(prefix = "") {
  const idEmit = `${prefix}TipoEmitidas`;
  const idRec = `${prefix}TipoRecebidas`;
  const idCan = `${prefix}TipoCanceladas`;
  const idAll = `${prefix}TipoTodas`;

  const elEmit = document.getElementById(idEmit);
  const elRec = document.getElementById(idRec);
  const elCan = document.getElementById(idCan);
  const elAll = document.getElementById(idAll);

  const hasNewUI = !!(elEmit || elRec || elCan || elAll);

  if (hasNewUI) {
    if (elAll && elAll.checked) return ["emitidas", "recebidas", "canceladas"];

    const tipos = [];
    if (elEmit && elEmit.checked) tipos.push("emitidas");
    if (elRec && elRec.checked) tipos.push("recebidas");
    if (elCan && elCan.checked) tipos.push("canceladas");

    return tipos.length ? tipos : ["emitidas"];
  }

  const radioName = prefix ? "loteTipoNota" : "tipoNota";
  const tipoNotaRadio = document.querySelector(
    `input[name='${radioName}']:checked`
  );
  const tipoNota = tipoNotaRadio ? tipoNotaRadio.value : "emitidas";

  if (String(tipoNota).toLowerCase() === "todas") {
    return ["emitidas", "recebidas", "canceladas"];
  }

  return [tipoNota];
}

function wireTodasCheckbox(prefix = "") {
  const elAll = document.getElementById(`${prefix}TipoTodas`);
  const elEmit = document.getElementById(`${prefix}TipoEmitidas`);
  const elRec = document.getElementById(`${prefix}TipoRecebidas`);
  const elCan = document.getElementById(`${prefix}TipoCanceladas`);

  if (!elAll || (!elEmit && !elRec && !elCan)) return;

  elAll.addEventListener("change", () => {
    const v = elAll.checked;
    if (elEmit) elEmit.checked = v;
    if (elRec) elRec.checked = v;
    if (elCan) elCan.checked = v;
  });

  const refreshAll = () => {
    const allChecked =
      (!!elEmit ? elEmit.checked : true) &&
      (!!elRec ? elRec.checked : true) &&
      (!!elCan ? elCan.checked : true);

    elAll.checked = allChecked;
  };

  [elEmit, elRec, elCan].filter(Boolean).forEach((el) => {
    el.addEventListener("change", refreshAll);
  });

  refreshAll();
}

wireTodasCheckbox("");
wireTodasCheckbox("lote");

// ---------------------------
// validação/auto-correção de período
// ---------------------------
function parseISODateInput(v) {
  if (!v) return null;
  const parts = String(v).split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d);
}

function maybeSwapPeriodoInUI({ dataInicialId, dataFinalId, logsEl }) {
  const diEl = document.getElementById(dataInicialId);
  const dfEl = document.getElementById(dataFinalId);
  if (!diEl || !dfEl) return;

  const di = parseISODateInput(diEl.value);
  const df = parseISODateInput(dfEl.value);

  if (!di || !df) return;

  if (di.getTime() > df.getTime()) {
    addLog(
      logsEl,
      "[AVISO] Período invertido detectado (Data inicial > Data final). Corrigindo automaticamente (trocando as datas)."
    );
    const tmp = diEl.value;
    diEl.value = dfEl.value;
    dfEl.value = tmp;
  }
}

// ---------------------------
// Helper: pegar config atual de download
// ---------------------------
function getDownloadConfig() {
  const dataInicialEl = document.getElementById("dataInicial");
  const dataFinalEl = document.getElementById("dataFinal");
  const baixarXmlEl = document.getElementById("baixarXml");
  const baixarPdfEl = document.getElementById("baixarPdf");
  const pastaDestinoEl = document.getElementById("pastaDestino");

  const manualLoginEl = document.getElementById("manualLoginPortal");
  const manualSenhaEl = document.getElementById("manualSenhaPortal");

  const processarTipos = getSelectedTipos("");

  const tipoNota = processarTipos[0] || "emitidas";

  return {
    dataInicial: dataInicialEl ? dataInicialEl.value || null : null,
    dataFinal: dataFinalEl ? dataFinalEl.value || null : null,

    tipoNota,
    processarTipos,

    baixarXml: !!(baixarXmlEl && baixarXmlEl.checked),
    baixarPdf: !!(baixarPdfEl && baixarPdfEl.checked),

    pastaDestino:
      pastaDestinoEl && pastaDestinoEl.value ? pastaDestinoEl.value : "downloads",
    login:
      manualLoginEl && manualLoginEl.value.trim()
        ? manualLoginEl.value.trim()
        : null,
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

const loteBaixarXmlEl = document.getElementById("loteBaixarXml");
const loteBaixarPdfEl = document.getElementById("loteBaixarPdf");

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

window.addEventListener("DOMContentLoaded", () => {
  if (dataInicialEl && loteDataInicialEl) {
    loteDataInicialEl.value = dataInicialEl.value;
  }
  if (dataFinalEl && loteDataFinalEl) {
    loteDataFinalEl.value = dataFinalEl.value;
  }

  const mainXml = document.getElementById("baixarXml");
  const mainPdf = document.getElementById("baixarPdf");

  if (mainXml && loteBaixarXmlEl) {
    loteBaixarXmlEl.checked = mainXml.checked;
  }
  if (mainPdf && loteBaixarPdfEl) {
    loteBaixarPdfEl.checked = mainPdf.checked;
  }

  if (pastaDestinoInput && lotePastaDestinoInput) {
    lotePastaDestinoInput.value = pastaDestinoInput.value || "downloads";
  }

  hideServerPathUI();
});

// ---------------------------
// Botões
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

function validatePeriodo(config, logsEl) {
  if (!config.dataInicial || !config.dataFinal) {
    addLog(logsEl, "[ERRO] Data inicial e Data final são obrigatórias.");
    return false;
  }

  if (!config.baixarXml && !config.baixarPdf) {
    addLog(logsEl, "[ERRO] Selecione pelo menos um formato: XML e/ou PDF.");
    return false;
  }

  if (!Array.isArray(config.processarTipos) || config.processarTipos.length === 0) {
    addLog(
      logsEl,
      "[ERRO] Selecione pelo menos um tipo de nota (Emitidas/Recebidas/Canceladas)."
    );
    return false;
  }

  const di = parseISODateInput(config.dataInicial);
  const df = parseISODateInput(config.dataFinal);
  if (di && df && di.getTime() > df.getTime()) {
    addLog(logsEl, "[ERRO] Período inválido: Data inicial está maior que Data final.");
    return false;
  }

  return true;
}

const iniciarDownloadBtn = document.getElementById("iniciarDownloadBtn");
if (iniciarDownloadBtn) {
  iniciarDownloadBtn.addEventListener("click", async () => {
    clearLogs(logsDownload);

    maybeSwapPeriodoInUI({
      dataInicialId: "dataInicial",
      dataFinalId: "dataFinal",
      logsEl: logsDownload,
    });

    const config = getDownloadConfig();

    if (!validatePeriodo(config, logsDownload)) return;

    if (!config.login || !config.senha) {
      addLog(
        logsDownload,
        "[ERRO] Informe o CNPJ/Login e a Senha do portal antes de iniciar o download manual."
      );
      return;
    }

    addLog(logsDownload, "[INFO] Enviando requisição para o robô...");

    try {
      const res = await fetch("/api/nf/manual", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        addLog(logsDownload, `[ERRO] Falha na requisição: ${res.status} ${res.statusText}`);
        const txt = await res.text().catch(() => "");
        if (txt) addLog(logsDownload, txt);
        return;
      }

      const data = await res.json();

      if (!data.success) {
        addLog(logsDownload, "[ERRO] O robô não conseguiu concluir.");
        if (data.error) addLog(logsDownload, `Detalhe: ${data.error}`);
        return;
      }

      if (Array.isArray(data.logs) && data.logs.length > 0) {
        data.logs.forEach((msg) => addLog(logsDownload, msg));
      } else {
        addLog(logsDownload, "[OK] Concluído (sem logs detalhados).");
      }

      if (data.downloadZipUrl) {
        addLog(logsDownload, `[OK] ZIP gerado. Baixando: ${data.downloadZipUrl}`);
        triggerZipDownload(data.downloadZipUrl);
      } else {
        addLog(logsDownload, "[AVISO] Nenhum ZIP retornado.");
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

    maybeSwapPeriodoInUI({
      dataInicialId: "loteDataInicial",
      dataFinalId: "loteDataFinal",
      logsEl: logsLote,
    });

    syncLotePeriodoToMain();
    syncLoteFormatosToMain();

    if (lotePastaDestinoInput && pastaDestinoInput) {
      pastaDestinoInput.value =
        lotePastaDestinoInput.value && lotePastaDestinoInput.value.trim()
          ? lotePastaDestinoInput.value.trim()
          : "downloads";
    }

    const config = getDownloadConfig();

    if (loteBaixarXmlEl) config.baixarXml = !!loteBaixarXmlEl.checked;
    if (loteBaixarPdfEl) config.baixarPdf = !!loteBaixarPdfEl.checked;

    const tiposLote = getSelectedTipos("lote");
    config.processarTipos = tiposLote;
    config.tipoNota = tiposLote[0] || "emitidas";

    if (loteDataInicialEl && loteDataInicialEl.value) config.dataInicial = loteDataInicialEl.value;
    if (loteDataFinalEl && loteDataFinalEl.value) config.dataFinal = loteDataFinalEl.value;

    if (lotePastaDestinoInput && lotePastaDestinoInput.value.trim()) {
      config.pastaDestino = lotePastaDestinoInput.value.trim();
    }

    if (!validatePeriodo(config, logsLote)) return;

    addLog(logsLote, "[INFO] Enviando requisição para execução em lote...");

    try {
      const res = await fetch("/api/nf/lote", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
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
        addLog(logsLote, "[ERRO] O robô não conseguiu concluir o lote.");
        if (data.error) addLog(logsLote, `Detalhe: ${data.error}`);
        return;
      }

      if (Array.isArray(data.logs) && data.logs.length > 0) {
        data.logs.forEach((msg) => addLog(logsLote, msg));
      } else {
        addLog(logsLote, "[OK] Lote concluído (sem logs detalhados).");
      }

      if (data.downloadZipUrl) {
        addLog(logsLote, `[OK] ZIP do lote gerado. Baixando: ${data.downloadZipUrl}`);
        triggerZipDownload(data.downloadZipUrl);
      } else {
        addLog(logsLote, "[AVISO] Nenhum ZIP retornado.");
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

function normalizeEmpresa(emp) {
  return {
    id: emp?.id ?? emp?.empresaId ?? emp?._id ?? emp?.cnpj ?? "",
    nome: emp?.nome ?? emp?.empresaNome ?? emp?.razaoSocial ?? emp?.fantasia ?? "",
    cnpj: emp?.cnpj ?? emp?.empresaCnpj ?? emp?.documento ?? "",
    raw: emp,
  };
}

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

  empresas.forEach((empRaw) => {
    const emp = normalizeEmpresa(empRaw);

    const tr = document.createElement("tr");
    tr.className = "border-t border-slate-100 hover:bg-sky-50 cursor-pointer";
    tr.dataset.id = String(emp.id || "");

    tr.innerHTML = `
      <td class="px-3 py-2 text-slate-600">${emp.id || "—"}</td>
      <td class="px-3 py-2 text-slate-800">${emp.nome || "—"}</td>
      <td class="px-3 py-2 text-slate-600">${emp.cnpj || "—"}</td>
    `;

    empresasTableBody.appendChild(tr);
  });
}

// ✅ Delegação de evento: seleção sempre funciona (mesmo após re-render)
// ✅ Patch: ignora clique em linha sem dataset.id
if (empresasTableBody && empresasTableBody.dataset._bound !== "1") {
  empresasTableBody.dataset._bound = "1";
  empresasTableBody.addEventListener("click", (ev) => {
    const tr = ev.target.closest("tr");
    if (!tr || !empresasTableBody.contains(tr)) return;

    const id = (tr.dataset.id || "").trim();
    if (!id || id === "—") return;

    empresaSelecionadaId = id;

    Array.from(empresasTableBody.querySelectorAll("tr")).forEach((row) => {
      row.classList.remove("bg-sky-100");
    });

    tr.classList.add("bg-sky-100");
    if (removerEmpresaBtn) removerEmpresaBtn.disabled = false;
  });
}

async function loadEmpresasFromAPI() {
  if (!empresasTableBody) return;

  try {
    const res = await fetch("/api/empresas", {
      headers: apiHeaders(),
    });

    if (!res.ok) {
      console.error("Erro ao carregar empresas:", res.status, res.statusText);
      return;
    }

    const data = await res.json();
    const list = Array.isArray(data) ? data : Array.isArray(data?.empresas) ? data.empresas : [];

    empresas = list;
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
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ nome, cnpj, senhaPortal }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        if (feedback) {
          feedback.textContent = "Erro ao salvar empresa no servidor.";
          feedback.classList.remove("hidden");
          feedback.classList.remove("text-emerald-600");
          feedback.classList.add("text-rose-600");
        }
        console.error("Salvar empresa falhou:", res.status, res.statusText, txt);
        return;
      }

      const json = await res.json().catch(() => ({}));
      const empresaCriada = (json && json.empresa) ? json.empresa : json;

      // ✅ Patch: se não vier id, recarrega do backend (evita UI quebrar)
      if (!empresaCriada || empresaCriada.id == null) {
        await loadEmpresasFromAPI();
      } else {
        empresas.push(empresaCriada);
        renderEmpresas();
      }

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
    if (!empresaSelecionadaId) {
      // ✅ Patch: feedback claro
      addLog(logsLote, "[AVISO] Selecione uma empresa na tabela antes de remover.");
      return;
    }

    // opcional: confirmação (se você não quiser, pode remover esse bloco)
    if (!confirm("Deseja remover a empresa selecionada?")) return;

    try {
      const res = await fetch(`/api/empresas/${encodeURIComponent(empresaSelecionadaId)}`, {
        method: "DELETE",
        headers: apiHeaders(),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("Erro ao remover empresa:", res.status, res.statusText, txt);
        addLog(
          logsLote,
          `[ERRO] Falha ao remover (HTTP ${res.status}). Pode ser empresa de outro usuário (multi-tenant).`
        );
        if (txt) addLog(logsLote, txt);
        return;
      }

      // ✅ Patch: sempre recarrega do backend (garante sincronismo real)
      empresaSelecionadaId = null;
      removerEmpresaBtn.disabled = true;

      await loadEmpresasFromAPI();
      addLog(logsLote, "[OK] Empresa removida com sucesso.");
    } catch (err) {
      console.error("Erro ao remover empresa:", err);
      addLog(logsLote, "[ERRO] Erro inesperado ao remover empresa.");
    }
  });
}
