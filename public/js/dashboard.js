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

// ---------------------------
// ✅ Logout (usado só pelo menu)
// ---------------------------
async function doLogout() {
  try {
    await fetch("/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch (err) {
    // silencioso: mesmo que falhe, limpa local e redireciona
  }

  try {
    localStorage.removeItem("nfseUser");
  } catch {}

  window.location.href = "/index.html";
}

// ---------------------------
// ✅ NOVO: menu do usuário (clicável) + modal Configurações
// ✅ AJUSTES PEDIDOS:
//    1) Mantém tema do modal sempre claro (sem dark:*)
//    2) Remove duplicidade de "Sair" do topo (esconde botão do topo)
//    3) No topo fica apenas NOME + 3 tracinhos (esconde avatar)
//    4) Modal de Configurações em TELA CHEIA
// ---------------------------
const userNameDisplay = document.getElementById("userNameDisplay");
const userAvatar = document.getElementById("userAvatar");

let nameToShow =
  currentUser.displayName ||
  currentUser.name ||
  (currentUser.email ? currentUser.email.split("@")[0] : "Usuário");

// ✅ pedido: topo apenas nome + 3 tracinhos (sem avatar bolinha)
if (userAvatar) {
  userAvatar.style.display = "none";
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ✅ pedido: tirar "Sair" duplicado do topo
(function hideTopLogoutIfAny() {
  const logoutBtnTop = document.getElementById("logoutBtn");
  if (logoutBtnTop) {
    logoutBtnTop.style.display = "none";
  }
})();

function ensureUserMenuUI() {
  if (!userNameDisplay) return;

  // ✅ guarda: evita recriar menu e re-binds
  if (document.getElementById("userMenuBtn")) return;

  // container
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  wrapper.style.display = "inline-flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "8px";

  // botão
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "userMenuBtn";
  btn.className =
    "inline-flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-100 transition";
  btn.setAttribute("aria-haspopup", "true");
  btn.setAttribute("aria-expanded", "false");
  btn.title = "Menu do usuário";

  // label
  const label = document.createElement("span");
  label.id = "userMenuLabel";
  label.className = "text-sm font-medium";
  label.textContent = nameToShow;

  // ícone
  const burger = document.createElement("span");
  burger.className = "text-lg leading-none opacity-80";
  burger.textContent = "≡";

  btn.appendChild(label);
  btn.appendChild(burger);

  // dropdown
  const menu = document.createElement("div");
  menu.id = "userMenuDropdown";
  menu.className =
    "hidden absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden z-50";
  menu.style.top = "100%";

  menu.innerHTML = `
    <div class="px-4 py-3 border-b border-slate-100">
      <div class="text-sm font-semibold text-slate-900">${escapeHtml(nameToShow)}</div>
      <div class="text-xs text-slate-500">${escapeHtml(currentUser.email || "")}</div>
    </div>

    <button id="userMenuConfigBtn"
      class="w-full text-left px-4 py-3 text-sm hover:bg-slate-50">
      ⚙️ Configurações
    </button>

    <button id="userMenuLogoutBtn"
      class="w-full text-left px-4 py-3 text-sm hover:bg-slate-50">
      ↩️ Sair
    </button>
  `;

  // coloca no lugar do texto antigo
  const parent = userNameDisplay.parentElement || userNameDisplay;
  parent.insertBefore(wrapper, userNameDisplay);
  wrapper.appendChild(btn);

  // some com o antigo
  userNameDisplay.style.display = "none";

  wrapper.appendChild(menu);

  function closeMenu() {
    menu.classList.add("hidden");
    btn.setAttribute("aria-expanded", "false");
  }
  function toggleMenu() {
    const willOpen = menu.classList.contains("hidden");
    if (willOpen) {
      menu.classList.remove("hidden");
      btn.setAttribute("aria-expanded", "true");
    } else {
      closeMenu();
    }
  }

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMenu();
  });

  // ✅ fecha ao clicar fora (bind único)
  if (!document.documentElement.dataset._userMenuDocClickBound) {
    document.documentElement.dataset._userMenuDocClickBound = "1";
    document.addEventListener("click", () => {
      const dropdown = document.getElementById("userMenuDropdown");
      const btnNow = document.getElementById("userMenuBtn");
      if (dropdown && btnNow) {
        dropdown.classList.add("hidden");
        btnNow.setAttribute("aria-expanded", "false");
      }
    });
  }

  // ações
  const logoutBtn = menu.querySelector("#userMenuLogoutBtn");
  const configBtn = menu.querySelector("#userMenuConfigBtn");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
      doLogout();
    });
  }

  if (configBtn) {
    configBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
      openSettingsModal();
    });
  }
}

