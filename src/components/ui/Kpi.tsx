type KpiProps = {
  label: string;
  valor: string | number;
  valorSecundario?: string;
  acento?: boolean;
};

function Kpi({ label, valor, valorSecundario, acento }: KpiProps) {
  return (
    <div className="bg-surface border border-gray-200 rounded-sm p-3">
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`text-xl font-semibold mt-0.5 ${acento ? 'text-brand' : 'text-gray-900'}`}>{valor}</p>
      {valorSecundario && <p className="text-xs text-gray-400 mt-0.5">{valorSecundario}</p>}
    </div>
  );
}

export function KpiRow({ items }: { items: KpiProps[] }) {
  return (
    <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
      {items.map((item) => (
        <Kpi key={item.label} {...item} />
      ))}
    </div>
  );
}
