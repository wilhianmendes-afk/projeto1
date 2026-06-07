"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Newspaper, CreditCard, ShoppingCart, ExternalLink, Globe, Upload, ImagePlus, Check } from "lucide-react";

function gerarSlug() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function gerarTransacao() {
  return Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join("");
}

function gerarPixId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz";
  return "E" + Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function hojeFormatado() {
  const d = new Date();
  const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return `${d.getDate()}/${meses[d.getMonth()]}/${d.getFullYear()}`;
}

function hojeInterFormatado() {
  const d = new Date();
  const dias = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
  const dia = String(d.getDate()).padStart(2,"0");
  const mes = String(d.getMonth()+1).padStart(2,"0");
  return `${dias[d.getDay()]}, ${dia}/${mes}/${d.getFullYear()}`;
}

function hojeCaixaFormatado() {
  const d = new Date();
  const dia = String(d.getDate()).padStart(2,"0");
  const mes = String(d.getMonth()+1).padStart(2,"0");
  return `${dia}/${mes}/${d.getFullYear()}`;
}

function horaCaixaFormatada() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
}

function gerarIdentificador() {
  return Array.from({ length: 20 }, () => Math.floor(Math.random() * 10)).join("");
}

function horaFormatada() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,"0")}h${String(d.getMinutes()).padStart(2,"0")}`;
}

// ─── Logos disponíveis ───────────────────────────────────────────────────────

const LOGOS = [
  { id: "g1",     label: "G1",     bg: "#CC0000", text: "g1",     textColor: "#fff", italic: true },
  { id: "record", label: "Record", bg: "#003087", text: "Record", textColor: "#fff", italic: false },
  { id: "sbt",    label: "SBT",    bg: "#0033A0", text: "SBT",    textColor: "#fff", italic: false },
  { id: "band",   label: "Band",   bg: "#FFD700", text: "Band",   textColor: "#000", italic: false },
];

const PLATAFORMAS_ANUNCIO = [
  { id: "mercadolivre", label: "Mercado Livre", cor: "#FFE600", corTexto: "#333", redirect: "https://www.mercadolivre.com.br" },
  { id: "shopee",       label: "Shopee",        cor: "#EE4D2D", corTexto: "#fff", redirect: "https://shopee.com.br" },
  { id: "olx",          label: "OLX",           cor: "#6E0AD6", corTexto: "#fff", redirect: "https://www.olx.com.br" },
];

const PORTAL_CONFIGS = [
  { id: "g1",        label: "G1",        logoId: "g1",     bg: "#CC0000", textColor: "#fff", italic: true,  redirect: "https://g1.globo.com" },
  { id: "record",    label: "Record TV", logoId: "record", bg: "#003087", textColor: "#fff", italic: false, redirect: "https://www.recordtv.com.br" },
  { id: "sbt",       label: "SBT",       logoId: "sbt",    bg: "#0033A0", textColor: "#fff", italic: false, redirect: "https://www.sbt.com.br" },
  { id: "band",      label: "Band",      logoId: "band",   bg: "#FFD700", textColor: "#000", italic: false, redirect: "https://www.band.com.br" },
  { id: "instagram", label: "Instagram", logoId: null,     bg: "#C13584", textColor: "#fff", italic: false, redirect: "https://www.instagram.com" },
];

function drawLogoOnCanvas(
  ctx: CanvasRenderingContext2D,
  logo: typeof LOGOS[0],
  x: number, y: number, w: number, h: number
) {
  ctx.fillStyle = logo.bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = logo.textColor;
  const fontSize = h * (logo.text.length > 3 ? 0.3 : 0.55);
  ctx.font = `${logo.italic ? "bold italic" : "bold"} ${fontSize}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(logo.text, x + w / 2, y + h / 2);
}

function drawInstagramIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const r = size * 0.22;
  // Gradient background (purple → pink → orange)
  const grad = ctx.createLinearGradient(x, y + size, x + size, y);
  grad.addColorStop(0, "#f09433");
  grad.addColorStop(0.25, "#e6683c");
  grad.addColorStop(0.5, "#dc2743");
  grad.addColorStop(0.75, "#cc2366");
  grad.addColorStop(1, "#bc1888");
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + size, y, x + size, y + size, r);
  ctx.arcTo(x + size, y + size, x, y + size, r);
  ctx.arcTo(x, y + size, x, y, r);
  ctx.arcTo(x, y, x + size, y, r);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  // White circle (lens)
  const cx = x + size / 2, cy = y + size / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.28, 0, Math.PI * 2);
  ctx.strokeStyle = "white";
  ctx.lineWidth = size * 0.08;
  ctx.stroke();
  // White dot (top-right viewfinder)
  ctx.beginPath();
  ctx.arc(x + size * 0.72, y + size * 0.28, size * 0.065, 0, Math.PI * 2);
  ctx.fillStyle = "white";
  ctx.fill();
}

// ─── Canvas: PIX OG Image (1200×630) ─────────────────────────────────────────

