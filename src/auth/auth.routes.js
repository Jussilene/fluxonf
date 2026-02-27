// src/auth/auth.routes.js
import express from "express";
import db from "../db/sqlite.js";
import { verifyPassword, hashPassword } from "./password.js";
import { createSession, deleteSessionByToken } from "./session.store.js";
import { requireAuth } from "./auth.middleware.js";

const router = express.Router();

function normalizePlanForResponse(plan, planValue, role = "") {
  if (String(role || "").trim().toUpperCase() === "ADMIN") {
    return { plan: null, plan_value: null };
  }

  const p = String(plan || "").trim().toUpperCase();
  const v = Number(planValue || 0);

  if (p === "LANCAMENTO") return { plan: "STARTER", plan_value: 49.9 };
  if (p === "STARTER") return { plan: "STARTER", plan_value: 49.9 };
  if (p === "PRO") return { plan: "EMPRESARIAL", plan_value: 147.0 };

  if (p === "FUNDADORES") return { plan: "STARTER", plan_value: v || 49.9 };
  if (p === "ESSENCIAL") return { plan: "ESSENCIAL", plan_value: v || 49.9 };
  if (p === "PROFISSIONAL") return { plan: "PROFISSIONAL", plan_value: v || 97.0 };
  if (p === "EMPRESARIAL") return { plan: "EMPRESARIAL", plan_value: v || 147.0 };

  return { plan: "ESSENCIAL", plan_value: 49.9 };
}

function cookieOpts(req) {
  // Se estiver atrás de proxy (nginx / load balancer), ele envia x-forwarded-proto
  const xfProto = String(req?.headers?.["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();

  const isHttps = Boolean(req?.secure) || xfProto === "https";

  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps, // ✅ só liga Secure quando for HTTPS de verdade
    path: "/",
  };
}

// POST /auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: "Email e senha são obrigatórios" });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  const user = db
    .prepare(`SELECT id, name, email, role, owner_admin_id, is_active, password_hash, company_name, cnpj, whatsapp, plan, plan_value, created_at FROM users WHERE email = ?`)
    .get(normalizedEmail);

  if (!user || !user.is_active) {
    return res.status(401).json({ ok: false, error: "Credenciais inválidas" });
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ ok: false, error: "Credenciais inválidas" });
  }

  const { token } = createSession(user.id);

  db.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), user.id);

  // ✅ importante: cookie Secure só em HTTPS real
  res.cookie("nfse_session", token, cookieOpts(req));

  const normalizedPlan = normalizePlanForResponse(user.plan, user.plan_value, user.role);

  return res.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      company_name: user.company_name || "",
      cnpj: user.cnpj || "",
      whatsapp: user.whatsapp || "",
      plan: normalizedPlan.plan,
      plan_value: normalizedPlan.plan_value,
      created_at: user.created_at || null,
    },
  });
});

// POST /auth/logout
router.post("/logout", (req, res) => {
  const token = req.cookies?.nfse_session || "";
  if (token) deleteSessionByToken(token);

  // ✅ limpa com os mesmos atributos
  res.clearCookie("nfse_session", cookieOpts(req));

  return res.json({ ok: true });
});

// GET /auth/me
router.get("/me", requireAuth, (req, res) => {
  const normalizedPlan = normalizePlanForResponse(req.user?.plan, req.user?.plan_value, req.user?.role);
  return res.json({
    ok: true,
    user: {
      ...req.user,
      plan: normalizedPlan.plan,
      plan_value: normalizedPlan.plan_value,
    },
  });
});

// POST /auth/update-profile  (nome/email)
router.post("/update-profile", requireAuth, (req, res) => {
  const { name, email } = req.body || {};
  const newName = String(name || "").trim();
  const newEmail = String(email || "").trim().toLowerCase();

  if (!newName || !newEmail) {
    return res.status(400).json({ ok: false, error: "Nome e email são obrigatórios" });
  }

  // evita duplicar email
  const exists = db.prepare(`SELECT id FROM users WHERE email = ? AND id <> ?`).get(newEmail, req.user.id);
  if (exists) {
    return res.status(409).json({ ok: false, error: "Esse email já está em uso" });
  }

  db.prepare(`UPDATE users SET name = ?, email = ? WHERE id = ?`).run(newName, newEmail, req.user.id);
  const updated = db.prepare(`
    SELECT id, name, email, role, is_active, last_login_at, company_name, cnpj, whatsapp, plan, plan_value, created_at
    FROM users WHERE id = ?
  `).get(req.user.id);

  res.set("Cache-Control", "no-store");
  return res.json({ ok: true, user: updated || null });
});

// POST /auth/change-password
router.post("/change-password", requireAuth, async (req, res) => {
  const { newPassword } = req.body || {};
  const pw = String(newPassword || "");

  if (!pw || pw.length < 6) {
    return res.status(400).json({ ok: false, error: "Senha inválida (mín. 6 caracteres)" });
  }

  const hash = await hashPassword(pw);
  const id = Number(req.user?.id);
  const email = String(req.user?.email || "").trim().toLowerCase();
  let info = { changes: 0 };

  if (Number.isFinite(id)) {
    info = db.prepare(`UPDATE users SET password_hash = ?, password_plain = ? WHERE id = ?`).run(hash, pw, id);
  }
  if ((!info?.changes || info.changes < 1) && email) {
    info = db.prepare(`UPDATE users SET password_hash = ?, password_plain = ? WHERE lower(trim(email)) = lower(trim(?))`).run(hash, pw, email);
  }

  res.set("Cache-Control", "no-store");
  return res.json({ ok: true, password_plain: pw, updated: Number(info?.changes || 0) });
});

export default router;
