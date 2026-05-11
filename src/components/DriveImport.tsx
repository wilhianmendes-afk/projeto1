"use client";

import { useState, useRef } from "react";
import { Loader2, FolderOpen, Upload, CheckCircle, XCircle, SkipForward } from "lucide-react";

// ─── Tipos ───────────────────────────────────────────────────────────────────
type Modo = "local" | "link";

interface Progresso {
  total: number;
  atual: number;
  importadas: number;
  puladas: number;
  semDados: number;
  erros: number;
  nomeAtual: string;
}

// ─── Utilitários ─────────────────────────────────────────────────────────────
const EXTENSOES_IMG = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp"]);

function ehImagem(nome: string) {
  const ext = nome.slice(nome.lastIndexOf(".")).toLowerCase();
  return EXTENSOES_IMG.has(ext);
}

async function md5(buffer: ArrayBuffer) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function extractDriveId(raw: string): string {
  const m = raw.match(/\/folders\/([a-zA-Z0-9_-]+)/) ||
            raw.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
            raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : raw.trim();
}

// ─── Componente ──────────────────────────────────────────────────────────────
export default function DriveImport() {
  const [modo, setModo] = useState<Modo>("local");

  // Local
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [rodando, setRodando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);

  // Link Drive
  const [linkInput, setLinkInput] = useState("");
  const [recursive, setRecursive] = useState(true);
  const [loadingLink, setLoadingLink] = useState(false);
  const [resultLink, setResultLink] = useState<{ imported: number; skipped: number; sem_dados: number } | null>(null);
  const [erroLink, setErroLink] = useState("");

  // ── Importação local ──────────────────────────────────────────────────────
  async function processarArquivos(files: FileList) {
    const imagens = Array.from(files).filter(f => ehImagem(f.name));
    if (!imagens.length) {
      alert("Nenhuma imagem encontrada na pasta selecionada.");
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
        const hash = await md5(buffer);

        const form = new FormData();
        form.append("file", file);
        form.append("file_hash", hash);
        form.append("file_name", file.name);

        const res = await fetch("/api/drive/local-import", {
          method: "POST",
          headers: { "x-import-token": "Z2XTlF4YgnICGN-u_o8jIsFFXX5WpHgvfHiRlfXpebs" },
          body: form,
        });

        const data = await res.json();

        if (data.status === "imported")  importadas++;
        else if (data.status === "skipped")   puladas++;
        else if (data.status === "sem_dados") semDados++;
        else                                   erros++;

      } catch {
        erros++;
      }

      setProgresso({ total: imagens.length, atual: i + 1, importadas, puladas, semDados, erros, nomeAtual: file.name });

      // Pequena pausa para não travar o servidor
      await new Promise(r => setTimeout(r, 300));
    }

    setRodando(false);
    setConcluido(true);
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) processarArquivos(e.target.files);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const items = e.dataTransfer.items;
    if (!items) return;
    // Tenta pegar arquivos via DataTransferItemList
    const files = e.dataTransfer.files;
    if (files.length) processarArquivos(files);
  }

  function parar() {
    abortRef.current = true;
    setRodando(false);
  }

  function reiniciar() {
    setConcluido(false);
    setProgresso(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  // ── Importação por link Drive ─────────────────────────────────────────────
  async function importarLink() {
    const ids = linkInput.split(/[\n,]+/).map(s => extractDriveId(s.trim())).filter(Boolean);
    if (!ids.length) return;

    setLoadingLink(true);
    setResultLink(null);
    setErroLink("");

    try {
      const res = await fetch("/api/drive/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderIds: ids, recursive }),
      });
      const text = await res.text();
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
      setResultLink({ imported: data.imported ?? 0, skipped: data.skipped ?? 0, sem_dados: data.sem_dados ?? 0 });
    } catch (err) {
      setErroLink(String(err));
    } finally {
      setLoadingLink(false);
    }
  }

  // ── Barra de progresso ────────────────────────────────────────────────────
  const pct = progresso ? Math.round((progresso.atual / progresso.total) * 100) : 0;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
        <FolderOpen className="w-5 h-5 text-blue-400" />
        Importar Fotos de Qualificados
      </h2>

      {/* Abas */}
      <div className="flex gap-2 mb-5">
        {[
          { key: "local", label: "📁 Pasta do Computador" },
          { key: "link",  label: "🔗 Link do Google Drive" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setModo(key as Modo)}
            className={`text-sm px-4 py-1.5 rounded-lg font-medium transition-colors ${
              modo === key
                ? "bg-blue-700 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Aba: Pasta local ── */}
      {modo === "local" && (
        <div>
          <p className="text-gray-400 text-sm mb-4">
            Selecione uma pasta do seu computador (ou do Google Drive Desktop). O sistema analisa cada foto,
            extrai nome, alcunha, CPF, DN e mãe automaticamente e adiciona ao banco — sem repetir fotos já importadas.
          </p>

          {/* Zona de seleção */}
          {!progresso && (
            <div
              onDrop={onDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-gray-700 hover:border-blue-600 rounded-xl p-10 text-center cursor-pointer transition-colors"
            >
              <Upload className="w-10 h-10 text-gray-500 mx-auto mb-3" />
              <p className="text-white font-medium mb-1">Clique para selecionar a pasta</p>
              <p className="text-gray-500 text-sm">ou arraste as fotos aqui</p>
              <p className="text-gray-600 text-xs mt-3">JPG · PNG · WEBP · BMP — subpastas incluídas automaticamente</p>
              <input
                ref={inputRef}
                type="file"
                multiple
                // @ts-expect-error webkitdirectory não tem tipo no TS mas funciona em todos os browsers modernos
                webkitdirectory=""
                accept="image/*"
                className="hidden"
                onChange={onFileInput}
              />
            </div>
          )}

          {/* Progresso */}
          {progresso && (
            <div>
              {/* Barra */}
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                <span>{progresso.atual} / {progresso.total} fotos</span>
                <span>{pct}%</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2 mb-3">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>

              {/* Arquivo atual */}
              {rodando && (
                <p className="text-gray-500 text-xs truncate mb-4 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                  {progresso.nomeAtual}
                </p>
              )}

              {/* Contadores */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-gray-800 rounded-lg p-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <div>
                    <p className="text-lg font-bold text-white">{progresso.importadas}</p>
                    <p className="text-gray-500 text-xs">Importadas</p>
                  </div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3 flex items-center gap-2">
                  <SkipForward className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="text-lg font-bold text-white">{progresso.puladas}</p>
                    <p className="text-gray-500 text-xs">Já existiam</p>
                  </div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3 flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-yellow-400" />
                  <div>
                    <p className="text-lg font-bold text-white">{progresso.semDados}</p>
                    <p className="text-gray-500 text-xs">Sem dados / não é ficha</p>
                  </div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3 flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-400" />
                  <div>
                    <p className="text-lg font-bold text-white">{progresso.erros}</p>
                    <p className="text-gray-500 text-xs">Erros</p>
                  </div>
                </div>
              </div>

              {/* Botões */}
              <div className="flex gap-2">
                {rodando ? (
                  <button onClick={parar} className="flex-1 bg-red-800 hover:bg-red-700 text-white text-sm py-2 rounded-lg">
                    Parar
                  </button>
                ) : (
                  <button onClick={reiniciar} className="flex-1 bg-blue-700 hover:bg-blue-600 text-white text-sm py-2 rounded-lg">
                    Importar outra pasta
                  </button>
                )}
              </div>

              {concluido && (
                <p className="text-green-400 text-sm text-center mt-3">
                  ✓ Concluído — {progresso.importadas} foto(s) adicionada(s) ao banco
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Aba: Link Drive ── */}
      {modo === "link" && (
        <div>
          <p className="text-gray-400 text-sm mb-4">
            Cole links ou IDs do Google Drive (um por linha). Requer credenciais Google configuradas nas env vars.
          </p>

          <textarea
            value={linkInput}
            onChange={e => setLinkInput(e.target.value)}
            placeholder={"https://drive.google.com/drive/folders/1BxiMVs...\nhttps://drive.google.com/file/d/1pNeyFB..."}
            rows={4}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600 mb-3 font-mono resize-none"
          />

          <label className="flex items-center gap-2 text-sm text-gray-300 mb-4 cursor-pointer select-none">
            <input type="checkbox" checked={recursive} onChange={e => setRecursive(e.target.checked)} className="accent-blue-500" />
            Escanear subpastas automaticamente
          </label>

          <button
            onClick={importarLink}
            disabled={!linkInput.trim() || loadingLink}
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {loadingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
            {loadingLink ? "Importando..." : "Importar"}
          </button>

          {resultLink && (
            <div className="mt-3 text-sm space-y-1">
              <p className="text-green-400">✅ Importados: {resultLink.imported}</p>
              <p className="text-gray-400">⏭ Já existiam: {resultLink.skipped}</p>
              {resultLink.sem_dados > 0 && <p className="text-yellow-400">⚠️ Sem dados: {resultLink.sem_dados}</p>}
            </div>
          )}
          {erroLink && <p className="text-red-400 text-sm mt-3">{erroLink}</p>}
        </div>
      )}
    </div>
  );
}
