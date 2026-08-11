import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, User, FileText, Receipt } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { agruparClientes } from '../../modules/clientes/types';
import type { Visita } from '../../modules/visitas/types';
import type { Presupuesto } from '../../modules/finanzas/presupuestos/types';
import type { Factura } from '../../modules/finanzas/facturas/types';

type BuscadorGlobalProps = {
  abierto: boolean;
  onClose: () => void;
};

function useDebounced<T>(valor: T, ms: number): T {
  const [debounced, setDebounced] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return debounced;
}

export function BuscadorGlobal({ abierto, onClose }: BuscadorGlobalProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const queryDebounced = useDebounced(query.trim(), 250);

  useEffect(() => {
    if (!abierto) setQuery('');
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [abierto, onClose]);

  const activa = abierto && queryDebounced.length >= 2;

  const { data: visitas, isFetching: buscandoVisitas } = useQuery({
    queryKey: ['buscador-global', 'visitas', queryDebounced],
    enabled: activa,
    queryFn: async () => {
      const q = `%${queryDebounced}%`;
      const { data, error } = await supabase
        .from('visitas')
        .select('*')
        .is('eliminado_en', null)
        .or(`nombre.ilike.${q},apellidos.ilike.${q},telefono.ilike.${q},email.ilike.${q}`)
        .limit(20);
      if (error) throw error;
      return data as Visita[];
    },
  });

  const { data: presupuestos, isFetching: buscandoPresupuestos } = useQuery({
    queryKey: ['buscador-global', 'presupuestos', queryDebounced],
    enabled: activa,
    queryFn: async () => {
      const q = `%${queryDebounced}%`;
      const { data, error } = await supabase
        .from('presupuestos')
        .select('id, numero, cliente_nombre, fecha_emision, estado')
        .is('eliminado_en', null)
        .or(`numero.ilike.${q},cliente_nombre.ilike.${q}`)
        .limit(5);
      if (error) throw error;
      return data as Pick<Presupuesto, 'id' | 'numero' | 'cliente_nombre' | 'fecha_emision' | 'estado'>[];
    },
  });

  const { data: facturas, isFetching: buscandoFacturas } = useQuery({
    queryKey: ['buscador-global', 'facturas', queryDebounced],
    enabled: activa,
    queryFn: async () => {
      const q = `%${queryDebounced}%`;
      const { data, error } = await supabase
        .from('facturas')
        .select('id, numero, cliente_nombre, fecha_factura, estado_cobro')
        .is('eliminado_en', null)
        .or(`numero.ilike.${q},cliente_nombre.ilike.${q}`)
        .limit(5);
      if (error) throw error;
      return data as Pick<Factura, 'id' | 'numero' | 'cliente_nombre' | 'fecha_factura' | 'estado_cobro'>[];
    },
  });

  const clientes = useMemo(() => agruparClientes(visitas ?? []).slice(0, 5), [visitas]);
  const cargando = buscandoVisitas || buscandoPresupuestos || buscandoFacturas;
  const sinResultados =
    activa && !cargando && clientes.length === 0 && (presupuestos ?? []).length === 0 && (facturas ?? []).length === 0;

  const irACliente = (id: string) => {
    navigate(`/clientes/${encodeURIComponent(id)}`);
    onClose();
  };
  const irAPresupuesto = (id: string) => {
    navigate('/finanzas/presupuestos', { state: { verDocId: id, verDocTipo: 'presupuesto' } });
    onClose();
  };
  const irAFactura = (id: string) => {
    navigate('/finanzas/facturas', { state: { verDocId: id, verDocTipo: 'factura' } });
    onClose();
  };

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-16 px-4 animate-[fade-in_150ms_ease-out]"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded max-w-lg w-full border-t-[3px] border-brand animate-[scale-in_150ms_ease-out] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
          <Search size={16} className="text-gray-400 shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cliente, presupuesto o factura..."
            className="flex-1 text-sm outline-none bg-transparent text-gray-900 placeholder:text-gray-400"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
          {!activa && (
            <p className="text-sm text-gray-400 px-2 py-4 text-center">
              Escribe para buscar clientes, presupuestos o facturas.
            </p>
          )}

          {sinResultados && <p className="text-sm text-gray-400 px-2 py-4 text-center">Sin resultados.</p>}

          {activa && clientes.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 px-2 py-1">Clientes</p>
              {clientes.map((c) => (
                <button
                  key={c.id}
                  onClick={() => irACliente(c.id)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-sm hover:bg-brand-light text-left"
                >
                  <User size={15} className="text-brand shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900 truncate">
                      {c.nombre} {c.apellidos}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{c.telefono}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {activa && (presupuestos ?? []).length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 px-2 py-1">Presupuestos</p>
              {(presupuestos ?? []).map((p) => (
                <button
                  key={p.id}
                  onClick={() => irAPresupuesto(p.id)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-sm hover:bg-brand-light text-left"
                >
                  <FileText size={15} className="text-brand shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900 truncate">{p.numero ?? 'Sin número'} · {p.cliente_nombre ?? '—'}</p>
                    <p className="text-xs text-gray-500 truncate">{p.estado} · {p.fecha_emision ?? 'Sin fecha'}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {activa && (facturas ?? []).length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 px-2 py-1">Facturas</p>
              {(facturas ?? []).map((f) => (
                <button
                  key={f.id}
                  onClick={() => irAFactura(f.id)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-sm hover:bg-brand-light text-left"
                >
                  <Receipt size={15} className="text-brand shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900 truncate">{f.numero ?? 'Sin número'} · {f.cliente_nombre ?? '—'}</p>
                    <p className="text-xs text-gray-500 truncate">{f.estado_cobro} · {f.fecha_factura ?? 'Sin fecha'}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
