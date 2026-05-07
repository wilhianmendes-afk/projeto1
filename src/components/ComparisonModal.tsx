"use client";

import { X } from "lucide-react";

interface SearchResult {
  source_id: string;
  photo_url: string;
  similarity: number;
  det_score: number;
  bbox: object;
  confidence: string;
  pessoa: { nome: string; vulgo?: string; cpf?: string; cidade?: string; uf?: string } | null;
}

interface ComparisonModalProps {
  isOpen: boolean;
  result: SearchResult | null;
  queryImage: string | null;
  onClose: () => void;
}

export default function ComparisonModal({
  isOpen,
  result,
  queryImage,
  onClose,
}: ComparisonModalProps) {
  if (!isOpen || !result || !queryImage) return null;

  const similarity = Math.round(result.similarity * 100);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl max-w-2xl w-full border border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">
              {result.pessoa?.nome ?? "Desconhecido"}
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              Similaridade: <span className="text-blue-400 font-bold">{similarity}%</span>
              {result.pessoa?.vulgo && ` • "${result.pessoa.vulgo}"`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Imagens lado a lado */}
        <div className="grid grid-cols-2 gap-4 p-6">
          {/* Foto Buscada */}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
              Foto Buscada
            </p>
            <img
              src={queryImage}
              alt="Foto buscada"
              className="w-full aspect-square object-cover rounded-lg border border-gray-700"
            />
          </div>

          {/* Foto Encontrada */}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
              Foto do Qualificado
            </p>
            <img
              src={result.photo_url}
              alt="Resultado"
              className="w-full aspect-square object-cover rounded-lg border border-gray-700"
            />
          </div>
        </div>

        {/* Informações */}
        <div className="bg-gray-800/50 border-t border-gray-700 px-6 py-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            {result.pessoa?.cpf && (
              <div>
                <p className="text-gray-500">CPF</p>
                <p className="text-white font-medium">{result.pessoa.cpf}</p>
              </div>
            )}
            {result.pessoa?.cidade && (
              <div>
                <p className="text-gray-500">Cidade</p>
                <p className="text-white font-medium">
                  {result.pessoa.cidade}
                  {result.pessoa.uf && `, ${result.pessoa.uf}`}
                </p>
              </div>
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-700">
            <p className="text-gray-400 text-xs">
              Confiança: <span className={`font-bold ${
                result.confidence === "alta" ? "text-green-400" :
                result.confidence === "forte" ? "text-blue-400" :
                result.confidence === "incerto" ? "text-yellow-400" :
                "text-gray-400"
              }`}>{result.confidence}</span>
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Det Score: {(result.det_score * 100).toFixed(0)}%
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 px-6 py-4">
          <button
            onClick={onClose}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
