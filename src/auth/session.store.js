// src/auth/session.store.js
import crypto from "crypto";
import db from "../db/sqlite.js";

function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(token);

  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(); // 7 dias

  db.prepare(`
    INSERT INTO sessions (user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(userId, tokenHash, expiresAt, new Date().toISOString());

  return { token, expiresAt };
}

export function deleteSessionByToken(token) {
  const tokenHash = sha256(token);
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
}

export function getSession(token) {
  const tokenHash = sha256(token);
  return db
    .prepare(`SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?`)
    .get(tokenHash, new Date().toISOString());
}

export function getSessionUserFromToken(token) {
  const sess = getSession(token);
  if (!sess) return null;

  const user = db
    .prepare(`SELECT id, name, email, role, owner_admin_id, is_active, last_login_at, company_name, cnpj, whatsapp, plan, plan_value, created_at FROM users WHERE id = ?`)
    .get(sess.user_id);

  if (!user || !user.is_active) return null;
  return user;
}

export function getSessionUser(req) {
  const token = req.cookies?.nfse_session || "";
  if (!token) return null;
  return getSessionUserFromToken(token);
}
