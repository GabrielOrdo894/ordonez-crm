import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText, Search, UserPlus, Users } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { ClienteForm } from '../../clientes/ClienteForm';
import { agruparClientes } from '../../clientes/types';
import type { Visita } from '../../visitas/types';
import type { Presupuesto } from '../presupuestos/types';

export type InicioFactura =
  | { modo: 'presupuesto'; presupuesto: Presupuesto }
  | { modo: 'cliente'; clienteId: string; idioma: string };

type IniciarFacturaPageProps = {
  onCancelar: () => void;
  onContinuar: (inicio: InicioFactura) => void;
};

export function IniciarFacturaPage({ onCancelar, onContinuar }: IniciarFacturaPageProps) {
  const [modo, setModo] = useState<'presupuesto' | 'cliente' | null>(null);
  const [busquedaPresupuesto, setBusquedaPresupuesto] = useState('');
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [idioma, setIdioma] = useState('Español');
  const [listaClienteAbierta, setListaClienteAbierta] = useState(false);
  const [creandoCliente, setCreandoCliente] = useState(false);

  const { data: presupuestosAceptados } = useQuery({
    queryKey: ['presupuestos', 'aceptados_normales'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('*')
        .eq('estado', 'Aceptado')
        .eq('tipo', 'normal')
        .is('eliminado_en', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Presupuesto[];
    },
    enabled: modo === 'presupuesto',
  });

  const { data: visitas } = useQuery({
    queryKey: ['visitas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visitas')
        .select('*')
        .is('eliminado_en', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Visita[];
    },
    enabled: modo === 'cliente',
  });

  const clientes = useMemo(() => agruparClientes(visitas ?? []), [visitas]);

  const presupuestosFiltrados = useMemo(() => {
    const q = busquedaPresupuesto.trim().toLowerCase();
    const lista = presupuestosAceptados ?? [];
    if (!q) return lista;
    return lista.filter((p) => `${p.numero ?? ''} ${p.cliente_nombre ?? ''}`.toLowerCase().includes(q));
  }, [presupuestosAceptados, busquedaPresupuesto]);

  const sugerenciasCliente = useMemo(() => {
    const q = busquedaCliente.trim().toLowerCase();
    if (!q) return clientes.slice(0, 8);
    return clientes.filter((c) => `${c.nombre} ${c.apellidos} ${c.telefono}`.toLowerCase().includes(q)).slice(0, 8);
  }, [clientes, busquedaCliente]);

  const sinCoincidenciasCliente = busquedaCliente.trim().length > 0 && sugerenciasCliente.length === 0;
  const clienteElegido = clientes.find((c) => c.id === clienteId);

  return (
    <div className="max-w-2xl mx-auto animate-[scale-in_180ms_ease-out]">
      <button
        onClick={() => (modo ? setModo(null) : onCancelar())}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5"
      >
        <ArrowLeft size={15} />
        {modo ? 'Volver' : 'Volver a facturas'}
      </button>

      <h1 className="text-xl font-bold text-gray-900 mb-1">Nueva factura</h1>
      <p className="text-sm text-gray-500 mb-6">Elige de dónde parte la factura.</p>

      {!modo && (
        <section className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">1. Origen</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => setModo('presupuesto')}
              className="text-left border border-gray-200 bg-surface hover:border-gray-300 rounded-sm p-3.5 transition-colors"
            >
              <FileText size={16} className="text-brand mb-1.5" />
              <p className="font-semibold text-gray-900 mb-1">Desde un presupuesto aceptado</p>
              <p className="text-xs text-gray-500">La factura se rellena ya con las líneas, cliente e idioma del presupuesto.</p>
            </button>
            <button
              onClick={() => setModo('cliente')}
              className="text-left border border-gray-200 bg-surface hover:border-gray-300 rounded-sm p-3.5 transition-colors"
            >
              <Users size={16} className="text-brand mb-1.5" />
              <p className="font-semibold text-gray-900 mb-1">Cliente</p>
              <p className="text-xs text-gray-500">Factura desde cero para un cliente nuevo o existente, sin presupuesto.</p>
            </button>
          </div>
        </section>
      )}

      {modo === 'presupuesto' && (
        <section className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">2. Presupuesto aceptado</p>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-8"
              placeholder="Buscar por número o cliente..."
              value={busquedaPresupuesto}
              onChange={(e) => setBusquedaPresupuesto(e.target.value)}
            />
          </div>
          <div className="border border-gray-200 rounded-sm max-h-80 overflow-y-auto">
            {presupuestosFiltrados.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">No hay presupuestos aceptados que coincidan.</p>
            ) : (
              presupuestosFiltrados.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onContinuar({ modo: 'presupuesto', presupuesto: p })}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-brand-light border-b border-gray-100 last:border-0"
                >
                  <p className="text-gray-900 font-medium">
                    {p.numero} · {p.titulo}
                  </p>
                  <p className="text-xs text-gray-400">{p.cliente_nombre}</p>
                </button>
              ))
            )}
          </div>
        </section>
      )}

      {modo === 'cliente' && (
        <>
          <section className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">2. Cliente</p>
            {clienteElegido ? (
              <div className="flex items-center justify-between border border-gray-200 rounded-sm px-3 py-2.5 bg-brand-light">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {clienteElegido.nombre} {clienteElegido.apellidos}
                  </p>
                  <p className="text-xs text-gray-500">{clienteElegido.telefono}</p>
                </div>
                <button
                  onClick={() => {
                    setClienteId('');
                    setBusquedaCliente('');
                  }}
                  className="text-xs text-gray-500 hover:text-red-600"
                >
                  Cambiar
                </button>
              </div>
            ) : creandoCliente ? (
              <div className="animate-[scale-in_150ms_ease-out]">
                <p className="text-xs text-gray-500 mb-3">
                  Se registra como cliente nuevo de verdad (igual que desde Clientes) y luego se usa para esta factura.
                </p>
                <ClienteForm
                  onClose={() => setCreandoCliente(false)}
                  onCreado={(cliente) => {
                    setClienteId(cliente.id);
                    setCreandoCliente(false);
                  }}
                />
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    className="pl-8"
                    placeholder="Buscar cliente por nombre o teléfono..."
                    value={busquedaCliente}
                    onChange={(e) => {
                      setBusquedaCliente(e.target.value);
                      setListaClienteAbierta(true);
                    }}
                    onFocus={() => setListaClienteAbierta(true)}
                    onBlur={() => setTimeout(() => setListaClienteAbierta(false), 150)}
                  />
                </div>
                {listaClienteAbierta && (
                  <div className="absolute z-10 mt-1 w-full bg-surface border border-gray-200 rounded-sm shadow-sm max-h-64 overflow-y-auto">
                    {!busquedaCliente.trim() && (
                      <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                        Clientes recientes
                      </p>
                    )}
                    {sugerenciasCliente.map((c) => (
                      <button
                        key={c.id}
                        onMouseDown={() => {
                          setClienteId(c.id);
                          setListaClienteAbierta(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                      >
                        <p className="text-gray-900">
                          {c.nombre} {c.apellidos}
                        </p>
                        <p className="text-xs text-gray-400">{c.telefono}</p>
                      </button>
                    ))}
                    {sinCoincidenciasCliente && (
                      <button
                        onMouseDown={() => {
                          setCreandoCliente(true);
                          setListaClienteAbierta(false);
                        }}
                        className="w-full flex items-center gap-1.5 text-left px-3 py-2.5 text-sm text-brand hover:bg-brand-light"
                      >
                        <UserPlus size={14} className="shrink-0" />
                        Crear cliente nuevo: "{busquedaCliente}"
                      </button>
                    )}
                  </div>
                )}
                <button
                  onClick={() => setCreandoCliente(true)}
                  className="text-xs text-brand hover:underline mt-1.5 flex items-center gap-1"
                >
                  <UserPlus size={12} />
                  O crea un cliente nuevo directamente
                </button>
              </div>
            )}
          </section>

          {!creandoCliente && (
            <section className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">3. Idioma del documento</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => setIdioma('Español')}
                  className={`text-left border rounded-sm p-3.5 transition-colors ${
                    idioma === 'Español' ? 'border-brand bg-brand-light' : 'border-gray-200 bg-surface hover:border-gray-300'
                  }`}
                >
                  <p className="font-semibold text-gray-900">Español</p>
                </button>
                <button
                  onClick={() => setIdioma('Français')}
                  className={`text-left border rounded-sm p-3.5 transition-colors ${
                    idioma === 'Français' ? 'border-brand bg-brand-light' : 'border-gray-200 bg-surface hover:border-gray-300'
                  }`}
                >
                  <p className="font-semibold text-gray-900">Français</p>
                </button>
              </div>
            </section>
          )}

          {!creandoCliente && (
            <Button onClick={() => onContinuar({ modo: 'cliente', clienteId, idioma })} disabled={!clienteId}>
              Continuar
            </Button>
          )}
        </>
      )}
    </div>
  );
}
