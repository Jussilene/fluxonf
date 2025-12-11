// src/server.js
import "dotenv/config"; // <-- carrega variáveis do .env logo no começo

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { runManualDownload, runLoteDownload } from "./bot/nfseBot.js";
import historicoRoutes from "./routes/historico.routes.js"; // <-- HISTÓRICO (SQLite)

const app = express();
const PORT = process.env.PORT || 3000;

// DEBUG opcional: só pra ver se o .env está sendo lido
console.log("[DEBUG] NFSE_USE_PORTAL no server:", process.env.NFSE_USE_PORTAL);

// --- helpers de path (porque estamos em ESModules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// middlewares básicos
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// serve arquivos estáticos
app.use(express.static(path.join(__dirname, "..", "public")));

// ---------------------------
// "Banco" em memória de empresas (MVP)
// ---------------------------
// Agora já com loginPortal (padrão = CNPJ) e senhaPortal (null até cadastrar)
let empresas = [
  {
    id: 1,
    nome: "Time Saver",
    cnpj: "52397721000180",
    loginPortal: "52397721000180",
    senhaPortal: null,
  },
  {
    id: 3,
    nome: "Ion Representações",
    cnpj: "51337409000139",
    loginPortal: "51337409000139",
    senhaPortal: null,
  },
  {
    id: 4,
    nome: "cnpj da Barbhara",
    cnpj: "63356089000143",
    loginPortal: "63356089000143",
    senhaPortal: null,
  },
];

// listar empresas
app.get("/api/empresas", (req, res) => {
  res.json(empresas);
});

// adicionar empresa
app.post("/api/empresas", (req, res) => {
  const { nome, cnpj, loginPortal, senhaPortal } = req.body;

  if (!nome || !cnpj) {
    return res.status(400).json({ error: "Nome e CNPJ são obrigatórios." });
  }

  const newId = empresas.length ? Math.max(...empresas.map((e) => e.id)) + 1 : 1;

  const nova = {
    id: newId,
    nome,
    cnpj,
    // por padrão, o login do portal é o próprio CNPJ
    loginPortal: loginPortal || cnpj,
    // senhaPortal vem do front (se não vier, fica null)
    senhaPortal: senhaPortal || null,
  };

  empresas.push(nova);

  return res.status(201).json(nova);
});

// remover empresa
app.delete("/api/empresas/:id", (req, res) => {
  const id = Number(req.params.id);
  const before = empresas.length;
  empresas = empresas.filter((e) => e.id !== id);

  if (empresas.length === before) {
    return res.status(404).json({ error: "Empresa não encontrada." });
  }

  return res.json({ success: true });
});

// ---------------------------
// Rotas do HISTÓRICO (SQLite)
// ---------------------------
app.use("/api/historico", historicoRoutes);

// ---------------------------
// Rotas do ROBÔ (manual + lote)
// ---------------------------

// download manual (uma execução única)
app.post("/api/nf/manual", async (req, res) => {
  try {
    const {
      dataInicial,
      dataFinal,
      tipoNota,
      baixarXml,
      baixarPdf,
      pastaDestino,
      login, // opcional (manual único)
      senha, // opcional (manual único)
    } = req.body;

    const logs = await runManualDownload({
      dataInicial,
      dataFinal,
      tipoNota,
      baixarXml,
      baixarPdf,
      pastaDestino,
      login,
      senha,
      onLog: (msg) => console.log(msg),
    });

    return res.json({ success: true, logs });
  } catch (err) {
    console.error("Erro em /api/nf/manual:", err);
    return res
      .status(500)
      .json({ success: false, error: "O robô não conseguiu concluir o download." });
  }
});

// execução em lote (todas as empresas)
app.post("/api/nf/lote", async (req, res) => {
  try {
    // AGORA o lote recebe as mesmas configs do manual
    const {
      dataInicial,
      dataFinal,
      tipoNota,
      baixarXml,
      baixarPdf,
      pastaDestino,
    } = req.body;

    const logs = await runLoteDownload(empresas, {
      dataInicial,
      dataFinal,
      tipoNota,
      baixarXml,
      baixarPdf,
      pastaDestino,
      onLog: (msg) => console.log(msg),
    });

    return res.json({ success: true, logs });
  } catch (err) {
    console.error("Erro em /api/nf/lote:", err);
    return res.status(500).json({
      success: false,
      error: "O robô não conseguiu concluir a execução em lote.",
    });
  }
});

// fallback pro dashboard
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "dashboard.html"));
});

// start
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
