import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { Button } from '../../../components/ui/Button';
import { ClienteForm } from '../../clientes/ClienteForm';
import { SelectorClienteInline } from '../../clientes/SelectorClienteInline';
import { usePotencialesCliente } from '../../clientes/usePotencialesCliente';
import { agruparClientes, ETIQUETA_ORIGEN_POTENCIAL } from '../../clientes/types';
import type { Cliente, ClientePotencial } from '../../clientes/types';
import type { Visita } from '../../visitas/types';
import { FORMATOS_PRESUPUESTO } from './types';
import type { TipoPresupuesto, FormatoPresupuesto } from './types';

export type InicioPresupuesto = {
  formato: FormatoPresupuesto;
  tipo: TipoPresupuesto;
  clienteId: string;
  // Solo se usa cuando clienteId queda vacío (presupuesto orientativo sin cliente real todavía) —
  // rellena de entrada los campos de texto libre del propio presupuesto (cliente_nombre/tel/email).
  clientePotencialPrefill?: { nombre: string; telefono: string; email: string; idioma?: string };
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
  const [clienteId, setClienteId] = useState('');
  const [potencialElegido, setPotencialElegido] = useState<ClientePotencial | null>(null);
  const [creandoCliente, setCreandoCliente] = useState(false);
  const [prefillClienteForm, setPrefillClienteForm] = useState<{ nombre?: string; telefono?: string; email?: string; idioma?: string } | undefined>();

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
  const potenciales = usePotencialesCliente(clientes);
  const clienteElegido = clientes.find((c) => c.id === clienteId);

  const handleCambiarTipo = (nuevoTipo: TipoPresupuesto) => {
    setTipo(nuevoTipo);
    if (nuevoTipo === 'normal') setPotencialElegido(null);
  };

  const handleSeleccionarCliente = (cliente: Cliente) => {
    setClienteId(cliente.id);
    setPotencialElegido(null);
  };

  const handleSeleccionarPotencial = (potencial: ClientePotencial) => {
    if (tipo === 'orientativo') {
      setPotencialElegido(potencial);
      setClienteId('');
      return;
    }
    // Un presupuesto normal sigue exigiendo un cliente real — abrimos el alta ya rellenada
    // con los datos del potencial en vez de forzar a retipearlos.
    setPrefillClienteForm({ nombre: potencial.nombre, telefono: potencial.telefono, email: potencial.email ?? undefined, idioma: potencial.idioma ?? undefined });
    setCreandoCliente(true);
  };

  const puedeContinuar = tipo === 'orientativo' || !!clienteId;

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
            onClick={() => handleCambiarTipo('normal')}
            className={`text-left border rounded-sm p-3.5 transition-colors ${
              tipo === 'normal' ? 'border-brand bg-brand-light' : 'border-gray-200 bg-surface hover:border-gray-300'
            }`}
          >
            <p className="font-semibold text-gray-900 mb-1">Normal</p>
            <p className="text-xs text-gray-500">
              Presupuesto detallado con precios cerrados, plan de pago y firma del cliente. Exige un cliente registrado.
            </p>
          </button>
          <button
            onClick={() => handleCambiarTipo('orientativo')}
            className={`text-left border rounded-sm p-3.5 transition-colors ${
              tipo === 'orientativo' ? 'border-brand bg-brand-light' : 'border-gray-200 bg-surface hover:border-gray-300'
            }`}
          >
            <p className="font-semibold text-gray-900 mb-1">Orientativo</p>
            <p className="text-xs text-gray-500">
              Estimación rápida con precios en rango, sin plan de pago ni firma — no hace falta registrar cliente.
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
            <button onClick={() => setClienteId('')} className="text-xs text-gray-500 hover:text-red-600">
              Cambiar
            </button>
          </div>
        ) : potencialElegido ? (
          <div className="flex items-center justify-between border border-amber-200 rounded-sm px-3 py-2.5 bg-amber-50">
            <div>
              <p className="text-sm font-medium text-gray-900">{potencialElegido.nombre}</p>
              <p className="text-xs text-amber-700">
                {[potencialElegido.telefono, ETIQUETA_ORIGEN_POTENCIAL[potencialElegido.origen]].filter(Boolean).join(' · ')}
              </p>
            </div>
            <button onClick={() => setPotencialElegido(null)} className="text-xs text-gray-500 hover:text-red-600">
              Cambiar
            </button>
          </div>
        ) : creandoCliente ? (
          <div className="animate-[scale-in_150ms_ease-out]">
            <p className="text-xs text-gray-500 mb-3">
              Se registra como cliente nuevo de verdad (igual que desde Clientes) y luego se usa para este presupuesto.
            </p>
            <ClienteForm
              onClose={() => {
                setCreandoCliente(false);
                setPrefillClienteForm(undefined);
              }}
              onCreado={(cliente) => {
                setClienteId(cliente.id);
                setCreandoCliente(false);
                setPrefillClienteForm(undefined);
              }}
              prefill={prefillClienteForm}
            />
          </div>
        ) : (
          <div>
            <SelectorClienteInline
              clientes={clientes}
              potenciales={potenciales}
              onSeleccionarCliente={handleSeleccionarCliente}
              onSeleccionarPotencial={handleSeleccionarPotencial}
              onCrearNuevo={() => setCreandoCliente(true)}
              placeholder="Buscar cliente por nombre o teléfono..."
            />
            {tipo === 'orientativo' && (
              <p className="text-xs text-gray-400 mt-1.5">
                Para un orientativo no hace falta cliente registrado — puedes continuar sin elegir ninguno y
                escribir sus datos directamente en el presupuesto.
              </p>
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
        <Button
          onClick={() =>
            onContinuar({
              formato,
              tipo,
              clienteId,
              clientePotencialPrefill: potencialElegido
                ? {
                    nombre: potencialElegido.nombre,
                    telefono: potencialElegido.telefono,
                    email: potencialElegido.email ?? '',
                    idioma: potencialElegido.idioma ?? undefined,
                  }
                : undefined,
              idioma,
            })
          }
          disabled={!puedeContinuar}
        >
          Continuar
        </Button>
      )}
    </div>
  );
}
