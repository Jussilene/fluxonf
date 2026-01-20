import fs from "fs";
import https from "https";

const pfxPath = process.env.NFSE_CERT_PFX_PATH;
const passphrase = process.env.NFSE_CERT_PFX_PASSPHRASE;

if (!pfxPath) throw new Error("NFSE_CERT_PFX_PATH não definido no .env");
if (!passphrase) throw new Error("NFSE_CERT_PFX_PASSPHRASE não definido no .env");

console.log("🔐 Testando certificado:", pfxPath);

const pfx = fs.readFileSync(pfxPath);

new https.Agent({
  pfx,
  passphrase,
  rejectUnauthorized: true,
});

console.log("✅ Certificado A1 carregado com sucesso!");
