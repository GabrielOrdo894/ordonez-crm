import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Star,
  Pencil,
  LayoutGrid,
  User,
  GitBranch,
  StickyNote,
  Wallet,
  Wrench,
  FileText,
  Receipt,
  ClipboardList,
  Shield,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { notaSistema } from '../../lib/notaSistema';
import { actualizarEtapaPipeline } from '../../lib/pipelineSync';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge, estadoToVariant } from '../../components/ui/Badge';
import { calcularTotales } from '../finanzas/lineas';
import { direccionEnDosLineas } from '../../lib/direcciones';
import type { Linea } from '../finanzas/lineas';
import { RecordatorioPagoModal } from '../finanzas/facturas/RecordatorioPagoModal';
import type { Factura } from '../finanzas/facturas/types';
import { GaleriaForm } from '../galeria/GaleriaForm';
import { ClientePrivacidadTab } from './ClientePrivacidadTab';
import { fechaVisitaCorta } from '../../lib/fechas';
import { ETAPAS_PIPELINE, normalizarTelefono } from './types';
import type { Cliente } from './types';
import type { Proyecto } from '../planning/PlanningObraPage';

type NotaCliente = {
  id: string;
  created_at: string;
  visita_id: string;
  tipo: string;
  texto: string;
  autor: string;
};

type PresupuestoResumen = {
  id: string;
  numero: string | null;
  visita_id: string | null;
  fecha_emision: string | null;
  estado: string;
  cliente_tel: string | null;
  lineas: Linea[];
};

const VARIANTE_ESTADO_PRESUPUESTO: Record<string, 'pendiente' | 'confirmada' | 'realizada' | 'cancelada' | 'default'> = {
  Borrador: 'default',
  Pendiente: 'pendiente',
  Aceptado: 'realizada',
  Rechazado: 'cancelada',
};

const VARIANTE_ESTADO_FACTURA: Record<string, 'pendiente' | 'confirmada' | 'realizada' | 'cancelada' | 'vencida' | 'default'> = {
  Pendiente: 'pendiente',
  Cobrada: 'realizada',
  'Cobrada parcialmente': 'confirmada',
  Vencida: 'vencida',
};

export const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'datos', label: 'Datos' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'notas', label: 'Notas' },
  { key: 'finanzas', label: 'Finanzas' },
  { key: 'privacidad', label: 'Privacidad' },
] as const;

export type TabKey = (typeof TABS)[number]['key'];

const ICONO_TAB: Record<TabKey, LucideIcon> = {
  resumen: LayoutGrid,
  datos: User,
  pipeline: GitBranch,
  notas: StickyNote,
  finanzas: Wallet,
  privacidad: Shield,
};

const ZONAS_ES = ['Irún', 'Hondarribia', 'Donostia/San Sebastián', 'Rentería', 'Bera de Bidasoa', 'Otro ES'];
const ZONAS_FR = ['Hendaye', 'Urrugne', 'Saint-Jean-de-Luz', 'Bayonne', 'Autre FR'];

type FormEdicion = {
  nombre: string;
  apellidos: string;
  telefono: string;
  email: string;
  idioma: string;
  direccion: string;
  direccion_extra: string;
  pais: string;
  zona: string;
};

function formDesdeVisita(v: Cliente['visitas'][number]): FormEdicion {
  return {
    nombre: v.nombre,
    apellidos: v.apellidos,
    telefono: v.telefono,
    email: v.email ?? '',
    idioma: v.idioma ?? 'Español',
    direccion: v.direccion ?? '',
    direccion_extra: v.direccion_extra ?? '',
    pais: v.pais ?? 'España',
    zona: v.zona ?? '',
  };
}

type ClienteDetalleContenidoProps = {
  cliente: Cliente;
  tabInicial?: TabKey;
  onPurgado: () => void;
};

