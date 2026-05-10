"use client";

import { useEffect, useState } from "react";

export default function TotalQualificados({ local }: { local: number }) {
  const [parceiros, setParceiros] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/banco-bruno/status")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.total_qualificados) setParceiros(d.total_qualificados);
      })
      .catch(() => {});
  }, []);

  return (
    <p className="text-gray-400 text-sm">
      {local.toLocaleString("pt-BR")} registros
      {parceiros != null && (
        <span className="text-amber-500">
          {" "}+ {parceiros.toLocaleString("pt-BR")} bancos parceiros
        </span>
      )}
    </p>
  );
}
