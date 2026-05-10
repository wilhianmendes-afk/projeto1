"use client";

import { useState, useMemo, useEffect, useRef } from "react";
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

interface BrunoMatch {
  id: string;
  nome: string;
  vulgo?: string | null;
  cpf?: string | null;
  genitora?: string | null;
  dn?: string | null;
  cidade?: string | null;
  composite_url?: string | null;
  foto_original_url?: string | null;
  faccao?: string | null;
  observacoes?: string | null;
}

interface QualificadosSearchProps {
  initialData: Qualificado[];
  totalCount: number;
}

function CardLocal({ p }: { p: Qualificado }) {
  return (
    <Link
      href={`/qualificados/${p.id}`}
      style={{
        display: "block",
        borderRadius: "12px",
        border: "1px solid #374151",
        overflow: "visible",
        textDecoration: "none",
      }}
    >
      <div style={{ width: "100%", aspectRatio: "3/4", background: "#1f2937", borderRadius: "12px 12px 0 0", overflow: "hidden" }}>
        {p.foto_url ? (
          <img src={p.foto_url} alt={p.nome} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", fontSize: "2rem", fontWeight: "bold" }}>
            {p.nome.charAt(0)}
          </div>
        )}
      </div>
      <div style={{ background: "white", borderRadius: "0 0 12px 12px", padding: "4px 6px", color: "black", fontSize: "9px", lineHeight: "1.3", overflowWrap: "break-word", wordBreak: "break-word" }}>
        <div style={{ fontWeight: "bold", textTransform: "uppercase" }}>{p.nome}</div>
        {p.nascimento && <div>DN: {p.nascimento.split("-").reverse().join("/")}</div>}
        {p.genitora && <div style={{ textTransform: "uppercase" }}>MÃE: {p.genitora}</div>}
        {p.vulgo && <div style={{ textTransform: "uppercase" }}>ALC: {p.vulgo}</div>}
      </div>
    </Link>
  );
}

function CardBruno({ m }: { m: BrunoMatch }) {
  const fotoUrl = m.composite_url || m.foto_original_url;
  return (
    <div
      style={{
        display: "block",
        borderRadius: "12px",
        border: "2px solid #b45309",
        overflow: "visible",
        position: "relative",
      }}
    >
      {/* Badge */}
      <div style={{ position: "absolute", top: "-10px", left: "6px", background: "#b45309", color: "white", fontSize: "8px", fontWeight: "bold", padding: "2px 6px", borderRadius: "4px", zIndex: 10, letterSpacing: "0.05em" }}>
        BANCO BRUNO
      </div>

      <div style={{ width: "100%", aspectRatio: "3/4", background: "#1f2937", borderRadius: "10px 10px 0 0", overflow: "hidden" }}>
        {fotoUrl ? (
          <img src={fotoUrl} alt={m.nome} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", fontSize: "2rem", fontWeight: "bold" }}>
            {m.nome.charAt(0)}
          </div>
        )}
      </div>
      <div style={{ background: "#fef3c7", borderRadius: "0 0 10px 10px", padding: "4px 6px", color: "#1c1917", fontSize: "9px", lineHeight: "1.3", overflowWrap: "break-word", wordBreak: "break-word" }}>
        <div style={{ fontWeight: "bold", textTransform: "uppercase" }}>{m.nome}</div>
        {m.dn && <div>DN: {m.dn}</div>}
        {m.genitora && <div style={{ textTransform: "uppercase" }}>MÃE: {m.genitora}</div>}
        {m.vulgo && <div style={{ textTransform: "uppercase" }}>ALC: {m.vulgo}</div>}
        {m.cpf && <div>CPF: {m.cpf}</div>}
        {m.cidade && <div>{m.cidade}</div>}
      </div>
    </div>
  );
}

export default function QualificadosSearch({ initialData, totalCount }: QualificadosSearchProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [brunoResults, setBrunoResults] = useState<BrunoMatch[]>([]);
  const [brunoLoading, setBrunoLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredLocal = useMemo(() => {
    if (!searchTerm.trim()) return initialData;

    const term = searchTerm.toLowerCase().trim();
    let dateSearchVariations: string[] = [];

    if (/^\d+$/.test(term)) {
      if (term.length === 8) {
        const dd = term.substring(0, 2);
        const mm = term.substring(2, 4);
        const yyyy = term.substring(4, 8);
        dateSearchVariations = [`${yyyy}-${mm}-${dd}`, `${dd}/${mm}/${yyyy}`];
      }
    } else if (term.includes("/")) {
      const parts = term.split("/");
      if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
        const [dd, mm, yyyy] = parts;
        dateSearchVariations = [`${yyyy}-${mm}-${dd}`, `${dd}/${mm}/${yyyy}`];
      }
    }

    return initialData.filter((q) =>
      q.nome.toLowerCase().includes(term) ||
      q.vulgo?.toLowerCase().includes(term) ||
      q.cpf?.includes(term) ||
      q.genitora?.toLowerCase().includes(term) ||
      q.nascimento?.includes(term) ||
      dateSearchVariations.some((d) => q.nascimento?.includes(d))
    );
  }, [searchTerm, initialData]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = searchTerm.trim();

    if (term.length < 2) {
      setBrunoResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setBrunoLoading(true);
      try {
        const res = await fetch(`/api/banco-bruno/search?q=${encodeURIComponent(term)}`);
        const data = await res.json() as { matches: BrunoMatch[] };

        // Deduplica: remove do Bruno quem já está no banco local (por CPF)
        const localCpfs = new Set(initialData.map((q) => q.cpf).filter(Boolean));
        const novosDoBruno = (data.matches ?? []).filter(
          (m) => !m.cpf || !localCpfs.has(m.cpf)
        );
        setBrunoResults(novosDoBruno);
      } catch {
        setBrunoResults([]);
      } finally {
        setBrunoLoading(false);
      }
    }, 400);
  }, [searchTerm, initialData]);

  const isSearching = searchTerm.trim().length >= 2;

  return (
    <div>
      <input
        type="search"
        placeholder="Buscar por nome, alcunha, CPF, mãe ou data (DD/MM/AAAA ou DDMMAAAA)..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600 mb-5"
      />

      {/* Resultados do banco local */}
      {isSearching ? (
        <p className="text-gray-400 text-sm mb-4">
          {filteredLocal.length} no banco local
          {brunoLoading ? " · buscando no Banco Bruno..." : brunoResults.length > 0 ? ` · ${brunoResults.length} no Banco Bruno` : ""}
        </p>
      ) : (
        <p className="text-gray-400 text-sm mb-4">{totalCount} registros</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-start">
        {filteredLocal.map((p) => <CardLocal key={p.id} p={p} />)}

        {/* Resultados do Bruno — aparecem no final com badge laranja */}
        {isSearching && brunoResults.map((m) => <CardBruno key={`bruno-${m.id}`} m={m} />)}

        {isSearching && !brunoLoading && filteredLocal.length === 0 && brunoResults.length === 0 && (
          <p className="col-span-full text-center text-gray-500 py-12">
            Nenhum registro encontrado.
          </p>
        )}

        {!isSearching && filteredLocal.length === 0 && (
          <p className="col-span-full text-center text-gray-500 py-12">
            Nenhum registro encontrado.
          </p>
        )}
      </div>
    </div>
  );
}
