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
  ensureDbFile();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

function normEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// ✅ Agora LISTA por usuário (tenant)
export function listarEmpresasEmissao(userEmail) {
  const db = readDb();
  const owner = normEmail(userEmail);
  if (!owner) return [];
  return db.empresas.filter((e) => normEmail(e.userEmail) === owner);
}

// ✅ busca por id, mas só dentro do dono
export function getEmpresaEmissaoById(id, userEmail) {
  const db = readDb();
  const idNum = Number(id);
  if (!Number.isFinite(idNum)) return null;

  const owner = normEmail(userEmail);
  if (!owner) return null;

  return (
    db.empresas.find((e) => Number(e.id) === idNum && normEmail(e.userEmail) === owner) || null
  );
}

// ✅ agora grava com userEmail (dono)
export function adicionarEmpresaEmissao({ nome, cnpj, municipio, userEmail }) {
  const db = readDb();
  const owner = normEmail(userEmail);
  if (!owner) throw new Error("userEmail é obrigatório (multi-tenant).");

  const cleanCnpj = (cnpj || "").toString().replace(/\D/g, "");
  const now = new Date().toISOString();

  const nova = {
    id: db.lastId + 1,
    userEmail: owner, // ✅ dono
    nome: (nome || "").trim(),
    cnpj: cleanCnpj,
    municipio: (municipio || "").toString().trim(),
    ativo: true,

    // credenciais (se você quiser usar depois)
    loginPortal: "",
    senhaPortal: "",

    // município IBGE (se preencher depois)
    municipioIbge: "",

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

// ✅ atualizar certificado só do dono
export function atualizarEmpresaEmissaoCertificado(id, userEmail, { certPfxPath, certPfxPassphrase }) {
  const db = readDb();
  const idNum = Number(id);
  if (!Number.isFinite(idNum)) return false;

  const owner = normEmail(userEmail);
  if (!owner) return false;

  const emp = db.empresas.find((e) => Number(e.id) === idNum && normEmail(e.userEmail) === owner);
  if (!emp) return false;

  emp.certPfxPath = String(certPfxPath || "").trim();
  emp.certPfxPassphrase = String(certPfxPassphrase || "").trim();
  emp.updatedAt = new Date().toISOString();

  writeDb(db);
  return true;
}

// ✅ remover só do dono
export function removerEmpresaEmissao(id, userEmail) {
  const db = readDb();
  const idNum = Number(id);
  if (!Number.isFinite(idNum)) return false;

  const owner = normEmail(userEmail);
  if (!owner) return false;

  const before = db.empresas.length;

  db.empresas = db.empresas.filter((e) => {
    const sameId = Number(e.id) === idNum;
    const sameOwner = normEmail(e.userEmail) === owner;
    // remove apenas se for o mesmo id e do mesmo dono
    return !(sameId && sameOwner);
  });

  writeDb(db);
  return db.empresas.length !== before;
}
