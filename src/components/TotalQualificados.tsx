export default function TotalQualificados({ local, drive }: { local: number; drive: number }) {
  return (
    <p className="text-gray-400 text-sm">
      {local.toLocaleString("pt-BR")} registros IBIS
      {drive > 0 && (
        <span className="text-green-500">
          {" "}· {drive.toLocaleString("pt-BR")} Drive BQ
        </span>
      )}
    </p>
  );
}
