"use client";

import { useState, useRef } from "react";
import { Loader2, FolderOpen, ImagePlus, CheckCircle, XCircle, SkipForward } from "lucide-react";

interface Progresso {
  total: number;
  atual: number;
  importadas: number;
  puladas: number;
  semDados: number;
  erros: number;
  nomeAtual: string;
}

const EXTENSOES_IMG = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp"]);

function ehImagem(nome: string) {
  return EXTENSOES_IMG.has(nome.slice(nome.lastIndexOf(".")).toLowerCase());
}

async function sha256(buffer: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export default function DriveImport() {
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [rodando, setRodando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  const pastaRef  = useRef<HTMLInputElement>(null);
  const fotosRef  = useRef<HTMLInputElement>(null);
  const abortRef  = useRef(false);

  async function processarArquivos(files: FileList) {
    const imagens = Array.from(files).filter(f => ehImagem(f.name));
    if (!imagens.length) {
      alert("Nenhuma imagem encontrada.");
      return;
    }

    abortRef.current = false;
    setRodando(true);
    setConcluido(false);
    setProgresso({ total: imagens.length, atual: 0, importadas: 0, puladas: 0, semDados: 0, erros: 0, nomeAtual: "" });

    let importadas = 0, puladas = 0, semDados = 0, erros = 0;

    for (let i = 0; i < imagens.length; i++) {
      if (abortRef.current) break;

      const file = imagens[i];
      setProgresso(p => p ? { ...p, atual: i + 1, nomeAtual: file.name } : p);

      try {
        const buffer = await file.arrayBuffer();
        const hash   = await sha256(buffer);

        const form = new FormData();
        form.append("file", file);
        form.append("file_hash", hash);
        form.append("file_name", file.name);

        const res  = await fetch("/api/drive/local-import", {
          method: "POST",
          headers: { "x-import-token": "Z2XTlF4YgnICGN-u_o8jIsFFXX5WpHgvfHiRlfXpebs" },
          body: form,
        });
        const data = await res.json();

        if      (data.status === "imported")  importadas++;
        else if (data.status === "skipped")   puladas++;
        else if (data.status === "sem_dados") semDados++;
        else                                   erros++;

      } catch { erros++; }

      setProgresso({ total: imagens.length, atual: i + 1, importadas, puladas, semDados, erros, nomeAtual: file.name });
      await new Promise(r => setTimeout(r, 300));
    }

    setRodando(false);
    setConcluido(true);
  }

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) processarArquivos(e.target.files);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files.length) processarArquivos(e.dataTransfer.files);
  }

  function reiniciar() {
    setConcluido(false);
    setProgresso(null);
    if (pastaRef.current) pastaRef.current.value = "";
    if (fotosRef.current) fotosRef.current.value = "";
  }

  const pct = progresso ? Math.round((progresso.atual / progresso.total) * 100) : 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="font-semibold text-white mb-1 flex items-center gap-2">
        <ImagePlus className="w-5 h-5 text-blue-400" />
        Importar Fotos de Qualificados
      </h2>
      <p className="text-gray-500 text-xs mb-4">
        Selecione uma pasta ou fotos individuais. O sistema analisa cada imagem, extrai os dados e adiciona ao banco automaticamente.
      </p>

      {/* Inputs ocultos */}
      <input ref={pastaRef} type="file" multiple
        // @ts-expect-error webkitdirectory não tipado no TS
        webkitdirectory="" accept="image/*" className="hidden" onChange={onInput} />
      <input ref={fotosRef} type="file" multiple accept="image/*" className="hidden" onChange={onInput} />

      {!progresso ? (
        <>
          {/* Zona de drop */}
          <div
            onDrop={onDrop}
            onDragOver={e => e.preventDefault()}
            className="border-2 border-dashed border-gray-700 hover:border-blue-600 rounded-xl p-8 text-center transition-colors mb-4"
          >
            <p className="text-gray-400 text-sm mb-1">Arraste fotos ou pasta aqui</p>
            <p className="text-gray-600 text-xs">JPG · PNG · WEBP · BMP</p>
          </div>

          {/* Botões de seleção */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => pastaRef.current?.click()}
              className="flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium px-4 py-3 rounded-xl transition-colors"
            >
              <FolderOpen className="w-4 h-4 text-blue-400" />
              Selecionar Pasta
            </button>
            <button
              onClick={() => fotosRef.current?.click()}
              className="flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium px-4 py-3 rounded-xl transition-colors"
            >
              <ImagePlus className="w-4 h-4 text-green-400" />
              Selecionar Fotos
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Barra de progresso */}
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span className="truncate max-w-[70%]">{rodando ? progresso.nomeAtual : "Concluído"}</span>
            <span>{progresso.atual}/{progresso.total} · {pct}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2 mb-4">
            <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>

          {/* Contadores */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-gray-800 rounded-lg p-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              <div>
                <p className="text-lg font-bold text-white">{progresso.importadas}</p>
                <p className="text-gray-500 text-xs">Importadas</p>
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 flex items-center gap-2">
              <SkipForward className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div>
                <p className="text-lg font-bold text-white">{progresso.puladas}</p>
                <p className="text-gray-500 text-xs">Já existiam</p>
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
              <div>
                <p className="text-lg font-bold text-white">{progresso.semDados}</p>
                <p className="text-gray-500 text-xs">Sem dados / não é ficha</p>
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <div>
                <p className="text-lg font-bold text-white">{progresso.erros}</p>
                <p className="text-gray-500 text-xs">Erros</p>
              </div>
            </div>
          </div>

          {/* Ações */}
          {rodando ? (
            <button onClick={() => { abortRef.current = true; setRodando(false); }}
              className="w-full bg-red-800 hover:bg-red-700 text-white text-sm py-2 rounded-lg">
              Parar
            </button>
          ) : (
            <button onClick={reiniciar}
              className="w-full bg-blue-700 hover:bg-blue-600 text-white text-sm py-2 rounded-lg">
              {concluido ? `✓ ${progresso.importadas} importada(s) — Importar mais` : "Importar mais"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
