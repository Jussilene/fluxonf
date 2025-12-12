// public/js/login.js

const users = [
  {
    email: "admju@empresa.com",
    password: "123456",
    displayName: "admju",
    role: "admin",
  },
  {
    email: "admb@empresa.com",
    password: "123456",
    displayName: "admB",
    role: "admin",
  },
  {
    email: "teste@empresa.com",
    password: "123456",
    displayName: "teste",
    role: "user",
  },
  {
    email: "ronaldo.teste@empresa.com",
    password: "123456",
    displayName: "Ronaldo",
    role: "admin",
  },
];

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

function openForgotModal() {
  if (!forgotModal) return;
  forgotModal.classList.remove("hidden");
  forgotModal.classList.add("flex");
  forgotModal.setAttribute("aria-hidden", "false");

  // preenche com e-mail atual, se tiver
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
  if (forgotFeedback) forgotFeedback.textContent = "";
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

    togglePasswordBtn.setAttribute(
      "aria-label",
      showing ? "Ocultar senha" : "Mostrar senha"
    );
    togglePasswordBtn.setAttribute(
      "title",
      showing ? "Ocultar senha" : "Mostrar senha"
    );
  }

  setUI();

  togglePasswordBtn.addEventListener("click", () => {
    showing = !showing;
    setUI();
    passwordEl.focus();
  });
})();

// --------------------
// Esqueci a senha (MVP)
// --------------------
(function initForgotPassword() {
  if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener("click", () => {
      openForgotModal();
    });
  }

  if (closeForgotModal) closeForgotModal.addEventListener("click", closeForgot);
  if (forgotBackdrop) forgotBackdrop.addEventListener("click", closeForgot);

  // ESC fecha
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeForgot();
  });

  if (copyForgotEmailBtn) {
    copyForgotEmailBtn.addEventListener("click", async () => {
      const email = safeTrim(forgotEmailEl ? forgotEmailEl.value : "");
      if (!email) {
        if (forgotFeedback) forgotFeedback.textContent = "Informe seu e-mail para copiar.";
        return;
      }
      const ok = await copyToClipboard(email);
      if (forgotFeedback) {
        forgotFeedback.textContent = ok
          ? "E-mail copiado. Agora envie para o admin/suporte."
          : "Não consegui copiar automaticamente. Copie manualmente.";
      }
    });
  }

  if (sendForgotEmailBtn) {
    sendForgotEmailBtn.addEventListener("click", () => {
      const email = safeTrim(forgotEmailEl ? forgotEmailEl.value : "");
      if (!email) {
        if (forgotFeedback) forgotFeedback.textContent = "Informe seu e-mail antes de enviar.";
        return;
      }

      // Ajuste aqui o e-mail do suporte/admin se quiser
      const suporteEmail = "suporte@empresa.com";

      const subject = encodeURIComponent("[NFSe] Recuperação de acesso");
      const body = encodeURIComponent(
        `Olá,\n\nEsqueci minha senha de acesso ao painel NFSe.\n\nMeu e-mail: ${email}\n\nPor favor, me ajude a recuperar/atualizar minha senha.\n\nObrigado(a).`
      );

      window.location.href = `mailto:${suporteEmail}?subject=${subject}&body=${body}`;

      if (forgotFeedback) {
        forgotFeedback.textContent =
          "Abrimos seu aplicativo de e-mail com a mensagem pronta.";
      }
    });
  }
})();

// --------------------
// Submit login
// --------------------
if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    if (errorBox) errorBox.classList.add("hidden");

    const email = safeTrim(emailEl ? emailEl.value : "").toLowerCase();
    const password = safeTrim(passwordEl ? passwordEl.value : "");

    const user = users.find(
      (u) => u.email.toLowerCase() === email && u.password === password
    );

    if (!user) {
      if (errorBox) errorBox.classList.remove("hidden");
      return;
    }

    // lembrar acesso: salva e-mail ou limpa
    try {
      const remember = !!(rememberEl && rememberEl.checked);
      localStorage.setItem(REMEMBER_KEY, remember ? "true" : "false");
      if (remember) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, user.email);
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY);
      }
    } catch (_) {}

    // Salva usuário no localStorage
    localStorage.setItem(
      "nfseUser",
      JSON.stringify({
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      })
    );

    window.location.href = "/dashboard.html";
  });
}
