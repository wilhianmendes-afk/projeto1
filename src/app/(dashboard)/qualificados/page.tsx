import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { UserPlus, ChevronRight } from "lucide-react";

export default async function QualificadosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = "", page = "1" } = await searchParams;
  const pageNum = Math.max(1, parseInt(page));
  const perPage = 30;
  const from = (pageNum - 1) * perPage;

  const supabase = await createClient();

  let query = supabase
    .from("qualificados")
    .select("id, nome, vulgo, cpf, rg, foto_url, cidade, uf, fonte, created_at", { count: "exact" })
    .is("deleted_at", null)
    .order("nome")
    .range(from, from + perPage - 1);

  if (q.trim()) {
    query = query.ilike("nome", `%${q}%`);
  }

  const { data: qualificados, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / perPage);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Qualificados</h1>
          <p className="text-gray-400 text-sm">{count ?? 0} registros</p>
        </div>
        <Link
          href="/qualificados/novo"
          className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Novo
        </Link>
      </div>

      <form className="mb-4">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome..."
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
      </form>

      <div className="space-y-2">
        {qualificados?.map((p) => (
          <Link
            key={p.id}
            href={`/qualificados/${p.id}`}
            className="flex items-center gap-4 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-xl p-4 transition-colors"
          >
            {p.foto_url ? (
              <img
                src={p.foto_url}
                alt={p.nome}
                className="w-12 h-12 rounded-full object-cover border border-gray-700 flex-shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gray-700 flex-shrink-0 flex items-center justify-center text-gray-400 text-lg font-bold">
                {p.nome.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-white truncate">{p.nome}</p>
              <p className="text-gray-400 text-sm truncate">
                {[p.vulgo && `"${p.vulgo}"`, p.cpf && `CPF: ${p.cpf}`, p.cidade && `${p.cidade}/${p.uf}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <span className="text-xs text-gray-500 capitalize bg-gray-800 px-2 py-1 rounded">
              {p.fonte}
            </span>
            <ChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
          </Link>
        ))}

        {!qualificados?.length && (
          <p className="text-center text-gray-500 py-12">Nenhum registro encontrado.</p>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/qualificados?q=${q}&page=${p}`}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                p === pageNum
                  ? "bg-blue-700 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
