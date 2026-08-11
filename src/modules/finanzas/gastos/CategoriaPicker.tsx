import { useState } from 'react';
import { Search, ChevronRight, ArrowLeft, Check } from 'lucide-react';
import { GRUPOS_CATEGORIA, cuentaLabel } from './categorias';

type CategoriaPickerProps = {
  onSeleccionar: (categoria: string, cuentaContable: string) => void;
  onVolver: () => void;
  seleccionActual?: string;
};

export function CategoriaPicker({ onSeleccionar, onVolver, seleccionActual }: CategoriaPickerProps) {
  const [grupoActivo, setGrupoActivo] = useState(GRUPOS_CATEGORIA[0].id);
  const [busqueda, setBusqueda] = useState('');

  const grupo = GRUPOS_CATEGORIA.find((g) => g.id === grupoActivo)!;

  const itemsFiltrados = busqueda.trim()
    ? GRUPOS_CATEGORIA.flatMap((g) => g.cuentas.map((codigo) => ({ grupo: g, codigo }))).filter(({ codigo }) =>
        cuentaLabel(codigo).toLowerCase().includes(busqueda.trim().toLowerCase()),
      )
    : grupo.cuentas.map((codigo) => ({ grupo, codigo }));

  return (
    <div>
      <button onClick={onVolver} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-3">
        <ArrowLeft size={15} />
        Volver al gasto
      </button>

      <div className="relative mb-3">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o número de cuenta..."
          className="w-full border border-gray-200 rounded-sm pl-8 pr-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-[170px_1fr] gap-3">
        <div className="border border-gray-200 rounded-sm overflow-hidden self-start">
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
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm border-l-2 ${
                  activo ? 'border-brand bg-brand-light text-brand font-medium' : 'border-transparent text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className={`w-6 h-6 rounded-sm flex items-center justify-center shrink-0 ${g.colorFondo} ${g.colorTexto}`}>
                  <Icono size={13} />
                </span>
                <span className="truncate">{g.nombre}</span>
              </button>
            );
          })}
        </div>

        <div className="border border-gray-200 rounded-sm overflow-hidden self-start min-h-[100px]">
          {itemsFiltrados.length === 0 && <p className="text-sm text-gray-400 p-4">Sin resultados</p>}
          {itemsFiltrados.map(({ grupo: g, codigo }) => {
            const Icono = g.icono;
            const seleccionado = seleccionActual === codigo;
            return (
              <button
                key={codigo}
                onClick={() => onSeleccionar(cuentaLabel(codigo), codigo)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm border-b border-gray-100 last:border-0 hover:bg-brand-light ${
                  seleccionado ? 'bg-brand-light' : ''
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {busqueda && (
                    <span className={`w-5 h-5 rounded-sm flex items-center justify-center shrink-0 ${g.colorFondo} ${g.colorTexto}`}>
                      <Icono size={11} />
                    </span>
                  )}
                  <span className={`truncate ${seleccionado ? 'font-semibold text-brand' : 'text-gray-800'}`}>
                    {cuentaLabel(codigo)}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {busqueda && <span className="text-[9px] uppercase tracking-wide text-gray-400">{g.nombre}</span>}
                  {seleccionado ? <Check size={14} className="text-brand" /> : <ChevronRight size={14} className="text-gray-300" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