function drawPixOgCanvas(ctx: CanvasRenderingContext2D, pix: PixForm, banco: string) {
  const W = 1200, H = 630;
  const colors: Record<string, string> = { mercado_pago: "#00b1ea", inter: "#FF6B00", caixa: "#005CA9" };
  const names: Record<string, string>  = { mercado_pago: "mercado pago", inter: "inter", caixa: "CAIXA" };
  const color    = colors[banco] || "#00b1ea";
  const bankName = names[banco]  || "mercado pago";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Left accent strip
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 16, H);

  // Header band
  ctx.fillStyle = color;
  ctx.fillRect(16, 0, W - 16, 120);
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(16, 0, W - 16, 120);
  ctx.fillStyle = color;
  ctx.fillRect(16, 0, W - 16, 120);

  ctx.fillStyle = "white";
  ctx.font = banco === "inter" ? "bold italic 62px Arial" : "bold 62px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(bankName, 48, 60);

  // Subtitle in header (banco label)
  if (banco === "mercado_pago" || banco === "caixa") {
    ctx.font = "28px Arial";
    ctx.globalAlpha = 0.75;
    ctx.fillText(banco === "caixa" ? "Comprovante de Pix" : "Comprovante de Pix", W - 400, 60);
    ctx.globalAlpha = 1;
  }

  // Green check circle
  ctx.fillStyle = "#22c55e";
  ctx.beginPath();
  ctx.arc(60, 162, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "white";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(50, 162);
  ctx.lineTo(58, 172);
  ctx.lineTo(72, 150);
  ctx.stroke();

  // Title
  ctx.fillStyle = "#111827";
  ctx.font = "bold 36px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(banco === "inter" ? "Pix enviado" : "Comprovante de Pix", 94, 162);

  // Date + time
  ctx.fillStyle = "#6b7280";
  ctx.font = "22px Arial";
  ctx.textAlign = "right";
  ctx.fillText(`${pix.data || ""}  ${pix.horario || ""}`.trim(), W - 44, 162);

  // Large R$ value
  ctx.fillStyle = "#111827";
  ctx.font = "bold 84px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`R$ ${pix.valor || "0"}`, 44, 300);

  // Divider 1
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(44, 330);
  ctx.lineTo(W - 44, 330);
  ctx.stroke();

  // De / Para columns
  const c1 = 44, c2 = W / 2 + 20;
  const maxW = W / 2 - c1 - 40;

  function trunc(text: string, mw: number, font: string): string {
    ctx.font = font;
    if (ctx.measureText(text).width <= mw) return text;
    let t = text;
    while (t.length > 0 && ctx.measureText(t + "…").width > mw) t = t.slice(0, -1);
    return t + "…";
  }

  ctx.fillStyle = "#9ca3af";
  ctx.font = "20px Arial";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText("De", c1, 352);
  ctx.fillText("Para", c2, 352);

  ctx.fillStyle = "#374151";
  ctx.font = "bold 26px Arial";
  ctx.fillText(trunc(pix.de_nome || "—", maxW, "bold 26px Arial"), c1, 380);
  ctx.fillText(trunc(pix.para_nome || "—", maxW, "bold 26px Arial"), c2, 380);

  ctx.fillStyle = "#6b7280";
  ctx.font = "20px Arial";
  ctx.fillText(trunc(pix.de_cpf   || "", maxW, "20px Arial"), c1, 418);
  ctx.fillText(trunc(pix.para_cpf || "", maxW, "20px Arial"), c2, 418);
  ctx.fillText(trunc(pix.de_banco   || "", maxW, "20px Arial"), c1, 446);
  ctx.fillText(trunc(pix.para_banco || "", maxW, "20px Arial"), c2, 446);

  // Arrow in centre
  ctx.fillStyle = "#d1d5db";
  ctx.font = "bold 36px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("→", W / 2, 415);

  // Divider 2
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(44, 490);
  ctx.lineTo(W - 44, 490);
  ctx.stroke();

  // Transaction ID
  ctx.fillStyle = "#9ca3af";
  ctx.font = "18px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("ID Pix:", 44, 520);
  ctx.fillStyle = "#374151";
  ctx.font = "18px monospace";
  ctx.fillText(trunc(pix.id || "—", W - 180, "18px monospace"), 120, 520);

  ctx.fillStyle = "#9ca3af";
  ctx.font = "18px Arial";
  ctx.fillText("Transação:", 44, 556);
  ctx.fillStyle = "#374151";
  ctx.fillText(trunc(pix.transacao || "—", W - 220, "18px Arial"), 150, 556);
}

// ─── Canvas: Anúncio OG Image (1200×630) ─────────────────────────────────────

async function drawAnuncioOgCanvas(
  ctx: CanvasRenderingContext2D,
  plataforma: string,
  titulo: string,
  preco: string,
  descricao: string,
  fotoDataUrl: string | null
) {
  const W = 1200, H = 630;
  const plats: Record<string, { cor: string; corTexto: string; nome: string }> = {
    mercadolivre: { cor: "#FFE600", corTexto: "#222", nome: "mercadolivre" },
    shopee:       { cor: "#EE4D2D", corTexto: "#fff", nome: "shopee" },
    olx:          { cor: "#6E0AD6", corTexto: "#fff", nome: "OLX" },
  };
  const plat = plats[plataforma] || plats.mercadolivre;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Right half: product photo
  if (fotoDataUrl) {
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const dW = W / 2, dH = H;
        const r = img.width / img.height, dr = dW / dH;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (r > dr) { sw = img.height * dr; sx = (img.width - sw) / 2; }
        else         { sh = img.width / dr;  sy = (img.height - sh) / 2; }
        ctx.drawImage(img, sx, sy, sw, sh, W / 2, 0, dW, dH);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = fotoDataUrl;
    });
  } else {
    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(W / 2, 0, W / 2, H);
    ctx.fillStyle = "#9ca3af";
    ctx.font = "bold 28px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Foto do produto", W * 3 / 4, H / 2);
  }

  // Divider between halves
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(W / 2, 0, 2, H);

  // Left half: platform header
  ctx.fillStyle = plat.cor;
  ctx.fillRect(0, 0, W / 2, 100);
  ctx.fillStyle = plat.corTexto;
  ctx.font = plataforma === "shopee" ? "bold italic 52px Arial" : "bold 52px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(plat.nome, 30, 50);

  // Title (wrapped, max 3 lines)
  const maxW = W / 2 - 60;
  ctx.fillStyle = "#111827";
  ctx.font = "bold 32px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const words = (titulo || "Produto").split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line); line = w;
      if (lines.length >= 3) { line = ""; break; }
    } else line = test;
  }
  if (line && lines.length < 3) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, 30, 114 + i * 40));

  // Price
  const priceY = 114 + lines.length * 40 + 16;
  ctx.fillStyle = plataforma === "shopee" ? "#EE4D2D" : "#111827";
  ctx.font = "bold 54px Arial";
  ctx.textBaseline = "top";
  ctx.fillText(`R$ ${preco || "0"}`, 30, priceY);

  // Extra label
  const labelY = priceY + 68;
  ctx.font = "22px Arial";
  if (plataforma === "mercadolivre") {
    ctx.fillStyle = "#22c55e";
    ctx.fillText("✓ Frete grátis", 30, labelY);
    const pNum = parseFloat((preco || "0").replace(",", ".")) || 0;
    const parc = pNum > 0 ? (pNum / 12).toFixed(2).replace(".", ",") : "0,00";
    ctx.fillText(`em 12x R$ ${parc} sem juros`, 30, labelY + 32);
  } else if (plataforma === "shopee") {
    ctx.fillStyle = "#EE4D2D";
    ctx.fillText("★★★★★  4.9 | 2.847 avaliações", 30, labelY);
  } else {
    ctx.fillStyle = "#9ca3af";
    ctx.fillText("📍 Goiânia, GO", 30, labelY);
  }

  // Description (2 lines max)
  if (descricao) {
    const descY = labelY + 72;
    ctx.fillStyle = "#6b7280";
    ctx.font = "21px Arial";
    const dWords = descricao.split(" ");
    const dLines: string[] = [];
    let dLine = "";
    for (const w of dWords) {
      const t = dLine ? dLine + " " + w : w;
      if (ctx.measureText(t).width > maxW && dLine) {
        dLines.push(dLine); dLine = w;
        if (dLines.length >= 2) break;
      } else dLine = t;
    }
    if (dLine && dLines.length < 2) dLines.push(dLine);
    dLines.forEach((l, i) => ctx.fillText(l, 30, descY + i * 30));
  }
}

// ─── Captura do preview como imagem WhatsApp (1200×630) ──────────────────────

