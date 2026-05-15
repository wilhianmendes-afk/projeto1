"use client";

import { useState, useRef } from "react";
import {
  Loader2, FolderOpen, ImagePlus, CheckCircle,
  XCircle, Trash2, Upload,
} from "lucide-react";

type CardStatus = "analisando" | "revisao" | "importando" | "importada" | "descartada" | "erro";

interface FotoCard {
  id: string;
  blob: Blob;
  hash: string;
  fileName: string;
  previewUrl: string;
  status: CardStatus;
  // dados OCR (editáveis)
  nome: string;
  genitora: string;
  nascimento: string;
  vulgo: string;
  cpf: string;
  observacoes: string;
  erroMsg?: string;
}

const IMPORT_TOKEN = "Z2XTlF4YgnICGN-u_o8jIsFFXX5WpHgvfHiRlfXpebs";
const EXTENSOES_IMG = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp"]);

function ehImagem(nome: string) {
  return EXTENSOES_IMG.has(nome.slice(nome.lastIndexOf(".")).toLowerCase());
}

async function sha256(buffer: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(h))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

async function resizeParaJpeg(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1600;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width >= height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => resolve(blob ?? file), "image/jpeg", 0.88);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

export default function DriveImport() {
  const [cards, setCards] = useState<FotoCard[]>([]);
  const [analisando, setAnalisando] = useState(false);
  const [analiseTotal, setAnaliseTotal] = useState(0);
  const [analiseAtual, setAnaliseAtual] = useState(0);

  const pastaRef = useRef<HTMLInputElement>(null);
  const fotosRef = useRef<HTMLInputElement>(null);

  function updateCard(id: string, patch: Partial<FotoCard>) {
    setCards(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  }

  async function processarArquivos(files: FileList) {
    const imagens = Array.from(files).filter(f => ehImagem(f.name));
    if (!imagens.length) { alert("Nenhuma imagem encontrada."); return; }

    setAnalisando(true);
    setAnaliseTotal(imagens.length);
    setAnaliseAtual(0);

    const novosCards: FotoCard[] = [];

    for (let i = 0; i < imagens.length; i++) {
      setAnaliseAtual(i + 1);
      const file = imagens[i];

      const blob = await resizeParaJpeg(file);
      const buffer = await blob.arrayBuffer();
      const hash = await sha256(buffer);
      const previewUrl = URL.createObjectURL(blob);
      const id = `${hash}-${Date.now()}-${i}`;

      // Adiciona card em estado "analisando" imediatamente
      const card: FotoCard = {
        id, blob, hash, fileName: file.name, previewUrl,
        status: "analisando",
        nome: "", genitora: "", nascimento: "", vulgo: "", cpf: "", observacoes: "",
      };
      novosCards.push(card);
      setCards(prev => [...prev, card]);

      // Chama OCR (preview — não salva nada)
      try {
        const form = new FormData();
        form.append("file", new File([blob], file.name, { type: "image/jpeg" }));

        const res = await fetch("/api/drive/local-preview", {
          method: "POST",
          headers: { "x-import-token": IMPORT_TOKEN },
          body: form,
        });
        const dados = await res.json();

        if (dados._erro) console.warn(`[OCR erro] ${file.name}:`, dados._erro);

        setCards(prev => prev.map(c => c.id !== id ? c : {
          ...c,
          status: "revisao",
          nome: dados.nome ?? "",
          genitora: dados.genitora ?? "",
          nascimento: dados.nascimento ?? "",
          vulgo: dados.vulgo ?? "",
          cpf: dados.cpf ?? "",
          observacoes: dados.observacoes ?? "",
          erroMsg: dados._erro ? `OCR falhou: ${dados._erro}` : undefined,
        }));
      } catch (e) {
        console.error(`[OCR falha de rede] ${file.name}:`, e);
        setCards(prev => prev.map(c => c.id !== id ? c : {
          ...c, status: "revisao",
        }));
      }
    }

    setAnalisando(false);
  }

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) processarArquivos(e.target.files);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files.length) processarArquivos(e.dataTransfer.files);
  }

  async function importarCard(id: string) {
    const card = cards.find(c => c.id === id);
    if (!card || !card.nome.trim()) return;

    updateCard(id, { status: "importando" });

    try {
      const form = new FormData();
      form.append("file", new File([card.blob], card.fileName, { type: "image/jpeg" }));
      form.append("file_hash", card.hash);
      form.append("file_name", card.fileName);
      form.append("nome", card.nome.trim());
      if (card.genitora.trim())   form.append("genitora", card.genitora.trim());
      if (card.nascimento.trim()) form.append("nascimento", card.nascimento.trim());
      if (card.vulgo.trim())      form.append("vulgo", card.vulgo.trim());
      if (card.cpf.trim())        form.append("cpf", card.cpf.trim());
      if (card.observacoes.trim()) form.append("observacoes", card.observacoes.trim());

      const res = await fetch("/api/drive/local-import", {
        method: "POST",
        headers: { "x-import-token": IMPORT_TOKEN },
        body: form,
      });
      const data = await res.json();

      if (data.status === "imported" || data.status === "skipped") {
        updateCard(id, { status: "importada" });
      } else {
        updateCard(id, { status: "erro", erroMsg: data.error ?? "Erro ao importar" });
      }
    } catch (err) {
      updateCard(id, { status: "erro", erroMsg: String(err) });
    }
  }

  function descartarCard(id: string) {
    setCards(prev => {
      const card = prev.find(c => c.id === id);
      if (card) URL.revokeObjectURL(card.previewUrl);
      return prev.filter(c => c.id !== id);
    });
  }

  function limpar() {
    cards.forEach(c => URL.revokeObjectURL(c.previewUrl));
    setCards([]);
    if (pastaRef.current) pastaRef.current.value = "";
    if (fotosRef.current) fotosRef.current.value = "";
  }

  const emRevisao = cards.filter(c => c.status === "revisao" || c.status === "importando" || c.status === "erro");
  const importadas = cards.filter(c => c.status === "importada").length;
  const semNome = emRevisao.filter(c => !c.nome.trim()).length;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="font-semibold text-white mb-1 flex items-center gap-2">
        <ImagePlus className="w-5 h-5 text-blue-400" />
        Importar Fotos de Qualificados
      </h2>
      <p className="text-gray-500 text-xs mb-4">
        Selecione fotos para analisar. O sistema extrai os dados e mostra para revisão antes de importar.
      </p>

      {/* Inputs ocultos */}
      <input ref={pastaRef} type="file" multiple
        // @ts-expect-error webkitdirectory não tipado no TS
        webkitdirectory="" accept="image/*" className="hidden" onChange={onInput} />
      <input ref={fotosRef} type="file" multiple accept="image/*" className="hidden" onChange={onInput} />

      {/* Seletor de arquivos */}
      <div
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        className="border-2 border-dashed border-gray-700 hover:border-blue-600 rounded-xl p-6 text-center transition-colors mb-4"
      >
        <p className="text-gray-400 text-sm mb-1">Arraste fotos ou pasta aqui</p>
        <p className="text-gray-600 text-xs">JPG · PNG · WEBP · BMP</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <button
          onClick={() => pastaRef.current?.click()}
          disabled={analisando}
          className="flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-white text-sm font-medium px-4 py-3 rounded-xl transition-colors"
        >
          <FolderOpen className="w-4 h-4 text-blue-400" />
          Selecionar Pasta
        </button>
        <button
          onClick={() => fotosRef.current?.click()}
          disabled={analisando}
          className="flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-white text-sm font-medium px-4 py-3 rounded-xl transition-colors"
        >
          <ImagePlus className="w-4 h-4 text-green-400" />
          Selecionar Fotos
        </button>
      </div>

      {/* Progresso da análise OCR */}
      {analisando && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span className="flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Analisando fotos…
            </span>
            <span>{analiseAtual}/{analiseTotal}</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-1.5">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all"
              style={{ width: `${Math.round((analiseAtual / analiseTotal) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Resumo quando há cards */}
      {cards.length > 0 && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-3 text-xs">
            {importadas > 0 && (
              <span className="text-green-400 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> {importadas} importada{importadas !== 1 ? "s" : ""}
              </span>
            )}
            {emRevisao.length > 0 && (
              <span className="text-yellow-400">{emRevisao.length} aguardando revisão</span>
            )}
          </div>
          {!analisando && (
            <button
              onClick={limpar}
              className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> Limpar tudo
            </button>
          )}
        </div>
      )}

      {/* Cards de revisão */}
      {cards.length > 0 && (
        <div className="space-y-4">
          {cards.map(card => (
            <CardRevisao
              key={card.id}
              card={card}
              onChange={(campo, valor) =>
                setCards(prev => prev.map(c => c.id === card.id ? { ...c, [campo]: valor } : c))
              }
              onImportar={() => importarCard(card.id)}
              onDescartar={() => descartarCard(card.id)}
            />
          ))}
        </div>
      )}

      {/* Aviso sobre campos sem nome */}
      {semNome > 0 && !analisando && (
        <p className="mt-3 text-xs text-yellow-500">
          {semNome} foto{semNome !== 1 ? "s" : ""} sem nome — preencha o campo Nome antes de importar.
        </p>
      )}
    </div>
  );
}

// ── Card individual de revisão ────────────────────────────────────────────────

interface CardRevisaoProps {
  card: FotoCard;
  onChange: (campo: keyof FotoCard, valor: string) => void;
  onImportar: () => void;
  onDescartar: () => void;
}

function CardRevisao({ card, onChange, onImportar, onDescartar }: CardRevisaoProps) {
  const isLoading = card.status === "analisando" || card.status === "importando";
  const isDone    = card.status === "importada";

  return (
    <div className={`rounded-xl border p-4 transition-all ${
      isDone
        ? "border-green-800 bg-green-950/30"
        : card.status === "erro"
        ? "border-red-800 bg-red-950/20"
        : "border-gray-700 bg-gray-800"
    }`}>
      <div className="flex gap-4">
        {/* Foto */}
        <div className="relative flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.previewUrl}
            alt={card.fileName}
            className="w-28 h-36 object-contain rounded-lg bg-gray-900"
          />
          {isDone && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-green-900/60">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
          )}
          {card.status === "analisando" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/60 gap-1">
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
              <span className="text-xs text-gray-300">Analisando…</span>
            </div>
          )}
        </div>

        {/* Dados */}
        <div className="flex-1 min-w-0">
          {isDone ? (
            <div className="h-full flex flex-col justify-center">
              <p className="text-green-400 font-semibold text-sm">Importado com sucesso</p>
              <p className="text-gray-400 text-xs mt-1">{card.nome}</p>
            </div>
          ) : (
            <>
              <p className="text-gray-500 text-xs truncate mb-2">{card.fileName}</p>

              <div className="space-y-2">
                {/* Nome */}
                <div>
                  <label className="text-gray-400 text-xs mb-0.5 block">Nome *</label>
                  <input
                    type="text"
                    value={card.nome}
                    onChange={e => onChange("nome", e.target.value)}
                    disabled={isLoading}
                    placeholder="Nome completo"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* Nascimento */}
                  <div>
                    <label className="text-gray-400 text-xs mb-0.5 block">Nascimento</label>
                    <input
                      type="text"
                      value={card.nascimento}
                      onChange={e => onChange("nascimento", e.target.value)}
                      disabled={isLoading}
                      placeholder="DD/MM/AAAA"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                    />
                  </div>

                  {/* Vulgo */}
                  <div>
                    <label className="text-gray-400 text-xs mb-0.5 block">Vulgo</label>
                    <input
                      type="text"
                      value={card.vulgo}
                      onChange={e => onChange("vulgo", e.target.value)}
                      disabled={isLoading}
                      placeholder="Apelido"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* Genitora */}
                <div>
                  <label className="text-gray-400 text-xs mb-0.5 block">Genitora</label>
                  <input
                    type="text"
                    value={card.genitora}
                    onChange={e => onChange("genitora", e.target.value)}
                    disabled={isLoading}
                    placeholder="Nome da mãe"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  />
                </div>
              </div>

              {card.status === "erro" && (
                <p className="text-red-400 text-xs mt-2">{card.erroMsg}</p>
              )}

              {/* Botões */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={onImportar}
                  disabled={isLoading || !card.nome.trim()}
                  className="flex items-center gap-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {card.status === "importando" ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Importando…</>
                  ) : (
                    <><Upload className="w-3 h-3" /> Importar</>
                  )}
                </button>

                <button
                  onClick={onDescartar}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 bg-gray-700 hover:bg-red-900 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 hover:text-red-300 text-xs font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  <XCircle className="w-3 h-3" /> Descartar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
