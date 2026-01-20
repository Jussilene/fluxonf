// public/js/emissao.js

function $(id) {
  return document.getElementById(id);
}

function log(msg) {
  const box = $("logsEmissao");
  if (!box) return;

  const t = new Date().toLocaleTimeString("pt-BR");

  if (box.dataset._init !== "1") {
    box.textContent = "";
    box.dataset._init = "1";
  }

  box.textContent += `[${t}] ${msg}\n`;
  box.scrollTop = box.scrollHeight;
}

function setCertStatus(msg, isError = false) {
  const el = $("emissaoCertStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "mt-2 text-[11px] " + (isError ? "text-rose-600" : "text-slate-500");
}

function setEmpresaFeedback(msg, isError = false) {
  const el = $("emissaoEmpresaFeedback");
  if (!el) return; // ✅ ajuste: removido "demonstrated;"
  el.textContent = msg || "";
  el.className = "text-[11px] " + (isError ? "text-rose-600" : "text-slate-500");
}

function getUser() {
  const raw = localStorage.getItem("nfseUser");
  if (!raw) return { email: "" };

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : { email: String(raw || "") };
  } catch {
    return { email: String(raw || "") };
  }
}

function normalizeMoney(v) {
  return String(v || "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fileToBase64(file) {
  const buf = await file.arrayBuffer();
  return arrayBufferToBase64(buf);
}

let _empresasCache = [];
let _emissaoBooted = false;

// ✅ AJUSTE ÚNICO: emissão 100% separada — não chama /api/empresas (lote)
async function fetchEmpresas() {
  try {
    const r2 = await fetch("/api/emissao/empresas");
    if (!r2.ok) throw new Error("HTTP " + r2.status);
    const j2 = await r2.json();
    if (j2 && (j2.ok || j2.success)) return j2.empresas || [];
    if (Array.isArray(j2)) return j2;
  } catch {}

  return [];
}

function getEmpresaById(empresaId) {
  if (!empresaId) return null;
  const s = String(empresaId);

  let found = _empresasCache.find((e) => String(e?.id ?? e?.empresaId ?? e?.cnpj ?? "") === s);
  if (found) return found;

  found = _empresasCache.find((e) => String(e?.cnpj ?? "") === s);
  return found || null;
}

function autoFillCredenciaisFromEmpresa(emp) {
  const use = $("emissaoUseCredenciais");
  const loginEl = $("emissaoLoginPortal");
  const senhaEl = $("emissaoSenhaPortal");

  if (!loginEl || !senhaEl) return;

  const shouldUse = use ? !!use.checked : true;
  if (!shouldUse) return;

  const login = (emp?.loginPortal || emp?.cnpj || "").toString().trim();
  const senha = (emp?.senhaPortal || "").toString();

  loginEl.value = loginEl.value?.trim() ? loginEl.value : login;
  senhaEl.value = senhaEl.value?.trim() ? senhaEl.value : senha;
}

function renderEmpresasSelect(selectEl) {
  if (!selectEl) return;

  selectEl.innerHTML = "";

  if (!_empresasCache.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Nenhuma empresa cadastrada";
    selectEl.appendChild(opt);

    const btnRem = $("emissaoRemoverEmpresaBtn");
    if (btnRem) btnRem.disabled = true;

    log("Cadastre uma empresa primeiro na aba Emissão (separada do Lote).");
    return;
  }

  for (const e of _empresasCache) {
    const idVal = e.id ?? e.empresaId ?? e.cnpj ?? "";
    const label = e.nome ?? e.empresaNome ?? e.cnpj ?? String(idVal);
    const opt = document.createElement("option");
    opt.value = idVal;
    opt.textContent = label;
    selectEl.appendChild(opt);
  }

  const btnRem = $("emissaoRemoverEmpresaBtn");
  if (btnRem) btnRem.disabled = false;
}

// ✅ NECESSÁRIO: Cadastrar empresa (Aba Emissão)
async function cadastrarEmpresaEmissao() {
  const nomeEl = $("emissaoNovaEmpresaNome");
  const cnpjEl = $("emissaoNovaEmpresaCnpj");
  const municipioEl = $("emissaoNovaEmpresaMunicipio");

  const nome = (nomeEl?.value || "").trim();
  const cnpj = (cnpjEl?.value || "").trim();
  const municipio = (municipioEl?.value || "").trim();

  if (!nome || !cnpj) {
    setEmpresaFeedback("Nome e CNPJ são obrigatórios.", true);
    return;
  }

  setEmpresaFeedback("Cadastrando empresa...");

  try {
    const r = await fetch("/api/emissao/empresas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, cnpj, municipio }),
    });

    const j = await r.json().catch(() => ({}));
    if (!j.ok) {
      setEmpresaFeedback(j.error || "Falha ao cadastrar empresa.", true);
      return;
    }

    setEmpresaFeedback("Empresa cadastrada com sucesso.");
    if (nomeEl) nomeEl.value = "";
    if (cnpjEl) cnpjEl.value = "";
    if (municipioEl) municipioEl.value = "";

    // recarrega select
    const select = $("emissaoEmpresaSelect");
    const empresas = await fetchEmpresas();
    _empresasCache = Array.isArray(empresas) ? empresas : [];
    renderEmpresasSelect(select);

    // seleciona a última cadastrada se backend retornar id
    if (select && j.empresa?.id != null) {
      select.value = String(j.empresa.id);
    } else if (select && _empresasCache.length) {
      // fallback: selecion allow last
      const last = _empresasCache[_empresasCache.length - 1];
      const idVal = last.id ?? last.empresaId ?? last.cnpj ?? "";
      if (idVal) select.value = String(idVal);
    }

    log("Empresa (Emissão) cadastrada.");
  } catch {
    setEmpresaFeedback("Erro inesperado ao cadastrar empresa.", true);
  }
}

