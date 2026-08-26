import { useMemo, useState } from 'react';
import { Search, UserPlus } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { ETIQUETA_ORIGEN_POTENCIAL } from './types';
import type { Cliente, ClientePotencial } from './types';

type SelectorClienteInlineProps = {
  clientes: Cliente[];
  potenciales?: ClientePotencial[];
  onSeleccionarCliente: (cliente: Cliente) => void;
  onSeleccionarPotencial?: (potencial: ClientePotencial) => void;
  onCrearNuevo?: (busqueda: string) => void;
  placeholder?: string;
};

// Mismo patrón de búsqueda que IniciarPresupuestoPage.tsx, extraído para reutilizarlo donde haga
// falta elegir un cliente ya existente sin abrir el flujo completo de "nuevo presupuesto"
// (VisitaForm), y ampliado para mostrar también "potenciales" (solicitudes/orientativos sin
// cliente real todavía) con un color distinto, sin mezclarlos con los clientes reales.
export function SelectorClienteInline({
  clientes,
  potenciales = [],
  onSeleccionarCliente,
  onSeleccionarPotencial,
  onCrearNuevo,
  placeholder = 'Buscar cliente por nombre o teléfono...',
}: SelectorClienteInlineProps) {
  const [busqueda, setBusqueda] = useState('');
  const [listaAbierta, setListaAbierta] = useState(false);

  const q = busqueda.trim().toLowerCase();

  const sugerenciasClientes = useMemo(() => {
    if (!q) return clientes.slice(0, 8);
    return clientes
      .filter((c) => `${c.nombre} ${c.apellidos} ${c.telefono}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [clientes, q]);

  const sugerenciasPotenciales = useMemo(() => {
    if (!onSeleccionarPotencial) return [];
    if (!q) return potenciales.slice(0, 5);
    return potenciales
      .filter((p) => `${p.nombre} ${p.telefono}`.toLowerCase().includes(q))
      .slice(0, 5);
  }, [potenciales, q, onSeleccionarPotencial]);

  const sinCoincidencias =
    q.length > 0 && sugerenciasClientes.length === 0 && sugerenciasPotenciales.length === 0;
  const hayResultados =
    sugerenciasClientes.length > 0 ||
    sugerenciasPotenciales.length > 0 ||
    (!!onCrearNuevo && sinCoincidencias);

  return (
    <div className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input
          className="pl-8"
          placeholder={placeholder}
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setListaAbierta(true);
          }}
          onFocus={() => setListaAbierta(true)}
          onBlur={() => setTimeout(() => setListaAbierta(false), 150)}
        />
      </div>
      {listaAbierta && hayResultados && (
        <div className="absolute z-10 mt-1 w-full bg-surface border border-gray-200 rounded-sm shadow-sm max-h-72 overflow-y-auto">
          {sugerenciasClientes.length > 0 && (
            <>
              {!q && (
                <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  Clientes recientes
                </p>
              )}
              {sugerenciasClientes.map((c) => (
                <button
                  key={c.id}
                  onMouseDown={() => {
                    onSeleccionarCliente(c);
                    setBusqueda('');
                    setListaAbierta(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                >
                  <p className="text-gray-900">
                    {c.nombre} {c.apellidos}
                  </p>
                  <p className="text-xs text-gray-400">{c.telefono}</p>
                </button>
              ))}
            </>
          )}
          {sugerenciasPotenciales.length > 0 && (
            <>
              <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-amber-700 bg-amber-50 border-y border-amber-100">
                Potenciales — aún no son clientes registrados
              </p>
              {sugerenciasPotenciales.map((p) => (
                <button
                  key={`${p.origen}-${p.id}`}
                  onMouseDown={() => {
                    onSeleccionarPotencial?.(p);
                    setBusqueda('');
                    setListaAbierta(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 border-b border-gray-100 last:border-0"
                >
                  <div className="flex items-center gap-1.5">
                    <p className="text-gray-900">{p.nombre}</p>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 rounded-sm px-1.5 py-0.5 shrink-0">
                      Potencial
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {[p.telefono, ETIQUETA_ORIGEN_POTENCIAL[p.origen]].filter(Boolean).join(' · ')}
                  </p>
                </button>
              ))}
            </>
          )}
          {onCrearNuevo && sinCoincidencias && (
            <button
              onMouseDown={() => {
                onCrearNuevo(busqueda);
                setListaAbierta(false);
              }}
              className="w-full flex items-center gap-1.5 text-left px-3 py-2.5 text-sm text-brand hover:bg-brand-light"
            >
              <UserPlus size={14} className="shrink-0" />
              Crear cliente nuevo: "{busqueda}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}