function CapturarPrevia({ previewRef, onImageReady, bgColor = "#f3f4f6" }: {
  previewRef: React.RefObject<HTMLDivElement>;
  onImageReady: (url: string) => void;
  bgColor?: string;
}) {
  const [capturing, setCapturing] = useState(false);
  const [applied, setApplied] = useState(false);

  async function handleCapture() {
    if (!previewRef.current) return;
    setCapturing(true);
    try {
      const h2c = (await import("html2canvas")).default;

      // Captura o card no tamanho renderizado
      const captured = await h2c(previewRef.current, {
        useCORS: true,
        scale: 3,
        backgroundColor: "#ffffff",
        logging: false,
      });

      // Gera a imagem OG no FORMATO DO PRÓPRIO CARD, para preencher o bubble
      // do WhatsApp sem sobras. A altura é limitada a 1.5× a largura:
      //  - anúncio (card mais baixo): cabe INTEIRO, sem cortar
      //  - PIX (card mais alto): preenche a largura e corta só o rodapé,
      //    preservando o topo com as informações
      const cardAspect = captured.width / captured.height; // largura/altura
      const OG_W = 1080;
      const OG_H = Math.min(Math.round(OG_W / cardAspect), Math.round(OG_W * 1.5));

      const ogCanvas = document.createElement("canvas");
      ogCanvas.width = OG_W;
      ogCanvas.height = OG_H;
      const ctx = ogCanvas.getContext("2d")!;

      // Fundo (só aparece se houver alguma sobra por arredondamento)
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, OG_W, OG_H);

      // "cover" ancorado no topo: preenche a largura inteira; se o card for
      // mais alto que o canvas (PIX), corta o excesso de baixo
      const scale = Math.max(OG_W / captured.width, OG_H / captured.height);
      const drawW = captured.width * scale;
      const drawH = captured.height * scale;
      const drawX = (OG_W - drawW) / 2;
      ctx.drawImage(captured, drawX, 0, drawW, drawH);

      const dataUrl = ogCanvas.toDataURL("image/jpeg", 0.97);
      const res = await fetch("/api/ops/intel-link/upload-og", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = await res.json();
      if (data.url) { onImageReady(data.url); setApplied(true); }
    } finally {
      setCapturing(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => { setApplied(false); handleCapture(); }}
      disabled={capturing}
      className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors w-full justify-center disabled:opacity-50 ${
        applied
          ? "bg-green-900/40 text-green-400 border border-green-700"
          : "bg-blue-700 hover:bg-blue-600 text-white"
      }`}
    >
      {capturing ? <Loader2 className="w-4 h-4 animate-spin" /> : applied ? <Check className="w-4 h-4" /> : <ImagePlus className="w-4 h-4" />}
      {capturing ? "Capturando..." : applied ? "Imagem aplicada!" : "Usar prévia como imagem WhatsApp"}
    </button>
  );
}

// ─── Compositor de Imagem ─────────────────────────────────────────────────────

function ImageComposer({ onImageReady, defaultLogoId }: { onImageReady: (url: string) => void; defaultLogoId?: string }) {
  const [selectedLogo, setSelectedLogo] = useState(LOGOS.find((l) => l.id === defaultLogoId) ?? LOGOS[0]);
  const [faceDataUrl, setFaceDataUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [applied, setApplied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const compose = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 1200, H = 630;
    canvas.width = W;
    canvas.height = H;

    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(0, 0, W, H);

    // Logo na metade esquerda
    drawLogoOnCanvas(ctx, selectedLogo, 0, 0, W / 2, H);

    // Foto na metade direita
    if (faceDataUrl) {
      const img = new Image();
      img.onload = () => {
        const dstW = W / 2, dstH = H;
        const srcRatio = img.width / img.height;
        const dstRatio = dstW / dstH;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (srcRatio > dstRatio) {
          sw = img.height * dstRatio;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / dstRatio;
          sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, W / 2, 0, dstW, dstH);
        setPreviewUrl(canvas.toDataURL("image/jpeg", 0.95));
      };
      img.src = faceDataUrl;
    } else {
      // Placeholder direita
      ctx.fillStyle = "#9ca3af";
      ctx.fillRect(W / 2, 0, W / 2, H);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 36px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Adicione uma foto", W * 3 / 4, H / 2);
      setPreviewUrl(canvas.toDataURL("image/jpeg", 0.95));
    }
  }, [selectedLogo, faceDataUrl]);

  useEffect(() => { compose(); }, [compose]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setFaceDataUrl(ev.target?.result as string); setApplied(false); };
    reader.readAsDataURL(file);
  }

  async function handleApply() {
    if (!previewUrl) return;
    setUploading(true);
    try {
      const res = await fetch("/api/ops/intel-link/upload-og", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: previewUrl }),
      });
      const data = await res.json();
      if (data.url) { onImageReady(data.url); setApplied(true); }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <canvas ref={canvasRef} className="hidden" />

      {/* Seletor de logo */}
      <div>
        <p className="text-xs text-gray-400 mb-2">Portal / Logo</p>
        <div className="flex gap-2 flex-wrap">
          {LOGOS.map((logo) => (
            <button
              key={logo.id}
              type="button"
              onClick={() => { setSelectedLogo(logo); setApplied(false); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all border-2 ${
                selectedLogo.id === logo.id
                  ? "border-blue-500 scale-105"
                  : "border-gray-700 hover:border-gray-500"
              }`}
              style={{ background: logo.bg, color: logo.textColor, fontStyle: logo.italic ? "italic" : "normal" }}
            >
              {logo.label}
            </button>
          ))}
        </div>
      </div>

      {/* Upload da foto */}
      <div>
        <p className="text-xs text-gray-400 mb-2">Foto do suspeito</p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
        >
          <Upload className="w-4 h-4" />
          {faceDataUrl ? "Trocar foto" : "Selecionar foto"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>

      {/* Preview da composição */}
      {previewUrl && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">Preview da imagem composta</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="composição" className="w-full rounded-lg border border-gray-700 max-h-40 object-cover" />
          <button
            type="button"
            onClick={handleApply}
            disabled={uploading || applied}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors ${
              applied
                ? "bg-green-900/40 text-green-400 border border-green-700"
                : "bg-blue-700 hover:bg-blue-600 text-white"
            } disabled:opacity-50`}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : applied ? <Check className="w-4 h-4" /> : <ImagePlus className="w-4 h-4" />}
            {uploading ? "Enviando..." : applied ? "Imagem aplicada!" : "Usar esta imagem"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Compositor Instagram ─────────────────────────────────────────────────────

function InstagramComposer({ onImageReady, onMetaReady }: {
  onImageReady: (url: string) => void;
  onMetaReady: (titulo: string, descricao: string) => void;
}) {
  const [conta, setConta] = useState("@goianiaurgente");
  const [titulo, setTitulo] = useState("");
  const [legenda, setLegenda] = useState("");
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [applied, setApplied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const compose = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const S = 1080;
    canvas.width = S;
    canvas.height = S;

    const draw = (img?: HTMLImageElement) => {
      ctx.clearRect(0, 0, S, S);

      // Fundo
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0, 0, S, S);

      // Foto (cover crop)
      if (img) {
        const srcRatio = img.width / img.height;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (srcRatio > 1) { sw = img.height; sx = (img.width - sw) / 2; }
        else               { sh = img.width;  sy = (img.height - sh) / 2; }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, S, S);
      }

      // Gradiente escuro na base (para título)
      const grad = ctx.createLinearGradient(0, S * 0.55, 0, S);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.82)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, S, S);

      // @conta — canto superior esquerdo
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, S, 80);
      ctx.fillStyle = "white";
      ctx.font = "bold 38px Arial";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 8;
      ctx.fillText(conta || "@conta", 32, 40);
      ctx.shadowBlur = 0;

      // Ícone do Instagram — canto superior direito
      const iconSize = 58;
      drawInstagramIcon(ctx, S - iconSize - 18, 11, iconSize);

      // Ícone de play (círculo + triângulo)
      const cx = S / 2, cy = S / 2;
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.arc(cx, cy, 72, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.moveTo(cx - 22, cy - 36);
      ctx.lineTo(cx - 22, cy + 36);
      ctx.lineTo(cx + 44, cy);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;

      // Título na base
      if (titulo) {
        ctx.fillStyle = "white";
        ctx.font = "bold 52px Arial";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.shadowColor = "rgba(0,0,0,0.9)";
        ctx.shadowBlur = 12;
        // Quebra automática de texto
        const maxW = S - 64;
        const words = titulo.split(" ");
        const lines: string[] = [];
        let line = "";
        for (const w of words) {
          const test = line ? line + " " + w : w;
          if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
          else line = test;
        }
        if (line) lines.push(line);
        const lineH = 62;
        const startY = S - 40;
        for (let i = lines.length - 1; i >= 0; i--) {
          ctx.fillText(lines[i], 32, startY - (lines.length - 1 - i) * lineH);
        }
        ctx.shadowBlur = 0;
      }

      setPreviewUrl(canvas.toDataURL("image/jpeg", 0.95));
    };

    if (fotoUrl) {
      const img = new Image();
      img.onload = () => draw(img);
      img.src = fotoUrl;
    } else {
      draw();
    }
  }, [conta, titulo, fotoUrl]);

  useEffect(() => { compose(); }, [compose]);

  // Atualiza og_titulo e og_descricao automaticamente
  useEffect(() => {
    const nome = conta.replace(/^@/, "");
    const tituloMeta = `${nome} no Instagram: "${legenda}"`;
    onMetaReady(tituloMeta, legenda);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta, legenda]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setFotoUrl(ev.target?.result as string); setApplied(false); };
    reader.readAsDataURL(file);
  }

  async function handleApply() {
    if (!previewUrl) return;
    setUploading(true);
    try {
      const res = await fetch("/api/ops/intel-link/upload-og", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: previewUrl }),
      });
      const data = await res.json();
      if (data.url) { onImageReady(data.url); setApplied(true); }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <canvas ref={canvasRef} className="hidden" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Campos */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Conta Instagram</label>
            <input
              type="text"
              value={conta}
              onChange={(e) => { setConta(e.target.value); setApplied(false); }}
              placeholder="@goianiaurgente"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Título (sobre a foto)</label>
            <textarea
              value={titulo}
              onChange={(e) => { setTitulo(e.target.value); setApplied(false); }}
              rows={2}
              placeholder="Graer visita mansão de Gustavo Lima"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Legenda (texto abaixo da imagem no WhatsApp)</label>
            <textarea
              value={legenda}
              onChange={(e) => { setLegenda(e.target.value); setApplied(false); }}
              rows={2}
              placeholder="Cafezinho com o embaixador..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm resize-none"
            />
            <p className="text-xs text-gray-600 mt-1">Vai aparecer como: <span className="text-gray-400">"{conta.replace(/^@/,"")} no Instagram: "{legenda}""</span></p>
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4" />
            {fotoUrl ? "Trocar foto" : "Selecionar foto"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>

        {/* Preview */}
        <div className="space-y-2">
          <p className="text-xs text-gray-400">Preview</p>
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="instagram preview" className="w-full rounded-lg border border-gray-700 aspect-square object-cover" />
          )}
          <button
            type="button"
            onClick={handleApply}
            disabled={uploading || applied}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors w-full justify-center ${
              applied ? "bg-green-900/40 text-green-400 border border-green-700" : "bg-blue-700 hover:bg-blue-600 text-white"
            } disabled:opacity-50`}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : applied ? <Check className="w-4 h-4" /> : <ImagePlus className="w-4 h-4" />}
            {uploading ? "Enviando..." : applied ? "Aplicado!" : "Usar esta imagem"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Upload simples de imagem ────────────────────────────────────────────────

function AnuncioImageUpload({ onUrlReady }: { onUrlReady: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      setUploading(true);
      try {
        const res = await fetch("/api/ops/intel-link/upload-og", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: dataUrl }),
        });
        const data = await res.json();
        if (data.url) { onUrlReady(data.url); setDone(true); }
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <button type="button" onClick={() => { setDone(false); fileRef.current?.click(); }} disabled={uploading}
        className={`flex items-center gap-2 px-4 py-2.5 border text-sm rounded-lg transition-colors disabled:opacity-50 ${
          done ? "bg-green-900/40 border-green-700 text-green-400" : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
        }`}>
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : done ? <Check className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
        {uploading ? "Enviando..." : done ? "Foto enviada!" : "Upload da foto"}
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

// ─── Previews de plataforma (anúncio) ────────────────────────────────────────

type AnuncioPreviewProps = { titulo: string; descricao: string; imagemUrl: string; preco: string };

function MercadoLivreAnuncioPreview({ titulo, descricao, imagemUrl, preco }: AnuncioPreviewProps) {
  const precoNum = parseFloat(preco.replace(",", ".")) || 0;
  const parcelado = precoNum > 0 ? (precoNum / 12).toFixed(2).replace(".", ",") : "0,00";
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-lg font-sans max-w-xs w-full">
      <div className="bg-[#FFE600] px-3 py-2">
        <span className="font-extrabold text-gray-900 text-sm">mercadolivre</span>
      </div>
      {imagemUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imagemUrl} alt="" className="w-full h-40 object-contain bg-white" />
      ) : (
        <div className="w-full h-40 bg-gray-100 flex items-center justify-center text-gray-400 text-xs">Foto do produto</div>
      )}
      <div className="px-3 py-3">
        <div className="text-gray-500 text-xs mb-1">Novo | +100 vendidos</div>
        <div className="font-semibold text-gray-900 text-sm leading-snug mb-2 line-clamp-2">{titulo || "Título do produto"}</div>
        <div className="text-2xl font-light text-gray-900 mb-0.5">
          <span className="text-xs align-top mr-0.5">R$</span>{preco || "0"}
        </div>
        <div className="text-green-600 text-xs mb-0.5">em 12x R$ {parcelado} sem juros</div>
        <div className="text-green-600 text-xs mb-2">🚚 Frete grátis</div>
        {descricao && <div className="text-gray-500 text-xs mb-2 line-clamp-2">{descricao}</div>}
        <button type="button" className="w-full py-2 bg-[#3483FA] text-white font-bold rounded-lg text-xs mb-1">Comprar agora</button>
        <button type="button" className="w-full py-2 border border-[#3483FA] text-[#3483FA] font-bold rounded-lg text-xs">Adicionar ao carrinho</button>
      </div>
    </div>
  );
}

