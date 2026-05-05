"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors"
    >
      <ArrowLeft className="w-4 h-4" />
      Voltar
    </button>
  );
}
