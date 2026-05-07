"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import ResultCard from "./ResultCard";

interface BBox { x: number; y: number; w: number; h: number }

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
  query_bbox?: BBox;
  faces_detected?: number;
  elapsed_ms?: number;
}

const confidenceColor: Record<string, string> = {
  alta:    "text-green-400 bg-green-950 border-green-800",
  forte:   "text-blue-400 bg-blue-950 border-blue-800",
  incerto: "text-yellow-400 bg-yellow-950 border-yellow-800",
  baixa:   "text-gray-400 bg-gray-800 border-gray-700",
};

export default function FaceSearch() {
  const [image, setImage]       = useState<string | null>(null);
  const [file, setFile]         = useState<File | null>(null);
  const [threshold, setThreshold] = useState(0.30);
  const [loading, setLoading]   = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError]       = useState("");
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
  const [imgDisplay, setImgDisplay] = useState<{ w: number; h: number } | null>(null);

  const fileRef  = useRef<HTMLInputElement>(null);
  const imgRef   = useRef<HTMLImageElement>(null);

  function handleFile(f: File) {
    if (!f.type.startsWith("image/")) return;
    setFile(f);
    setImage(URL.createObjectURL(f));
    setResponse(null);
    setError("");
    setImgNatural(null);
    setImgDisplay(null);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  // Auto-busca ao carregar imagem
  useEffect(() => {
    if (file) runSearch(file, threshold);
  }, [file]);

  async function runSearch(f: File, t: number) {
    setLoading(true);
    setError("");
    const form = new FormData();
    form.append("file", f);
    form.append("threshold", String(t));
    try {
      const res  = await fetch("/api/face/search", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro desconhecido");
      setResponse(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function onThresholdChange(val: number) {
    setThreshold(val);
    if (file) runSearch(file, val);
  }

  function onImgLoad() {
    if (!imgRef.current) return;
    setImgNatural({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight });
    setImgDisplay({ w: imgRef.current.clientWidth,  h: imgRef.current.clientHeight });
  }

  function clear() {
    setImage(null); setFile(null); setResponse(null);
    setError(""); setImgNatural(null); setImgDisplay(null);
  }

  // Calcula posição do bbox escalado para o tamanho exibido
  function scaledBbox(bbox: BBox) {
    if (!imgNatural || !imgDisplay || !imgNatural.w) return null;
    const sx = imgDisplay.w / imgNatural.w;
    const sy = imgDisplay.h / imgNatural.h;
    return {
      left:   Math.round(bbox.x * sx),
      top:    Math.round(bbox.y * sy),
      width:  Math.round(bbox.w * sx),
      height: Math.round(bbox.h * sy),
    };
  }

  const bbox = response?.query_bbox ? scaledBbox(response.query_bbox) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Coluna esquerda */}
      <div>
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => !image && fileRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl flex items-center justify-center transition-colors ${
            image ? "border-gray-700 cursor-default" : "border-gray-700 hover:border-blue-600 cursor-pointer"
          }`}
          style={{ minHeight: 280 }}
        >
          {image ? (
            <>
              <div className="relative inline-block">
                <img
                  ref={imgRef}
                  src={image}
                  alt="Query"
                  className="max-h-72 max-w-full rounded-xl object-contain"
                  onLoad={onImgLoad}
                />
                {/* Bounding box overlay */}
                {bbox && (
                  <div
                    className="absolute border-2 border-blue-400 pointer-events-none"
                    style={{ left: bbox.left, top: bbox.top, width: bbox.width, height: bbox.height }}
                  >
                    <span className="absolute -top-5 left-0 bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded">
                      ROSTO
                    </span>
                  </div>
                )}
                {/* Indicador de loading sobre a foto */}
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                  </div>
                )}
              </div>
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
                <p className="text-sm">JPG, PNG, WEBP — detecção automática</p>
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
              type="range" min={0.20} max={0.90} step={0.05}
              value={threshold}
              onChange={(e) => onThresholdChange(parseFloat(e.target.value))}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-0.5">
              <span>0.20 (mais resultados)</span>
              <span>0.90 (só certeza)</span>
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-3 text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {response && !loading && (
          <div className="mt-3 text-xs text-gray-500 space-y-0.5">
            {response.faces_detected !== undefined && (
              <p>{response.faces_detected} rosto(s) detectado(s) na imagem</p>
            )}
            {response.query_det_score !== undefined && (
              <p>Det score: {(response.query_det_score * 100).toFixed(0)}%</p>
            )}
            {response.elapsed_ms !== undefined && <p>Tempo: {response.elapsed_ms}ms</p>}
          </div>
        )}
      </div>

      {/* Coluna direita — resultados */}
      <div>
        <h2 className="text-sm font-medium text-gray-400 mb-3">
          {loading
            ? "Detectando rosto e buscando..."
            : response
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
                {r.pessoa?.vulgo && <p className="text-gray-400 text-sm">"{r.pessoa.vulgo}"</p>}
                {r.pessoa?.cpf   && <p className="text-gray-500 text-xs">CPF: {r.pessoa.cpf}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-lg font-bold text-white">{(r.similarity * 100).toFixed(0)}%</p>
                <span className={`text-xs px-2 py-0.5 rounded border font-medium ${confidenceColor[r.confidence] ?? ""}`}>
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
