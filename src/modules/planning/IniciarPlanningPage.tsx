import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, UserPlus, FileText, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { FechaPicker } from '../../components/ui/FechaPicker';
import { MapsAutocomplete } from '../google/MapsAutocomplete';
import { agruparClientes, normalizarTelefono } from '../clientes/types';
import { calcularTotales } from '../finanzas/lineas';
import { fechaVisitaCorta } from '../../lib/fechas';
import type { Visita } from '../visitas/types';
import type { Presupuesto } from '../finanzas/presupuestos/types';

const ZONAS_ES = ['Irún', 'Hondarribia', 'Donostia/San Sebastián', 'Rentería', 'Bera de Bidasoa', 'Otro ES'];
const ZONAS_FR = ['Hendaye', 'Urrugne', 'Saint-Jean-de-Luz', 'Bayonne', 'Autre FR'];

function zonaDefault(pais: string) {
  return pais === 'España' ? 'Irún' : pais === 'Francia' ? 'Hendaye' : '';
}

type ClienteManual = {
  nombre: string;
  apellidos: string;
  telefono: string;
  email: string;
  idioma: string;
  contacto: string;
  direccion: string;
  lat: number | null;
  lng: number | null;
  pais: string;
  zona: string;
};

function clienteManualVacio(): ClienteManual {
  return {
    nombre: '', apellidos: '', telefono: '', email: '', idioma: 'Español', contacto: 'Llamada',
    direccion: '', lat: null, lng: null, pais: 'España', zona: 'Irún',
  };
}

type IniciarPlanningPageProps = {
  presupuestosSinPlanning: Presupuesto[];
  onCancelar: () => void;
  onCrear: (datos: { presupuesto: Presupuesto; nombreObra: string; fechaInicio: string | null }) => void;
  creando: boolean;
};

function TarjetaPresupuesto({ p, onClick }: { p: Presupuesto; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left border border-gray-200 rounded-sm px-3 py-2.5 hover:border-brand flex items-center justify-between text-sm"
    >
      <div>
        <p className="text-gray-900 font-medium">
          {p.numero} · {p.cliente_nombre}
        </p>
        <p className="text-xs text-gray-500">{fechaVisitaCorta(p.fecha_emision)}</p>
      </div>
      <span className="text-gray-700 font-medium">{calcularTotales(p.lineas).totalConIva.toFixed(2)} €</span>
    </button>
  );
}

