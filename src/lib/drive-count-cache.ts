"use client";

// Cache em memória compartilhado entre todos os componentes que precisam do
// count do Drive BQ. Persiste enquanto a aba estiver aberta.
let _count: number | null = null;
let _error: string | null = null;
let _at = 0;
const TTL = 5 * 60 * 1000;

export function getCachedDriveCount(): number | null {
  if (_count !== null && Date.now() - _at < TTL) return _count;
  return null;
}

export function getCachedDriveError(): string | null {
  if (Date.now() - _at < TTL) return _error;
  return null;
}

export async function fetchDriveCount(): Promise<{ count: number; error: string | null }> {
  const cached = getCachedDriveCount();
  if (cached !== null) return { count: cached, error: getCachedDriveError() };

  const r = await fetch("/api/drive/count");
  const d = await r.json();
  _count = d.count ?? 0;
  _error = d.error ?? null;
  _at = Date.now();
  return { count: _count!, error: _error };
}
