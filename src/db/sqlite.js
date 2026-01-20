// src/db/sqlite.js
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dbPath = path.join(process.cwd(), "data", "nfse.db");

// garante que a pasta data existe
const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// ✅ pragmas seguros (melhora concorrência e estabilidade; não muda tua lógica)
try {
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
} catch {}

// cria tabela de histórico se não existir
db.exec(`
  CREATE TABLE IF NOT EXISTS historico_execucoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- 🔹 ADICIONADO para separar histórico por usuário (sem quebrar nada)
    usuarioEmail TEXT,
    usuarioNome TEXT,

    empresaId TEXT,
    empresaNome TEXT,
    tipo TEXT,                -- 'manual' | 'lote'
    dataHora TEXT,            -- ISO string
    qtdXml INTEGER,
    qtdPdf INTEGER,
    totalArquivos INTEGER,
    status TEXT,              -- 'sucesso' | 'erro' | 'parcial'
    erros TEXT,               -- string JSON
    detalhes TEXT             -- texto livre (ex: 'Baixou emitidas de 01/10 a 31/10')
  );
`);

// ✅ índices leves (não muda nada, só acelera listagens por usuário/empresa)
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_hist_usuario_data ON historico_execucoes(usuarioEmail, dataHora);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_hist_empresa_data ON historico_execucoes(empresaId, dataHora);`);
} catch {}

export default db;