function ShopeeAnuncioPreview({ titulo, descricao, imagemUrl, preco }: AnuncioPreviewProps) {
  return (
    <div className="bg-gray-50 rounded-xl overflow-hidden shadow-lg font-sans max-w-xs w-full">
      <div className="bg-[#EE4D2D] px-3 py-2 flex items-center justify-between">
        <span className="text-white font-bold text-base italic tracking-tight">shopee</span>
        <span className="text-white text-xs">🔍 🛒</span>
      </div>
      {imagemUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imagemUrl} alt="" className="w-full h-40 object-contain bg-white" />
      ) : (
        <div className="w-full h-40 bg-gray-200 flex items-center justify-center text-gray-400 text-xs">Foto do produto</div>
      )}
      <div className="bg-white px-3 py-3">
        <div className="text-[#EE4D2D] font-bold text-lg mb-1">R$ {preco || "0,00"}</div>
        <div className="font-semibold text-gray-900 text-sm leading-snug mb-1 line-clamp-2">{titulo || "Título do produto"}</div>
        {descricao && <div className="text-gray-500 text-xs mb-2 line-clamp-2">{descricao}</div>}
        <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
          <span className="text-[#EE4D2D] text-xs">★★★★★</span> 4.9 | 2.847 avaliações
        </div>
        <div className="flex gap-2">
          <button type="button" className="flex-1 py-1.5 border border-[#EE4D2D] text-[#EE4D2D] font-bold rounded text-xs">+ Carrinho</button>
          <button type="button" className="flex-1 py-1.5 bg-[#EE4D2D] text-white font-bold rounded text-xs">Comprar</button>
        </div>
      </div>
    </div>
  );
}

