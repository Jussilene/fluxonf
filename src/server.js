import "dotenv/config";

import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import archiver from "archiver";
import { fileURLToPath } from "url";

import { runManualDownload, runLoteDownload } from "./bot/nfseBot.js";
import historicoRoutes from "./routes/historico.routes.js";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------
// Middlewares
// ---------------------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "..", "public")));

// ---------------------------
// Pasta pública de ZIPs
// ---------------------------
const ZIP_DIR = path.join(__dirname, "..", "public", "zips");
if (!fs.existsSync(ZIP_DIR)) {
  fs.mkdirSync(ZIP_DIR, { recursive: true });
}

// ---------------------------
// ✅ Empresas (persistência simples em JSON)
// ---------------------------
const DATA_DIR = path.join(__dirname, "..", "data");
const EMPRESAS_FILE = path.join(DATA_DIR, "empresas.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(EMPRESAS_FILE)) {
  fs.writeFileSync(EMPRESAS_FILE, JSON.stringify([], null, 2), "utf-8");
}

function readEmpresas() {
  try {
    const raw = fs.readFileSync(EMPRESAS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEmpresas(empresas) {
  fs.writeFileSync(EMPRESAS_FILE, JSON.stringify(empresas, null, 2), "utf-8");
}

// Rotas de empresas (o front já chama /api/empresas)
app.get("/api/empresas", (req, res) => {
  const empresas = readEmpresas();
  return res.json(empresas);
});

app.post("/api/empresas", (req, res) => {
  const { nome, cnpj, senhaPortal } = req.body || {};

  if (!nome || !cnpj) {
    return res.status(400).json({ error: "Nome e CNPJ são obrigatórios." });
  }

  const empresas = readEmpresas();

  const novaEmpresa = {
    id: String(Date.now()),
    nome: String(nome).trim(),
    cnpj: String(cnpj).trim(),
    senhaPortal: senhaPortal ? String(senhaPortal) : "",
  };

  empresas.push(novaEmpresa);
  writeEmpresas(empresas);

  return res.status(201).json(novaEmpresa);
});

app.delete("/api/empresas/:id", (req, res) => {
  const { id } = req.params;
  const empresas = readEmpresas();
  const novo = empresas.filter((e) => String(e.id) !== String(id));

  if (novo.length === empresas.length) {
    return res.status(404).json({ error: "Empresa não encontrada." });
  }

  writeEmpresas(novo);
  return res.json({ success: true });
});

// ---------------------------
// Helper ZIP
// ---------------------------
function zipDirectory(sourceDir, zipFilePath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    output.on("error", (err) => reject(err));
    archive.on("error", (err) => reject(err));

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

// ---------------------------
// Histórico
// ---------------------------
app.use("/api/historico", historicoRoutes);

// ---------------------------
// ROBÔ – MANUAL
// ---------------------------
app.post("/api/nf/manual", async (req, res) => {
  try {
    const result = await runManualDownload({
      ...req.body,
      onLog: (msg) => console.log(msg),
    });

    const logs = result?.logs || [];

    // ✅ fallback para não “perder” a pasta caso o bot retorne com outro nome
    const finalDir =
      result?.paths?.finalDir ||
      result?.finalDir ||
      result?.outputDir ||
      result?.paths?.outputDir ||
      null;

    let downloadZipUrl = null;

    if (finalDir && fs.existsSync(finalDir)) {
      const zipName = `nfse-manual-${Date.now()}.zip`;
      const zipPath = path.join(ZIP_DIR, zipName);

      await zipDirectory(finalDir, zipPath);
      downloadZipUrl = `/zips/${zipName}`;
    }

    return res.json({
      success: true,
      logs,
      downloadZipUrl,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      error: "Erro ao executar download manual",
    });
  }
});

// ---------------------------
// ROBÔ – LOTE
// ---------------------------
app.post("/api/nf/lote", async (req, res) => {
  try {
    const empresas = readEmpresas();

    if (!empresas || empresas.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Nenhuma empresa cadastrada para execução em lote.",
      });
    }

    // ✅ agora passa as empresas cadastradas pro robô
    const result = await runLoteDownload(empresas, {
      ...req.body,
      onLog: (msg) => console.log(msg),
    });

    const logs = result?.logs || [];

    const finalDir =
      result?.paths?.finalDir ||
      result?.finalDir ||
      result?.outputDir ||
      result?.paths?.outputDir ||
      null;

    let downloadZipUrl = null;

    if (finalDir && fs.existsSync(finalDir)) {
      const zipName = `nfse-lote-${Date.now()}.zip`;
      const zipPath = path.join(ZIP_DIR, zipName);

      await zipDirectory(finalDir, zipPath);
      downloadZipUrl = `/zips/${zipName}`;
    }

    return res.json({
      success: true,
      logs,
      downloadZipUrl,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      error: "Erro ao executar lote",
    });
  }
});

// ---------------------------
// Fallback
// ---------------------------
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "dashboard.html"));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
