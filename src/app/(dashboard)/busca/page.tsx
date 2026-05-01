import FaceSearch from "@/components/FaceSearch";

export default function BuscaPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">Busca Facial</h1>
      <p className="text-gray-400 text-sm mb-6">
        Envie uma foto para buscar no banco de qualificados por similaridade facial.
      </p>
      <FaceSearch />
    </div>
  );
}
