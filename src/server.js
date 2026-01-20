// src/server.js
import "dotenv/config";

import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import archiver from "archiver";
import { fileURLToPath } from "url";

import { runManualDownload, runLoteDownload } from "./bot/nfseBot.js";

// ✅ usa o store único (não duplica banco no server)
import { listarEmpresas, adicionarEmpresa, removerEmpresa } from "./utils/empresasStore.js";

// ✅ HISTÓRICO está em src/emissao/routes/
import historicoRoutes from "./emissao/routes/historico.routes.js";

// ✅ rotas da emissão
import emissaoRoutes from "./emissao/routes/emissao.routes.js";

// ✅ garante tabela de emissão no SQLite
import { ensureNfseEmissaoTables } from "./emissao/nfseEmissao.model.js";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------
// ✅ Boot: garante tabelas
// ---------------------------
ensureNfseEmissaoTables();

// ---------------------------
// Middlewares
// ---------------------------
app.use(cors());
app.use(express.json({ limit: "25mb" })); // ✅ necessário pro base64 do PFX
app.use(express.urlencoded({ extended: true, limit: "25mb" })); // ✅ idem
app.use(express.static(path.join(__dirname, "..", "public")));

// ---------------------------
// Pasta pública de ZIPs
// ---------------------------
const ZIP_DIR = path.join(__dirname, "..", "public", "zips");
if (!fs.existsSync(ZIP_DIR)) {
  fs.mkdirSync(ZIP_DIR, { recursive: true });
}

// ---------------------------
// ✅ Empresas (store único em JSON: data/empresas.json)
// ---------------------------

// GET /api/empresas -> retorna padrão { empresas: [...] } (e mantém compatibilidade)
app.get("/api/empresas", (req, res) => {
  const empresas = listarEmpresas();
  return res.json({ ok: true, empresas });
});

// POST /api/empresas
app.post("/api/empresas", (req, res) => {
  const { nome, cnpj, loginPortal, senhaPortal, municipio } = req.body || {};

  if (!nome || !cnpj) {
    return res.status(400).json({ ok: false, error: "Nome e CNPJ são obrigatórios." });
  }

  const nova = adicionarEmpresa({
    nome,
    cnpj,
    loginPortal,
    senhaPortal: senhaPortal || "",
    municipio: municipio || "",
  });

  return res.status(201).json({ ok: true, empresa: nova });
});

// DELETE /api/empresas/:id
app.delete("/api/empresas/:id", (req, res) => {
  const { id } = req.params;
  const ok = removerEmpresa(id);

  if (!ok) {
    return res.status(404).json({ ok: false, error: "Empresa não encontrada." });
  }

  return res.json({ ok: true });
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
// Emissão
// ---------------------------
app.use("/api/emissao", emissaoRoutes);

// ---------------------------
// ✅ Validação de período (backend)
// ---------------------------
function assertPeriodo(req, res) {
  const { dataInicial, dataFinal } = req.body || {};
  if (!dataInicial || !dataFinal) {
    res.status(400).json({
      success: false,
      error: "Informe dataInicial e dataFinal (obrigatório).",
    });
    return false;
  }
  return true;
}

// ---------------------------
// Helpers: tipos selecionados
// ---------------------------
function normalizeTipos(processarTipos, tipoNotaFallback) {
  const allow = new Set(["emitidas", "recebidas", "canceladas"]);

  const arr = Array.isArray(processarTipos) ? processarTipos : [];
  const clean = arr.map((t) => String(t).toLowerCase()).filter((t) => allow.has(t));

  if (clean.length) return Array.from(new Set(clean));

  // fallback (compatível com UI antiga de radio)
  const t = (tipoNotaFallback || "emitidas").toLowerCase();
  return allow.has(t) ? [t] : ["emitidas"];
}

// ---------------------------
// ROBÔ – MANUAL
// ---------------------------
app.post("/api/nf/manual", async (req, res) => {
  try {
    if (!assertPeriodo(req, res)) return;

    const baixarXml = !!req.body?.baixarXml;
    const baixarPdf = !!req.body?.baixarPdf;

    const tipos = normalizeTipos(req.body?.processarTipos, req.body?.tipoNota);

    const baseBody = {
      ...req.body,
      baixarXml,
      baixarPdf,
      onLog: (msg) => console.log(msg),
    };

    let allLogs = [];
    let rootJobDir = null;

    for (const tipoNota of tipos) {
      const result = await runManualDownload({
        ...baseBody,
        tipoNota,
        jobDir: rootJobDir || undefined,
      });

      (result?.logs || []).forEach((m) => allLogs.push(m));

      if (!rootJobDir) {
        rootJobDir = result?.paths?.jobDir || result?.jobDir || null;
      }
    }

    let downloadZipUrl = null;

    const zipTarget = rootJobDir && fs.existsSync(rootJobDir) ? rootJobDir : null;

    if (zipTarget) {
      const zipName = `nfse-manual-${Date.now()}.zip`;
      const zipPath = path.join(ZIP_DIR, zipName);

      await zipDirectory(zipTarget, zipPath);
      downloadZipUrl = `/zips/${zipName}`;
    }

    return res.json({
      success: true,
      logs: allLogs,
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
    if (!assertPeriodo(req, res)) return;

    // ✅ pega do store único
    const empresas = listarEmpresas();

    if (!empresas || empresas.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Nenhuma empresa cadastrada para execução em lote.",
      });
    }

    const baixarXml = !!req.body?.baixarXml;
    const baixarPdf = !!req.body?.baixarPdf;

    const tipos = normalizeTipos(req.body?.processarTipos, req.body?.tipoNota);

    const result = await runLoteDownload(empresas, {
      ...req.body,
      baixarXml,
      baixarPdf,
      onLog: (msg) => console.log(msg),
      processarTipos: tipos,
    });

    const logs = result?.logs || [];

    const finalDir = result?.paths?.jobDir || result?.jobDir || null;

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
