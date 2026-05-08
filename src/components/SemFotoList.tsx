"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ImageOff } from "lucide-react";

interface Qualificado {
  id: string;
  nome: string;
}

export default function SemFotoList({ qualificados }: { qualificados: Qualificado[] }) {
  const [open, setOpen] = useState(false);

  if (qualificados.length === 0) return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl mb-6 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-800 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <ImageOff className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <span className="text-gray-400 text-sm">
            <span className="font-medium text-gray-300">{qualificados.length}</span>
            {" "}qualificado{qualificados.length !== 1 ? "s" : ""} sem foto cadastrada — não entram na indexação
          </span>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-gray-500 flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-gray-800 px-5 py-3 max-h-72 overflow-y-auto">
          <div className="space-y-1">
            {qualificados.map((q) => (
              <Link
                key={q.id}
                href={`/qualificados/${q.id}`}
                className="flex items-center gap-2 py-1.5 text-sm text-gray-300 hover:text-white hover:underline transition-colors"
              >
                <ImageOff className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
                {q.nome}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
