"use client";

import { useState, useEffect, useCallback } from "react";
import { FolderOpen, Plus, Trash2, RefreshCw, Clock, AlertCircle, CheckCircle } from "lucide-react";

interface SyncFolder {
  id: string;
  folder_id: string;
  folder_name?: string;
  last_synced_at?: string;
  total_imported: number;
  active: boolean;
}

export default function DriveSyncConfig() {
  const [folders, setFolders] = useState<SyncFolder[]>([]);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [googleOk, setGoogleOk] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/drive/sync-folders");
    const d = await res.json();
    setFolders(d.folders ?? []);
  }, []);

  useEffect(() => {
    load();
    // Checa se Google está configurado
    fetch("/api/drive/auto-sync", { method: "POST", headers: { "authorization": `Bearer ${process.env.NEXT_PUBLIC_FAKE}` } })
      .then(() => {})
      .catch(() => {});

    // Checa via status simples
    fetch("/api/drive/sync-folders")
      .then(r => r.json())
      .then(() => setGoogleOk(!!process.env.NEXT_PUBLIC_GOOGLE_CONFIGURED))
      .catch(() => setGoogleOk(false));

    setGoogleOk(null); // será null até sabermos
  }, [load]);

  async function addFolder() {
    if (!input.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/drive/sync-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input.trim() }),
      });
      if (res.ok) { setInput(""); await load(); }
      else { const d = await res.json(); alert(d.error ?? "Erro ao adicionar"); }
    } finally {
      setAdding(false);
    }
  }

  async function removeFolder(id: string) {
    if (!confirm("Remover esta pasta do escaneamento automático?")) return;
    await fetch("/api/drive/sync-folders", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  async function runSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/drive/auto-sync", {
        method: "POST",
        headers: { "x-vercel-cron": "1" },
      });
      const d = await res.json();
      if (d.ok) {
        const total = d.total_imported ?? 0;
        setSyncResult(`✓ Sync concluído — ${total} foto(s) importada(s)`);
        await load();
      } else {
        setSyncResult(`Erro: ${d.error ?? "desconhecido"}`);
      }
    } catch (e) {
      setSyncResult(`Erro: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-blue-400" />
          <h2 className="font-semibold text-white">Escaneamento Automático do Drive</h2>
        </div>
        <button
          onClick={runSync}
          disabled={syncing || folders.length === 0}
          className="flex items-center gap-1.5 text-xs bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizando..." : "Sync agora"}
        </button>
      </div>

      {/* Aviso Google não configurado */}
      {!process.env.NEXT_PUBLIC_SUPABASE_URL && (
        <div className="mb-4 bg-yellow-950 border border-yellow-800 rounded-lg px-4 py-3 flex gap-2">
          <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-yellow-300 text-sm">
            <p className="font-medium mb-1">Google Drive não configurado</p>
            <p>Configure as variáveis <code className="bg-yellow-900 px-1 rounded">GOOGLE_CLIENT_ID</code>, <code className="bg-yellow-900 px-1 rounded">GOOGLE_CLIENT_SECRET</code>, <code className="bg-yellow-900 px-1 rounded">GOOGLE_REDIRECT_URI</code> e <code className="bg-yellow-900 px-1 rounded">GOOGLE_REFRESH_TOKEN</code> nas env vars da Vercel.</p>
          </div>
        </div>
      )}

      {syncResult && (
        <div className={`mb-4 rounded-lg px-4 py-3 text-sm flex items-center gap-2 ${
          syncResult.startsWith("✓")
            ? "bg-green-950 border border-green-800 text-green-300"
            : "bg-red-950 border border-red-800 text-red-300"
        }`}>
          {syncResult.startsWith("✓") ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {syncResult}
        </div>
      )}

      {/* Lista de pastas */}
      <div className="space-y-2 mb-4">
        {folders.length === 0 ? (
          <p className="text-gray-500 text-sm py-2">Nenhuma pasta configurada. Adicione abaixo.</p>
        ) : folders.map((f) => (
          <div key={f.id} className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3">
            <FolderOpen className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">
                {f.folder_name ?? f.folder_id}
              </p>
              <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                {f.last_synced_at && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Último sync: {new Date(f.last_synced_at).toLocaleString("pt-BR")}
                  </span>
                )}
                <span>{f.total_imported} importados</span>
              </div>
            </div>
            <button
              onClick={() => removeFolder(f.id)}
              className="text-gray-600 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Adicionar pasta */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addFolder()}
          placeholder="Link ou ID da pasta do Google Drive..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <button
          onClick={addFolder}
          disabled={adding || !input.trim()}
          className="flex items-center gap-1.5 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Adicionar
        </button>
      </div>

      <p className="text-gray-600 text-xs mt-3">
        Escaneamento automático a cada hora. Apenas fotos novas são importadas. OCR extrai nome, alcunha, CPF, DN e mãe da imagem.
      </p>
    </div>
  );
}
