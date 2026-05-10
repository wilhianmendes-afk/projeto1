"use client";

import { useState } from "react";
import { Loader2, FolderOpen } from "lucide-react";

function extractDriveId(raw: string): string {
  const folderMatch = raw.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  const fileMatch = raw.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];
  const openMatch = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return openMatch[1];
  return raw.trim();
}

function parseIds(input: string): string[] {
  return input.split(/[\n,]+/).map(s => extractDriveId(s.trim())).filter(Boolean);
}

export default function DriveImport() {
  const [folderInput, setFolderInput] = useState("");
  const [recursive, setRecursive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; sem_dados: number } | null>(null);
  const [error, setError] = useState("");

  const ids = parseIds(folderInput);

  async function run() {
    if (!ids.length) return;
    if (!confirm(`Importar fotos de ${ids.length} pasta(s) do Google Drive?${recursive ? "\n\nSubpastas serão escaneadas automaticamente." : ""}`)) return;

    setLoading(true);
    setResult(null);
    setError("");

    try {
      const res = await fetch("/api/drive/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderIds: ids, recursive }),
      });
      const text = await res.text();
      if (!text) throw new Error(`Servidor retornou resposta vazia (status ${res.status})`);
      let data: { ok?: boolean; imported?: number; skipped?: number; sem_dados?: number; error?: string };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Resposta inesperada do servidor: ${text.slice(0, 300)}`);
      }
      if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
      setResult({ imported: data.imported ?? 0, skipped: data.skipped ?? 0, sem_dados: data.sem_dados ?? 0 });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="font-semibold text-white mb-3 flex items-center gap-2">
        <FolderOpen className="w-5 h-5 text-blue-400" />
        Importar do Google Drive
      </h2>
      <p className="text-gray-400 text-sm mb-4">
        Cole links ou IDs do Google Drive (um por linha). Aceita links de pasta ou de arquivo individual.
      </p>

      <textarea
        value={folderInput}
        onChange={(e) => setFolderInput(e.target.value)}
        placeholder={"https://drive.google.com/drive/folders/1BxiMVs...\nhttps://drive.google.com/file/d/1pNeyFB...\n1Cx9NVs1YSB6gNLKwCeCaAkhmVVrqumuct85PhWF3vnt"}
        rows={4}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600 mb-3 font-mono resize-none"
      />

      <label className="flex items-center gap-2 text-sm text-gray-300 mb-4 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={recursive}
          onChange={(e) => setRecursive(e.target.checked)}
          className="accent-blue-500"
        />
        Escanear subpastas automaticamente
      </label>

      <button
        onClick={run}
        disabled={!ids.length || loading}
        className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
        {loading
          ? "Importando... (pode demorar alguns minutos)"
          : `Importar${ids.length > 1 ? ` (${ids.length} itens)` : ""}`}
      </button>

      {result && (
        <div className="mt-3 text-sm space-y-1">
          <p className="text-green-400">✅ Importados: {result.imported}</p>
          <p className="text-gray-400">⏭ Já existiam: {result.skipped}</p>
          {result.sem_dados > 0 && (
            <p className="text-yellow-400">⚠️ Sem dados identificados: {result.sem_dados}</p>
          )}
        </div>
      )}
      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
    </div>
  );
}