export function IniciarPlanningPage({ presupuestosSinPlanning, onCancelar, onCrear, creando }: IniciarPlanningPageProps) {
  const navigate = useNavigate();
  const [modo, setModo] = useState<'presupuesto' | 'cliente'>('presupuesto');
  const [buscarPresupuesto, setBuscarPresupuesto] = useState('');
  const [buscarCliente, setBuscarCliente] = useState('');
  const [listaClienteAbierta, setListaClienteAbierta] = useState(false);
  const [clienteId, setClienteId] = useState('');
  const [creandoCliente, setCreandoCliente] = useState(false);
  const [clienteNuevo, setClienteNuevo] = useState<ClienteManual>(clienteManualVacio());
  const [presupuestoElegido, setPresupuestoElegido] = useState<Presupuesto | null>(null);
  const [nombreObra, setNombreObra] = useState('');
  const [nombreObraError, setNombreObraError] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');

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

  const sugerenciasCliente = useMemo(() => {
    const q = buscarCliente.trim().toLowerCase();
    if (!q) return clientes.slice(0, 8);
    return clientes.filter((c) => `${c.nombre} ${c.apellidos} ${c.telefono}`.toLowerCase().includes(q)).slice(0, 8);
  }, [clientes, buscarCliente]);

  const sinCoincidenciasCliente = buscarCliente.trim().length > 0 && sugerenciasCliente.length === 0;
  const clienteElegido = clientes.find((c) => c.id === clienteId);

  const presupuestosFiltrados = useMemo(() => {
    const q = buscarPresupuesto.trim().toLowerCase();
    if (!q) return presupuestosSinPlanning;
    return presupuestosSinPlanning.filter((p) => `${p.numero ?? ''} ${p.cliente_nombre ?? ''}`.toLowerCase().includes(q));
  }, [presupuestosSinPlanning, buscarPresupuesto]);

  const presupuestosDelCliente = useMemo(() => {
    if (!clienteElegido) return [];
    const tel = normalizarTelefono(clienteElegido.telefono);
    return presupuestosSinPlanning.filter((p) => p.cliente_tel && normalizarTelefono(p.cliente_tel) === tel);
  }, [presupuestosSinPlanning, clienteElegido]);

  const elegirPresupuesto = (p: Presupuesto) => {
    setPresupuestoElegido(p);
    setFechaInicio(p.fecha_emision ?? '');
  };

  const handleCrear = () => {
    if (!presupuestoElegido) return;
    if (!nombreObra.trim()) {
      setNombreObraError('Obligatorio');
      return;
    }
    onCrear({ presupuesto: presupuestoElegido, nombreObra: nombreObra.trim(), fechaInicio: fechaInicio || null });
  };

  if (presupuestoElegido) {
    return (
      <div className="max-w-2xl mx-auto animate-[scale-in_180ms_ease-out]">
        <button
          onClick={() => setPresupuestoElegido(null)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5"
        >
          <ArrowLeft size={15} />
          Elegir otro presupuesto
        </button>

        <h1 className="text-xl font-bold text-gray-900 mb-1">Nuevo planning de obra</h1>
        <p className="text-sm text-gray-500 mb-6">Ponle nombre a la obra para crear el planning.</p>

        <div className="border border-gray-200 rounded-sm px-3 py-2.5 bg-brand-light mb-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">
              {presupuestoElegido.numero} · {presupuestoElegido.cliente_nombre}
            </p>
            <p className="text-xs text-gray-500">{presupuestoElegido.cliente_dir}</p>
          </div>
          <span className="text-sm text-gray-700 font-medium">
            {calcularTotales(presupuestoElegido.lineas).totalConIva.toFixed(2)} €
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Nombre de la obra"
            required
            value={nombreObra}
            error={nombreObraError}
            onChange={(e) => {
              setNombreObra(e.target.value);
              if (e.target.value.trim()) setNombreObraError('');
            }}
            placeholder="Ej. Reforma integral de baño"
          />
          <FechaPicker label="Fecha de inicio" value={fechaInicio} onChange={setFechaInicio} />
        </div>

        <div className="flex gap-2 mt-5">
          <Button variant="secondary" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button onClick={handleCrear} disabled={creando}>
            {creando ? 'Creando...' : 'Crear planning de obra'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto animate-[scale-in_180ms_ease-out]">
      <button onClick={onCancelar} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5">
        <ArrowLeft size={15} />
        Volver a planning de obra
      </button>

      <h1 className="text-xl font-bold text-gray-900 mb-1">Nuevo planning de obra</h1>
      <p className="text-sm text-gray-500 mb-6">Vincula la obra a un presupuesto aceptado, buscando directamente o por cliente.</p>

      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setModo('presupuesto')}
          className={`flex-1 flex items-center justify-center gap-1.5 border rounded-sm py-2 text-sm font-medium ${
            modo === 'presupuesto' ? 'border-brand bg-brand-light text-brand' : 'border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
        >
          <FileText size={14} />
          Por presupuesto
        </button>
        <button
          onClick={() => setModo('cliente')}
          className={`flex-1 flex items-center justify-center gap-1.5 border rounded-sm py-2 text-sm font-medium ${
            modo === 'cliente' ? 'border-brand bg-brand-light text-brand' : 'border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
        >
          <Users size={14} />
          Por cliente
        </button>
      </div>

      {modo === 'presupuesto' ? (
        <section>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-8"
              placeholder="Buscar por número o cliente..."
              value={buscarPresupuesto}
              onChange={(e) => setBuscarPresupuesto(e.target.value)}
            />
          </div>
          {presupuestosFiltrados.length === 0 && (
            <p className="text-sm text-gray-400 py-6 text-center">
              {presupuestosSinPlanning.length === 0
                ? 'No hay presupuestos aceptados sin planning todavía.'
                : 'Sin coincidencias.'}
            </p>
          )}
          <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto">
            {presupuestosFiltrados.map((p) => (
              <TarjetaPresupuesto key={p.id} p={p} onClick={() => elegirPresupuesto(p)} />
            ))}
          </div>
        </section>
      ) : (
        <section>
          {clienteElegido ? (
            <div>
              <div className="flex items-center justify-between border border-gray-200 rounded-sm px-3 py-2.5 bg-brand-light mb-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {clienteElegido.nombre} {clienteElegido.apellidos}
                  </p>
                  <p className="text-xs text-gray-500">{clienteElegido.telefono}</p>
                </div>
                <button
                  onClick={() => {
                    setClienteId('');
                    setBuscarCliente('');
                  }}
                  className="text-xs text-gray-500 hover:text-red-600"
                >
                  Cambiar
                </button>
              </div>

              {presupuestosDelCliente.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Presupuestos de este cliente
                  </p>
                  {presupuestosDelCliente.map((p) => (
                    <TarjetaPresupuesto key={p.id} p={p} onClick={() => elegirPresupuesto(p)} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 border border-dashed border-gray-200 rounded-sm">
                  <p className="text-sm text-gray-400 mb-3">Este cliente no tiene presupuestos aceptados pendientes de planning.</p>
                  <Button size="sm" variant="secondary" onClick={() => navigate('/finanzas/presupuestos')}>
                    Crear presupuesto para este cliente
                  </Button>
                </div>
              )}
            </div>
          ) : creandoCliente ? (
            <div className="border border-gray-200 rounded-sm p-3.5 animate-[scale-in_150ms_ease-out]">
              <p className="text-xs text-gray-500 mb-3">Cliente nuevo — rellena sus datos (los mismos que al registrar una visita)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <Input
                  label="Nombre"
                  value={clienteNuevo.nombre}
                  onChange={(e) => setClienteNuevo((c) => ({ ...c, nombre: e.target.value }))}
                />
                <Input
                  label="Apellidos"
                  value={clienteNuevo.apellidos}
                  onChange={(e) => setClienteNuevo((c) => ({ ...c, apellidos: e.target.value }))}
                />
                <Input
                  label="Teléfono"
                  value={clienteNuevo.telefono}
                  onChange={(e) => setClienteNuevo((c) => ({ ...c, telefono: e.target.value }))}
                />
                <Input
                  label="Email"
                  value={clienteNuevo.email}
                  onChange={(e) => setClienteNuevo((c) => ({ ...c, email: e.target.value }))}
                />
                <div className="col-span-2">
                  <MapsAutocomplete
                    label="Dirección"
                    value={clienteNuevo.direccion}
                    onChange={(direccion) => setClienteNuevo((c) => ({ ...c, direccion }))}
                    onSelect={(lugar) =>
                      setClienteNuevo((c) => ({
                        ...c,
                        direccion: lugar.direccion,
                        lat: lugar.lat,
                        lng: lugar.lng,
                        pais: lugar.pais || c.pais,
                        zona: lugar.pais && lugar.pais !== c.pais ? zonaDefault(lugar.pais) : c.zona,
                      }))
                    }
                  />
                </div>
                <Select
                  label="País"
                  options={[{ value: 'España', label: 'España' }, { value: 'Francia', label: 'Francia' }]}
                  value={clienteNuevo.pais}
                  onChange={(e) => setClienteNuevo((c) => ({ ...c, pais: e.target.value, zona: zonaDefault(e.target.value) }))}
                />
                <Select
                  label="Zona"
                  options={(clienteNuevo.pais === 'España' ? ZONAS_ES : ZONAS_FR).map((v) => ({ value: v, label: v }))}
                  value={clienteNuevo.zona}
                  onChange={(e) => setClienteNuevo((c) => ({ ...c, zona: e.target.value }))}
                />
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Un cliente nuevo todavía no tiene presupuestos — tras guardarlo, créale uno desde Presupuestos y luego vincula ese
                presupuesto aquí.
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setCreandoCliente(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  disabled={!clienteNuevo.nombre.trim()}
                  onClick={() => navigate('/finanzas/presupuestos')}
                >
                  Ir a crear su presupuesto
                </Button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  className="pl-8"
                  placeholder="Buscar cliente por nombre o teléfono..."
                  value={buscarCliente}
                  onChange={(e) => {
                    setBuscarCliente(e.target.value);
                    setListaClienteAbierta(true);
                  }}
                  onFocus={() => setListaClienteAbierta(true)}
                  onBlur={() => setTimeout(() => setListaClienteAbierta(false), 150)}
                />
              </div>
              {listaClienteAbierta && (
                <div className="absolute z-10 mt-1 w-full bg-surface border border-gray-200 rounded-sm shadow-sm max-h-64 overflow-y-auto">
                  {!buscarCliente.trim() && (
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
                        setClienteNuevo((c) => ({ ...c, nombre: buscarCliente }));
                        setCreandoCliente(true);
                        setListaClienteAbierta(false);
                      }}
                      className="w-full flex items-center gap-1.5 text-left px-3 py-2.5 text-sm text-brand hover:bg-brand-light"
                    >
                      <UserPlus size={14} className="shrink-0" />
                      Crear cliente nuevo: "{buscarCliente}"
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
      )}
    </div>
  );
}
