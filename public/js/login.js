// public/js/login.js
const form = document.getElementById("loginForm");
const errorBox = document.getElementById("loginError");

const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");

// lembrar acesso
const rememberEl = document.getElementById("rememberAccess");
const REMEMBER_KEY = "nfseRememberAccess";
const REMEMBER_EMAIL_KEY = "nfseRememberEmail";

// toggle senha
const togglePasswordBtn = document.getElementById("togglePasswordBtn");
const eyeClosedIcon = document.getElementById("eyeClosedIcon");
const eyeOpenIcon = document.getElementById("eyeOpenIcon");

// esqueci senha (modal)
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const forgotModal = document.getElementById("forgotModal");
const forgotBackdrop = document.getElementById("forgotBackdrop");
const closeForgotModal = document.getElementById("closeForgotModal");
const forgotEmailEl = document.getElementById("forgotEmail");
const copyForgotEmailBtn = document.getElementById("copyForgotEmail");
const sendForgotEmailBtn = document.getElementById("sendForgotEmail");
const forgotFeedback = document.getElementById("forgotFeedback");

function safeTrim(v) {
  return typeof v === "string" ? v.trim() : "";
}

function showLoginError(msg) {
  if (!errorBox) return;
  errorBox.textContent = msg || "E-mail ou senha inválidos. Tente novamente.";
  errorBox.classList.remove("hidden");
}

function hideLoginError() {
  if (!errorBox) return;
  errorBox.classList.add("hidden");
}

function setForgotFeedback(msg, type = "info") {
  if (!forgotFeedback) return;
  forgotFeedback.textContent = msg || "";

  // reset classes
  forgotFeedback.classList.remove("text-green-600", "text-red-500", "text-slate-500");

  if (!msg) {
    forgotFeedback.classList.add("text-slate-500");
    return;
  }

  if (type === "success") forgotFeedback.classList.add("text-green-600");
  else if (type === "error") forgotFeedback.classList.add("text-red-500");
  else forgotFeedback.classList.add("text-slate-500");
}

function openForgotModal() {
  if (!forgotModal) return;
  forgotModal.classList.remove("hidden");
  forgotModal.classList.add("flex");
  forgotModal.setAttribute("aria-hidden", "false");

  setForgotFeedback("");

  if (forgotEmailEl && emailEl) {
    const currentEmail = safeTrim(emailEl.value);
    if (currentEmail) forgotEmailEl.value = currentEmail;
    setTimeout(() => forgotEmailEl.focus(), 50);
  }
}

function closeForgot() {
  if (!forgotModal) return;
  forgotModal.classList.add("hidden");
  forgotModal.classList.remove("flex");
  forgotModal.setAttribute("aria-hidden", "true");
  setForgotFeedback("");
}

async function copyToClipboard(text) {
  if (!text) return false;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {}

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}

// --------------------
// INIT: lembrar acesso
// --------------------
(function initRememberAccess() {
  try {
    const remember = localStorage.getItem(REMEMBER_KEY) === "true";
    const rememberedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY) || "";

    if (rememberEl) rememberEl.checked = remember;

    if (emailEl && remember && rememberedEmail) {
      emailEl.value = rememberedEmail;
    }
  } catch (_) {}
})();

// --------------------
// Toggle mostrar senha
// --------------------
(function initTogglePassword() {
  if (!togglePasswordBtn || !passwordEl) return;

  let showing = false;

  function setUI() {
    passwordEl.type = showing ? "text" : "password";

    if (eyeClosedIcon) eyeClosedIcon.classList.toggle("hidden", showing);
    if (eyeOpenIcon) eyeOpenIcon.classList.toggle("hidden", !showing);

    togglePasswordBtn.setAttribute("aria-label", showing ? "Ocultar senha" : "Mostrar senha");
    togglePasswordBtn.setAttribute("title", showing ? "Ocultar senha" : "Mostrar senha");
  }

  setUI();

  togglePasswordBtn.addEventListener("click", () => {
    showing = !showing;
    setUI();
    passwordEl.focus();
  });
})();

// --------------------
// Esqueci a senha (AGORA: backend /auth/forgot-password)
// --------------------
(function initForgotPassword() {
  if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener("click", () => openForgotModal());
  }

  if (closeForgotModal) closeForgotModal.addEventListener("click", closeForgot);
  if (forgotBackdrop) forgotBackdrop.addEventListener("click", closeForgot);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeForgot();
  });

  if (copyForgotEmailBtn) {
    copyForgotEmailBtn.addEventListener("click", async () => {
      const email = safeTrim(forgotEmailEl ? forgotEmailEl.value : "");
      if (!email) {
        setForgotFeedback("Informe seu e-mail para copiar.", "error");
        return;
      }
      const ok = await copyToClipboard(email);
      setForgotFeedback(
        ok ? "E-mail copiado." : "Não consegui copiar automaticamente. Copie manualmente.",
        ok ? "success" : "error"
      );
    });
  }

  if (sendForgotEmailBtn) {
    sendForgotEmailBtn.addEventListener("click", async () => {
      const email = safeTrim(forgotEmailEl ? forgotEmailEl.value : "").toLowerCase();
      if (!email) {
        setForgotFeedback("Informe seu e-mail antes de enviar.", "error");
        return;
      }

      const prevText = sendForgotEmailBtn.textContent;
      sendForgotEmailBtn.disabled = true;
      sendForgotEmailBtn.textContent = "Enviando...";

      try {
        const res = await fetch("/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email }),
        });

        const data = await res.json().catch(() => ({}));

        // resposta neutra: mesmo se email não existir, mostra sucesso
        const msg =
          data?.message ||
          "Se o e-mail existir, enviaremos um link de recuperação. Verifique sua caixa de entrada e spam.";

        setForgotFeedback(msg, "success");
      } catch (err) {
        console.error(err);
        setForgotFeedback("Falha ao enviar. Tente novamente em instantes.", "error");
      } finally {
        sendForgotEmailBtn.disabled = false;
        sendForgotEmailBtn.textContent = prevText || "Enviar e-mail";
      }
    });
  }
})();

// --------------------
// Submit login (backend /auth/login)
// --------------------
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideLoginError();

    const email = safeTrim(emailEl ? emailEl.value : "").toLowerCase();
    const password = safeTrim(passwordEl ? passwordEl.value : "");

    if (!email || !password) {
      showLoginError("Informe e-mail e senha.");
      return;
    }

    try {
      const res = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        showLoginError(data?.error || "E-mail ou senha inválidos. Tente novamente.");
        return;
      }

      // lembrar acesso
      try {
        const remember = !!(rememberEl && rememberEl.checked);
        localStorage.setItem(REMEMBER_KEY, remember ? "true" : "false");
        if (remember) localStorage.setItem(REMEMBER_EMAIL_KEY, email);
        else localStorage.removeItem(REMEMBER_EMAIL_KEY);
      } catch (_) {}

      const u = data.user || {};
      localStorage.setItem(
        "nfseUser",
        JSON.stringify({
          email: u.email || email,
          displayName: u.name || (email.includes("@") ? email.split("@")[0] : email),
          role: (u.role || "USER").toLowerCase(),
          plan: (u.plan || "STARTER").toUpperCase(),
          plan_value: Number(u.plan_value || 49.9),
          company_name: u.company_name || "",
          cnpj: u.cnpj || "",
          whatsapp: u.whatsapp || "",
          created_at: u.created_at || null,
        })
      );

      window.location.href = "/dashboard.html";
    } catch (err) {
      console.error(err);
      showLoginError("Erro ao conectar no servidor. Tente novamente.");
    }
  });
}
