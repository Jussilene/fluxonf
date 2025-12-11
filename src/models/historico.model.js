// src/models/historico.model.js
import db from "../db/sqlite.js";

export function registrarExecucao({
  empresaId,
  empresaNome,
  tipo,
  qtdXml,
  qtdPdf,
  totalArquivos,
  status,
  erros,
  detalhes,
}) {
  const stmt = db.prepare(`
    INSERT INTO historico_execucoes (
      empresaId,
      empresaNome,
      tipo,
      dataHora,
      qtdXml,
      qtdPdf,
      totalArquivos,
      status,
      erros,
      detalhes
    ) VALUES (
      @empresaId,
      @empresaNome,
      @tipo,
      @dataHora,
      @qtdXml,
      @qtdPdf,
      @totalArquivos,
      @status,
      @erros,
      @detalhes
    )
  `);

  const dataHora = new Date().toISOString();

  stmt.run({
    empresaId: empresaId || null,
    empresaNome: empresaNome || null,
    tipo: tipo || "manual",
    dataHora,
    qtdXml: qtdXml ?? 0,
    qtdPdf: qtdPdf ?? 0,
    totalArquivos: totalArquivos ?? (qtdXml ?? 0) + (qtdPdf ?? 0),
    status: status || "sucesso",
    erros: erros ? JSON.stringify(erros) : null,
    detalhes: detalhes || null,
  });
}

export function listarHistorico({ empresaId, tipo, dataDe, dataAte } = {}) {
  let sql = `SELECT * FROM historico_execucoes WHERE 1=1`;
  const params = {};

  if (empresaId) {
    sql += ` AND empresaId = @empresaId`;
    params.empresaId = empresaId;
  }

  if (tipo) {
    sql += ` AND tipo = @tipo`;
    params.tipo = tipo;
  }

  if (dataDe) {
    sql += ` AND dataHora >= @dataDe`;
    params.dataDe = dataDe;
  }

  if (dataAte) {
    sql += ` AND dataHora <= @dataAte`;
    params.dataAte = dataAte;
  }

  sql += ` ORDER BY datetime(dataHora) DESC LIMIT 200`;

  const stmt = db.prepare(sql);
  return stmt.all(params);
}
