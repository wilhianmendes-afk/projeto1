"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Newspaper, CreditCard } from "lucide-react";

export default function NovaInvestigacaoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  const [form, setForm] = useState({
    nome: "",
    tipo: "reportagem",
    og_titulo: "",
    og_descricao: "",
    og_imagem_url: "",
  });

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) { setErro("Nome da investigação é obrigatório."); return; }
    setErro("");
    setLoading(true);

    try {
      const res = await fetch("/api/ops/hispy/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data.error || "Erro ao criar."); return; }
      router.push(`/ops/hispy/${data.id}`);
    } catch {
      setErro("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/ops/hispy" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Nova Investigação</h1>
          <p className="text-sm text-gray-400 mt-0.5">Crie um link de captura personalizado</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Nome */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Nome da Investigação <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.nome}
            onChange={(e) => set("nome", e.target.value)}
            placeholder="Ex: Op. Foragido Silva"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
          />
          <p className="text-xs text-gray-500 mt-1.5">Visível apenas no painel — não aparece para o alvo.</p>
        </div>

        {/* Tipo de isca */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <label className="block text-sm font-medium text-gray-300 mb-3">Tipo de Isca</label>
          <div className="grid grid-cols-2 gap-3">
            {([
              { value: "reportagem", label: "Reportagem", desc: "Parece uma notícia de portal", Icon: Newspaper, color: "blue" },
              { value: "pix", label: "Cobrança PIX", desc: "Parece um link de pagamento", Icon: CreditCard, color: "green" },
            ] as const).map(({ value, label, desc, Icon, color }) => (
              <button
                key={value}
                type="button"
                onClick={() => set("tipo", value)}
                className={`flex flex-col items-start gap-2 p-4 rounded-lg border-2 transition-all text-left ${
                  form.tipo === value
                    ? color === "blue"
                      ? "border-blue-500 bg-blue-900/20"
                      : "border-green-500 bg-green-900/20"
                    : "border-gray-700 hover:border-gray-600"
                }`}
              >
                <Icon className={`w-5 h-5 ${color === "blue" ? "text-blue-400" : "text-green-400"}`} />
                <div>
                  <div className="text-sm font-medium text-white">{label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Preview WhatsApp */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-300">Preview do WhatsApp</h3>
            <p className="text-xs text-gray-500 mt-0.5">O que aparece no chat antes do alvo clicar no link.</p>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Título</label>
            <input
              type="text"
              value={form.og_titulo}
              onChange={(e) => set("og_titulo", e.target.value)}
              placeholder={form.tipo === "pix" ? "Ex: Cobrança Pendente - R$ 150,00" : "Ex: Homem é preso após..."}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Descrição</label>
            <textarea
              value={form.og_descricao}
              onChange={(e) => set("og_descricao", e.target.value)}
              rows={3}
              placeholder={form.tipo === "pix" ? "Ex: Pagamento vence hoje. Clique para pagar." : "Ex: Polícia realizou operação na região..."}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">URL da Imagem de Preview</label>
            <input
              type="url"
              value={form.og_imagem_url}
              onChange={(e) => set("og_imagem_url", e.target.value)}
              placeholder="https://..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">URL pública de qualquer imagem (logo de portal, foto, etc).</p>
          </div>
        </div>

        {erro && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300">
            {erro}
          </div>
        )}

        <div className="flex gap-3">
          <Link
            href="/ops/hispy"
            className="px-4 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Criando..." : "Criar Investigação"}
          </button>
        </div>
      </form>
    </div>
  );
}