// Contenido de la ficha de cliente (pestañas + datos vinculados) — se muestra dentro de un
// Modal (ClienteFicha.tsx, usado desde Pipeline y desde el detalle de un presupuesto/factura) o
// a página completa (ClienteDetallePage.tsx, usado desde la tabla de Clientes).
export function ClienteDetalleContenido({ cliente, tabInicial, onPurgado }: ClienteDetalleContenidoProps) {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>(tabInicial ?? 'resumen');
  const [notaTexto, setNotaTexto] = useState('');
  const [mostrarFormGaleria, setMostrarFormGaleria] = useState(false);
  const [editandoDatos, setEditandoDatos] = useState(false);
  const [formEdicion, setFormEdicion] = useState<FormEdicion | null>(null);

  useEffect(() => {
    setTab(tabInicial ?? 'resumen');
    setEditandoDatos(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente.telefono]);

  const nombreUsuarioActual = (user?.user_metadata?.nombre as string) || user?.email || 'Sistema';
  const ultimaVisita = cliente.visitas[0] ?? null;
  const visitaIds = useMemo(() => cliente.visitas.map((v) => v.id), [cliente]);

  const iniciarEdicion = () => {
    if (!ultimaVisita) return;
    setFormEdicion(formDesdeVisita(ultimaVisita));
    setEditandoDatos(true);
  };

  const guardarDatosMutation = useMutation({
    mutationFn: async (datos: FormEdicion) => {
      if (!ultimaVisita) throw new Error('Sin visita de referencia');
      const { error } = await supabase
        .from('visitas')
        .update({
          nombre: datos.nombre,
          apellidos: datos.apellidos,
          telefono: datos.telefono,
          email: datos.email || null,
          idioma: datos.idioma,
          direccion: datos.direccion,
          direccion_extra: datos.direccion_extra || null,
          pais: datos.pais,
          zona: datos.zona,
        })
        .eq('id', ultimaVisita.id);
      if (error) throw error;
      await notaSistema(ultimaVisita.id, `Datos del cliente actualizados por ${nombreUsuarioActual}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visitas'] });
      toast.success('Datos del cliente actualizados');
      setEditandoDatos(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const moverPipelineMutation = useMutation({
    mutationFn: async (etapa: string) => {
      if (!ultimaVisita) throw new Error('Sin visita de referencia');
      await actualizarEtapaPipeline(ultimaVisita.id, etapa, nombreUsuarioActual);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visitas'] });
      toast.success('Pipeline actualizado');
    },
    onError: (error) => toast.error(error.message),
  });

  const { data: notas, isLoading: cargandoNotas } = useQuery({
    queryKey: ['notas_cliente', visitaIds],
    enabled: tab === 'notas' && visitaIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notas_cliente')
        .select('*')
        .in('visita_id', visitaIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as NotaCliente[];
    },
  });

  const agregarNotaMutation = useMutation({
    mutationFn: async (texto: string) => {
      if (!ultimaVisita) throw new Error('Sin visita de referencia');
      const { error } = await supabase
        .from('notas_cliente')
        .insert({ visita_id: ultimaVisita.id, tipo: 'manual', texto, autor: nombreUsuarioActual });
      if (error) throw error;
    },
    onSuccess: () => {
      setNotaTexto('');
      queryClient.invalidateQueries({ queryKey: ['notas_cliente', visitaIds] });
      toast.success('Nota añadida');
    },
    onError: (error) => toast.error(error.message),
  });

  const telefonoCliente = normalizarTelefono(cliente.telefono);

  const { data: presupuestos, isLoading: cargandoPresupuestos } = useQuery({
    queryKey: ['presupuestos', 'cliente_tel'],
    enabled: (tab === 'finanzas' || tab === 'pipeline' || tab === 'resumen') && !!telefonoCliente,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('id, numero, visita_id, fecha_emision, estado, cliente_tel, lineas')
        .is('eliminado_en', null)
        .not('cliente_tel', 'is', null);
      if (error) throw error;
      return data as PresupuestoResumen[];
    },
  });

  const { data: facturas, isLoading: cargandoFacturas } = useQuery({
    queryKey: ['facturas', 'cliente_tel'],
    enabled: (tab === 'finanzas' || tab === 'resumen') && !!telefonoCliente,
    queryFn: async () => {
      const { data, error } = await supabase.from('facturas').select('*').is('eliminado_en', null).not('cliente_tel', 'is', null);
      if (error) throw error;
      return data as Factura[];
    },
  });

  const { data: proyectos, isLoading: cargandoProyectos } = useQuery({
    queryKey: ['proyectos', 'cliente', visitaIds],
    enabled: tab === 'resumen' && visitaIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('proyectos').select('*').in('visita_id', visitaIds);
      if (error) throw error;
      return data as Proyecto[];
    },
  });

  const [recordandoPago, setRecordandoPago] = useState<Factura | null>(null);

  const presupuestosCliente = useMemo(
    () => (presupuestos ?? []).filter((p) => p.cliente_tel && normalizarTelefono(p.cliente_tel) === telefonoCliente),
    [presupuestos, telefonoCliente],
  );

  const facturasCliente = useMemo(
    () => (facturas ?? []).filter((f) => f.cliente_tel && normalizarTelefono(f.cliente_tel) === telefonoCliente),
    [facturas, telefonoCliente],
  );

  const totalFacturado = useMemo(
    () =>
      presupuestosCliente
        .filter((p) => p.estado === 'Aceptado')
        .reduce((s, p) => s + calcularTotales(p.lineas).totalConIva, 0),
    [presupuestosCliente],
  );

  const importePorVisita = (visitaId: string) => {
    const p = presupuestosCliente.find((pp) => pp.visita_id === visitaId && pp.estado === 'Aceptado');
    return p ? calcularTotales(p.lineas).totalConIva : null;
  };

  if (!ultimaVisita) return null;

  return (
    <div>
      <div className="flex mb-5 overflow-x-auto">
        <div className="inline-flex items-center gap-1 bg-gray-100 rounded-full p-1">
          {TABS.map((t) => {
            const Icon = ICONO_TAB[t.key];
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide transition-colors ${
                  tab === t.key ? 'bg-surface text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon size={13} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'resumen' && (
        <div className="flex flex-col gap-5">
          <div>
            <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-gray-400">
                <Wrench size={13} />
                Visitas ({cliente.visitas.length})
              </p>
              <button onClick={() => setTab('pipeline')} className="text-xs text-brand hover:underline">
                Ver todo →
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {cliente.visitas.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-2 flex-wrap text-sm border border-gray-200 rounded-sm px-3 py-2 hover:bg-brand-light/40 transition-colors">
                  <div>
                    <p className="text-gray-900">{fechaVisitaCorta(v.fecha_visita)}</p>
                    <p className="text-xs text-gray-500">
                      {v.tipo} · {v.estado_pipeline}
                    </p>
                  </div>
                  <Badge variant={estadoToVariant(v.estado)}>{v.estado}</Badge>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-gray-400">
                <FileText size={13} />
                Presupuestos ({presupuestosCliente.length})
              </p>
              <button onClick={() => setTab('finanzas')} className="text-xs text-brand hover:underline">
                Ver todo →
              </button>
            </div>
            {cargandoPresupuestos && <p className="text-sm text-gray-400">Cargando...</p>}
            {!cargandoPresupuestos && presupuestosCliente.length === 0 && <p className="text-sm text-gray-400">Sin presupuestos</p>}
            <div className="flex flex-col gap-2">
              {presupuestosCliente.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 flex-wrap text-sm border border-gray-200 rounded-sm px-3 py-2 hover:bg-brand-light/40 transition-colors">
                  <div>
                    <p className="text-gray-900">{p.numero ?? 'Sin número'}</p>
                    <p className="text-xs text-gray-500">{p.fecha_emision ?? 'Sin fecha'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-700">{calcularTotales(p.lineas).totalConIva.toFixed(2)} €</span>
                    <Badge variant={VARIANTE_ESTADO_PRESUPUESTO[p.estado] ?? 'default'}>{p.estado}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-gray-400">
                <Receipt size={13} />
                Facturas ({facturasCliente.length})
              </p>
              <button onClick={() => setTab('finanzas')} className="text-xs text-brand hover:underline">
                Ver todo →
              </button>
            </div>
            {cargandoFacturas && <p className="text-sm text-gray-400">Cargando...</p>}
            {!cargandoFacturas && facturasCliente.length === 0 && <p className="text-sm text-gray-400">Sin facturas</p>}
            <div className="flex flex-col gap-2">
              {facturasCliente.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 flex-wrap text-sm border border-gray-200 rounded-sm px-3 py-2 hover:bg-brand-light/40 transition-colors">
                  <div>
                    <p className="text-gray-900">{f.numero ?? 'Sin número'}</p>
                    <p className="text-xs text-gray-500">{f.fecha_factura ?? 'Sin fecha'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-700">{calcularTotales(f.lineas).totalConIva.toFixed(2)} €</span>
                    <Badge variant={VARIANTE_ESTADO_FACTURA[f.estado_cobro] ?? 'default'}>{f.estado_cobro}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-2">
              <ClipboardList size={13} />
              Planning de obra ({proyectos?.length ?? 0})
            </p>
            {cargandoProyectos && <p className="text-sm text-gray-400">Cargando...</p>}
            {!cargandoProyectos && (proyectos?.length ?? 0) === 0 && <p className="text-sm text-gray-400">Sin planning de obra</p>}
            <div className="flex flex-col gap-2">
              {proyectos?.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 flex-wrap text-sm border border-gray-200 rounded-sm px-3 py-2 hover:bg-brand-light/40 transition-colors">
                  <div>
                    <p className="text-gray-900">{p.nombre_obra}</p>
                    <p className="text-xs text-gray-500">
                      {p.fecha_inicio ?? 'Sin fecha de inicio'} · {p.fases.length} fase{p.fases.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <Badge variant={estadoToVariant(p.estado)}>{p.estado}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'datos' && !editandoDatos && (
        <div className="text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Teléfono</p>
              <p className="text-gray-900">{cliente.telefono}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Email</p>
              <p className="text-gray-900">{cliente.email || '—'}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs uppercase tracking-wide text-gray-400">Dirección</p>
              {ultimaVisita.direccion ? (
                direccionEnDosLineas(ultimaVisita.direccion)
                  .filter(Boolean)
                  .map((linea, i) => (
                    <p key={i} className="text-gray-900">{linea}</p>
                  ))
              ) : (
                <p className="text-gray-900">—</p>
              )}
              {ultimaVisita.direccion_extra && <p className="text-xs text-gray-500 mt-0.5">{ultimaVisita.direccion_extra}</p>}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Zona</p>
              <p className="text-gray-900">
                {cliente.zona} · {cliente.pais}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Tipo de reforma</p>
              <p className="text-gray-900">{ultimaVisita.tipo || '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Idioma</p>
              <p className="text-gray-900">{ultimaVisita.idioma || '—'}</p>
            </div>
          </div>
          <button
            onClick={iniciarEdicion}
            className="flex items-center gap-1.5 text-xs text-brand hover:underline pt-3 mt-3 border-t border-gray-200"
          >
            <Pencil size={12} />
            Editar datos del cliente
          </button>
        </div>
      )}

      {tab === 'datos' && editandoDatos && formEdicion && (
        <div className="text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Nombre"
              value={formEdicion.nombre}
              onChange={(e) => setFormEdicion((f) => f && { ...f, nombre: e.target.value })}
            />
            <Input
              label="Apellidos"
              value={formEdicion.apellidos}
              onChange={(e) => setFormEdicion((f) => f && { ...f, apellidos: e.target.value })}
            />
            <Input
              label="Teléfono"
              type="tel"
              value={formEdicion.telefono}
              onChange={(e) => setFormEdicion((f) => f && { ...f, telefono: e.target.value })}
            />
            <Input
              label="Email"
              type="email"
              value={formEdicion.email}
              onChange={(e) => setFormEdicion((f) => f && { ...f, email: e.target.value })}
            />
            <div className="col-span-2">
              <Input
                label="Dirección"
                value={formEdicion.direccion}
                onChange={(e) => setFormEdicion((f) => f && { ...f, direccion: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Input
                label="Piso / puerta / referencia (opcional)"
                hint="Ej.: 2º piso, puerta B — étage 4, porte gauche"
                value={formEdicion.direccion_extra}
                onChange={(e) => setFormEdicion((f) => f && { ...f, direccion_extra: e.target.value })}
              />
            </div>
            <Select
              label="País"
              options={[{ value: 'España', label: 'España' }, { value: 'Francia', label: 'Francia' }]}
              value={formEdicion.pais}
              onChange={(e) =>
                setFormEdicion((f) => f && { ...f, pais: e.target.value, zona: e.target.value === 'España' ? 'Irún' : 'Hendaye' })
              }
            />
            <Select
              label="Zona"
              options={(formEdicion.pais === 'España' ? ZONAS_ES : ZONAS_FR).map((v) => ({ value: v, label: v }))}
              value={formEdicion.zona}
              onChange={(e) => setFormEdicion((f) => f && { ...f, zona: e.target.value })}
            />
            <Select
              label="Idioma"
              options={[{ value: 'Español', label: 'Español' }, { value: 'Français', label: 'Français' }]}
              value={formEdicion.idioma}
              onChange={(e) => setFormEdicion((f) => f && { ...f, idioma: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2 pt-3 mt-3 border-t border-gray-200">
            <Button
              size="sm"
              disabled={guardarDatosMutation.isPending}
              onClick={() => formEdicion && guardarDatosMutation.mutate(formEdicion)}
            >
              {guardarDatosMutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditandoDatos(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {tab === 'pipeline' && (
        <div>
          <div className="flex flex-wrap gap-2 mb-4">
            {[...ETAPAS_PIPELINE, 'Perdido'].map((etapa) => (
              <button
                key={etapa}
                onClick={() => moverPipelineMutation.mutate(etapa)}
                disabled={moverPipelineMutation.isPending}
                className={`px-2.5 py-1 rounded-sm text-xs border ${
                  ultimaVisita.estado_pipeline === etapa
                    ? 'bg-brand text-white border-brand'
                    : 'bg-surface border-gray-200 text-gray-600 hover:border-brand'
                }`}
              >
                {etapa}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap border-b border-gray-200 pb-2 mb-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              Obras anteriores ({cliente.visitas.length})
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              {cliente.visitas.length > 1 && (
                <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
                  <Star size={12} /> Cliente fidelizado
                </span>
              )}
              <button onClick={() => setMostrarFormGaleria(true)} className="text-xs text-brand hover:underline">
                + Añadir a galería
              </button>
            </div>
          </div>
          {totalFacturado > 0 && (
            <p className="text-xs text-gray-500 mb-2">
              Total facturado (presupuestos aceptados): <span className="font-semibold text-gray-800">{totalFacturado.toFixed(2)} €</span>
            </p>
          )}
          <div className="flex flex-col gap-2">
            {cliente.visitas.map((v) => {
              const importe = importePorVisita(v.id);
              return (
                <div key={v.id} className="flex items-center justify-between gap-2 flex-wrap text-sm border border-gray-200 rounded-sm px-3 py-2">
                  <div>
                    <p className="text-gray-900">{fechaVisitaCorta(v.fecha_visita)}</p>
                    <p className="text-xs text-gray-500">
                      {v.tipo} · {v.estado_pipeline}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {importe != null && <span className="text-xs text-gray-600">{importe.toFixed(2)} €</span>}
                    <Badge variant={estadoToVariant(v.estado)}>{v.estado}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'notas' && (
        <div>
          <div className="flex gap-2 mb-4">
            <Input
              value={notaTexto}
              onChange={(e) => setNotaTexto(e.target.value)}
              placeholder="Escribe una nota..."
              className="flex-1"
            />
            <Button
              size="sm"
              disabled={!notaTexto.trim() || agregarNotaMutation.isPending}
              onClick={() => agregarNotaMutation.mutate(notaTexto.trim())}
            >
              Añadir
            </Button>
          </div>

          {cargandoNotas && <p className="text-sm text-gray-400">Cargando notas...</p>}
          {!cargandoNotas && (notas?.length ?? 0) === 0 && <p className="text-sm text-gray-400">Sin notas</p>}
          <div className="flex flex-col gap-2">
            {notas?.map((n) => (
              <div key={n.id} className="border border-gray-200 rounded-sm px-3 py-2">
                <p className={`text-sm ${n.tipo === 'sistema' ? 'italic text-gray-500' : 'text-gray-900'}`}>
                  {n.texto}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {n.autor} · {new Date(n.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'finanzas' && (
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-2">
              Presupuestos ({presupuestosCliente.length})
            </p>
            {cargandoPresupuestos && <p className="text-sm text-gray-400">Cargando...</p>}
            {!cargandoPresupuestos && presupuestosCliente.length === 0 && (
              <p className="text-sm text-gray-400">Sin presupuestos</p>
            )}
            <div className="flex flex-col gap-2">
              {presupuestosCliente.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 flex-wrap text-sm border border-gray-200 rounded-sm px-3 py-2">
                  <div>
                    <p className="text-gray-900">{p.numero ?? 'Sin número'}</p>
                    <p className="text-xs text-gray-500">{p.fecha_emision ?? 'Sin fecha'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-700">{calcularTotales(p.lineas).totalConIva.toFixed(2)} €</span>
                    <Badge variant={VARIANTE_ESTADO_PRESUPUESTO[p.estado] ?? 'default'}>{p.estado}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-2">
              Facturas ({facturasCliente.length})
            </p>
            {cargandoFacturas && <p className="text-sm text-gray-400">Cargando...</p>}
            {!cargandoFacturas && facturasCliente.length === 0 && (
              <p className="text-sm text-gray-400">Sin facturas</p>
            )}
            <div className="flex flex-col gap-2">
              {facturasCliente.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 flex-wrap text-sm border border-gray-200 rounded-sm px-3 py-2">
                  <div>
                    <p className="text-gray-900">{f.numero ?? 'Sin número'}</p>
                    <p className="text-xs text-gray-500">{f.fecha_factura ?? 'Sin fecha'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-700">{calcularTotales(f.lineas).totalConIva.toFixed(2)} €</span>
                    <Badge variant={VARIANTE_ESTADO_FACTURA[f.estado_cobro] ?? 'default'}>{f.estado_cobro}</Badge>
                    {f.estado_cobro !== 'Cobrada' && (
                      <button
                        onClick={() => setRecordandoPago(f)}
                        className="text-xs text-brand hover:underline"
                      >
                        Recordar pago
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'privacidad' && <ClientePrivacidadTab cliente={cliente} visitaIds={visitaIds} onPurgado={onPurgado} />}

      <RecordatorioPagoModal factura={recordandoPago} onClose={() => setRecordandoPago(null)} />

      <GaleriaForm
        open={mostrarFormGaleria}
        onClose={() => setMostrarFormGaleria(false)}
        visitaPrefill={{
          visita_id: ultimaVisita.id,
          titulo: `${ultimaVisita.tipo ?? 'Reforma'} — ${cliente.nombre} ${cliente.apellidos}`,
          tipo_obra: ultimaVisita.tipo ?? '',
          zona: ultimaVisita.zona ?? '',
        }}
      />
    </div>
  );
}
