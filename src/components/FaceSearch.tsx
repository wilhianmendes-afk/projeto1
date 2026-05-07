"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import ResultCard from "./ResultCard";

interface SearchResult {
  source_id: string;
  photo_url: string;
  similarity: number;
  det_score: number;
  bbox: object;
  confidence: string;
  pessoa: { nome: string; vulgo?: string; cpf?: string; cidade?: string; uf?: string } | null;
}

interface SearchResponse {
  results: SearchResult[];
  message?: string;
  query_det_score?: number;
  faces_detected?: number;
  elapsed_ms?: number;
}

export default function FaceSearch() {
  const [image, setImage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [threshold, setThreshold] = useState(0.30);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  function handleFile(f: File) {
    if (!f.type.startsWith("image/")) return;
    setFile(f);
    setImage(URL.createObjectURL(f));
    setResponse(null);
    setError("");
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  async function handleSearch() {
    if (!file) return;
    setLoading(true);
    setError("");

    const form = new FormData();
    form.append("file", file);
    form.append("threshold", String(threshold));

    try {
      const res = await fetch("/api/face/search", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro desconhecido");
      setResponse(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setImage(null);
    setFile(null);
    setResponse(null);
    setError("");
  }

  const confidenceColor: Record<string, string> = {
    alta: "text-green-400 bg-green-950 border-green-800",
    forte: "text-blue-400 bg-blue-950 border-blue-800",
    incerto: "text-yellow-400 bg-yellow-950 border-yellow-800",
    baixa: "text-gray-400 bg-gray-800 border-gray-700",
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <div
          ref={dropRef}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => !image && fileRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl flex items-center justify-center transition-colors ${
            image
              ? "border-gray-700 cursor-default"
              : "border-gray-700 hover:border-blue-600 cursor-pointer"
          }`}
          style={{ minHeight: 280 }}
        >
          {image ? (
            <>
              <img src={image} alt="Query" className="max-h-72 max-w-full rounded-xl object-contain" />
              <button
                onClick={clear}
                className="absolute top-2 right-2 bg-gray-800 hover:bg-gray-700 text-white rounded-full p-1.5"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 text-gray-500 p-8 text-center">
              <Upload className="w-10 h-10" />
              <div>
                <p className="font-medium text-gray-300">Arraste ou clique para enviar</p>
                <p className="text-sm">JPG, PNG, WEBP</p>
              </div>
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Threshold de similaridade: <span className="text-white font-medium">{threshold.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min={0.20}
              max={0.90}
              step={0.05}
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-0.5">
              <span>0.20 (mais resultados)</span>
              <span>0.90 (só certeza)</span>
            </div>
          </div>

          <button
            onClick={handleSearch}
            disabled={!file || loading}
            className="w-full bg-blue-700 hover:bg-blue-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Buscando...
              </>
            ) : (
              "Buscar"
            )}
          </button>
        </div>

        {error && (
          <p className="mt-3 text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {response && (
          <div className="mt-3 text-xs text-gray-500 space-y-0.5">
            {response.query_det_score !== undefined && (
              <p>Det score da query: {(response.query_det_score * 100).toFixed(0)}%</p>
            )}
            {response.elapsed_ms !== undefined && <p>Tempo: {response.elapsed_ms}ms</p>}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-400 mb-3">
          {response
            ? response.results.length > 0
              ? `${response.results.length} resultado(s) encontrado(s)`
              : response.message ?? "Nenhum resultado"
            : "Resultados aparecerão aqui"}
        </h2>

        <div className="space-y-3">
          {response?.results.map((r, i) => (
            <div
              key={i}
              className={`flex items-center gap-4 bg-gray-900 border rounded-xl p-4 ${
                confidenceColor[r.confidence]?.split(" ").slice(2).join(" ") ?? "border-gray-800"
              }`}
            >
              <img
                src={r.photo_url}
                alt=""
                className="w-16 h-16 rounded-lg object-cover border border-gray-700 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white truncate">
                  {r.pessoa?.nome ?? "Desconhecido"}
                </p>
                {r.pessoa?.vulgo && (
                  <p className="text-gray-400 text-sm">"{r.pessoa.vulgo}"</p>
                )}
                {r.pessoa?.cpf && <p className="text-gray-500 text-xs">CPF: {r.pessoa.cpf}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-lg font-bold text-white">
                  {(r.similarity * 100).toFixed(0)}%
                </p>
                <span
                  className={`text-xs px-2 py-0.5 rounded border font-medium ${
                    confidenceColor[r.confidence] ?? ""
                  }`}
                >
                  {r.confidence}
                </span>
              </div>
            </div>
          ))}

          {response && response.results.length === 0 && !loading && (
            <div className="text-center py-12 text-gray-600">
              <p>{response.message ?? "Nenhum match acima do threshold."}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
