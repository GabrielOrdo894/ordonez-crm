import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Search, UserPlus } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { ClienteForm } from '../../clientes/ClienteForm';
import { agruparClientes } from '../../clientes/types';
import type { Visita } from '../../visitas/types';
import { FORMATOS_PRESUPUESTO } from './types';
import type { TipoPresupuesto, FormatoPresupuesto } from './types';

export type InicioPresupuesto = {
  formato: FormatoPresupuesto;
  tipo: TipoPresupuesto;
  clienteId: string;
  idioma: string;
};

type IniciarPresupuestoPageProps = {
  onCancelar: () => void;
  onContinuar: (inicio: InicioPresupuesto) => void;
};

export function IniciarPresupuestoPage({ onCancelar, onContinuar }: IniciarPresupuestoPageProps) {
  const [formato, setFormato] = useState<FormatoPresupuesto>('rapido');
  const [tipo, setTipo] = useState<TipoPresupuesto>('normal');
  const [idioma, setIdioma] = useState('Español');
  const [busqueda, setBusqueda] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [listaAbierta, setListaAbierta] = useState(false);
  const [creandoCliente, setCreandoCliente] = useState(false);

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
  });

  const clientes = useMemo(() => agruparClientes(visitas ?? []), [visitas]);

  const sugerencias = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes.slice(0, 8);
    return clientes.filter((c) => `${c.nombre} ${c.apellidos} ${c.telefono}`.toLowerCase().includes(q)).slice(0, 8);
  }, [clientes, busqueda]);

  const sinCoincidencias = busqueda.trim().length > 0 && sugerencias.length === 0;
  const clienteElegido = clientes.find((c) => c.id === clienteId);

  return (
    <div className="max-w-2xl mx-auto animate-[scale-in_180ms_ease-out]">
      <button onClick={onCancelar} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5">
        <ArrowLeft size={15} />
        Volver a presupuestos
      </button>

      <h1 className="text-xl font-bold text-gray-900 mb-1">Nuevo presupuesto</h1>
      <p className="text-sm text-gray-500 mb-6">Elige el tipo de presupuesto y el cliente para empezar.</p>

      <section className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">1. Formato</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FORMATOS_PRESUPUESTO.map((f) => (
            <button
              key={f.value}
              onClick={() => setFormato(f.value)}
              className={`text-left border rounded-sm p-3.5 transition-colors ${
                formato === f.value ? 'border-brand bg-brand-light' : 'border-gray-200 bg-surface hover:border-gray-300'
              }`}
            >
              <p className="font-semibold text-gray-900 mb-1">{f.label}</p>
              <p className="text-xs text-gray-500">{f.descripcion}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">2. Tipo de presupuesto</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => setTipo('normal')}
            className={`text-left border rounded-sm p-3.5 transition-colors ${
              tipo === 'normal' ? 'border-brand bg-brand-light' : 'border-gray-200 bg-surface hover:border-gray-300'
            }`}
          >
            <p className="font-semibold text-gray-900 mb-1">Normal</p>
            <p className="text-xs text-gray-500">
              Presupuesto detallado con precios cerrados, plan de pago y firma del cliente.
            </p>
          </button>
          <button
            onClick={() => setTipo('orientativo')}
            className={`text-left border rounded-sm p-3.5 transition-colors ${
              tipo === 'orientativo' ? 'border-brand bg-brand-light' : 'border-gray-200 bg-surface hover:border-gray-300'
            }`}
          >
            <p className="font-semibold text-gray-900 mb-1">Orientativo</p>
            <p className="text-xs text-gray-500">
              Estimación rápida con precios en rango, sin plan de pago ni firma — para una primera idea de precio.
            </p>
          </button>
        </div>
      </section>

      <section className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">3. Cliente</p>
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
                setBusqueda('');
              }}
              className="text-xs text-gray-500 hover:text-red-600"
            >
              Cambiar
            </button>
          </div>
        ) : creandoCliente ? (
          <div className="animate-[scale-in_150ms_ease-out]">
            <p className="text-xs text-gray-500 mb-3">
              Se registra como cliente nuevo de verdad (igual que desde Clientes) y luego se usa para este presupuesto.
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
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setListaAbierta(true);
                }}
                onFocus={() => setListaAbierta(true)}
                onBlur={() => setTimeout(() => setListaAbierta(false), 150)}
              />
            </div>
            {listaAbierta && (
              <div className="absolute z-10 mt-1 w-full bg-surface border border-gray-200 rounded-sm shadow-sm max-h-64 overflow-y-auto">
                {!busqueda.trim() && (
                  <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    Clientes recientes
                  </p>
                )}
                {sugerencias.map((c) => (
                  <button
                    key={c.id}
                    onMouseDown={() => {
                      setClienteId(c.id);
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
                {sinCoincidencias && (
                  <button
                    onMouseDown={() => {
                      setCreandoCliente(true);
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

      <section className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">4. Idioma del documento</p>
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

      {!creandoCliente && (
        <Button onClick={() => onContinuar({ formato, tipo, clienteId, idioma })} disabled={!clienteId}>
          Continuar
        </Button>
      )}
    </div>
  );
}
