// src/auth/auth.routes.js
import express from "express";
import db from "../db/sqlite.js";
import { verifyPassword, hashPassword } from "./password.js";
import { createSession, deleteSessionByToken } from "./session.store.js";
import { requireAuth } from "./auth.middleware.js";

const router = express.Router();

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
    .prepare(`SELECT id, name, email, role, is_active, password_hash FROM users WHERE email = ?`)
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

  return res.json({
    ok: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
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
  return res.json({ ok: true, user: req.user });
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

  return res.json({ ok: true });
});

// POST /auth/change-password
router.post("/change-password", requireAuth, async (req, res) => {
  const { newPassword } = req.body || {};
  const pw = String(newPassword || "");

  if (!pw || pw.length < 6) {
    return res.status(400).json({ ok: false, error: "Senha inválida (mín. 6 caracteres)" });
  }

  const hash = await hashPassword(pw);
  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hash, req.user.id);

  return res.json({ ok: true });
});

export default router;
