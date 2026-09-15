"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";

interface Qualificado {
  id: string;
  nome: string;
  vulgo?: string;
  cpf?: string;
  nascimento?: string;
  genitora?: string;
  foto_url?: string;
  observacoes?: string;
  fonte?: string;
}

interface OwnDriveFile {
  id: string;
  name: string;
  thumbnailLink: string | null;
}

interface QualificadosSearchProps {
  initialData: Qualificado[];
  totalCount: number;
  isViewer?: boolean;
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
        position: "relative",
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

function CardOwnDrive({ f, onClick }: { f: OwnDriveFile; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "block",
        borderRadius: "12px",
        border: "2px solid #15803d",
        overflow: "visible",
        position: "relative",
        cursor: "pointer",
      }}
    >
      <div style={{ position: "absolute", top: "-10px", left: "6px", background: "#15803d", color: "white", fontSize: "8px", fontWeight: "bold", padding: "2px 6px", borderRadius: "4px", zIndex: 10, letterSpacing: "0.05em" }}>
        MEU DRIVE
      </div>
      <div style={{ width: "100%", aspectRatio: "3/4", background: "#1f2937", borderRadius: "10px 10px 0 0", overflow: "hidden" }}>
        {f.thumbnailLink ? (
          <img src={f.thumbnailLink} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", fontSize: "2rem" }}>
            📄
          </div>
        )}
      </div>
      <div style={{ background: "#dcfce7", borderRadius: "0 0 10px 10px", padding: "4px 6px", color: "#14532d", fontSize: "9px", lineHeight: "1.3" }}>
        <div style={{ fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
        <div style={{ opacity: 0.7 }}>Clique para ampliar</div>
      </div>
    </div>
  );
}

interface DriveFileStatus {
  indexed: boolean;
  facesCount: number;
  skipped: boolean;
  reason: string | null;
}

function EmbeddingStatusBadge({ status, loading }: { status: DriveFileStatus | null; loading: boolean }) {
  if (loading) {
    return <span className="text-xs text-gray-500">Verificando embedding facial...</span>;
  }
  if (!status) {
    return <span className="text-xs text-gray-500">Não foi possível verificar</span>;
  }
  if (status.indexed) {
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-green-950 border border-green-800 text-green-400">
        ✓ Embedding facial gerado ({status.facesCount} rosto{status.facesCount !== 1 ? "s" : ""})
      </span>
    );
  }
  if (status.skipped) {
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-yellow-950 border border-yellow-800 text-yellow-500">
        ⚠ Sem rosto detectável{status.reason ? ` (${status.reason})` : ""}
      </span>
    );
  }
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400">
      ○ Ainda não indexado — aguardando rodada do drive-index-faces
    </span>
  );
}

