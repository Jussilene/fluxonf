// src/routes/webhooks.hotmart.routes.js
import express from "express";

// ✅ importa as funções do teu store
import { findUserByEmail, createUser, setUserActiveByEmail } from "../utils/usersStore.js";

// ✅ aqui você vai usar o MESMO hash/sistema de senha que teu auth já usa
// Se teu projeto já tem função pronta pra gerar hash, use ela.
// Vou deixar um fallback simples com "senha temporária" pra você trocar depois.
import crypto from "crypto";

const router = express.Router();

function pickEmail(payload) {
  // tenta achar email em formatos diferentes (Hotmart pode variar)
  return (
    payload?.buyer?.email ||
    payload?.data?.buyer?.email ||
    payload?.purchase?.buyer?.email ||
    payload?.payload?.buyer?.email ||
    ""
  ).toString().trim().toLowerCase();
}

function pickEvent(payload) {
  return (payload?.event || payload?.type || payload?.name || "").toString().trim().toUpperCase();
}

function makeTempPasswordHash() {
  // ⚠️ ideal: usar o mesmo hasher do teu auth (bcrypt, etc).
  // isso aqui é só placeholder pra não quebrar.
  const temp = crypto.randomBytes(12).toString("hex"); // senha temporária
  const hash = crypto.createHash("sha256").update(temp).digest("hex");
  return { tempPassword: temp, passwordHash: hash };
}

router.post("/hotmart", (req, res) => {
  const hottok = req.headers["x-hotmart-hottok"] || req.headers["x-hotmart-hottoken"];

  if (!process.env.HOTMART_HOTTOK) {
    console.warn("⚠️ HOTMART_HOTTOK não configurado no .env");
  }

  if (hottok !== process.env.HOTMART_HOTTOK) {
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

  // ✅ 1) APROVADO: cria user NORMAL ou reativa
  if (event === "PURCHASE_APPROVED") {
    const exists = findUserByEmail(email);

    if (exists) {
      setUserActiveByEmail(email, true);
      console.log("✅ Usuário reativado:", email);
      return res.json({ ok: true });
    }

    const { tempPassword, passwordHash } = makeTempPasswordHash();

    createUser({
      email,
      passwordHash,
      role: "user", // ✅ GARANTE: NÃO ADM
    });

    console.log("✅ Usuário criado (role=user):", email);
    console.log("🔑 Senha temporária (só pra debug):", tempPassword);

    return res.json({ ok: true });
  }

  // ✅ 2) CANCELADO: bloqueia acesso
  if (event === "PURCHASE_CANCELED") {
    const u = setUserActiveByEmail(email, false);
    if (u) console.log("⛔ Usuário bloqueado:", email);
    else console.log("⚠️ Cancelado, mas usuário não encontrado:", email);
    return res.json({ ok: true });
  }

  // outros eventos você pode simplesmente ignorar por enquanto
  return res.json({ ok: true });
});

export default router;
