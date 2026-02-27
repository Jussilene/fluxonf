// src/auth/seedAdmins.js
import db from "../db/sqlite.js";
import { hashPassword } from "./password.js";

async function ensureAdmin({ name, email, password }) {
  const e = String(email).trim().toLowerCase();
  const existing = db.prepare(`SELECT id, role FROM users WHERE email = ?`).get(e);

  if (existing) {
    // se já existe, garante ADMIN e ativo
    db.prepare(`UPDATE users SET role = 'ADMIN', is_active = 1, owner_admin_id = COALESCE(owner_admin_id, id) WHERE id = ?`).run(existing.id);
    console.log(`[seed] Admin garantido: ${e}`);
    return;
  }

  const passHash = await hashPassword(password);

  db.prepare(`
    INSERT INTO users (name, email, password_hash, password_plain, role, is_active, created_at, owner_admin_id)
    VALUES (?, ?, ?, ?, 'ADMIN', 1, ?, NULL)
  `).run(name, e, passHash, password, new Date().toISOString());
  db.prepare(`UPDATE users SET owner_admin_id = id WHERE email = ?`).run(e);

  console.log(`[seed] Admin criado: ${e}`);
}

async function main() {
  await ensureAdmin({
    name: "Ronaldo",
    email: "ronaldo@brasilprice.com.br",
    password: process.env.ADMIN_RONALDO_PASSWORD || "Ronaldo@123",
  });

  await ensureAdmin({
    name: "Ju",
    email: "jussilene.valim@gmail.com",
    password: process.env.ADMIN_JU_PASSWORD || "Ju@12345",
  });

  console.log("[seed] OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
