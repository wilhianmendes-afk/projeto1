"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

export default function IndexButton({ qualificadoId }: { qualificadoId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ embedded: number; diagnostics?: object[] } | null>(null);
  const [error, setError] = useState("");

  async function run() {
    setLoading(true);
    setResult(null);
    setError("");

    try {
      const res = await fetch("/api/face/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qualificadoId }),
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
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={loading}
        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        Re-indexar
      </button>
      {result && result.embedded > 0 && (
        <span className="text-green-400 text-xs">{result.embedded} embeddings gerados</span>
      )}
      {result && result.embedded === 0 && result.diagnostics && (
        <span className="text-yellow-400 text-xs font-mono">
          {JSON.stringify(result.diagnostics)}
        </span>
      )}
      {error && <span className="text-red-400 text-xs">{error}</span>}
    </div>
  );
}
