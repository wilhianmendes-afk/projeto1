"use client";

// Cache em memória compartilhado entre todos os componentes que precisam do
// count do Drive BQ. Persiste enquanto a aba estiver aberta.
let _count: number | null = null;
let _at = 0;
const TTL = 5 * 60 * 1000;

export function getCachedDriveCount(): number | null {
  if (_count !== null && Date.now() - _at < TTL) return _count;
  return null;
}

export async function fetchDriveCount(): Promise<number> {
  const cached = getCachedDriveCount();
  if (cached !== null) return cached;

  const r = await fetch("/api/drive/count");
  const d = await r.json();
  _count = d.count ?? 0;
  _at = Date.now();
  return _count!;
}
