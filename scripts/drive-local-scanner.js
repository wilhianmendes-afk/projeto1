#!/usr/bin/env node
/**
 * Scanner local de qualificados no Google Drive
 *
 * Uso:
 *   node scripts/drive-local-scanner.js "C:\Users\Voce\Google Drive\Qualificados"
 *   node scripts/drive-local-scanner.js "C:\Users\Voce\Google Drive\Qualificados" --watch
 *   node scripts/drive-local-scanner.js "C:\Users\Voce\Google Drive\Qualificados" --watch --intervalo 30
 *
 * Flags:
 *   --watch         Fica rodando e verifica novas fotos a cada X minutos (padrão: 30)
 *   --intervalo N   Intervalo em minutos entre varreduras (padrão: 30)
 */

const fs   = require("fs");
const path = require("path");
const crypto = require("crypto");

// ─── CONFIGURAÇÃO ──────────────────────────────────────────────────────────────
const API_URL     = "https://projeto1-liard-one.vercel.app";
const API_TOKEN   = "Z2XTlF4YgnICGN-u_o8jIsFFXX5WpHgvfHiRlfXpebs";
const EXTENSOES   = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp"]);
const DELAY_MS    = 800;   // pausa entre arquivos para não sobrecarregar a API
// ───────────────────────────────────────────────────────────────────────────────

const args      = process.argv.slice(2);
const pasta     = args.find(a => !a.startsWith("--"));
const modoWatch = args.includes("--watch");
const idxInt    = args.indexOf("--intervalo");
const intervalo = idxInt !== -1 ? parseInt(args[idxInt + 1]) || 30 : 30;

if (!pasta) {
  console.log("\nUso: node drive-local-scanner.js <pasta> [--watch] [--intervalo <minutos>]");
  console.log('Exemplo: node drive-local-scanner.js "G:\\My Drive\\Qualificados" --watch --intervalo 15\n');
  process.exit(1);
}

if (!fs.existsSync(pasta)) {
  console.error(`\nPasta não encontrada: ${pasta}\n`);
  process.exit(1);
}

function md5(buffer) {
  return crypto.createHash("md5").update(buffer).digest("hex");
}

function listarImagens(dir) {
  const arquivos = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        arquivos.push(...listarImagens(caminho));
      } else if (EXTENSOES.has(path.extname(entry.name).toLowerCase())) {
        arquivos.push(caminho);
      }
    }
  } catch {}
  return arquivos;
}

async function enviarArquivo(caminhoArquivo) {
  const buffer   = fs.readFileSync(caminhoArquivo);
  const hash     = md5(buffer);
  const nome     = path.basename(caminhoArquivo);
  const ext      = path.extname(nome).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";

  // Monta multipart form-data manualmente (sem dependências externas)
  const boundary = "----FormBoundary" + Date.now().toString(16);

  function campo(nome, valor) {
    return `--${boundary}\r\nContent-Disposition: form-data; name="${nome}"\r\n\r\n${valor}\r\n`;
  }
  function arquivo(nome, filename, mime, buf) {
    return Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${nome}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
      buf,
      Buffer.from("\r\n"),
    ]);
  }

  const body = Buffer.concat([
    Buffer.from(campo("file_hash", hash)),
    Buffer.from(campo("file_name", nome)),
    arquivo("file", nome, mimeType, buffer),
    Buffer.from(`--${boundary}--\r\n`),
  ]);

  try {
    const res = await fetch(`${API_URL}/api/drive/local-import`, {
      method: "POST",
      headers: {
        "x-import-token": API_TOKEN,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    const data = await res.json();
    return data;
  } catch (e) {
    return { error: String(e) };
  }
}

function esperar(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function varrer() {
  const inicio = Date.now();
  console.log(`\n[${ new Date().toLocaleString("pt-BR") }] Varrendo: ${pasta}`);

  const imagens = listarImagens(pasta);
  console.log(`  ${imagens.length} imagem(ns) encontrada(s)`);

  let importadas = 0, puladas = 0, semDados = 0, erros = 0;

  for (const arquivo of imagens) {
    const resultado = await enviarArquivo(arquivo);

    if (resultado.status === "imported") {
      console.log(`  ✓ ${path.basename(arquivo)} → ${resultado.nome}`);
      importadas++;
    } else if (resultado.status === "skipped") {
      puladas++;
    } else if (resultado.status === "sem_dados") {
      // Não é ficha de qualificado ou não tem nome — ignora silenciosamente
      semDados++;
    } else {
      console.log(`  ✗ ${path.basename(arquivo)}: ${resultado.error ?? resultado.reason ?? "erro"}`);
      erros++;
    }

    await esperar(DELAY_MS);
  }

  const seg = ((Date.now() - inicio) / 1000).toFixed(0);
  console.log(`  Resultado: ${importadas} importadas | ${puladas} já existiam | ${semDados} sem dados | ${erros} erros | ${seg}s`);
}

// ─── EXECUÇÃO ──────────────────────────────────────────────────────────────────
(async () => {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Scanner de Qualificados — Intel Facial 42ª BPM");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Pasta : ${pasta}`);
  console.log(`  Modo  : ${modoWatch ? `watch (a cada ${intervalo} min)` : "único"}`);
  console.log("───────────────────────────────────────────────────");

  await varrer();

  if (modoWatch) {
    console.log(`\n  Próxima varredura em ${intervalo} minutos. Ctrl+C para parar.`);
    setInterval(async () => {
      await varrer();
      console.log(`\n  Próxima varredura em ${intervalo} minutos.`);
    }, intervalo * 60 * 1000);
  }
})();
