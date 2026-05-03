import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { UserPlus } from "lucide-react";

export const dynamic = "force-dynamic";

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function QualificadosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = "", page = "1" } = await searchParams;
  const pageNum = Math.max(1, parseInt(page));
  const perPage = 24;
  const from = (pageNum - 1) * perPage;

  const supabase = getAdminClient();

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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-start">
        {qualificados?.map((p) => (
          <Link
            key={p.id}
            href={`/qualificados/${p.id}`}
            style={{ display: 'block', borderRadius: '12px', border: '1px solid #374151', overflow: 'visible', textDecoration: 'none' }}
          >
            {/* Foto */}
            <div style={{ width: '100%', aspectRatio: '3/4', background: '#1f2937', borderRadius: '12px 12px 0 0', overflow: 'hidden' }}>
              {p.foto_url ? (
                <img
                  src={p.foto_url}
                  alt={p.nome}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: '2rem', fontWeight: 'bold' }}>
                  {p.nome.charAt(0)}
                </div>
              )}
            </div>

            {/* Rodapé branco */}
            <div style={{ background: 'white', borderRadius: '0 0 12px 12px', padding: '4px 6px', color: 'black', fontSize: '9px', lineHeight: '1.3', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
              <div style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{p.nome}</div>
              {p.nascimento && <div>DN: {p.nascimento.split("-").reverse().join("/")}</div>}
              {p.genitora   && <div style={{ textTransform: 'uppercase' }}>MÃE: {p.genitora}</div>}
              {p.vulgo      && <div style={{ textTransform: 'uppercase' }}>ALC: {p.vulgo}</div>}
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
