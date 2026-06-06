"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Copy, Check, Eye, Trash2, Radio, Newspaper, CreditCard } from "lucide-react";

type Investigation = {
  id: string;
  nome: string;
  slug: string;
  tipo: string;
  og_imagem_url: string | null;
  created_at: string;
  status: string;
  captures_count: number;
};

const BASE_URL = typeof window !== "undefined" ? window.location.origin : "";

function CopyButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${BASE_URL}/i/${slug}`;

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
      title={url}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copiado!" : "Copiar link"}
    </button>
  );
}

export default function IntelLinkClient({ investigations }: { investigations: Investigation[] }) {
  const [filtro, setFiltro] = useState<"todas" | "ativa" | "encerrada">("todas");
  const [lista, setLista] = useState(investigations);
  const [deletando, setDeletando] = useState<string | null>(null);

  const listaFiltrada = lista.filter((inv) =>
    filtro === "todas" ? true : inv.status === filtro
  );

  async function handleDelete(id: string, nome: string) {
    if (!confirm(`Excluir "${nome}"? Todas as capturas e fotos serão apagadas.`)) return;
    setDeletando(id);
    try {
      const res = await fetch(`/api/ops/intel-link/${id}`, { method: "DELETE" });
      if (res.ok) setLista((prev) => prev.filter((inv) => inv.id !== id));
    } finally {
      setDeletando(null);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Intel Link</h1>
          <p className="text-sm text-gray-400 mt-0.5">Links de captura de localização e câmera</p>
        </div>
        <Link
          href="/ops/intel-link/nova"
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova Investigação
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-5">
        {(["todas", "ativa", "encerrada"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
              filtro === f
                ? "bg-blue-700 text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            {f === "todas" ? "Todas" : f === "ativa" ? "Ativas" : "Encerradas"}
          </button>
        ))}
      </div>

      {/* Lista */}
      {listaFiltrada.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          {lista.length === 0
            ? "Nenhuma investigação criada ainda."
            : "Nenhuma investigação nesse filtro."}
        </div>
      ) : (
        <div className="space-y-3">
          {listaFiltrada.map((inv) => (
            <div
              key={inv.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4"
            >
              {/* Ícone do tipo */}
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
                {inv.tipo === "pix" ? (
                  <CreditCard className="w-5 h-5 text-green-400" />
                ) : (
                  <Newspaper className="w-5 h-5 text-blue-400" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-white truncate">{inv.nome}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      inv.tipo === "pix"
                        ? "bg-green-900/50 text-green-400"
                        : "bg-blue-900/50 text-blue-400"
                    }`}
                  >
                    {inv.tipo === "pix" ? "PIX" : "Reportagem"}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      inv.status === "ativa"
                        ? "bg-emerald-900/50 text-emerald-400"
                        : "bg-gray-700 text-gray-400"
                    }`}
                  >
                    {inv.status === "ativa" ? "● Ativa" : "Encerrada"}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  <span className="flex items-center gap-1 text-sm text-gray-400">
                    <Radio className="w-3.5 h-3.5" />
                    {inv.captures_count} {inv.captures_count === 1 ? "captura" : "capturas"}
                  </span>
                  <span className="text-xs text-gray-600">
                    {new Date(inv.created_at).toLocaleDateString("pt-BR")}
                  </span>
                  <CopyButton slug={inv.slug} />
                </div>
              </div>

              {/* Ações */}
              <div className="flex-shrink-0 flex items-center gap-2">
                <Link
                  href={`/ops/intel-link/${inv.id}`}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-sm rounded-lg transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  <span className="hidden sm:inline">Ver</span>
                </Link>
                <button
                  onClick={() => handleDelete(inv.id, inv.nome)}
                  disabled={deletando === inv.id}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-900/30 hover:bg-red-900/60 text-red-400 hover:text-red-300 disabled:opacity-40 text-sm rounded-lg transition-colors"
                  title="Excluir investigação"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
