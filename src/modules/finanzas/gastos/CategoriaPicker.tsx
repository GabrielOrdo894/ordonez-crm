import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ChevronRight, ArrowLeft, Check, Flame } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { GRUPOS_CATEGORIA, cuentaLabel } from './categorias';

type CategoriaPickerProps = {
  onSeleccionar: (categoria: string, cuentaContable: string) => void;
  onVolver: () => void;
  seleccionActual?: string;
};

const MAX_MAS_USADAS = 8;

export function CategoriaPicker({ onSeleccionar, onVolver, seleccionActual }: CategoriaPickerProps) {
  const [grupoActivo, setGrupoActivo] = useState(GRUPOS_CATEGORIA[0].id);
  const [busqueda, setBusqueda] = useState('');

  // Frecuencia histórica de uso (todo el histórico, sin filtro de fecha) — "más usadas" refleja el
  // hábito real de la empresa, no solo lo reciente (confirmado con Gabriel, auditoría 2026-08-21).
  const { data: usoHistorico } = useQuery({
    queryKey: ['gastos-uso-cuentas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('gastos').select('cuenta_contable');
      if (error) throw error;
      return data;
    },
  });

  const masUsadas = useMemo(() => {
    if (!usoHistorico) return [];
    const conteo = new Map<string, number>();
    for (const { cuenta_contable } of usoHistorico) {
      if (!cuenta_contable) continue;
      conteo.set(cuenta_contable, (conteo.get(cuenta_contable) ?? 0) + 1);
    }
    return [...conteo.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_MAS_USADAS).map(([codigo]) => codigo);
  }, [usoHistorico]);

  function grupoDeCuenta(codigo: string) {
    return GRUPOS_CATEGORIA.find((g) => g.cuentas.includes(codigo)) ?? GRUPOS_CATEGORIA[0];
  }

  const grupo = GRUPOS_CATEGORIA.find((g) => g.id === grupoActivo)!;

  const itemsFiltrados = busqueda.trim()
    ? GRUPOS_CATEGORIA.flatMap((g) => g.cuentas.map((codigo) => ({ grupo: g, codigo }))).filter(({ codigo }) =>
        cuentaLabel(codigo).toLowerCase().includes(busqueda.trim().toLowerCase()),
      )
    : grupo.cuentas.map((codigo) => ({ grupo, codigo }));

  return (
    <div>
      <button onClick={onVolver} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ArrowLeft size={16} />
        Volver al gasto
      </button>

      <h1 className="text-xl font-bold text-gray-900 mb-1">Elegir categoría contable</h1>
      <p className="text-sm text-gray-500 mb-5">Cuenta del PCG a la que se imputa este gasto.</p>

      <div className="relative mb-5 max-w-xl">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          autoFocus
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o número de cuenta..."
          className="w-full border border-gray-200 rounded-sm pl-9 pr-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      {!busqueda && masUsadas.length > 0 && (
        <div className="mb-5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
            <Flame size={12} />
            Más usadas
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {masUsadas.map((codigo) => {
              const g = grupoDeCuenta(codigo);
              const Icono = g.icono;
              const seleccionado = seleccionActual === codigo;
              return (
                <button
                  key={codigo}
                  onClick={() => onSeleccionar(cuentaLabel(codigo), codigo)}
                  className={`flex items-center gap-2 border rounded-sm px-3 py-2 text-left text-sm hover:border-brand hover:bg-brand-light ${
                    seleccionado ? 'border-brand bg-brand-light' : 'border-gray-200'
                  }`}
                >
                  <span className={`w-7 h-7 rounded-sm flex items-center justify-center shrink-0 ${g.colorFondo} ${g.colorTexto}`}>
                    <Icono size={14} />
                  </span>
                  <span className={`truncate ${seleccionado ? 'font-semibold text-brand' : 'text-gray-700'}`}>
                    {cuentaLabel(codigo)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-[220px_1fr] gap-4">
        <div className="border border-gray-200 rounded-sm self-start">
          {GRUPOS_CATEGORIA.map((g) => {
            const Icono = g.icono;
            const activo = grupoActivo === g.id && !busqueda;
            return (
              <button
                key={g.id}
                onClick={() => {
                  setGrupoActivo(g.id);
                  setBusqueda('');
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm border-l-2 ${
                  activo ? 'border-brand bg-brand-light text-brand font-medium' : 'border-transparent text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className={`w-7 h-7 rounded-sm flex items-center justify-center shrink-0 ${g.colorFondo} ${g.colorTexto}`}>
                  <Icono size={14} />
                </span>
                <span className="truncate">{g.nombre}</span>
              </button>
            );
          })}
        </div>

        <div className="border border-gray-200 rounded-sm self-start min-h-[100px]">
          {itemsFiltrados.length === 0 && <p className="text-sm text-gray-400 p-4">Sin resultados</p>}
          {itemsFiltrados.map(({ grupo: g, codigo }) => {
            const Icono = g.icono;
            const seleccionado = seleccionActual === codigo;
            return (
              <button
                key={codigo}
                onClick={() => onSeleccionar(cuentaLabel(codigo), codigo)}
                className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left text-sm border-b border-gray-100 last:border-0 hover:bg-brand-light ${
                  seleccionado ? 'bg-brand-light' : ''
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  {busqueda && (
                    <span className={`w-6 h-6 rounded-sm flex items-center justify-center shrink-0 ${g.colorFondo} ${g.colorTexto}`}>
                      <Icono size={12} />
                    </span>
                  )}
                  <span className={`truncate ${seleccionado ? 'font-semibold text-brand' : 'text-gray-800'}`}>
                    {cuentaLabel(codigo)}
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {busqueda && <span className="text-[10px] uppercase tracking-wide text-gray-400">{g.nombre}</span>}
                  {seleccionado ? <Check size={15} className="text-brand" /> : <ChevronRight size={14} className="text-gray-300" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
