import { notFound } from "next/navigation";
import BackButton from "@/components/BackButton";

export const dynamic = "force-dynamic";

const BRUNO_URL = process.env.BANCO_BRUNO_URL!;
const BRUNO_TOKEN = process.env.BANCO_BRUNO_TOKEN!;

interface BrunoQualificado {
  id: string;
  nome: string;
  vulgo?: string | null;
  cpf?: string | null;
  genitora?: string | null;
  dn?: string | null;
  cidade?: string | null;
  bairro?: string | null;
  faccao?: string | null;
  artigos?: string | null;
  observacoes?: string | null;
  foto_original_url?: string | null;
  composite_url?: string | null;
  fotos_extras?: string[];
  fonte_externa?: string | null;
  created_at?: string;
}

async function getBrunoQualificado(id: string): Promise<BrunoQualificado | null> {
  try {
    const res = await fetch(BRUNO_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BRUNO_TOKEN}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "get_qualificado", arguments: { id } },
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.result?.content?.[0]?.text;
    if (!text) return null;
    return JSON.parse(text) as BrunoQualificado;
  } catch {
    return null;
  }
}

export default async function BrunoQualificadoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pessoa = await getBrunoQualificado(id);

  if (!pessoa) notFound();

  const fotoUrl = pessoa.composite_url || pessoa.foto_original_url;

  const fields = [
    { label: "Nome", value: pessoa.nome },
    { label: "Vulgo (Alcunha)", value: pessoa.vulgo },
    { label: "CPF", value: pessoa.cpf },
    { label: "Data de Nascimento", value: pessoa.dn },
    { label: "Nome da Mãe", value: pessoa.genitora },
    { label: "Cidade", value: pessoa.cidade },
    { label: "Bairro", value: pessoa.bairro },
    { label: "Facção", value: pessoa.faccao && pessoa.faccao !== "SEM FACCAO" ? pessoa.faccao : null },
    { label: "Artigos", value: pessoa.artigos && pessoa.artigos !== "N/I" ? pessoa.artigos : null },
    { label: "Fonte", value: pessoa.fonte_externa },
    { label: "Cadastrado em", value: pessoa.created_at ? new Date(pessoa.created_at).toLocaleDateString("pt-BR") : null },
  ];

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <BackButton />
        <span className="text-xs font-bold bg-amber-700 text-white px-3 py-1 rounded-full">
          BANCO BRUNO
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-start gap-6 mb-8">
        <div style={{ width: "100%", maxWidth: 300, flexShrink: 0 }}>
          <div
            style={{
              width: "100%",
              aspectRatio: "3/4",
              background: "#1f2937",
              borderRadius: 12,
              overflow: "hidden",
              border: "2px solid #b45309",
            }}
          >
            {fotoUrl ? (
              <img
                src={fotoUrl}
                alt={pessoa.nome}
                style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#6b7280",
                  fontSize: "5rem",
                  fontWeight: "bold",
                }}
              >
                {pessoa.nome.charAt(0)}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{pessoa.nome}</h1>
          {pessoa.vulgo && <p className="text-amber-400">"{pessoa.vulgo}"</p>}
          {pessoa.observacoes && (
            <p className="text-gray-300 text-sm mt-2 bg-gray-900 border border-gray-800 rounded-lg p-3 whitespace-pre-line">
              {pessoa.observacoes}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-8">
        {fields
          .filter((f) => f.value)
          .map((f) => (
            <div key={f.label} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
              <p className="text-gray-500 text-xs mb-0.5">{f.label}</p>
              <p className="text-white text-sm font-medium">{f.value}</p>
            </div>
          ))}
      </div>

      {pessoa.fotos_extras && pessoa.fotos_extras.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-semibold text-white mb-4">Fotos Adicionais</h2>
          <div className="grid grid-cols-4 gap-3">
            {pessoa.fotos_extras.map((foto, idx) => (
              <div key={idx} className="rounded-lg border border-gray-700 overflow-hidden bg-black">
                <img
                  src={foto}
                  alt={`Foto adicional ${idx + 1}`}
                  className="w-full aspect-square object-contain"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
