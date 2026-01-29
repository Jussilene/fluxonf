// src/routes/webhooks.hotmart.routes.js
import express from "express";
import crypto from "crypto";

// store de usuários (o seu já existente)
import {
  findUserByEmail,
  createUser,
  setUserActiveByEmail,
} from "../utils/usersStore.js";

const router = express.Router();

/* =========================
   Helpers
========================= */

function pickEmail(payload) {
  return (
    payload?.data?.buyer?.email ||
    payload?.buyer?.email ||
    payload?.purchase?.buyer?.email ||
    ""
  )
    .toString()
    .trim()
    .toLowerCase();
}

function pickEvent(payload) {
  return (payload?.event || "")
    .toString()
    .trim()
    .toUpperCase();
}

function makeTempPasswordHash() {
  // ⚠️ ideal futuramente: usar o MESMO hash do auth (bcrypt, etc)
  const tempPassword = crypto.randomBytes(12).toString("hex");
  const passwordHash = crypto
    .createHash("sha256")
    .update(tempPassword)
    .digest("hex");

  return { tempPassword, passwordHash };
}

/* =========================
   WEBHOOK HOTMART
========================= */

router.post("/webhooks/hotmart", (req, res) => {
  const hottok =
    req.headers["x-hotmart-hottok"] ||
    req.headers["x-hotmart-hottoken"] ||
    "";

  if (!process.env.HOTMART_HOTTOK) {
    console.warn("⚠️ HOTMART_HOTTOK não configurado no .env");
  }

  if (String(hottok).trim() !== String(process.env.HOTMART_HOTTOK).trim()) {
    console.warn("❌ Webhook Hotmart rejeitado: HOTTOK inválido");
    return res.status(401).json({ ok: false });
  }

  const payload = req.body || {};
  const event = pickEvent(payload);
  const email = pickEmail(payload);

  console.log("✅ Hotmart webhook recebido:", { event, email });

  if (!email) {
    console.warn("⚠️ Webhook sem email de comprador. Ignorando.");
    return res.json({ ok: true });
  }

  /* =========================
     COMPRA APROVADA
  ========================= */
  if (event === "PURCHASE_APPROVED") {
    const exists = findUserByEmail(email);

    if (exists) {
      setUserActiveByEmail(email, true);
      console.log("🔓 Usuário reativado:", email);
      return res.json({ ok: true });
    }

    const { tempPassword, passwordHash } = makeTempPasswordHash();

    createUser({
      email,
      passwordHash,
      role: "user", // 🔒 garante que nunca será admin
    });

    console.log("👤 Usuário criado:", email);
    console.log("🔑 Senha temporária (debug):", tempPassword);
    // ⚠️ depois vamos substituir isso por envio de email

    return res.json({ ok: true });
  }

  /* =========================
     BLOQUEIO DE ACESSO
  ========================= */
  if (
    event === "PURCHASE_CANCELED" ||
    event === "PURCHASE_REFUNDED" ||
    event === "PURCHASE_CHARGEBACK"
  ) {
    const u = setUserActiveByEmail(email, false);

    if (u) console.log("⛔ Usuário bloqueado:", email);
    else console.log("⚠️ Evento recebido, mas usuário não encontrado:", email);

    return res.json({ ok: true });
  }

  // Outros eventos: ignorar por enquanto
  return res.json({ ok: true });
});

export default router;
