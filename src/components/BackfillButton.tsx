"use client";

import { useState } from "react";
import { Loader2, Play } from "lucide-react";

export default function BackfillButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ processed: number; embedded: number; skipped: number } | null>(null);
  const [error, setError] = useState("");

  async function run() {
    if (!confirm("Iniciar backfill de todos os qualificados pendentes?")) return;
    setLoading(true);
    setResult(null);
    setError("");

    try {
      const res = await fetch("/api/face/backfill", { method: "POST" });
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
    <div>
      <button
        onClick={run}
        disabled={loading}
        className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        {loading ? "Processando..." : "Iniciar Backfill"}
      </button>

      {result && (
        <p className="text-green-400 text-sm mt-3">
          Concluído: {result.processed} processados, {result.embedded} embeddings gerados,{" "}
          {result.skipped} ignorados.
        </p>
      )}
      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
    </div>
  );
}
