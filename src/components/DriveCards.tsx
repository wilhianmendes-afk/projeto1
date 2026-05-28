"use client";

import { useEffect, useState } from "react";
import { FolderOpen, LayoutList } from "lucide-react";

export default function DriveCards({ ibisCount }: { ibisCount: number }) {
  const [driveCount, setDriveCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/drive/count")
      .then((r) => r.json())
      .then((d) => setDriveCount(d.count ?? 0))
      .catch(() => setDriveCount(0));
  }, []);

  const loading = driveCount === null;

  return (
    <>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="bg-green-950 text-green-400 w-10 h-10 rounded-lg flex items-center justify-center mb-3">
          <FolderOpen className="w-5 h-5" />
        </div>
        <p className="text-2xl font-bold text-white">
          {loading ? (
            <span className="animate-pulse text-gray-500">…</span>
          ) : (
            driveCount!.toLocaleString("pt-BR")
          )}
        </p>
        <p className="text-gray-400 text-sm">Meu Drive</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="bg-purple-950 text-purple-400 w-10 h-10 rounded-lg flex items-center justify-center mb-3">
          <LayoutList className="w-5 h-5" />
        </div>
        <p className="text-2xl font-bold text-white">
          {loading ? (
            <span className="animate-pulse text-gray-500">…</span>
          ) : (
            (ibisCount + driveCount!).toLocaleString("pt-BR")
          )}
        </p>
        <p className="text-gray-400 text-sm">Total geral</p>
      </div>
    </>
  );
}
