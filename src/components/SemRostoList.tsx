"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle } from "lucide-react";
import ClearSkippedButton from "./ClearSkippedButton";

interface SkippedRecord {
  source_id: string;
  source_label: string | null;
}

export default function SemRostoList({
  records,
  total,
}: {
  records: SkippedRecord[];
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const count = records.length;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl mb-6 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80 transition-opacity text-left"
        >
          {count === 0
            ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
            : <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />}
          <span className="text-sm text-gray-400">
            {count === 0
              ? <span className="font-medium text-green-400">Nenhum sem rosto detectado</span>
              : <><span className="font-medium text-gray-300">{count}</span>{" "}qualificado{count !== 1 ? "s" : ""} sem rosto detectado</>}
          </span>
          {count > 0 && (
            open
              ? <ChevronUp className="w-4 h-4 text-gray-500 flex-shrink-0 ml-1" />
              : <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0 ml-1" />
          )}
        </button>
        {count > 0 && (
          <div className="ml-3 flex-shrink-0">
            <ClearSkippedButton total={total} />
          </div>
        )}
      </div>

      {open && count > 0 && (
        <div className="border-t border-gray-800 px-5 py-3 max-h-72 overflow-y-auto">
          <div className="space-y-1">
            {records.map((r) => (
              <Link
                key={r.source_id}
                href={`/qualificados/${r.source_id}`}
                className="flex items-center gap-2 py-1.5 text-sm text-gray-300 hover:text-white hover:underline transition-colors"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-600 flex-shrink-0" />
                {r.source_label ?? "—"}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