function OlxAnuncioPreview({ titulo, descricao, imagemUrl, preco }: AnuncioPreviewProps) {
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-lg font-sans max-w-xs w-full">
      <div className="border-b border-gray-200 px-3 py-2 flex items-center gap-2">
        <span className="bg-[#6E0AD6] text-white font-extrabold text-xs px-2 py-0.5 rounded">OLX</span>
      </div>
      {imagemUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imagemUrl} alt="" className="w-full h-40 object-cover" />
      ) : (
        <div className="w-full h-40 bg-gray-200 flex items-center justify-center text-gray-400 text-xs">Foto do produto</div>
      )}
      <div className="px-3 py-3">
        <div className="text-xl font-bold text-gray-900 mb-0.5">R$ {preco || "0"}</div>
        <div className="font-semibold text-gray-800 text-sm mb-1 line-clamp-2">{titulo || "Título do anúncio"}</div>
        {descricao && <div className="text-gray-600 text-xs mb-2 line-clamp-3">{descricao}</div>}
        <div className="text-xs text-gray-400 mb-2">📍 Goiânia, GO</div>
        <button type="button" className="w-full py-2 bg-[#6E0AD6] text-white font-bold rounded-lg text-xs mb-1">Ver telefone</button>
        <button type="button" className="w-full py-2 border border-[#6E0AD6] text-[#6E0AD6] font-bold rounded-lg text-xs">Chat OLX</button>
      </div>
    </div>
  );
}

// ─── Preview Mercado Pago ────────────────────────────────────────────────────

function MercadoPagoPreview({ pix }: { pix: PixForm }) {
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-lg text-gray-900 text-sm font-sans max-w-xs w-full">
      {/* Logo */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-2">
        <div className="w-10 h-10 rounded-full bg-[#00b1ea] flex items-center justify-center text-white text-lg font-bold">🤝</div>
        <div className="leading-tight">
          <div className="text-[#00b1ea] font-bold text-base">mercado</div>
          <div className="text-[#00b1ea] font-bold text-base -mt-1">pago</div>
        </div>
      </div>

      <div className="px-5 pb-2">
        {/* Título */}
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-green-600 text-base">✓</span>
          <span className="font-bold text-base">Comprovante de Pix</span>
        </div>
        <div className="text-gray-500 text-xs mb-4">
          {pix.data || hojeFormatado()} às {pix.horario || horaFormatada()}.
        </div>

        {/* Valor */}
        <div className="text-3xl font-bold mb-4">
          R$ {pix.valor || "0"}
        </div>

        <div className="border-t border-gray-200 my-3" />

        {/* De */}
        <div className="flex gap-3 mb-4">
          <div className="flex flex-col items-center pt-1">
            <div className="w-2 h-2 rounded-full bg-[#00b1ea]" />
            <div className="w-0.5 bg-gray-300 flex-1 my-1" />
            <div className="w-2 h-2 rounded-full bg-[#00b1ea]" />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <div className="text-gray-500 text-xs mb-0.5">De</div>
              <div className="font-bold text-sm">{pix.de_nome || "Nome do remetente"}</div>
              <div className="text-gray-500 text-xs">CPF: {pix.de_cpf || "***.000.000-**"}</div>
              <div className="text-gray-500 text-xs">{pix.de_banco || "Mercado Pago"}</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs mb-0.5">Para</div>
              <div className="font-bold text-sm">{pix.para_nome || "Nome do destinatário"}</div>
              <div className="text-gray-500 text-xs">CPF: {pix.para_cpf || "***.000.000-**"}</div>
              <div className="text-gray-500 text-xs truncate">{pix.para_banco || "Banco"}</div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 my-3" />

        {/* IDs */}
        <div className="space-y-3 mb-4">
          <div>
            <div className="text-gray-500 text-xs">N.º transação do Mercado Pago</div>
            <div className="font-bold text-sm">{pix.transacao || "000000000000"}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs">ID de transação Pix</div>
            <div className="font-bold text-xs break-all">{pix.id || "E00000000000000000000000000000000"}</div>
          </div>
        </div>

        <div className="border-t border-gray-200 my-3" />

        {/* Footer */}
        <div className="space-y-2 pb-5">
          <div>
            <div className="text-gray-400 text-xs">Atendimento ao cliente</div>
            <div className="text-gray-600 text-xs">0800 637 7246</div>
          </div>
          <div>
            <div className="text-gray-400 text-xs">Ouvidoria</div>
            <div className="text-gray-600 text-xs">0800 688 4365</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Preview Banco Inter ─────────────────────────────────────────────────────

function BancoInterPreview({ pix }: { pix: PixForm }) {
  const DashedLine = () => <div className="border-t border-dashed border-gray-300 my-4" />;
  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between items-start gap-2 py-1">
      <span className="text-gray-500 text-xs flex-shrink-0">{label}</span>
      <span className="font-bold text-gray-900 text-xs text-right break-all">{value || "—"}</span>
    </div>
  );
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-lg text-gray-900 font-sans max-w-xs w-full px-5 py-5">
      {/* Logo */}
      <div className="text-center mb-4">
        <span className="text-[#FF6B00] font-extrabold text-2xl tracking-tight">inter</span>
      </div>
      {/* Título */}
      <div className="text-center mb-1">
        <div className="font-bold text-gray-900 text-base">Pix enviado</div>
        <div className="font-bold text-gray-900 text-xl">R$ {pix.valor || "0,00"}</div>
      </div>
      <DashedLine />
      {/* Transação */}
      <p className="font-bold text-gray-900 text-xs mb-2">Sobre a transação</p>
      <Row label="Data do pagamento" value={pix.data || hojeInterFormatado()} />
      <Row label="Horário" value={pix.horario || horaFormatada()} />
      <div className="py-1">
        <span className="text-gray-500 text-xs">ID da transação</span>
        <div className="font-bold text-gray-900 text-xs break-all mt-0.5">{pix.id || "E000..."}</div>
      </div>
      <DashedLine />
      {/* Quem recebeu */}
      <p className="font-bold text-gray-900 text-xs mb-2">Quem recebeu</p>
      <Row label="Nome" value={pix.para_nome} />
      <Row label="CPF/CNPJ" value={pix.para_cpf} />
      <Row label="Instituição" value={pix.para_banco} />
      <DashedLine />
      {/* Quem pagou */}
      <p className="font-bold text-gray-900 text-xs mb-2">Quem pagou</p>
      <Row label="Nome" value={pix.de_nome} />
      <Row label="CPF/CNPJ" value={pix.de_cpf} />
      <Row label="Instituição" value={pix.de_banco || "Banco Inter S.A."} />
    </div>
  );
}

