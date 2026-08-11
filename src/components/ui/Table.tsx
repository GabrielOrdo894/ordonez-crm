import { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

type Column<T> = {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
};

type TableProps<T> = {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyMessage?: string;
  seleccion?: Set<string | number>;
  onToggleFila?: (id: string | number) => void;
  onToggleTodas?: (ids: (string | number)[]) => void;
  /** Clases extra por fila (ej. destacar en negrita las filas nuevas) — opcional, no afecta a
   * las páginas que no lo pasan. */
  rowClassName?: (row: T) => string;
};

type Direccion = 'asc' | 'desc';

export function Table<T extends { id: string | number }>({
  columns,
  data,
  onRowClick,
  loading,
  emptyMessage = 'Sin datos',
  seleccion,
  onToggleFila,
  onToggleTodas,
  rowClassName,
}: TableProps<T>) {
  const seleccionable = !!seleccion && !!onToggleFila && !!onToggleTodas;
  const [ordenColumna, setOrdenColumna] = useState<string | null>(null);
  const [direccion, setDireccion] = useState<Direccion>('asc');

  const columnaActual = columns.find((c) => c.key === ordenColumna);

  const datosOrdenados = useMemo(() => {
    if (!columnaActual) return data;
    const obtenerValor = columnaActual.sortValue ?? ((row: T) => (row as Record<string, unknown>)[columnaActual.key] as string | number | null);
    const copia = [...data];
    copia.sort((a, b) => {
      const va = obtenerValor(a);
      const vb = obtenerValor(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp =
        typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es', { numeric: true });
      return direccion === 'asc' ? cmp : -cmp;
    });
    return copia;
  }, [data, columnaActual, direccion]);

  const handleOrdenar = (col: Column<T>) => {
    if (col.sortable === false) return;
    if (ordenColumna === col.key) {
      setDireccion((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrdenColumna(col.key);
      setDireccion('asc');
    }
  };

  return (
    <div className="overflow-x-auto">
    <table className="w-full border-collapse min-w-[640px]">
      <thead>
        <tr className="bg-brand text-white text-xs uppercase tracking-wide">
          {seleccionable && (
            <th className="w-8 px-3 py-2">
              <input
                type="checkbox"
                checked={datosOrdenados.length > 0 && datosOrdenados.every((r) => seleccion!.has(r.id))}
                onChange={() => onToggleTodas!(datosOrdenados.map((r) => r.id))}
              />
            </th>
          )}
          {columns.map((col) => {
            const esOrdenable = col.sortable !== false;
            const activa = ordenColumna === col.key;
            return (
              <th
                key={col.key}
                onClick={() => handleOrdenar(col)}
                className={`text-left px-3 py-2 font-medium ${esOrdenable ? 'cursor-pointer select-none hover:bg-brand-dark' : ''}`}
              >
                <span className="flex items-center gap-1">
                  {col.label}
                  {esOrdenable &&
                    (activa ? (
                      direccion === 'asc' ? (
                        <ChevronUp size={12} />
                      ) : (
                        <ChevronDown size={12} />
                      )
                    ) : (
                      <ChevronsUpDown size={12} className="opacity-40" />
                    ))}
                </span>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {loading &&
          Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="odd:bg-gray-50">
              {seleccionable && <td className="px-3 py-2.5" />}
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2.5">
                  <div className="h-3 bg-gray-200 rounded-sm animate-pulse" />
                </td>
              ))}
            </tr>
          ))}

        {!loading && datosOrdenados.length === 0 && (
          <tr>
            <td colSpan={columns.length + (seleccionable ? 1 : 0)} className="text-center text-sm text-gray-400 py-6">
              {emptyMessage}
            </td>
          </tr>
        )}

        {!loading &&
          datosOrdenados.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row)}
              className={`group odd:bg-gray-50 hover:bg-brand-light text-sm ${onRowClick ? 'cursor-pointer' : ''} ${
                seleccion?.has(row.id) ? 'bg-brand-light' : ''
              } ${rowClassName?.(row) ?? ''}`}
            >
              {seleccionable && (
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={seleccion!.has(row.id)} onChange={() => onToggleFila!(row.id)} />
                </td>
              )}
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2">
                  {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
      </tbody>
    </table>
    </div>
  );
}
