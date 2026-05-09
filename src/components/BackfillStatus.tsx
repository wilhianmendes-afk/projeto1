"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Play } from "lucide-react";

interface Stats {
  ok: boolean;
  processed: number;
  embedded: number;
  remaining: number;
}

export default function BackfillStatus({ initialRemaining }: { initialRemaining: number }) {
  const router = useRouter();
  const [running, setRunning]   = useState(false);
  const [lastRun, setLastRun]   = useState<Stats | null>(null);
  const [error, setError]       = useState("");
  const [remaining, setRemaining] = useState(initialRemaining);

  // Atualiza os dados da página a cada 60s sem precisar de ação do usuário
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 60000);
    return () => clearInterval(id);
  }, [router]);

  const triggerOne = useCallback(async () => {
    setRunning(true);
    setError("");
    try {
      const text = await (await fetch("/api/face/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 5 }),
      })).text();
      const data = JSON.parse(text);
      setLastRun(data);
      setRemaining(data.remaining ?? remaining);
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }, [remaining, router]);

  return (
    <div className="space-y-4">
      {/* Status automático */}
      <div className="flex items-center gap-3 text-sm text-gray-400">
        <div className="flex items-center gap-1.5 bg-green-950 border border-green-800 text-green-400 px-3 py-1.5 rounded-lg text-xs font-medium">
          <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
          Automático — a cada 15 min via GitHub Actions
        </div>
      </div>

      {/* Resultado da última execução manual */}
      {lastRun && (
        <div className="text-xs text-gray-500 bg-gray-800 rounded-lg px-3 py-2">
          Última execução manual: {lastRun.embedded} embeddado(s) · {lastRun.remaining} pendentes
        </div>
      )}

      {error && (
        <p className="text-red-400 text-xs bg-red-950 border border-red-900 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Botões */}
      <div className="flex gap-2">
        <button
          onClick={triggerOne}
          disabled={running}
          className="flex items-center gap-2 text-sm bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
        >
          {running
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Processando...</>
            : <><Play className="w-4 h-4" /> Rodar agora</>}
        </button>

        <button
          onClick={() => router.refresh()}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-2 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {remaining === 0 && (
        <p className="text-green-400 text-sm font-medium">
          Todos os embeddings gerados.
        </p>
      )}
    </div>
  );
}
