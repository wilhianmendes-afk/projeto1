"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

interface Qualificado {
  id: string;
  nome: string;
  vulgo?: string;
  cpf?: string;
  nascimento?: string;
  genitora?: string;
  foto_url?: string;
}

interface QualificadosSearchProps {
  initialData: Qualificado[];
  totalCount: number;
}

export default function QualificadosSearch({
  initialData,
  totalCount,
}: QualificadosSearchProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredQualificados = useMemo(() => {
    if (!searchTerm.trim()) return initialData;

    const term = searchTerm.toLowerCase().trim();

    // Tentar converter termo de busca como data
    let dateSearchVariations: string[] = [];

    // Se é apenas números, tentar interpretar como DDMMAAAA
    if (/^\d+$/.test(term)) {
      if (term.length === 8) {
        const dd = term.substring(0, 2);
        const mm = term.substring(2, 4);
        const yyyy = term.substring(4, 8);
        const dateStr = `${yyyy}-${mm}-${dd}`;
        dateSearchVariations = [dateStr, `${dd}/${mm}/${yyyy}`];
      }
    }
    // Se tem barra, tentar DD/MM/AAAA
    else if (term.includes("/")) {
      const parts = term.split("/");
      if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
        const dd = parts[0];
        const mm = parts[1];
        const yyyy = parts[2];
        const dateStr = `${yyyy}-${mm}-${dd}`;
        dateSearchVariations = [dateStr, `${dd}/${mm}/${yyyy}`];
      }
    }

    return initialData.filter((q) =>
      q.nome.toLowerCase().includes(term) ||
      q.vulgo?.toLowerCase().includes(term) ||
      q.cpf?.includes(term) ||
      q.genitora?.toLowerCase().includes(term) ||
      q.nascimento?.includes(term) ||
      dateSearchVariations.some(dateVar => q.nascimento?.includes(dateVar))
    );
  }, [searchTerm, initialData]);

  return (
    <div>
      <input
        type="search"
        placeholder="Buscar por nome, alcunha, CPF, mãe ou data (DD/MM/AAAA ou DDMMAAAA)..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600 mb-5"
      />

      <p className="text-gray-400 text-sm mb-4">
        {filteredQualificados.length} de {totalCount} registros
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-start">
        {filteredQualificados.map((p) => (
          <Link
            key={p.id}
            href={`/qualificados/${p.id}`}
            style={{
              display: "block",
              borderRadius: "12px",
              border: "1px solid #374151",
              overflow: "visible",
              textDecoration: "none",
            }}
          >
            {/* Foto */}
            <div
              style={{
                width: "100%",
                aspectRatio: "3/4",
                background: "#1f2937",
                borderRadius: "12px 12px 0 0",
                overflow: "hidden",
              }}
            >
              {p.foto_url ? (
                <img
                  src={p.foto_url}
                  alt={p.nome}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "top",
                    display: "block",
                  }}
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
                    fontSize: "2rem",
                    fontWeight: "bold",
                  }}
                >
                  {p.nome.charAt(0)}
                </div>
              )}
            </div>

            {/* Rodapé branco */}
            <div
              style={{
                background: "white",
                borderRadius: "0 0 12px 12px",
                padding: "4px 6px",
                color: "black",
                fontSize: "9px",
                lineHeight: "1.3",
                overflowWrap: "break-word",
                wordBreak: "break-word",
              }}
            >
              <div style={{ fontWeight: "bold", textTransform: "uppercase" }}>
                {p.nome}
              </div>
              {p.nascimento && (
                <div>DN: {p.nascimento.split("-").reverse().join("/")}</div>
              )}
              {p.genitora && (
                <div style={{ textTransform: "uppercase" }}>
                  MÃE: {p.genitora}
                </div>
              )}
              {p.vulgo && (
                <div style={{ textTransform: "uppercase" }}>ALC: {p.vulgo}</div>
              )}
            </div>
          </Link>
        ))}

        {!filteredQualificados.length && (
          <p className="col-span-full text-center text-gray-500 py-12">
            Nenhum registro encontrado.
          </p>
        )}
      </div>
    </div>
  );
}
