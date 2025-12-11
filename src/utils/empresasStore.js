// src/utils/empresasStore.js
// "Banco de dados" simples em JSON para empresas do lote NFSe

import fs from "fs";
import path from "path";

const DB_DIR = path.resolve(process.cwd(), "data");
const DB_FILE = path.join(DB_DIR, "empresas.json");

// Garante que a pasta e o arquivo existem
function ensureDbFile() {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify({ lastId: 0, empresas: [] }, null, 2));
    }
  } catch (err) {
    console.error("[EMPRESAS_DB] Erro ao garantir arquivo de banco:", err);
  }
}

function readDb() {
  ensureDbFile();
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Formato inválido");
    }
    if (!Array.isArray(parsed.empresas)) {
      parsed.empresas = [];
    }
    if (typeof parsed.lastId !== "number") {
      parsed.lastId = 0;
    }
    return parsed;
  } catch (err) {
    console.error("[EMPRESAS_DB] Erro ao ler banco. Recriando...", err);
    const reset = { lastId: 0, empresas: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(reset, null, 2));
    return reset;
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("[EMPRESAS_DB] Erro ao escrever banco:", err);
  }
}

export function listarEmpresas() {
  const db = readDb();
  return db.empresas;
}

export function adicionarEmpresa({ nome, cnpj, loginPortal, senhaPortal }) {
  const db = readDb();

  const cleanCnpj = (cnpj || "")
    .toString()
    .replace(/\D/g, "");

  const now = new Date().toISOString();

  const novaEmpresa = {
    id: db.lastId + 1,
    nome: (nome || "").trim(),
    cnpj: cleanCnpj,
    loginPortal: (loginPortal || cleanCnpj || "").trim(),
    senhaPortal: senhaPortal || "",
    ativo: true,
    createdAt: now,
    updatedAt: now,
  };

  db.lastId = novaEmpresa.id;
  db.empresas.push(novaEmpresa);
  writeDb(db);

  return novaEmpresa;
}

export function removerEmpresa(id) {
  const db = readDb();
  const idNum = Number(id);

  const before = db.empresas.length;
  db.empresas = db.empresas.filter((emp) => emp.id !== idNum);
  const after = db.empresas.length;

  if (after !== before) {
    writeDb(db);
    return true;
  }
  return false;
}