// ✅ NECESSÁRIO: Remover empresa (Aba Emissão)
async function removerEmpresaEmissao() {
  const select = $("emissaoEmpresaSelect");
  const btnRem = $("emissaoRemoverEmpresaBtn");
  if (!select || !select.value) return;

  const empresaId = select.value;

  if (!confirm("Deseja remover esta empresa da Aba Emissão?")) return;

  if (btnRem) btnRem.disabled = true;
  setEmpresaFeedback("Removendo empresa...");

  try {
    const r = await fetch(`/api/emissao/empresas/${encodeURIComponent(empresaId)}`, {
      method: "DELETE",
    });

    const j = await r.json().catch(() => ({}));
    if (j.ok === false) {
      setEmpresaFeedback(j.error || "Falha ao remover empresa.", true);
      if (btnRem) btnRem.disabled = false;
      return;
    }

    setEmpresaFeedback("Empresa removida.");
    log("Empresa (Emissão) removida.");

    const empresas = await fetchEmpresas();
    _empresasCache = Array.isArray(empresas) ? empresas : [];
    renderEmpresasSelect(select);

    if (btnRem) btnRem.disabled = !_empresasCache.length;
  } catch {
    setEmpresaFeedback("Erro inesperado ao remover empresa.", true);
    if (btnRem) btnRem.disabled = false;
  }
}

