"use client";

import { X } from "lucide-react";

interface SearchResult {
  source_id: string;
  photo_url: string;
  similarity: number;
  det_score: number;
  bbox: object;
  confidence: string;
  pessoa: { nome: string; vulgo?: string; cpf?: string; cidade?: string; uf?: string; nascimento?: string; genitora?: string } | null;
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
      <div className="bg-gray-900 rounded-xl max-w-6xl w-full border border-gray-700 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white">
              {result.pessoa?.nome ?? "Desconhecido"}
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              Similaridade: <span className="text-blue-400 font-bold text-lg">{similarity}%</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Conteúdo - scrollável */}
        <div className="overflow-y-auto flex-1 px-6 py-6">
          {/* Imagens lado a lado - GRANDES */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* Foto Buscada */}
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-3 font-bold">
                Foto Buscada
              </p>
              <img
                src={queryImage}
                alt="Foto buscada"
                className="w-full aspect-square object-contain rounded-lg border border-gray-700 bg-black"
              />
            </div>

            {/* Foto do Qualificado */}
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-3 font-bold">
                Foto do Qualificado
              </p>
              <img
                src={result.photo_url}
                alt="Resultado"
                className="w-full aspect-square object-contain rounded-lg border border-gray-700 bg-black"
              />
            </div>
          </div>

          {/* Dados do Qualificado */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">Dados do Qualificado</h3>
            <div className="grid grid-cols-2 gap-4">
              {/* Nome */}
              <div className="col-span-2">
                <p className="text-gray-500 text-xs uppercase tracking-wide">Nome</p>
                <p className="text-white font-bold text-lg">{result.pessoa?.nome}</p>
              </div>

              {/* Alcunha */}
              {result.pessoa?.vulgo && (
                <div className="col-span-2">
                  <p className="text-gray-500 text-xs uppercase tracking-wide">Alcunha</p>
                  <p className="text-white font-medium">"{result.pessoa.vulgo}"</p>
                </div>
              )}

              {/* Data de Nascimento */}
              {result.pessoa?.nascimento && (
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wide">Data de Nascimento</p>
                  <p className="text-white font-medium">{result.pessoa.nascimento}</p>
                </div>
              )}

              {/* Nome da Mãe */}
              {result.pessoa?.genitora && (
                <div className="col-span-2">
                  <p className="text-gray-500 text-xs uppercase tracking-wide">Nome da Mãe</p>
                  <p className="text-white font-medium">{result.pessoa.genitora}</p>
                </div>
              )}

              {/* CPF */}
              {result.pessoa?.cpf && (
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wide">CPF</p>
                  <p className="text-white font-medium">{result.pessoa.cpf}</p>
                </div>
              )}

              {/* Localização */}
              {(result.pessoa?.cidade || result.pessoa?.uf) && (
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wide">Localização</p>
                  <p className="text-white font-medium">
                    {result.pessoa.cidade}
                    {result.pessoa.cidade && result.pessoa.uf && ", "}
                    {result.pessoa.uf}
                  </p>
                </div>
              )}

              {/* Confiança e Det Score */}
              <div className="col-span-2 mt-4 pt-4 border-t border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wide">Confiança</p>
                    <span className={`inline-block font-bold text-sm mt-1 px-3 py-1 rounded border ${
                      result.confidence === "alta" ? "text-green-400 bg-green-950 border-green-800" :
                      result.confidence === "forte" ? "text-blue-400 bg-blue-950 border-blue-800" :
                      result.confidence === "incerto" ? "text-yellow-400 bg-yellow-950 border-yellow-800" :
                      "text-gray-400 bg-gray-800 border-gray-700"
                    }`}>{result.confidence}</span>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wide">Det Score</p>
                    <p className="text-white font-bold text-sm mt-1">{(result.det_score * 100).toFixed(0)}%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 px-6 py-4 flex-shrink-0">
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
