"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Loader2, RefreshCw, XCircle } from "lucide-react";

type Stats = {
  rodada: number;
  processed: number;
  embedded: number;
  skipped: number;
  remaining: number;
};

export default function AutoBackfill() {
  const router = useRouter();
  const [stats, setStats]     = useState<Stats>({ rodada: 0, processed: 0, embedded: 0, skipped: 0, remaining: -1 });
  const [status, setStatus]   = useState<"running" | "done" | "error" | "stopped">("running");
  const [errorMsg, setErrorMsg] = useState("");
  const [retryIn, setRetryIn]  = useState(0);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    run();
    return () => { stopped.current = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    setStatus("running");
    setErrorMsg("");
    let rodada = 0, totalProcessed = 0, totalEmbedded = 0, totalSkipped = 0;

    while (!stopped.current) {
      try {
        const res  = await fetch("/api/face/backfill", { method: "POST" });

        let data;
        try {
          const text = await res.text();
          data = JSON.parse(text);
        } catch (e) {
          throw new Error(`Resposta inválida: ${String(e).substring(0, 100)}`);
        }

        if (!res.ok) {
          const msg = data.error ?? `HTTP ${res.status}`;
          // 503 = face service offline — espera mais antes de tentar
          if (res.status === 503) throw new Error(`⚠️ ${msg}`);
          throw new Error(msg);
        }

        rodada++;
        totalProcessed += data.processed ?? 0;
        totalEmbedded  += data.embedded  ?? 0;
        totalSkipped   += data.skipped   ?? 0;

        setStats({ rodada, processed: totalProcessed, embedded: totalEmbedded, skipped: totalSkipped, remaining: data.remaining ?? 0 });

        if ((data.remaining ?? 0) === 0) {
          setStatus("done");
          router.refresh();
          return;
        }

        // pequena pausa entre rodadas para não sobrecarregar
        await sleep(1500);
      } catch (e) {
        if (stopped.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        setErrorMsg(msg);
        setStatus("error");

        // retry automático com contagem regressiva
        for (let i = 8; i > 0 && !stopped.current; i--) {
          setRetryIn(i);
          await sleep(1000);
        }
        if (stopped.current) return;
        setRetryIn(0);
        setStatus("running");
      }
    }
    setStatus("stopped");
  }

  function stop() {
    stopped.current = true;
    setStatus("stopped");
  }

  function restart() {
    stopped.current = false;
    setStats({ rodada: 0, processed: 0, embedded: 0, skipped: 0, remaining: -1 });
    setErrorMsg("");
    setRetryIn(0);
    run();
  }

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex items-center gap-2">
        {status === "running" && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
        {status === "done"    && <CheckCircle className="w-4 h-4 text-green-400" />}
        {status === "error"   && <XCircle className="w-4 h-4 text-red-400" />}
        {status === "stopped" && <RefreshCw className="w-4 h-4 text-gray-400" />}

        <span className="text-sm font-medium text-white">
          {status === "running" && (stats.remaining === -1 ? "Iniciando..." : `Processando... ${stats.remaining} pendentes`)}
          {status === "done"    && "Todos os embeddings gerados!"}
          {status === "error"   && `Erro — tentando novamente em ${retryIn}s`}
          {status === "stopped" && "Pausado"}
        </span>
      </div>

      {/* Progresso */}
      {stats.rodada > 0 && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-gray-800 rounded-lg p-2">
            <p className="text-white font-bold text-lg">{stats.processed}</p>
            <p className="text-gray-400 text-xs">Processados</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-2">
            <p className="text-green-400 font-bold text-lg">{stats.embedded}</p>
            <p className="text-gray-400 text-xs">Embeddings</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-2">
            <p className="text-yellow-400 font-bold text-lg">{stats.skipped}</p>
            <p className="text-gray-400 text-xs">Sem rosto</p>
          </div>
        </div>
      )}

      {/* Erro detalhado */}
      {errorMsg && (
        <p className="text-red-400 text-xs bg-red-950 border border-red-900 rounded-lg px-3 py-2">
          {errorMsg}
        </p>
      )}

      {/* Controles */}
      <div className="flex gap-2">
        {(status === "running" || status === "error") && (
          <button onClick={stop} className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors">
            Pausar
          </button>
        )}
        {(status === "stopped" || status === "done") && (
          <button onClick={restart} className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-white border border-blue-800 hover:border-blue-600 px-3 py-1.5 rounded-lg transition-colors">
            <RefreshCw className="w-3 h-3" />
            Reiniciar
          </button>
        )}
      </div>
    </div>
  );
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
