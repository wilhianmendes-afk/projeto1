"use client";

import { useEffect, useState } from "react";
import { Users, Fingerprint, Wifi } from "lucide-react";

interface BrunoStatus {
  ok: boolean;
  total_qualificados?: number;
  faces_total?: number;
  faces_banco?: number;
  faces_drive?: number;
  ibis_online?: boolean;
  cadastrados_hoje?: number;
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

      <div className="bg-gray-900 border border-amber-800/50 rounded-xl p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold bg-amber-700 text-white px-2 py-1 rounded">
              BANCO BRUNO
            </span>
            {status?.ibis_online && (
              <span className="flex items-center gap-1 text-green-400 text-xs">
                <Wifi className="w-3 h-3" />
                IBIS online
              </span>
            )}
          </div>
          {status?.cadastrados_hoje != null && status.cadastrados_hoje > 0 && (
            <span className="text-amber-400 text-xs">
              +{status.cadastrados_hoje} hoje
            </span>
          )}
        </div>

        {/* Stats */}
        {status === null ? (
          <p className="text-gray-500 text-sm animate-pulse">Consultando...</p>
        ) : !status.ok ? (
          <p className="text-gray-500 text-sm">Indisponível</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Users className="w-3.5 h-3.5 text-amber-400" />
                <p className="text-gray-400 text-xs">Pessoas</p>
              </div>
              <p className="text-xl font-bold text-white">
                {status.total_qualificados?.toLocaleString("pt-BR") ?? "—"}
              </p>
            </div>

            <div className="bg-gray-800 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Fingerprint className="w-3.5 h-3.5 text-amber-400" />
                <p className="text-gray-400 text-xs">Faces banco</p>
              </div>
              <p className="text-xl font-bold text-white">
                {status.faces_banco?.toLocaleString("pt-BR") ?? "—"}
              </p>
            </div>

            <div className="bg-gray-800 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Fingerprint className="w-3.5 h-3.5 text-blue-400" />
                <p className="text-gray-400 text-xs">Faces drive</p>
              </div>
              <p className="text-xl font-bold text-white">
                {status.faces_drive?.toLocaleString("pt-BR") ?? "—"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
