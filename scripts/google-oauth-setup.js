/**
 * Gera o refresh token OAuth2 para bancodequalificados@gmail.com.
 *
 * Uso:
 *   node scripts/google-oauth-setup.js <CLIENT_ID> <CLIENT_SECRET>
 *
 * Após obter o refresh token, adicione ao .env.local e Vercel:
 *   GOOGLE_OAUTH_CLIENT_ID=...
 *   GOOGLE_OAUTH_CLIENT_SECRET=...
 *   GOOGLE_OAUTH_REFRESH_TOKEN=...
 *   DRIVE_BQ_FOLDER_ID=<ID da pasta no Drive do bancodequalificados@gmail.com>
 */

const http = require("http");
const { google } = require("googleapis");

const PORT = 3333;
const REDIRECT_URI = `http://localhost:${PORT}`;

const CLIENT_ID = process.argv[2];
const CLIENT_SECRET = process.argv[3];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Uso: node scripts/google-oauth-setup.js <CLIENT_ID> <CLIENT_SECRET>");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/drive.readonly"],
});

console.log("\n==== Autorização Google Drive OAuth2 ====\n");
console.log("1. Abra esta URL no navegador:\n");
console.log("   " + authUrl);
console.log("\n2. Faça login com bancodequalificados@gmail.com e clique em Permitir.");
console.log("3. O script captura o código automaticamente...\n");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get("code");

  if (!code) {
    res.writeHead(400);
    res.end("Código não encontrado na URL.");
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <h2>✅ Autorizado!</h2>
      <p>Pode fechar esta aba e voltar ao terminal.</p>
    `);
    server.close();

    console.log("✅ Autorização concluída! Adicione ao .env.local e no Vercel:\n");
    console.log(`GOOGLE_OAUTH_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GOOGLE_OAUTH_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log("\nTambém adicione o ID da pasta do Drive (veja instruções no README):");
    console.log("DRIVE_BQ_FOLDER_ID=<id_da_pasta>");
    console.log("\nDepois faça deploy na Vercel para ativar a indexação.");
  } catch (err) {
    res.writeHead(500);
    res.end("Erro ao trocar código por token: " + err.message);
    console.error("Erro:", err.message);
    server.close();
  }
});

server.listen(PORT, () => {
  console.log(`Aguardando resposta do Google em http://localhost:${PORT} ...`);
});