function LightboxOwnDrive({ f, onClose, onDeleted, isViewer = false }: { f: OwnDriveFile; onClose: () => void; onDeleted: (id: string) => void; isViewer?: boolean }) {
  const [deleting, setDeleting] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [status, setStatus] = React.useState<DriveFileStatus | null>(null);
  const [statusLoading, setStatusLoading] = React.useState(true);

  React.useEffect(() => {
    setStatus(null);
    setStatusLoading(true);
    fetch(`/api/drive/file/${f.id}`)
      .then((r) => r.json())
      .then((data: DriveFileStatus) => setStatus(data))
      .catch(() => setStatus(null))
      .finally(() => setStatusLoading(false));
  }, [f.id]);

  async function handleDelete() {
    if (!confirm) { setConfirm(true); return; }
    setDeleting(true);
    try {
      const res = await fetch(`/api/drive/file/${f.id}`, { method: "DELETE" });
      if (res.ok) { onDeleted(f.id); onClose(); }
      else { alert("Erro ao excluir. Tente novamente."); setDeleting(false); setConfirm(false); }
    } catch { setDeleting(false); setConfirm(false); }
  }

  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-2xl w-full flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-gray-900 rounded-t-xl px-4 py-3 flex-wrap gap-2">
          <div>
            <span className="text-xs font-bold bg-green-700 text-white px-2 py-0.5 rounded mr-2">MEU DRIVE</span>
            <span className="text-white text-sm font-medium">{f.name}</span>
            <div className="mt-1">
              <EmbeddingStatusBadge status={status} loading={statusLoading} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isViewer && (
              <>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className={`text-xs font-semibold px-3 py-1.5 rounded transition-colors ${
                    confirm
                      ? "bg-red-600 hover:bg-red-500 text-white"
                      : "bg-gray-700 hover:bg-red-700 text-gray-200"
                  }`}
                >
                  {deleting ? "Excluindo..." : confirm ? "Confirmar exclusão" : "Excluir"}
                </button>
                {confirm && !deleting && (
                  <button onClick={() => setConfirm(false)} className="text-gray-400 hover:text-white text-xs px-2 py-1.5">
                    Cancelar
                  </button>
                )}
              </>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none ml-1">✕</button>
          </div>
        </div>
        <div className="bg-black rounded-b-xl overflow-hidden">
          {f.thumbnailLink ? (
            <img
              src={f.thumbnailLink.replace(/=s\d+$/, "=s1200")}
              alt={f.name}
              style={{ display: "block", width: "100%", maxHeight: "calc(90vh - 60px)", objectFit: "contain" }}
            />
          ) : (
            <p className="text-gray-500 p-8 text-center">Sem preview disponível</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function QualificadosSearch({ initialData, totalCount, isViewer = false }: QualificadosSearchProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [localResults, setLocalResults] = useState<Qualificado[] | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [ownDrive, setOwnDrive] = useState<OwnDriveFile[]>([]);
  const [ownDriveLoading, setOwnDriveLoading] = useState(false);
  const [ownDriveLightbox, setOwnDriveLightbox] = useState<OwnDriveFile | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sem pesquisa: mostra initialData; com pesquisa: mostra resultado da API (sem limite de 1000)
  const filteredLocal = searchTerm.trim().length >= 2
    ? (localResults ?? [])
    : initialData;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = searchTerm.trim();

    if (term.length < 2) {
      setLocalResults(null);
      setOwnDrive([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLocalLoading(true);
      setOwnDriveLoading(true);

      // Busca local server-side (sem limite de 1000 do Supabase)
      fetch(`/api/qualificados/search?q=${encodeURIComponent(term)}`)
        .then(r => r.json())
        .then((data: Qualificado[]) => setLocalResults(data ?? []))
        .catch(() => setLocalResults([]))
        .finally(() => setLocalLoading(false));

      // Busca no próprio Drive em paralelo
      fetch(`/api/drive/own-search?q=${encodeURIComponent(term)}`)
        .then(r => r.json())
        .then((data: { files: OwnDriveFile[] }) => setOwnDrive(data.files ?? []))
        .catch(() => setOwnDrive([]))
        .finally(() => setOwnDriveLoading(false));
    }, 400);
  }, [searchTerm]);

  const isSearching = searchTerm.trim().length >= 2;

  return (
    <div>
      {ownDriveLightbox && (
        <LightboxOwnDrive
          f={ownDriveLightbox}
          onClose={() => setOwnDriveLightbox(null)}
          onDeleted={(id) => setOwnDrive((prev) => prev.filter((f) => f.id !== id))}
          isViewer={isViewer}
        />
      )}
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
          {localLoading
            ? "buscando..."
            : `${filteredLocal.length} no banco local`}
          {ownDriveLoading
            ? " · buscando no Drive..."
            : ownDrive.length > 0
              ? ` · ${ownDrive.length} no Drive`
              : ""}
        </p>
      ) : (
        <p className="text-gray-400 text-sm mb-4">{totalCount} registros</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-start">
        {filteredLocal.map((p) => <CardLocal key={p.id} p={p} />)}

        {/* Resultados do próprio Drive */}
        {isSearching && ownDrive.map((f) => (
          <CardOwnDrive key={`own-${f.id}`} f={f} onClick={() => setOwnDriveLightbox(f)} />
        ))}

        {isSearching && !ownDriveLoading && filteredLocal.length === 0 && ownDrive.length === 0 && (
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