let settingsModalEl = null;

async function fetchMeRole() {
  try {
    const res = await fetch("/auth/me", { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data?.user || null;
  } catch {
    return null;
  }
}

async function openSettingsModal() {
  if (settingsModalEl) {
    settingsModalEl.classList.remove("hidden");
    return;
  }

  const me = (await fetchMeRole()) || {
    name: currentUser.name || currentUser.displayName || nameToShow,
    email: currentUser.email || "",
    role: currentUser.role || "USER",
  };

  settingsModalEl = document.createElement("div");
  settingsModalEl.id = "settingsModal";
  settingsModalEl.className =
    "fixed inset-0 z-[9999] flex items-stretch justify-stretch bg-black/50";

  const isAdmin = String(me.role || "").toUpperCase() === "ADMIN";

  // ✅ pedido: modal em TELA CHEIA
  settingsModalEl.innerHTML = `
    <div class="w-screen h-screen max-w-none max-h-none rounded-none bg-white border border-slate-200 shadow-xl overflow-hidden flex flex-col">
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <div class="text-base font-semibold text-slate-900">Configurações</div>
          <div class="text-xs text-slate-500">Gerencie seus dados e acessos</div>
        </div>
        <button id="settingsCloseBtn" class="px-3 py-1 rounded-lg hover:bg-slate-100">✕</button>
      </div>

      <div class="flex flex-1 min-h-0 overflow-hidden">
        <div class="w-72 border-r border-slate-100 p-3 space-y-2">
          <button data-tab="account" class="settings-tab w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 font-medium">
            👤 Minha conta
          </button>
          ${
            isAdmin
              ? `<button data-tab="users" class="settings-tab w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 font-medium">
                  🧩 Usuários
                </button>`
              : ""
          }
        </div>

        <div class="flex-1 p-5 overflow-y-auto">
          <div id="settingsTab-account" class="settings-panel">
            <div class="text-sm font-semibold mb-3 text-slate-900">Minha conta</div>

            <div class="grid gap-3 max-w-2xl">
              <label class="text-sm text-slate-700">
                Nome
                <input id="meName" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                  value="${escapeHtml(me.name || "")}">
              </label>

              <label class="text-sm text-slate-700">
                Email
                <input id="meEmail" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                  value="${escapeHtml(me.email || "")}">
              </label>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label class="text-sm text-slate-700">
                  Nova senha
                  <input id="mePass" type="password" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                    placeholder="Digite a nova senha">
                </label>

                <label class="text-sm text-slate-700">
                  Confirmar senha
                  <input id="mePass2" type="password" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                    placeholder="Confirme a nova senha">
                </label>
              </div>

              <div class="flex items-center gap-2">
                <button id="saveMeBtn" class="px-4 py-2 rounded-lg bg-slate-900 text-white hover:opacity-90">
                  Salvar
                </button>
                <span id="saveMeMsg" class="text-sm text-slate-600"></span>
              </div>
            </div>
          </div>

          ${
            isAdmin
              ? `
          <div id="settingsTab-users" class="settings-panel hidden">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-sm font-semibold text-slate-900">Usuários</div>
                <div class="text-xs text-slate-500">Criar, desativar e resetar senha</div>
              </div>

              <div class="text-xs text-slate-500">
                <span id="usersCount">—</span>
              </div>
            </div>

            <div class="mt-4 grid md:grid-cols-2 gap-4">
              <div class="rounded-xl border border-slate-200 p-4">
                <div class="text-sm font-semibold mb-2">Criar usuário</div>

                <div class="grid gap-2">
                  <input id="newUserName" class="px-3 py-2 rounded-lg border border-slate-200 bg-white" placeholder="Nome">
                  <input id="newUserEmail" class="px-3 py-2 rounded-lg border border-slate-200 bg-white" placeholder="Email">
                  <input id="newUserPass" type="password" class="px-3 py-2 rounded-lg border border-slate-200 bg-white" placeholder="Senha temporária">
                  <select id="newUserRole" class="px-3 py-2 rounded-lg border border-slate-200 bg-white">
                    <option value="USER">USER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>

                  <button id="createUserBtn" class="mt-2 px-4 py-2 rounded-lg bg-slate-900 text-white hover:opacity-90">
                    Criar
                  </button>
                  <div id="createUserMsg" class="text-sm text-slate-600"></div>
                </div>
              </div>

              <div class="rounded-xl border border-slate-200 p-4">
                <div class="text-sm font-semibold mb-2">Lista</div>

                <div class="max-h-[70vh] overflow-auto border border-slate-100 rounded-lg">
                  <table class="w-full text-sm">
                    <thead class="sticky top-0 bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th class="text-left px-3 py-2">Nome</th>
                        <th class="text-left px-3 py-2">Email</th>
                        <th class="text-left px-3 py-2">Role</th>
                        <th class="text-left px-3 py-2">Status</th>
                        <th class="text-left px-3 py-2">Ações</th>
                      </tr>
                    </thead>
                    <tbody id="usersTbody"></tbody>
                  </table>
                </div>

                <div id="usersMsg" class="text-sm text-slate-600 mt-2"></div>
              </div>
            </div>
          </div>
          `
              : ""
          }
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(settingsModalEl);

  // close
  const closeBtn = settingsModalEl.querySelector("#settingsCloseBtn");
  if (closeBtn) closeBtn.addEventListener("click", () => settingsModalEl.classList.add("hidden"));

  // (mantém clique fora para fechar)
  settingsModalEl.addEventListener("click", (e) => {
    if (e.target === settingsModalEl) settingsModalEl.classList.add("hidden");
  });

  // tabs
  const tabBtns = settingsModalEl.querySelectorAll(".settings-tab");
  tabBtns.forEach((b) => {
    b.addEventListener("click", () => {
      const tab = b.getAttribute("data-tab");
      settingsModalEl.querySelectorAll(".settings-panel").forEach((p) => p.classList.add("hidden"));
      const panel = settingsModalEl.querySelector(`#settingsTab-${tab}`);
      if (panel) panel.classList.remove("hidden");
    });
  });

  // ✅✅✅ AJUSTE PRINCIPAL: salvar perfil/senha SEM fallback fake/local para senha
  const saveMeBtn = settingsModalEl.querySelector("#saveMeBtn");
  if (saveMeBtn) {
    saveMeBtn.addEventListener("click", async () => {
      const msg = settingsModalEl.querySelector("#saveMeMsg");
      if (msg) msg.textContent = "Salvando...";

      const name = settingsModalEl.querySelector("#meName")?.value?.trim() || "";
      const email = settingsModalEl.querySelector("#meEmail")?.value?.trim() || "";
      const pass = settingsModalEl.querySelector("#mePass")?.value || "";
      const pass2 = settingsModalEl.querySelector("#mePass2")?.value || "";

      if (!name || !email) {
        if (msg) msg.textContent = "Preencha nome e email.";
        return;
      }

      if ((pass || pass2) && pass !== pass2) {
        if (msg) msg.textContent = "As senhas não conferem.";
        return;
      }

      // 1) Atualiza perfil no BACKEND
      try {
        const up = await fetch("/auth/update-profile", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email }),
        });

        const upJson = await up.json().catch(() => ({}));

        if (!up.ok || upJson?.ok === false) {
          if (msg) msg.textContent = upJson?.message || upJson?.error || "Erro ao salvar perfil.";
          return;
        }
      } catch (e) {
        if (msg) msg.textContent = "Falha ao salvar no servidor (update-profile).";
        return;
      }

      // 2) Troca senha no BACKEND (se preenchida)
      let changedPassword = false;
      if (pass) {
        try {
          const pw = await fetch("/auth/change-password", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newPassword: pass }),
          });

          const pwJson = await pw.json().catch(() => ({}));

          if (!pw.ok || pwJson?.ok === false) {
            if (msg) msg.textContent = pwJson?.message || pwJson?.error || "Erro ao alterar senha.";
            return;
          }

          changedPassword = true;
        } catch (e) {
          if (msg) msg.textContent = "Falha ao alterar senha no servidor (change-password).";
          return;
        }
      }

      // 3) Só agora atualiza localStorage (espelha o backend)
      currentUser.name = name;
      currentUser.displayName = name;
      currentUser.email = email;
      try {
        localStorage.setItem("nfseUser", JSON.stringify(currentUser));
      } catch {}

      const label = document.getElementById("userMenuLabel");
      if (label) label.textContent = name;

      // limpa campos senha
      const p1 = settingsModalEl.querySelector("#mePass");
      const p2 = settingsModalEl.querySelector("#mePass2");
      if (p1) p1.value = "";
      if (p2) p2.value = "";

      if (changedPassword) {
        if (msg) msg.textContent = "Senha alterada. Faça login novamente com a nova senha...";
        // força logout pra você testar que a senha nova realmente funciona
        setTimeout(() => doLogout(), 900);
        return;
      }

      if (msg) msg.textContent = "Salvo com sucesso.";
    });
  }

  // admin load users
  if (isAdmin) {
    await adminLoadUsersIntoModal();
    wireAdminActions();
  }
}