// ─── Preview Caixa ───────────────────────────────────────────────────────────

function CaixaPreview({ pix }: { pix: PixForm }) {
  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between items-start gap-2 py-1.5 border-b border-gray-100">
      <span className="text-[#005CA9] text-xs flex-shrink-0">{label}</span>
      <span className="text-gray-900 text-xs text-right break-all">{value || "—"}</span>
    </div>
  );
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-lg font-sans max-w-xs w-full">
      {/* Header azul */}
      <div className="bg-[#005CA9] px-4 pt-4 pb-0">
        <div className="text-white font-extrabold text-lg tracking-wide mb-1">CAIXA</div>
        <div className="text-white font-bold text-base mb-3">Comprovante de Pix</div>
        {/* Zigzag */}
        <div className="h-3 w-full" style={{
          backgroundImage: "linear-gradient(135deg, white 33%, transparent 33%), linear-gradient(225deg, white 33%, transparent 33%)",
          backgroundSize: "12px 12px",
          backgroundColor: "#005CA9",
        }} />
      </div>
      <div className="px-4 py-3 text-xs">
        <div className="text-[#005CA9] font-bold mb-0.5">Pix enviado</div>
        <div className="text-gray-500 mb-3">{pix.data || hojeCaixaFormatado()}, {pix.horario || horaCaixaFormatada()}</div>
        <Row label="Valor" value={`R$ ${pix.valor || "0,00"}`} />
        <div className="mt-2 mb-1 text-[#005CA9] font-bold">Recebedor</div>
        <Row label="Nome" value={pix.para_nome} />
        <Row label="CNPJ/CPF" value={pix.para_cpf} />
        <Row label="Instituição" value={pix.para_banco} />
        <div className="mt-2 mb-1 text-[#005CA9] font-bold">Pagador</div>
        <Row label="Nome" value={pix.de_nome} />
        <Row label="CPF" value={pix.de_cpf} />
        <Row label="Instituição" value={pix.de_banco || "CAIXA ECONÔMICA FEDERAL"} />
        <div className="mt-2 mb-1 text-[#005CA9] font-bold">Dados da transação</div>
        <Row label="Situação" value="Efetivado" />
        <div className="py-1.5 border-b border-gray-100">
          <span className="text-[#005CA9] text-xs">ID transação</span>
          <div className="text-gray-900 text-xs break-all mt-0.5">{pix.id || "E000..."}</div>
        </div>
        <Row label="Identificador" value={pix.transacao || "—"} />
      </div>
    </div>
  );
}

// ─── Preview WhatsApp ────────────────────────────────────────────────────────

