"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";

interface BrunoStatus {
  ok: boolean;
  total_qualificados?: number;
  total_indexados?: number;
  estimado?: boolean;
}

export default function BancoParceiros() {
  const [status, setStatus] = useState<BrunoStatus | null>(null);

  useEffect(() => {
    fetch("/api/banco-bruno/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ ok: false }));
  }, []);

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Bancos Parceiros
      </h2>

      <div className="bg-gray-900 border border-amber-800/50 rounded-xl p-5 flex items-center gap-4">
        <div className="bg-amber-950 text-amber-400 w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0">
          <Users className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-gray-400 text-xs mb-0.5">Banco Bruno</p>
          {status === null ? (
            <p className="text-gray-500 text-sm animate-pulse">Consultando...</p>
          ) : !status.ok ? (
            <p className="text-gray-500 text-sm">Indisponível</p>
          ) : status.total_qualificados != null ? (
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-white">
                {status.total_qualificados.toLocaleString("pt-BR")}
              </p>
              <p className="text-amber-400 text-sm">qualificados</p>
              {status.estimado && (
                <span className="text-gray-600 text-xs">(estimado)</span>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Sem dados</p>
          )}
        </div>

        <span className="text-[10px] font-bold bg-amber-700 text-white px-2 py-1 rounded flex-shrink-0">
          PARCEIRO
        </span>
      </div>
    </div>
  );
}
