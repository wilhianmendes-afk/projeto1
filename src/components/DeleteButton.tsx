"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export default function DeleteButton({ id, nome }: { id: string; nome: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    const res = await fetch(`/api/qualificados/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.back();
      router.refresh();
    } else {
      alert("Erro ao excluir. Tente novamente.");
      setLoading(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-300">Excluir <strong>{nome}</strong>?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          {loading ? "Excluindo..." : "Confirmar"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="flex items-center gap-2 bg-red-900/40 hover:bg-red-800/60 border border-red-800 text-red-400 hover:text-red-300 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
    >
      <Trash2 className="w-4 h-4" />
      Excluir
    </button>
  );
}
