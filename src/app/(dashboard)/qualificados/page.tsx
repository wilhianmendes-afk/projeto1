import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { UserPlus } from "lucide-react";

export default async function QualificadosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = "", page = "1" } = await searchParams;
  const pageNum = Math.max(1, parseInt(page));
  const perPage = 24;
  const from = (pageNum - 1) * perPage;

  const supabase = await createClient();

  let query = supabase
    .from("qualificados")
    .select("id, nome, vulgo, cpf, rg, nascimento, genitora, foto_url, fonte, created_at", { count: "exact" })
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

      <form className="mb-5">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome..."
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
      </form>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {qualificados?.map((p) => (
          <Link
            key={p.id}
            href={`/qualificados/${p.id}`}
            className="group block bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-blue-600 transition-colors"
          >
            {/* Foto */}
            <div className="relative w-full aspect-[3/4] bg-gray-800">
              {p.foto_url ? (
                <img
                  src={p.foto_url}
                  alt={p.nome}
                  className="w-full h-full object-cover object-top"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-5xl font-bold">
                  {p.nome.charAt(0)}
                </div>
              )}

              {/* Overlay inferior na foto */}
              <div className="absolute bottom-0 left-0 right-0 bg-black/75 px-2 py-1.5 text-white leading-tight">
                <p className="text-xs font-bold truncate uppercase">{p.nome}</p>
                {p.vulgo && (
                  <p className="text-[10px] text-gray-300 truncate">
                    ALCUNHA: {p.vulgo.toUpperCase()}
                  </p>
                )}
                {p.nascimento && (
                  <p className="text-[10px] text-gray-300">
                    DN: {p.nascimento}
                  </p>
                )}
                {p.genitora && (
                  <p className="text-[10px] text-gray-300 truncate">
                    MÃE: {p.genitora.toUpperCase()}
                  </p>
                )}
              </div>
            </div>

            {/* Rodapé do card */}
            <div className="px-2 py-2">
              <p className="text-xs font-semibold text-white truncate uppercase">{p.nome}</p>
              <p className="text-[10px] text-gray-500 mt-0.5 uppercase">{p.fonte}</p>
            </div>
          </Link>
        ))}

        {!qualificados?.length && (
          <p className="col-span-full text-center text-gray-500 py-12">
            Nenhum registro encontrado.
          </p>
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
