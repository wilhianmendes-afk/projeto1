"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Upload } from "lucide-react";

export default function FotoUpload({ qualificadoId, temFoto }: { qualificadoId: string; temFoto: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Selecione uma imagem (JPG, PNG).");
      return;
    }
    setLoading(true);
    setError("");

    const form = new FormData();
    form.append("foto", file);

    try {
      const res = await fetch(`/api/qualificados/${qualificadoId}/foto`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar foto");
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="mt-3">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPick} />

      <button
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="w-full flex items-center justify-center gap-2 border border-dashed border-gray-600 hover:border-blue-500 hover:bg-blue-950/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg py-2.5 text-sm text-gray-400 hover:text-blue-400 transition-colors"
      >
        {loading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
          : temFoto
            ? <><Camera className="w-4 h-4" /> Trocar foto</>
            : <><Upload className="w-4 h-4" /> Adicionar foto</>}
      </button>

      {error && (
        <p className="text-red-400 text-xs mt-1.5">{error}</p>
      )}
    </div>
  );
}