async function adminLoadUsersIntoModal() {
  const tbody = settingsModalEl?.querySelector("#usersTbody");
  const countEl = settingsModalEl?.querySelector("#usersCount");
  const msgEl = settingsModalEl?.querySelector("#usersMsg");
  if (!tbody) return;

  tbody.innerHTML = "";
  if (msgEl) msgEl.textContent = "Carregando...";

  try {
    const res = await fetch("/admin/users", { credentials: "include" });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      if (msgEl) msgEl.textContent = t || "Erro ao listar usuários.";
      return;
    }

    const data = await res.json().catch(() => ({}));
    const list = Array.isArray(data?.users) ? data.users : [];
    const totals = data?.totals || null;

    if (countEl && totals) {
      countEl.textContent = `Ativos: ${totals.active} | Inativos: ${totals.inactive} | Total: ${totals.total}`;
    }

    list.forEach((u) => {
      const tr = document.createElement("tr");
      tr.className = "border-t border-slate-100";
      tr.innerHTML = `
        <td class="px-3 py-2">${escapeHtml(u.name || "—")}</td>
        <td class="px-3 py-2">${escapeHtml(u.email || "—")}</td>
        <td class="px-3 py-2">${escapeHtml(u.role || "USER")}</td>
        <td class="px-3 py-2">${u.is_active ? "Ativo" : "Inativo"}</td>
        <td class="px-3 py-2">
          <button data-action="toggle" data-id="${u.id}" class="px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50">
            ${u.is_active ? "Desativar" : "Ativar"}
          </button>
          <button data-action="reset" data-id="${u.id}" class="ml-1 px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50">
            Reset senha
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    if (msgEl) msgEl.textContent = "";
  } catch (err) {
    console.error(err);
    if (msgEl) msgEl.textContent = "Erro inesperado ao listar usuários.";
  }
}

function wireAdminActions() {
  const createBtn = settingsModalEl?.querySelector("#createUserBtn");
  const createMsg = settingsModalEl?.querySelector("#createUserMsg");

  if (createBtn) {
    createBtn.addEventListener("click", async () => {
      const name = settingsModalEl.querySelector("#newUserName")?.value?.trim() || "";
      const email = settingsModalEl.querySelector("#newUserEmail")?.value?.trim() || "";
      const pass = settingsModalEl.querySelector("#newUserPass")?.value || "";
      const role = settingsModalEl.querySelector("#newUserRole")?.value || "USER";

      if (!name || !email || !pass) {
        if (createMsg) createMsg.textContent = "Preencha nome, email e senha.";
        return;
      }

      if (createMsg) createMsg.textContent = "Criando...";

      try {
        const res = await fetch("/admin/users", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password: pass, role }),
        });

        if (!res.ok) {
          const t = await res.text().catch(() => "");
          if (createMsg) createMsg.textContent = t || "Erro ao criar usuário.";
          return;
        }

        if (createMsg) createMsg.textContent = "Usuário criado.";
        settingsModalEl.querySelector("#newUserName").value = "";
        settingsModalEl.querySelector("#newUserEmail").value = "";
        settingsModalEl.querySelector("#newUserPass").value = "";
        settingsModalEl.querySelector("#newUserRole").value = "USER";

        await adminLoadUsersIntoModal();
      } catch (err) {
        console.error(err);
        if (createMsg) createMsg.textContent = "Erro inesperado ao criar usuário.";
      }
    });
  }

  const tbody = settingsModalEl?.querySelector("#usersTbody");
  if (tbody && tbody.dataset.bound !== "1") {
    tbody.dataset.bound = "1";
    tbody.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;

      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");
      if (!action || !id) return;

      if (action === "toggle") {
        try {
          const res = await fetch(`/admin/users/${encodeURIComponent(id)}/toggle`, {
            method: "POST",
            credentials: "include",
          });
          if (!res.ok) return;
          await adminLoadUsersIntoModal();
        } catch {}
      }

      if (action === "reset") {
        const newPass = prompt("Digite a nova senha temporária para esse usuário:");
        if (!newPass) return;

        try {
          const res = await fetch(`/admin/users/${encodeURIComponent(id)}/reset-password`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newPassword: newPass }),
          });
          if (!res.ok) return;
          alert("Senha resetada com sucesso.");
        } catch {}
      }
    });
  }
}

// init menu
ensureUserMenuUI();

// ---------------------------
// Tema claro/escuro (switch)
// ✅ AJUSTE: agora alterna TAMBÉM a classe "dark" no <html>
//            (pra funcionar com Tailwind dark:...)
// ---------------------------
const themeToggleBtn = document.getElementById("themeToggleBtn");
const themeToggleKnob = document.getElementById("themeToggleKnob");
const themeSunIcon = document.getElementById("themeSunIcon");
const themeMoonIcon = document.getElementById("themeMoonIcon");

function applyThemeUI(isDark) {
  // ✅ suporta os 2 estilos de CSS (dark-mode no body e dark no html)
  document.body.classList.toggle("dark-mode", isDark);
  document.documentElement.classList.toggle("dark", isDark);

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
    const willBeDark =
      !document.documentElement.classList.contains("dark") &&
      !document.body.classList.contains("dark-mode");
    applyThemeUI(willBeDark);
  });
}

// =======================================================
// ✅ OCULTAR ABA "EMISSÃO" NO SERVIDOR (MOSTRA SÓ LOCALHOST)
// - Mantém visível em: localhost / 127.0.0.1 / ::1
// - Remove botão + painel em produção
// =======================================================
function isLocalhostHost() {
  const h = String(window.location.hostname || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

(function hideEmissaoTabInProd() {
  if (isLocalhostHost()) return;

  // remove botão da aba
  const emissaoBtn = document.querySelector('.tab-btn[data-tab="emissao"]');
  if (emissaoBtn) emissaoBtn.remove();

  // remove painel
  const emissaoPanel = document.getElementById("tab-emissao");
  if (emissaoPanel) emissaoPanel.remove();

  // se por algum motivo a URL tinha hash/estado apontando emissao, garante download
  // (isso evita ficar “sem tela” caso algo tente ativar emissao)
  try {
    const active = document.querySelector('.tab-btn.border-slate-900[data-tab="emissao"]');
    if (active) active.classList.remove("border-slate-900");
  } catch {}
})();

// ---------------------------
// Tabs
// ---------------------------
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

function activateTab(tabName) {
  // ✅ se alguém chamar activateTab("emissao") em produção, cai para download
  if (tabName === "emissao" && !isLocalhostHost()) tabName = "download";

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
      addLog(logsLote, "[AVISO] Selecione uma empresa na tabela antes de remover.");
      return;
    }

    if (!confirm("Deseja remover a empresa selecionada?")) return;

    try {
      const res = await fetch(
        `/api/empresas/${encodeURIComponent(empresaSelecionadaId)}`,
        {
          method: "DELETE",
          headers: apiHeaders(),
        }
      );

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