async function listar(userEmail, empresaId) {
  try {
    const url =
      `/api/emissao/listar?usuarioEmail=${encodeURIComponent(userEmail)}` +
      `&empresaId=${encodeURIComponent(empresaId || "")}`;

    const r = await fetch(url);
    if (!r.ok) return;

    const j = await r.json();
    if (!j.ok) return;

    const list = $("emissaoLista");
    if (!list) return;

    list.innerHTML = "";

    for (const n of j.notas || []) {
      const div = document.createElement("div");
      div.style.cssText = "padding:10px;border:1px solid #e6e6e6;border-radius:10px;margin-bottom:8px;";

      const chave = n.chaveAcesso ? ` • Chave ${n.chaveAcesso}` : "";
      const prov = n.provider ? ` • ${String(n.provider).toUpperCase()}` : "";

      div.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;">
          <strong>${String(n.status || "").toUpperCase()} ${n.numeroNota ? "• Nº " + n.numeroNota : ""}${prov}</strong>
          <span style="opacity:.7;">${n.createdAt || ""}</span>
        </div>
        <div style="opacity:.85;margin-top:6px;">
          Tomador: ${n.tomadorNome || ""} (${n.tomadorDocumento || ""}) • R$ ${Number(n.valorServico || 0).toFixed(2)}${chave}
        </div>
        <div style="opacity:.7;margin-top:6px;">${n.mensagem || ""}</div>
      `;
      list.appendChild(div);
    }
  } catch {}
}

function readOptionalValue(id) {
  const el = $(id);
  if (!el) return "";
  const v = (el.value ?? "").toString().trim();
  return v;
}

// ✅ map rápido para ajudar a enviar municipioIbge sem mexer no HTML
function resolveMunicipioIbge(municipioNome) {
  const n = String(municipioNome || "").trim().toLowerCase();
  const map = {
    curitiba: "4106902",
    "sao paulo": "3550308",
    "são paulo": "3550308",
    araguaina: "1702109",
    "araguaína": "1702109",
  };
  return map[n] || "";
}

function isEmissaoTabAvailable() {
  const panel = $("tab-emissao");
  const btnEmitir = $("emitirNfseBtn");
  const select = $("emissaoEmpresaSelect");
  const btnSalvarSessao = $("salvarSessaoEmissaoBtn");
  return !!(panel && btnEmitir && select && btnSalvarSessao);
}

async function initEmissao() {
  if (!isEmissaoTabAvailable()) return false;
  if (_emissaoBooted) return true;

  const user = getUser();

  const select = $("emissaoEmpresaSelect");
  const btnAbrirPortal = $("abrirPortalEmissaoBtn");
  const btnSalvarSessao = $("salvarSessaoEmissaoBtn");
  const btnEmitir = $("emitirNfseBtn");

  const btnSalvarPfx = $("salvarCertPfxBtn");
  const pfxFileEl = $("emissaoCertPfxFile");
  const pfxPassEl = $("emissaoCertPfxPass");

  const btnAddEmpresa = $("emissaoAddEmpresaBtn");
  const btnRemEmpresa = $("emissaoRemoverEmpresaBtn");

  const useCred = $("emissaoUseCredenciais");
  const loginEl = $("emissaoLoginPortal");
  const senhaEl = $("emissaoSenhaPortal");
  const debugEl = $("emissaoDebugHeadlessOff");
  const autoSaveEl = $("emissaoAutoSaveSessao");

  if (!select || !btnSalvarSessao || !btnEmitir) return false;

  _emissaoBooted = true;

  // ✅ bind cadastrar/remover (necessário pro card novo funcionar)
  if (btnAddEmpresa && btnAddEmpresa.dataset._bound !== "1") {
    btnAddEmpresa.dataset._bound = "1";
    btnAddEmpresa.addEventListener("click", cadastrarEmpresaEmissao);
  }
  if (btnRemEmpresa && btnRemEmpresa.dataset._bound !== "1") {
    btnRemEmpresa.dataset._bound = "1";
    btnRemEmpresa.addEventListener("click", removerEmpresaEmissao);
  }

  if (btnAbrirPortal && btnAbrirPortal.dataset._bound !== "1") {
    btnAbrirPortal.dataset._bound = "1";
    btnAbrirPortal.addEventListener("click", () => {
      window.open("https://www.nfse.gov.br/EmissorNacional", "_blank", "noopener,noreferrer");
      log("Abrindo portal NFS-e em nova aba...");
    });
  }

  try {
    const empresas = await fetchEmpresas();
    _empresasCache = Array.isArray(empresas) ? empresas : [];

    renderEmpresasSelect(select);

    if (_empresasCache.length) {
      log(`Empresas carregadas: ${_empresasCache.length}`);

      const firstId = select.value;
      const emp = getEmpresaById(firstId);
      if (emp) autoFillCredenciaisFromEmpresa(emp);

      if (emp?.certPfxPath) setCertStatus(`Certificado salvo: ${emp.certPfxPath}`);
      else setCertStatus("Nenhum certificado salvo para esta empresa ainda.");
    } else {
      setCertStatus("Nenhum certificado salvo para esta empresa ainda.");
    }
  } catch {
    log("Erro ao carregar empresas. Verifique /api/emissao/empresas.");
  }

  if (select.dataset._bound !== "1") {
    select.dataset._bound = "1";
    select.addEventListener("change", () => {
      const empresaId = select.value;
      const emp = getEmpresaById(empresaId);
      if (emp) {
        autoFillCredenciaisFromEmpresa(emp);
        log(`Empresa selecionada: ${emp?.nome || emp?.cnpj || empresaId}`);
        if (emp?.municipio) log(`Município da empresa: ${emp.municipio}`);
        if (emp?.municipioIbge) log(`Município IBGE: ${emp.municipioIbge}`);

        if (emp?.certPfxPath) setCertStatus(`Certificado salvo: ${emp.certPfxPath}`);
        else setCertStatus("Nenhum certificado salvo para esta empresa ainda.");
      }
    });
  }

  if (btnSalvarPfx && btnSalvarPfx.dataset._bound !== "1") {
    btnSalvarPfx.dataset._bound = "1";
    btnSalvarPfx.addEventListener("click", async () => {
      const empresaId = select.value;
      if (!empresaId) return setCertStatus("Selecione uma empresa.", true);
      if (!user?.email) return setCertStatus("Usuário não encontrado no localStorage (nfseUser).", true);

      const file = pfxFileEl?.files?.[0];
      const pass = (pfxPassEl?.value || "").toString();

      if (!file) return setCertStatus("Escolha um arquivo .pfx/.p12.", true);
      if (!pass) return setCertStatus("Informe a senha do certificado.", true);

      setCertStatus("Enviando certificado para o servidor...");

      try {
        const base64 = await fileToBase64(file);

        const r = await fetch("/api/emissao/certificado", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            usuarioEmail: user.email,
            empresaId,
            filename: file.name,
            pfxBase64: base64,
            passphrase: pass,
          }),
        });

        const j = await r.json().catch(() => ({}));
        if (!j.ok) return setCertStatus(j.error || "Falha ao salvar certificado.", true);

        setCertStatus(j.message || "Certificado salvo com sucesso.");
        log(j.message || "Certificado salvo.");

        try {
          const empresas = await fetchEmpresas();
          _empresasCache = Array.isArray(empresas) ? empresas : _empresasCache;
          const emp = getEmpresaById(empresaId);
          if (emp?.certPfxPath) setCertStatus(`Certificado salvo: ${emp.certPfxPath}`);
        } catch {}
      } catch (e) {
        setCertStatus("Erro inesperado ao enviar/salvar o certificado.", true);
      }
    });
  }

  if (useCred && useCred.dataset._bound !== "1") {
    useCred.dataset._bound = "1";
    useCred.addEventListener("change", () => {
      const emp = getEmpresaById(select.value);
      if (useCred.checked && emp) {
        autoFillCredenciaisFromEmpresa(emp);
        log("Usando credenciais da empresa cadastrada (lote).");
      } else {
        log("Modo manual de credenciais (você pode digitar login/senha).");
      }
    });
  }

  if (btnSalvarSessao.dataset._bound !== "1") {
    btnSalvarSessao.dataset._bound = "1";
    btnSalvarSessao.addEventListener("click", async () => {
      const empresaId = select.value;
      if (!empresaId) return log("Selecione uma empresa.");
      if (!user?.email) return log("Usuário não encontrado no localStorage (nfseUser).");

      log("Iniciando sessão (se estiver em modo portal, vai abrir navegador)...");

      try {
        const r = await fetch("/api/emissao/salvar-sessao", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usuarioEmail: user.email, empresaId }),
        });

        const j = await r.json().catch(() => ({}));
        if (!j.ok) return log(`Erro: ${j.error || "falha ao iniciar sessão"}`);

        (j.logs || []).forEach(log);
        log(j.message || "Sessão processada.");
      } catch (e) {
        log("Erro inesperado ao chamar /api/emissao/salvar-sessao.");
      }
    });
  }

  if (btnEmitir.dataset._bound !== "1") {
    btnEmitir.dataset._bound = "1";
    btnEmitir.addEventListener("click", async () => {
      const empresaId = select.value;
      if (!empresaId) return log("Selecione uma empresa.");
      if (!user?.email) return log("Usuário não encontrado no localStorage (nfseUser).");

      const useCredChecked = useCred ? !!useCred.checked : true;

      let loginPortal = "";
      let senhaPortal = "";

      if (useCredChecked) {
        const emp = getEmpresaById(empresaId);
        loginPortal = (emp?.loginPortal || emp?.cnpj || "").toString().trim();
        senhaPortal = (emp?.senhaPortal || "").toString();
      }

      if ((!loginPortal || !senhaPortal) && loginEl && senhaEl) {
        const l = (loginEl.value || "").toString().trim();
        const s = (senhaEl.value || "").toString();
        if (l) loginPortal = l;
        if (s) senhaPortal = s;
      }

      const emp = getEmpresaById(empresaId);

      const municipioFromInput = readOptionalValue("emissaoMunicipio");
      const municipioFinal = municipioFromInput || (emp?.municipio ? String(emp.municipio) : "");

      const municipioIbge =
        (emp?.municipioIbge ? String(emp.municipioIbge) : "") || resolveMunicipioIbge(municipioFinal);

      const payload = {
        usuarioEmail: user.email,
        empresaId,

        loginPortal: loginPortal || "",
        senhaPortal: senhaPortal || "",

        headless: debugEl ? !debugEl.checked : undefined,
        salvarSessaoAuto: autoSaveEl ? !!autoSaveEl.checked : true,

        dataCompetencia: $("emissaoDataCompetencia")?.value || "",

        tomadorDocumento: $("emissaoTomadorDocumento")?.value.trim() || "",
        tomadorNome: $("emissaoTomadorNome")?.value.trim() || "",
        tomadorEmail: $("emissaoTomadorEmail")?.value.trim() || "",

        descricaoServico: $("emissaoDescricao")?.value.trim() || "",
        valorServico: normalizeMoney($("emissaoValor")?.value || ""),

        municipio: municipioFinal,
        municipioIbge,
        indicadorMunicipal: readOptionalValue("emissaoIndicadorMunicipal"),
      };

      if (!payload.tomadorDocumento || !payload.tomadorNome || !payload.valorServico) {
        return log("Preencha ao menos: Tomador (CPF/CNPJ), Nome e Valor do serviço.");
      }
      if (!payload.descricaoServico) {
        return log("Preencha a descrição do serviço.");
      }

      if (!payload.loginPortal || !payload.senhaPortal) {
        log("⚠️ Sem credenciais do portal. (Se estiver em modo API, isso é ok.)");
      }

      if (!payload.municipio && !payload.municipioIbge) {
        log("⚠️ Município vazio. (A API tende a exigir IBGE. Cadastre município na empresa.)");
      } else {
        if (payload.municipio) log(`Município enviado: ${payload.municipio}`);
        if (payload.municipioIbge) log(`Município IBGE enviado: ${payload.municipioIbge}`);
      }

      log("Enviando para emissão...");

      try {
        const r = await fetch("/api/emissao/emitir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const j = await r.json().catch(() => ({}));
        if (!j.ok) return log(`Erro: ${j.error || "falha ao emitir"}`);

        (j.logs || []).forEach(log);

        if (j.provider) log(`Provider: ${String(j.provider).toUpperCase()}`);
        if (j.chaveAcesso) log(`Chave: ${j.chaveAcesso}`);
        if (j.numeroNota) log(`Número: ${j.numeroNota}`);

        log(j.mensagem || "OK");

        await listar(user.email, empresaId);
      } catch (e) {
        log("Erro inesperado ao chamar /api/emissao/emitir.");
      }
    });
  }

  log("Aba Emissão pronta. Provider (portal/API) é definido pelo .env (NFSE_PROVIDER).");
  return true;
}

(function bootEmissao() {
  window.addEventListener("DOMContentLoaded", () => {
    initEmissao();
  });

  const obs = new MutationObserver(() => {
    initEmissao();
  });
  obs.observe(document.body, { childList: true, subtree: true });
})();

window.initEmissao = initEmissao;
