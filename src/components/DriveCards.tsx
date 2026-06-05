"use client";

import { useEffect, useState } from "react";
import { FolderOpen, LayoutList, AlertTriangle } from "lucide-react";
import { fetchDriveCount, getCachedDriveCount, getCachedDriveError } from "@/lib/drive-count-cache";

export default function DriveCards({ ibisCount }: { ibisCount: number }) {
  const [driveCount, setDriveCount] = useState<number | null>(getCachedDriveCount);
  const [driveError, setDriveError] = useState<string | null>(getCachedDriveError);

  useEffect(() => {
    if (getCachedDriveCount() !== null) return;
    fetchDriveCount()
      .then(({ count, error }) => {
        setDriveCount(count);
        setDriveError(error);
      })
      .catch(() => {
        setDriveCount(0);
        setDriveError("fetch_error");
      });
  }, []);

  const loading = driveCount === null;
  const authExpired = driveError === "auth_expired";

  return (
    <>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${authExpired ? "bg-red-950 text-red-400" : "bg-green-950 text-green-400"}`}>
          {authExpired ? <AlertTriangle className="w-5 h-5" /> : <FolderOpen className="w-5 h-5" />}
        </div>
        {authExpired ? (
          <>
            <p className="text-sm font-semibold text-red-400">Token expirado</p>
            <p className="text-gray-500 text-xs mt-0.5">Renovar OAuth no Netlify</p>
          </>
        ) : (
          <p className="text-2xl font-bold text-white">
            {loading ? (
              <span className="animate-pulse text-gray-500">…</span>
            ) : (
              driveCount!.toLocaleString("pt-BR")
            )}
          </p>
        )}
        <p className="text-gray-400 text-sm mt-1">Meu Drive</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="bg-purple-950 text-purple-400 w-10 h-10 rounded-lg flex items-center justify-center mb-3">
          <LayoutList className="w-5 h-5" />
        </div>
        <p className="text-2xl font-bold text-white">
          {loading ? (
            <span className="animate-pulse text-gray-500">…</span>
          ) : (
            (ibisCount + (authExpired ? 0 : driveCount!)).toLocaleString("pt-BR")
          )}
        </p>
        <p className="text-gray-400 text-sm">Total geral</p>
      </div>
    </>
  );
}
