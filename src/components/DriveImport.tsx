"use client";

import { useState } from "react";
import { Loader2, FolderOpen } from "lucide-react";

export default function DriveImport() {
  const [folderId, setFolderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState("");

  async function run() {
    if (!folderId.trim()) return;
    if (!confirm(`Importar fotos da pasta do Google Drive?\n\nID: ${folderId}`)) return;
    setLoading(true);
    setResult(null);
    setError("");

    try {
      const res = await fetch("/api/drive/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: folderId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro");
      setResult(data);
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
        Cole o ID da pasta do Google Drive que contém as fotos (visível na URL da pasta).
      </p>

      <input
        type="text"
        value={folderId}
        onChange={(e) => setFolderId(e.target.value)}
        placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600 mb-3 font-mono"
      />

      <button
        onClick={run}
        disabled={!folderId.trim() || loading}
        className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
        {loading ? "Importando..." : "Importar fotos"}
      </button>

      {result && (
        <p className="text-green-400 text-sm mt-3">
          Importados: {result.imported} fotos | Ignorados: {result.skipped}
        </p>
      )}
      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
    </div>
  );
}
