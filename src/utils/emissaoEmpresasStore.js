// src/utils/emissaoEmpresasStore.js
import fs from "fs";
import path from "path";

const DB_DIR = path.resolve(process.cwd(), "data");
const DB_FILE = path.join(DB_DIR, "emissao_empresas.json");

function ensureDbFile() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ lastId: 0, empresas: [] }, null, 2), "utf8");
  }
}

function readDb() {
  ensureDbFile();
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(raw);

    // compatibilidade: se for array antigo, converte
    if (Array.isArray(parsed)) {
      const converted = { lastId: parsed.length, empresas: parsed };
      fs.writeFileSync(DB_FILE, JSON.stringify(converted, null, 2), "utf8");
      return converted;
    }

    if (!parsed || typeof parsed !== "object") throw new Error("Formato inválido");
    if (!Array.isArray(parsed.empresas)) parsed.empresas = [];
    if (typeof parsed.lastId !== "number") parsed.lastId = 0;

    return parsed;
  } catch {
    const reset = { lastId: 0, empresas: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(reset, null, 2), "utf8");
    return reset;
  }
}

function writeDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

export function listarEmpresasEmissao() {
  return readDb().empresas;
}

export function getEmpresaEmissaoById(id) {
  const db = readDb();
  const idNum = Number(id);
  if (!Number.isFinite(idNum)) return null;

  // ✅ 100% separado: só busca no store de emissão
  return db.empresas.find((e) => Number(e.id) === idNum) || null;
}

export function adicionarEmpresaEmissao({ nome, cnpj, municipio }) {
  const db = readDb();
  const cleanCnpj = (cnpj || "").toString().replace(/\D/g, "");
  const now = new Date().toISOString();

  const nova = {
    id: db.lastId + 1,
    nome: (nome || "").trim(),
    cnpj: cleanCnpj,
    municipio: (municipio || "").toString().trim(),
    ativo: true,

    // certificado vinculado à empresa de emissão
    certPfxPath: "",
    certPfxPassphrase: "",

    createdAt: now,
    updatedAt: now,
  };

  db.lastId = nova.id;
  db.empresas.push(nova);
  writeDb(db);
  return nova;
}

export function atualizarEmpresaEmissaoCertificado(id, { certPfxPath, certPfxPassphrase }) {
  const db = readDb();
  const idNum = Number(id);
  if (!Number.isFinite(idNum)) return false;

  // ✅ 100% separado: se não existe no store de emissão, NÃO importa do lote
  const emp = db.empresas.find((e) => Number(e.id) === idNum);
  if (!emp) return false;

  emp.certPfxPath = String(certPfxPath || "").trim();
  emp.certPfxPassphrase = String(certPfxPassphrase || "").trim();
  emp.updatedAt = new Date().toISOString();

  writeDb(db);
  return true;
}

export function removerEmpresaEmissao(id) {
  const db = readDb();
  const idNum = Number(id);
  if (!Number.isFinite(idNum)) return false;

  const before = db.empresas.length;
  db.empresas = db.empresas.filter((e) => Number(e.id) !== idNum);
  writeDb(db);

  return db.empresas.length !== before;
}
