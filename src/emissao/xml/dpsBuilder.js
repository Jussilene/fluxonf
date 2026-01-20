// src/emissao/xml/dpsBuilder.js

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

function escXml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ✅ map inicial (você pode expandir depois)
const MUNICIPIO_IBGE_MAP = {
  "curitiba": "4106902",
  "sao paulo": "3550308",
  "são paulo": "3550308",
  "araguaina": "1702109",
  "araguaína": "1702109",
};

function resolveMunicipioIbge({ payload, empresa }) {
  const fromPayload = onlyDigits(payload?.municipioIbge);
  if (fromPayload && fromPayload.length >= 6) return fromPayload;

  const fromEmpresa = onlyDigits(empresa?.municipioIbge);
  if (fromEmpresa && fromEmpresa.length >= 6) return fromEmpresa;

  const nome = String(payload?.municipio || empresa?.municipio || "").trim().toLowerCase();
  if (nome && MUNICIPIO_IBGE_MAP[nome]) return MUNICIPIO_IBGE_MAP[nome];

  return "";
}

/**
 * DPS minimalista (para teste/homologação)
 * - Inclui Município IBGE quando disponível (ajuda a não cair no "município vazio")
 *
 * Obs: A estrutura completa da DPS pode exigir mais tags (item/NBS/cClassTrib etc),
 * mas isso já deixa teu payload “coerente” e evita o buraco do município.
 */
export function buildDpsXmlMinimal({ payload, empresa }) {
  const prestCnpj = onlyDigits(empresa?.cnpj);
  const tomadorDoc = onlyDigits(payload?.tomadorDocumento);

  const valor = Number(payload?.valorServico || 0);
  const valorFmt = Number.isFinite(valor) ? valor.toFixed(2) : "0.00";

  const dataCompetencia = payload?.dataCompetencia ? escXml(payload.dataCompetencia) : "";

  const descricao = escXml(payload?.descricaoServico || "");
  const tomadorNome = escXml(payload?.tomadorNome || "");
  const tomadorEmail = escXml(payload?.tomadorEmail || "");

  const municipioIbge = resolveMunicipioIbge({ payload, empresa });

  const idDps = `DPS-${Date.now()}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<DPS xmlns="http://www.sped.fazenda.gov.br/nfse">
  <InfDPS Id="${escXml(idDps)}">
    <Prestador>
      <CNPJ>${prestCnpj}</CNPJ>
      <RazaoSocial>${escXml(empresa?.nome || "")}</RazaoSocial>
    </Prestador>

    <Tomador>
      <Documento>${tomadorDoc}</Documento>
      <NomeRazao>${tomadorNome}</NomeRazao>
      ${tomadorEmail ? `<Email>${tomadorEmail}</Email>` : ""}
    </Tomador>

    ${dataCompetencia ? `<Competencia>${dataCompetencia}</Competencia>` : ""}

    ${
      municipioIbge
        ? `<LocalPrestacao>
      <CodigoMunicipio>${escXml(municipioIbge)}</CodigoMunicipio>
    </LocalPrestacao>`
        : ""
    }

    <Servico>
      <Discriminacao>${descricao}</Discriminacao>
      <Valores>
        <ValorServicos>${valorFmt}</ValorServicos>
      </Valores>
    </Servico>
  </InfDPS>
</DPS>`;
}
