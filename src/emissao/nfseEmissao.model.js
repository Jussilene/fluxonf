// src/emissao/nfseEmissao.model.js
import db from "../db/sqlite.js";

function hasColumn(table, col) {
  const rows = db.prepare(`PRAGMA table_info(${table});`).all();
  return rows.some((r) => r.name === col);
}

function addColumnIfMissing(table, col, ddl) {
  if (!hasColumn(table, col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl};`);
  }
}

export function ensureNfseEmissaoTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS nfse_emitidas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuarioEmail TEXT,
      empresaId TEXT,
      empresaNome TEXT,

      tomadorDocumento TEXT,
      tomadorNome TEXT,
      tomadorEmail TEXT,

      descricaoServico TEXT,
      valorServico REAL,

      status TEXT,          -- 'emitida' | 'erro' | 'pendente' | 'cancelada'
      numeroNota TEXT,
      mensagem TEXT,

      pdfPath TEXT,
      xmlPath TEXT,

      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ✅ colunas novas (compatíveis)
  try {
    addColumnIfMissing("nfse_emitidas", "provider", "provider TEXT");
    addColumnIfMissing("nfse_emitidas", "chaveAcesso", "chaveAcesso TEXT");
    addColumnIfMissing("nfse_emitidas", "rawJson", "rawJson TEXT");
    addColumnIfMissing("nfse_emitidas", "rawXml", "rawXml TEXT");
  } catch {}

  // ✅ eventos (cancelamento etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS nfse_eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuarioEmail TEXT,
      empresaId TEXT,
      chaveAcesso TEXT,
      tipo TEXT,            -- 'cancelamento' etc
      justificativa TEXT,
      status TEXT,          -- 'sucesso' | 'erro'
      mensagem TEXT,
      rawJson TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_emitidas_usuario_data ON nfse_emitidas(usuarioEmail, createdAt);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_emitidas_chave ON nfse_emitidas(chaveAcesso);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_eventos_chave ON nfse_eventos(chaveAcesso, createdAt);`);
  } catch {}
}

export function insertNfseEmitida(row) {
  const stmt = db.prepare(`
    INSERT INTO nfse_emitidas (
      usuarioEmail, empresaId, empresaNome,
      tomadorDocumento, tomadorNome, tomadorEmail,
      descricaoServico, valorServico,
      status, numeroNota, mensagem,
      pdfPath, xmlPath,
      provider, chaveAcesso, rawJson, rawXml
    ) VALUES (
      @usuarioEmail, @empresaId, @empresaNome,
      @tomadorDocumento, @tomadorNome, @tomadorEmail,
      @descricaoServico, @valorServico,
      @status, @numeroNota, @mensagem,
      @pdfPath, @xmlPath,
      @provider, @chaveAcesso, @rawJson, @rawXml
    )
  `);
  const info = stmt.run({
    ...row,
    provider: row.provider ?? "portal",
    chaveAcesso: row.chaveAcesso ?? "",
    rawJson: row.rawJson ?? "",
    rawXml: row.rawXml ?? "",
  });
  return info.lastInsertRowid;
}

export function listNfseEmitidas({ usuarioEmail, empresaId, limit = 60 }) {
  const stmt = db.prepare(`
    SELECT *
    FROM nfse_emitidas
    WHERE usuarioEmail = ?
      AND (? IS NULL OR empresaId = ?)
    ORDER BY id DESC
    LIMIT ?
  `);
  return stmt.all(usuarioEmail, empresaId ?? null, empresaId ?? null, limit);
}

export function getNfseByChave(chaveAcesso) {
  const stmt = db.prepare(`
    SELECT *
    FROM nfse_emitidas
    WHERE chaveAcesso = ?
    ORDER BY id DESC
    LIMIT 1
  `);
  return stmt.get(chaveAcesso);
}

export function markNfseAsCancelada({ chaveAcesso, mensagem }) {
  const stmt = db.prepare(`
    UPDATE nfse_emitidas
    SET status = 'cancelada',
        mensagem = COALESCE(?, mensagem)
    WHERE chaveAcesso = ?
  `);
  return stmt.run(mensagem || null, chaveAcesso);
}

export function insertEvento(row) {
  const stmt = db.prepare(`
    INSERT INTO nfse_eventos (
      usuarioEmail, empresaId, chaveAcesso,
      tipo, justificativa, status, mensagem, rawJson
    ) VALUES (
      @usuarioEmail, @empresaId, @chaveAcesso,
      @tipo, @justificativa, @status, @mensagem, @rawJson
    )
  `);
  const info = stmt.run({
    ...row,
    rawJson: row.rawJson ?? "",
  });
  return info.lastInsertRowid;
}
