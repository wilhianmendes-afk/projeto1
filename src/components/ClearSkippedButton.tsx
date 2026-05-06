"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { clearSkippedAction } from "@/app/(dashboard)/indexacao/actions";

export default function ClearSkippedButton({ total }: { total: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handle() {
    if (!confirm(`Limpar ${total} registro(s) "sem rosto" para reprocessar no próximo backfill?`)) return;
    setLoading(true);
    setError("");
    try {
      await clearSkippedAction();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handle}
        disabled={loading || total === 0}
        className="flex items-center gap-2 text-sm text-yellow-400 hover:text-white border border-yellow-800 hover:border-yellow-600 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors"
      >
        <Trash2 className="w-4 h-4" />
        {loading ? "Limpando..." : `Limpar ${total} sem rosto e reprocessar`}
      </button>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
