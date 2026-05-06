"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

export default function ClearSkippedButton({ total }: { total: number }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handle() {
    if (!confirm(`Limpar ${total} registro(s) "sem rosto" para reprocessar no próximo backfill?`)) return;
    setLoading(true);
    try {
      const res = await fetch("/api/face/backfill", { method: "DELETE" });
      const data = await res.json();
      if (data.ok) { setDone(true); window.location.reload(); }
    } finally {
      setLoading(false);
    }
  }

  if (done) return null;

  return (
    <button
      onClick={handle}
      disabled={loading || total === 0}
      className="flex items-center gap-2 text-sm text-yellow-400 hover:text-white border border-yellow-800 hover:border-yellow-600 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors"
    >
      <Trash2 className="w-4 h-4" />
      {loading ? "Limpando..." : `Limpar ${total} sem rosto e reprocessar`}
    </button>
  );
}