function WhatsAppPreview({ titulo, descricao, imagemUrl, slug, baseUrl, redirectUrl }: {
  titulo: string; descricao: string; imagemUrl: string; slug: string; baseUrl: string; redirectUrl?: string;
}) {
  const linkExibido = `${baseUrl}/i/${slug || "..."}`;
  const dominio = redirectUrl
    ? redirectUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
    : baseUrl.replace(/^https?:\/\//, "");
  return (
    <div className="bg-[#0b141a] rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide">Preview no WhatsApp</p>
      <div className="bg-[#202c33] rounded-lg overflow-hidden max-w-xs">
        {imagemUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagemUrl} alt="preview" className="w-full h-36 object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="w-full h-36 bg-gray-700 flex items-center justify-center">
            <Globe className="w-8 h-8 text-gray-500" />
          </div>
        )}
        <div className="p-3">
          <p className="text-xs text-gray-400 mb-1 truncate">{dominio}</p>
          <p className="text-sm font-semibold text-white leading-snug line-clamp-2">{titulo || "Título do link"}</p>
          {descricao && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{descricao}</p>}
          <p className="text-xs text-blue-400 mt-2 truncate">{linkExibido}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

type PixForm = {
  banco: string;
  valor: string;
  data: string;
  horario: string;
  de_nome: string;
  de_cpf: string;
  de_banco: string;
  para_nome: string;
  para_cpf: string;
  para_banco: string;
  transacao: string;
  id: string;
};

// ─── Página principal ────────────────────────────────────────────────────────

export default function NovaInvestigacaoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [reportagemPortal, setReportagemPortal] = useState("g1");
  const pixPreviewRef = useRef<HTMLDivElement>(null);
  const anuncioPreviewRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    nome: "",
    tipo: "reportagem" as "reportagem" | "pix" | "anuncio",
    og_titulo: "",
    og_descricao: "",
    og_imagem_url: "",
    slug: "",
    redirect_url: "",
  });

  const [anuncio, setAnuncio] = useState({ plataforma: "mercadolivre", preco: "", imagem_url: "" });

  const [pix, setPix] = useState<PixForm>({
    banco: "mercado_pago",
    valor: "",
    data: "",
    horario: "",
    de_nome: "",
    de_cpf: "",
    de_banco: "Mercado Pago",
    para_nome: "",
    para_cpf: "",
    para_banco: "",
    transacao: "",
    id: "",
  });

  useEffect(() => {
    setBaseUrl("https://linkdigital.app.br");
    setForm((prev) => ({ ...prev, slug: gerarSlug() }));
    setPix((prev) => ({
      ...prev,
      data: hojeFormatado(),
      horario: horaFormatada(),
      transacao: gerarTransacao(),
      id: gerarPixId(),
    }));
  }, []);

  function setF(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function setP(field: keyof PixForm, value: string) {
    setPix((prev) => ({ ...prev, [field]: value }));
  }

  function setA(field: string, value: string) {
    setAnuncio((prev) => ({ ...prev, [field]: value }));
  }

  function handleAnuncioPlataformaChange(plataforma: string) {
    const p = PLATAFORMAS_ANUNCIO.find((x) => x.id === plataforma);
    setAnuncio((prev) => ({ ...prev, plataforma }));
    if (p) setForm((prev) => ({ ...prev, redirect_url: p.redirect }));
  }

  function handleBancoChange(banco: string) {
    const redirects: Record<string, string> = {
      mercado_pago: "https://www.mercadopago.com.br",
      inter:        "https://inter.co",
      caixa:        "https://www.caixa.gov.br",
    };
    setPix((prev) => ({
      ...prev,
      banco,
      de_banco:
        banco === "inter"        ? "Banco Inter S.A."        :
        banco === "mercado_pago" ? "Mercado Pago"            :
        banco === "caixa"        ? "CAIXA ECONÔMICA FEDERAL" : prev.de_banco,
      data:
        banco === "inter"  ? hojeInterFormatado()  :
        banco === "caixa"  ? hojeCaixaFormatado()  : hojeFormatado(),
      horario:
        banco === "caixa" ? horaCaixaFormatada() : prev.horario,
      transacao:
        banco === "caixa" ? gerarIdentificador() : prev.transacao,
    }));
    setForm((prev) => ({ ...prev, redirect_url: redirects[banco] || prev.redirect_url }));
  }

  function handlePortalChange(portalId: string) {
    const portal = PORTAL_CONFIGS.find((p) => p.id === portalId);
    setReportagemPortal(portalId);
    if (portal) setForm((prev) => ({ ...prev, redirect_url: portal.redirect }));
  }

  function handleTipoChange(tipo: "reportagem" | "pix" | "anuncio") {
    const redirects: Record<string, string> = {
      pix: "https://www.mercadopago.com.br",
      anuncio: "https://www.mercadolivre.com.br",
      reportagem: "https://g1.globo.com",
    };
    setReportagemPortal("g1");
    setForm((prev) => ({ ...prev, tipo, redirect_url: redirects[tipo] || "" }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) { setErro("Nome da investigação é obrigatório."); return; }
    if (!form.slug.trim()) { setErro("Slug do link é obrigatório."); return; }
    if (!/^[a-z0-9\-_]+$/.test(form.slug)) {
      setErro("Slug só pode conter letras minúsculas, números, hífens e underscores.");
      return;
    }
    setErro("");
    setLoading(true);

    try {
      const res = await fetch("/api/ops/intel-link/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, pix, anuncio }),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data.error || "Erro ao criar."); return; }
      router.push(`/ops/intel-link/${data.id}`);
    } catch {
      setErro("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  const linkFinal = `${baseUrl}/i/${form.slug || "..."}`;

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/ops/intel-link" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Nova Investigação</h1>
          <p className="text-sm text-gray-400 mt-0.5">Crie um link de captura personalizado</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Nome interno */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Nome da Investigação <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.nome}
            onChange={(e) => setF("nome", e.target.value)}
            placeholder="Ex: Op. Foragido Silva"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
          />
          <p className="text-xs text-gray-500 mt-1.5">Visível apenas no painel — não aparece para o alvo.</p>
        </div>

        {/* Tipo */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <label className="block text-sm font-medium text-gray-300 mb-3">Tipo de Isca</label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: "reportagem" as const, label: "Reportagem", desc: "Parece uma notícia de portal", Icon: Newspaper, color: "blue" },
              { value: "pix" as const, label: "Comprovante PIX", desc: "Parece um comprovante de pagamento", Icon: CreditCard, color: "green" },
              { value: "anuncio" as const, label: "Anúncio", desc: "ML, Shopee ou OLX", Icon: ShoppingCart, color: "orange" },
            ].map(({ value, label, desc, Icon, color }) => (
              <button key={value} type="button" onClick={() => handleTipoChange(value)}
                className={`flex flex-col items-start gap-2 p-4 rounded-lg border-2 transition-all text-left ${
                  form.tipo === value
                    ? color === "blue"   ? "border-blue-500 bg-blue-900/20"
                    : color === "green"  ? "border-green-500 bg-green-900/20"
                    :                      "border-orange-500 bg-orange-900/20"
                    : "border-gray-700 hover:border-gray-600"
                }`}
              >
                <Icon className={`w-5 h-5 ${
                  color === "blue" ? "text-blue-400" : color === "green" ? "text-green-400" : "text-orange-400"
                }`} />
                <div>
                  <div className="text-sm font-medium text-white">{label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Link */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <label className="block text-sm font-medium text-gray-300 mb-2">Link da Isca</label>
          <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5">
            <span className="text-gray-500 text-sm whitespace-nowrap">{baseUrl}/i/</span>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => setF("slug", e.target.value.toLowerCase().replace(/[^a-z0-9\-_]/g, ""))}
              className="flex-1 bg-transparent text-white text-sm focus:outline-none min-w-0"
              placeholder="slug-do-link"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1.5">
            O alvo verá: <span className="text-gray-400 font-mono">{linkFinal}</span>
          </p>
        </div>

        {/* Redirect */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <label className="block text-sm font-medium text-gray-300 mb-1">Redirecionar para (após captura)</label>
          <p className="text-xs text-gray-500 mb-2">Após capturar, o alvo é enviado para este site.</p>
          <div className="flex items-center gap-2">
            <ExternalLink className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <input
              type="url"
              value={form.redirect_url}
              onChange={(e) => setF("redirect_url", e.target.value)}
              placeholder="https://..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>
        </div>

        {/* ── PIX: editor + preview ── */}
        {form.tipo === "pix" && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-medium text-gray-300 mb-4">Comprovante PIX — Editor</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Campos */}
              <div className="space-y-4">

                {/* Banco */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Banco</label>
                  <select
                    value={pix.banco}
                    onChange={(e) => handleBancoChange(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="mercado_pago">Mercado Pago</option>
                    <option value="inter">Banco Inter</option>
                    <option value="caixa">Caixa Econômica Federal</option>
                  </select>
                </div>

                {/* Valor + Data + Hora */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-1">
                    <label className="block text-xs text-gray-400 mb-1.5">Valor (R$)</label>
                    <input
                      type="text"
                      value={pix.valor}
                      onChange={(e) => setP("valor", e.target.value)}
                      placeholder="150"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-xs text-gray-400 mb-1.5">Data</label>
                    <input
                      type="text"
                      value={pix.data}
                      onChange={(e) => setP("data", e.target.value)}
                      placeholder="26/março/2026"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-xs text-gray-400 mb-1.5">Horário</label>
                    <input
                      type="text"
                      value={pix.horario}
                      onChange={(e) => setP("horario", e.target.value)}
                      placeholder="21h25"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                    />
                  </div>
                </div>

                {/* De */}
                <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">De (remetente)</p>
                  <input
                    type="text"
                    value={pix.de_nome}
                    onChange={(e) => setP("de_nome", e.target.value)}
                    placeholder="Nome completo"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={pix.de_cpf}
                      onChange={(e) => setP("de_cpf", e.target.value)}
                      placeholder="***.291.925-**"
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                    />
                    <input
                      type="text"
                      value={pix.de_banco}
                      onChange={(e) => setP("de_banco", e.target.value)}
                      placeholder="Mercado Pago"
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                    />
                  </div>
                </div>

                {/* Para */}
                <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Para (destinatário)</p>
                  <input
                    type="text"
                    value={pix.para_nome}
                    onChange={(e) => setP("para_nome", e.target.value)}
                    placeholder="Nome completo"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={pix.para_cpf}
                      onChange={(e) => setP("para_cpf", e.target.value)}
                      placeholder="***.237.499-**"
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                    />
                    <input
                      type="text"
                      value={pix.para_banco}
                      onChange={(e) => setP("para_banco", e.target.value)}
                      placeholder="Nome do banco"
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                    />
                  </div>
                </div>

                {/* IDs */}
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">N.º Transação Mercado Pago</label>
                    <input
                      type="text"
                      value={pix.transacao}
                      onChange={(e) => setP("transacao", e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">ID de Transação Pix</label>
                    <input
                      type="text"
                      value={pix.id}
                      onChange={(e) => setP("id", e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Preview ao vivo */}
              <div className="flex flex-col gap-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Preview (o que o alvo vê)</p>
                <div ref={pixPreviewRef}>
                  {pix.banco === "inter"  ? <BancoInterPreview pix={pix} /> :
                   pix.banco === "caixa"  ? <CaixaPreview pix={pix} />      :
                   <MercadoPagoPreview pix={pix} />}
                </div>
                <CapturarPrevia
                  previewRef={pixPreviewRef}
                  onImageReady={(url) => setF("og_imagem_url", url)}
                  bgColor={
                    pix.banco === "inter" ? "#fff3e8" :
                    pix.banco === "caixa" ? "#e8eff7" : "#e8f8fd"
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Anúncio: editor + preview ── */}
        {form.tipo === "anuncio" && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-medium text-gray-300 mb-4">Anúncio — Editor</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Campos */}
              <div className="space-y-4">
                {/* Plataforma */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Plataforma</label>
                  <div className="flex gap-2 flex-wrap">
                    {PLATAFORMAS_ANUNCIO.map((p) => (
                      <button key={p.id} type="button" onClick={() => handleAnuncioPlataformaChange(p.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                          anuncio.plataforma === p.id ? "border-blue-500 scale-105" : "border-gray-700 hover:border-gray-500"
                        }`}
                        style={{ background: p.cor, color: p.corTexto }}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Título */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Título do produto</label>
                  <input type="text" value={form.og_titulo} onChange={(e) => setF("og_titulo", e.target.value)}
                    placeholder="Ex: Bota Coturno Militar 930 Masculino..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm" />
                </div>

                {/* Preço */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Preço (R$)</label>
                  <input type="text" value={anuncio.preco} onChange={(e) => setA("preco", e.target.value)}
                    placeholder="170,91"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm" />
                </div>

                {/* Descrição */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Descrição</label>
                  <textarea value={form.og_descricao} onChange={(e) => setF("og_descricao", e.target.value)}
                    rows={4} placeholder="Detalhes do produto..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm resize-none" />
                </div>

                {/* Imagem */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Foto do produto</label>
                  <AnuncioImageUpload onUrlReady={(url) => setA("imagem_url", url)} />
                </div>
              </div>

              {/* Preview ao vivo */}
              <div className="flex flex-col gap-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Preview (o que o alvo vê)</p>
                <div ref={anuncioPreviewRef}>
                  {anuncio.plataforma === "shopee" ? (
                    <ShopeeAnuncioPreview titulo={form.og_titulo} descricao={form.og_descricao} imagemUrl={anuncio.imagem_url} preco={anuncio.preco} />
                  ) : anuncio.plataforma === "olx" ? (
                    <OlxAnuncioPreview titulo={form.og_titulo} descricao={form.og_descricao} imagemUrl={anuncio.imagem_url} preco={anuncio.preco} />
                  ) : (
                    <MercadoLivreAnuncioPreview titulo={form.og_titulo} descricao={form.og_descricao} imagemUrl={anuncio.imagem_url} preco={anuncio.preco} />
                  )}
                </div>
                <CapturarPrevia
                  previewRef={anuncioPreviewRef}
                  onImageReady={(url) => setF("og_imagem_url", url)}
                  bgColor={
                    anuncio.plataforma === "shopee" ? "#fff0ed" :
                    anuncio.plataforma === "olx"    ? "#f0ebf9" : "#fffbe6"
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Reportagem: editor + preview ── */}
        {form.tipo === "reportagem" && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-300">Reportagem</h3>
              <p className="text-xs text-gray-500 mt-0.5">Escolha o portal e edite o conteúdo que aparecerá no WhatsApp.</p>
            </div>

            {/* Seletor de portal */}
            <div>
              <p className="text-xs text-gray-400 mb-2">Portal / Plataforma</p>
              <div className="flex gap-2 flex-wrap">
                {PORTAL_CONFIGS.map((portal) => (
                  <button
                    key={portal.id}
                    type="button"
                    onClick={() => handlePortalChange(portal.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                      reportagemPortal === portal.id ? "border-blue-400 scale-105" : "border-gray-700 hover:border-gray-500"
                    }`}
                    style={{
                      background: portal.bg,
                      color: portal.textColor,
                      fontStyle: portal.italic ? "italic" : "normal",
                    }}
                  >
                    {portal.id === "instagram" ? "📷 Instagram" : portal.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Instagram */}
            {reportagemPortal === "instagram" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
                  <InstagramComposer
                    key="instagram-composer"
                    onImageReady={(url) => setF("og_imagem_url", url)}
                    onMetaReady={(titulo, descricao) => {
                      setF("og_titulo", titulo);
                      setF("og_descricao", descricao);
                    }}
                  />
                </div>
                <WhatsAppPreview
                  titulo={form.og_titulo}
                  descricao={form.og_descricao}
                  imagemUrl={form.og_imagem_url}
                  slug={form.slug}
                  baseUrl={baseUrl}
                  redirectUrl={form.redirect_url}
                />
              </div>
            ) : (
              /* G1 / Record / SBT / Band */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">Título</label>
                    <input
                      type="text"
                      value={form.og_titulo}
                      onChange={(e) => setF("og_titulo", e.target.value)}
                      placeholder="Ex: Homem é preso após..."
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">Descrição</label>
                    <textarea
                      value={form.og_descricao}
                      onChange={(e) => setF("og_descricao", e.target.value)}
                      rows={3}
                      placeholder="Ex: Polícia realizou operação na região..."
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm resize-none"
                    />
                  </div>
                  <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
                    <ImageComposer
                      key={reportagemPortal}
                      defaultLogoId={PORTAL_CONFIGS.find((p) => p.id === reportagemPortal)?.logoId ?? "g1"}
                      onImageReady={(url) => setF("og_imagem_url", url)}
                    />
                  </div>
                </div>
                <WhatsAppPreview
                  titulo={form.og_titulo}
                  descricao={form.og_descricao}
                  imagemUrl={form.og_imagem_url}
                  slug={form.slug}
                  baseUrl={baseUrl}
                  redirectUrl={form.redirect_url}
                />
              </div>
            )}
          </div>
        )}

        {erro && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300">{erro}</div>
        )}

        <div className="flex gap-3">
          <Link href="/ops/intel-link"
            className="px-4 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
            Cancelar
          </Link>
          <button type="submit" disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Criando..." : "Criar Investigação"}
          </button>
        </div>
      </form>
    </div>
  );
}
