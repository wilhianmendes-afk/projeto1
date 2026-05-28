"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Clock, XCircle, TrendingUp, Info } from "lucide-react";
import BackfillStatus from "@/components/BackfillStatus";
import { fetchDriveCount, getCachedDriveCount } from "@/lib/drive-count-cache";

interface Props {
  totalQualificados: number;
  totalIndexados: number;
  totalSkipped: number;
  totalSemFoto: number;
  driveIndexed: number;
  driveSkipped: number;
  isViewer: boolean;
}

export default function IndexacaoStats({
  totalQualificados,
  totalIndexados,
  totalSkipped,
  totalSemFoto,
  driveIndexed,
  driveSkipped,
  isViewer,
}: Props) {
  const [driveFiles, setDriveFiles] = useState<number | null>(getCachedDriveCount);

  useEffect(() => {
    if (getCachedDriveCount() !== null) return;
    fetchDriveCount().then(setDriveFiles).catch(() => setDriveFiles(0));
  }, []);

  const ibisComFoto = totalQualificados - totalSemFoto;
  const ibisPendentes = Math.max(0, ibisComFoto - totalIndexados - totalSkipped);
  const totalIndexadosGeral = totalIndexados + driveIndexed;
  const totalSkippedGeral = totalSkipped + driveSkipped;

  const loading = driveFiles === null;
  const cobertura = loading
    ? null
    : ibisComFoto + driveFiles > 0
      ? Math.round((totalIndexadosGeral / (ibisComFoto + driveFiles)) * 100)
      : 0;
  const pendentes = loading
    ? null
    : ibisPendentes + Math.max(0, driveFiles - driveIndexed - driveSkipped);

  const colors: Record<string, string> = {
    blue: "bg-blue-950 text-blue-400",
    green: "bg-green-950 text-green-400",
    yellow: "bg-yellow-950 text-yellow-400",
    red: "bg-red-950 text-red-400",
  };

  function StatCard({
    icon: Icon,
    color,
    label,
    value,
  }: {
    icon: React.ElementType;
    color: string;
    label: string;
    value: string | number | null;
  }) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className={`${colors[color]} w-10 h-10 rounded-lg flex items-center justify-center mb-3`}>
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-2xl font-bold text-white">
          {value === null ? (
            <span className="animate-pulse text-gray-500">…</span>
          ) : typeof value === "number" ? (
            value.toLocaleString("pt-BR")
          ) : (
            value
          )}
        </p>
        <p className="text-gray-400 text-sm">{label}</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={TrendingUp} color="blue" label="Cobertura" value={loading ? null : `${cobertura}%`} />
        <StatCard icon={CheckCircle} color="green" label="Indexados" value={totalIndexadosGeral} />
        <StatCard icon={Clock} color="yellow" label="Pendentes" value={pendentes} />
        <StatCard icon={XCircle} color="red" label="Sem rosto" value={totalSkippedGeral} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-semibold text-white mb-4">Indexação de embeddings</h2>
          <BackfillStatus initialRemaining={pendentes ?? ibisPendentes} isViewer={isViewer} />
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 mb-1">
            <Info className="w-5 h-5 text-blue-400 flex-shrink-0" />
            <h2 className="font-semibold text-white">Cadastro de qualificados</h2>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed">
            O cadastro de novos qualificados no sistema é feito exclusivamente por pessoal autorizado.
          </p>
          <p className="text-gray-400 text-sm leading-relaxed">
            Para inclusão, atualização ou remoção de registros, entre em contato com:
          </p>
          <div className="bg-gray-800 rounded-lg p-4 mt-1 space-y-2">
            <p className="text-white text-sm font-medium">Administrador do Sistema</p>
            <p className="text-gray-400 text-xs">ou</p>
            <p className="text-white text-sm font-medium">Agência Local de Inteligência</p>
            <p className="text-blue-400 text-sm font-semibold">42º Batalhão de Polícia Militar</p>
          </div>
        </div>
      </div>
    </>
  );
}
