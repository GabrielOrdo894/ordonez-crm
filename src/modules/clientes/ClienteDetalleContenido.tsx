import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  AlertTriangle,
  History,
  Download,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { notaSistema } from '../../lib/notaSistema';
import { camposContactoFaltantes } from '../../lib/datosContacto';
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
import { generarPdfFichaCliente } from '../../lib/generarPdfFichaCliente';
import { conAvisoDescarga } from '../../lib/conAvisoDescarga';
import { mensajeError } from '../../lib/mensajeError';
import { useCatalogosVisitas } from '../visitas/useCatalogosVisitas';
import { useEtiquetasClientes } from './useEtiquetasClientes';
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
  fecha_seguimiento: string | null;
};

type PresupuestoResumen = {
  id: string;
  numero: string | null;
  visita_id: string | null;
  fecha_emision: string | null;
  estado: string;
  tipo: string | null;
  cliente_tel: string | null;
  lineas: Linea[];
};

const VARIANTE_ESTADO_PRESUPUESTO: Record<
  string,
  'pendiente' | 'confirmada' | 'realizada' | 'cancelada' | 'default'
> = {
  Borrador: 'default',
  Pendiente: 'pendiente',
  Aceptado: 'realizada',
  Rechazado: 'cancelada',
};

const VARIANTE_ESTADO_FACTURA: Record<
  string,
  'pendiente' | 'confirmada' | 'realizada' | 'cancelada' | 'vencida' | 'default'
> = {
  Pendiente: 'pendiente',
  Cobrada: 'realizada',
  'Cobrada parcialmente': 'confirmada',
  Vencida: 'vencida',
};

// Umbral de "próxima a vencer" — mismo criterio simple de 30 días usado ya en otras alertas por
// fecha del CRM (facturas/presupuestos a punto de caducar).
function estadoGarantia(fechaFin: string) {
  const hoy = new Date().toISOString().slice(0, 10);
  const dias = Math.round((new Date(fechaFin).getTime() - new Date(hoy).getTime()) / 86400000);
  if (dias < 0)
    return { texto: 'Garantía vencida', clase: 'bg-red-50 text-red-700 border-red-200' };
  if (dias <= 30)
    return {
      texto: `Garantía hasta el ${fechaFin} (vence pronto)`,
      clase: 'bg-amber-50 text-amber-700 border-amber-200',
    };
  return {
    texto: `En garantía hasta el ${fechaFin}`,
    clase: 'bg-brand-light text-brand border-brand-hover',
  };
}

export const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'datos', label: 'Datos' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'historial', label: 'Historial' },
  { key: 'notas', label: 'Notas' },
  { key: 'finanzas', label: 'Finanzas' },
  { key: 'privacidad', label: 'Privacidad' },
] as const;

export type TabKey = (typeof TABS)[number]['key'];

const ICONO_TAB: Record<TabKey, LucideIcon> = {
  resumen: LayoutGrid,
  datos: User,
  pipeline: GitBranch,
  historial: History,
  notas: StickyNote,
  finanzas: Wallet,
  privacidad: Shield,
};

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
  esEmpresa: boolean;
  empresaNombre: string;
  empresaCif: string;
  referidoPor: string;
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
    // es_empresa/empresa_nombre/empresa_cif se capturaban al crear el cliente pero no se podían
    // ver ni corregir después — para arreglar un CIF mal tecleado había que ir a Supabase
    // directamente (mejora real, auditoría de Clientes 2026-08-18).
    esEmpresa: v.es_empresa ?? false,
    empresaNombre: v.empresa_nombre ?? '',
    empresaCif: v.empresa_cif ?? '',
    referidoPor: v.referido_por ?? '',
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
export function ClienteDetalleContenido({
  cliente,
  tabInicial,
  onPurgado,
}: ClienteDetalleContenidoProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const catalogos = useCatalogosVisitas();
  const { etiquetasDe } = useEtiquetasClientes();
  const [tab, setTab] = useState<TabKey>(tabInicial ?? 'resumen');
  const [notaTexto, setNotaTexto] = useState('');
  const [notaFechaSeguimiento, setNotaFechaSeguimiento] = useState('');
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
          es_empresa: datos.esEmpresa,
          empresa_nombre: datos.esEmpresa ? datos.empresaNombre || null : null,
          empresa_cif: datos.esEmpresa ? datos.empresaCif || null : null,
          referido_por: datos.referidoPor || null,
        })
        .eq('id', ultimaVisita.id);
      if (error) throw error;
      await notaSistema(
        ultimaVisita.id,
        `Datos del cliente actualizados por ${nombreUsuarioActual}`,
      );
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
    enabled: (tab === 'notas' || tab === 'historial') && visitaIds.length > 0,
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
    mutationFn: async ({
      texto,
      fechaSeguimiento,
    }: {
      texto: string;
      fechaSeguimiento: string;
    }) => {
      if (!ultimaVisita) throw new Error('Sin visita de referencia');
      const { error } = await supabase.from('notas_cliente').insert({
        visita_id: ultimaVisita.id,
        tipo: 'manual',
        texto,
        autor: nombreUsuarioActual,
        fecha_seguimiento: fechaSeguimiento || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNotaTexto('');
      setNotaFechaSeguimiento('');
      queryClient.invalidateQueries({ queryKey: ['notas_cliente', visitaIds] });
      toast.success('Nota añadida');
    },
    onError: (error) => toast.error(error.message),
  });

  const telefonoCliente = normalizarTelefono(cliente.telefono);

  const { data: presupuestos, isLoading: cargandoPresupuestos } = useQuery({
    queryKey: ['presupuestos', 'cliente_tel'],
    enabled:
      (tab === 'finanzas' || tab === 'pipeline' || tab === 'resumen' || tab === 'historial') &&
      !!telefonoCliente,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('id, numero, visita_id, fecha_emision, estado, tipo, cliente_tel, lineas')
        .is('eliminado_en', null)
        .not('cliente_tel', 'is', null);
      if (error) throw error;
      return data as PresupuestoResumen[];
    },
  });

  const { data: facturas, isLoading: cargandoFacturas } = useQuery({
    queryKey: ['facturas', 'cliente_tel'],
    enabled: (tab === 'finanzas' || tab === 'resumen' || tab === 'historial') && !!telefonoCliente,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facturas')
        .select('*')
        .is('eliminado_en', null)
        .not('cliente_tel', 'is', null);
      if (error) throw error;
      return data as Factura[];
    },
  });

  const { data: proyectos, isLoading: cargandoProyectos } = useQuery({
    queryKey: ['proyectos', 'cliente', visitaIds],
    enabled: (tab === 'resumen' || tab === 'historial') && visitaIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proyectos')
        .select('*')
        .in('visita_id', visitaIds);
      if (error) throw error;
      return data as Proyecto[];
    },
  });

  const [recordandoPago, setRecordandoPago] = useState<Factura | null>(null);

  const presupuestosCliente = useMemo(
    () =>
      (presupuestos ?? []).filter(
        (p) => p.cliente_tel && normalizarTelefono(p.cliente_tel) === telefonoCliente,
      ),
    [presupuestos, telefonoCliente],
  );

  const facturasCliente = useMemo(
    () =>
      (facturas ?? []).filter(
        (f) => f.cliente_tel && normalizarTelefono(f.cliente_tel) === telefonoCliente,
      ),
    [facturas, telefonoCliente],
  );

  // "Facturado" solo puede significar que existe una factura real vinculada (facturas.presupuesto_id)
  // Y que ese dinero está confirmado — no basta con que la factura exista (podría seguir Pendiente
  // o Vencida, sin cobrar un céntimo todavía). Antes esta cifra sumaba presupuestos Aceptado y se
  // etiquetaba "Total facturado", así que un orientativo aceptado (que por diseño nunca se factura,
  // ver PresupuestosPage.tsx) aparecía como si estuviera facturado (bug real reportado por Gabriel
  // 2026-08-28, caso Xabier Urtizbere: P-2026-0042 orientativo/Aceptado, 0 facturas reales).
  // `monto_pagado` solo se rellena (RegistrarPagoModal.tsx) al registrar un cobro real — es la única
  // constancia fiable de que el dinero ha entrado, independiente del texto exacto de estado_cobro
  // (corrección 2026-08-28: al principio bastaba con que existiera la factura, sin comprobar cobro).
  const presupuestoIdsFacturados = useMemo(
    () =>
      new Set(
        (facturasCliente ?? [])
          .filter((f) => (f.monto_pagado ?? 0) > 0)
          .map((f) => f.presupuesto_id)
          .filter((id): id is string => !!id),
      ),
    [facturasCliente],
  );
  const totalFacturado = useMemo(
    () => facturasCliente.reduce((s, f) => s + calcularTotales(f.lineas).totalConIva, 0),
    [facturasCliente],
  );

  // Intercala visitas, notas, presupuestos, facturas y fases de planning por fecha en una sola
  // lista — antes reconstruir "qué pasó y cuándo" exigía saltar entre las pestañas Resumen, Notas
  // y Finanzas por separado (mejora real, auditoría de Clientes 2026-08-18).
  const historial = useMemo(() => {
    type Entrada = { fecha: string; icono: LucideIcon; titulo: string; detalle?: string };
    const entradas: Entrada[] = [];

    for (const v of cliente.visitas) {
      if (!v.fecha_visita) continue;
      entradas.push({
        fecha: v.fecha_visita,
        icono: Wrench,
        titulo: `Visita — ${v.tipo ?? 'Sin tipo'}`,
        detalle: `${v.estado ?? ''}${v.hora_visita ? ` · ${v.hora_visita.slice(0, 5)}` : ''}`,
      });
    }
    for (const n of notas ?? []) {
      entradas.push({
        fecha: n.created_at.slice(0, 10),
        icono: StickyNote,
        titulo: n.tipo === 'sistema' ? 'Nota del sistema' : 'Nota',
        detalle: n.texto,
      });
    }
    for (const p of presupuestosCliente) {
      if (!p.fecha_emision) continue;
      entradas.push({
        fecha: p.fecha_emision,
        icono: FileText,
        titulo: `Presupuesto ${p.numero ?? ''} — ${p.estado}`,
        detalle: `${calcularTotales(p.lineas).totalConIva.toFixed(2)} €`,
      });
    }
    for (const f of facturasCliente) {
      if (!f.fecha_factura) continue;
      entradas.push({
        fecha: f.fecha_factura,
        icono: Receipt,
        titulo: `Factura ${f.numero ?? ''} — ${f.estado_cobro}`,
        detalle: `${calcularTotales(f.lineas).totalConIva.toFixed(2)} €`,
      });
    }
    for (const p of proyectos ?? []) {
      for (const fase of p.fases) {
        const fecha = fase.fecha_fin ?? fase.fecha_inicio;
        if (!fecha) continue;
        entradas.push({
          fecha,
          icono: ClipboardList,
          titulo: `${p.nombre_obra} — ${fase.nombre}`,
          detalle: fase.completada ? 'Fase completada' : 'Fase programada',
        });
      }
    }

    return entradas.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [cliente.visitas, notas, presupuestosCliente, facturasCliente, proyectos]);

  // Fetch propio en vez de reutilizar `notas`/`presupuestosCliente`/`facturasCliente` —  esos
  // quedan gateados por `enabled: tab === ...` para no pedirlos si nadie mira esas pestañas, pero
  // el botón de descarga vive en la cabecera, visible desde cualquier pestaña, así que necesita
  // datos completos aunque el usuario nunca haya abierto Notas/Finanzas (mejora real, auditoría de
  // Clientes 2026-08-18).
  const descargarFicha = async () => {
    try {
      await conAvisoDescarga(async () => {
        const [
          { data: notasFrescas, error: errorNotas },
          { data: presFrescos, error: errorPres },
          { data: factFrescas, error: errorFact },
        ] = await Promise.all([
          supabase
            .from('notas_cliente')
            .select('*')
            .in('visita_id', visitaIds)
            .order('created_at', { ascending: false }),
          supabase
            .from('presupuestos')
            .select('id, numero, fecha_emision, estado, tipo, cliente_tel, lineas')
            .is('eliminado_en', null)
            .eq('cliente_tel', cliente.telefono),
          supabase
            .from('facturas')
            .select('*')
            .is('eliminado_en', null)
            .eq('cliente_tel', cliente.telefono),
        ]);
        if (errorNotas) throw errorNotas;
        if (errorPres) throw errorPres;
        if (errorFact) throw errorFact;
        const totalFacturadoFresco = ((factFrescas ?? []) as Factura[]).reduce(
          (s, f) => s + calcularTotales(f.lineas).totalConIva,
          0,
        );
        await generarPdfFichaCliente({
          nombre: cliente.nombre,
          apellidos: cliente.apellidos,
          telefono: cliente.telefono,
          email: cliente.email,
          zona: cliente.zona,
          pais: cliente.pais,
          clienteDesde: cliente.visitas[cliente.visitas.length - 1]?.fecha_visita ?? null,
          etapaPipeline: ultimaVisita.estado_pipeline,
          etiquetas: etiquetasDe(cliente.id),
          visitas: cliente.visitas.map((v) => ({
            fecha: v.fecha_visita,
            hora: v.hora_visita,
            tipo: v.tipo,
            estado: v.estado,
          })),
          presupuestos: ((presFrescos ?? []) as PresupuestoResumen[]).map((p) => ({
            numero: p.numero,
            fecha: p.fecha_emision,
            estado: p.estado,
            total: calcularTotales(p.lineas).totalConIva,
          })),
          facturas: ((factFrescas ?? []) as Factura[]).map((f) => ({
            numero: f.numero,
            fecha: f.fecha_factura,
            estado: f.estado_cobro,
            total: calcularTotales(f.lineas).totalConIva,
          })),
          totalFacturado: totalFacturadoFresco,
          notas: ((notasFrescas ?? []) as NotaCliente[]).map((n) => ({
            fecha: n.created_at.slice(0, 10),
            texto: n.texto,
            autor: n.autor,
          })),
        });
      }, toast);
    } catch (error) {
      toast.error(mensajeError(error));
    }
  };

  const importePorVisita = (visitaId: string): { total: number; esOrientativo: boolean } | null => {
    const aceptados = presupuestosCliente.filter((pp) => pp.visita_id === visitaId && pp.estado === 'Aceptado');
    // Si hay un normal y un orientativo aceptados para la misma visita, el normal es el importe real.
    const p = aceptados.find((pp) => pp.tipo !== 'orientativo') ?? aceptados[0];
    if (!p) return null;
    return { total: calcularTotales(p.lineas).totalConIva, esOrientativo: p.tipo === 'orientativo' };
  };

  if (!ultimaVisita) return null;

  const camposFaltantes = camposContactoFaltantes({
    nombre: cliente.nombre,
    telefono: cliente.telefono,
    direccion: ultimaVisita.direccion,
    email: cliente.email,
  });
  if (!cliente.apellidos?.trim()) camposFaltantes.splice(1, 0, 'apellidos');

  return (
    <div>
      {camposFaltantes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-sm px-3 py-2 mb-4 flex items-center gap-2">
          <AlertTriangle size={14} className="shrink-0" />
          Faltan datos de contacto: {camposFaltantes.join(', ')} — complétalos en la pestaña
          "Datos".
        </div>
      )}
      <div className="flex items-center justify-between gap-3 mb-5 overflow-x-auto">
        <div className="inline-flex items-center gap-1 bg-gray-100 rounded-full p-1">
          {TABS.map((t) => {
            const Icon = ICONO_TAB[t.key];
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide transition-colors ${
                  tab === t.key
                    ? 'bg-surface text-brand shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon size={13} />
                {t.label}
              </button>
            );
          })}
        </div>
        <button
          onClick={descargarFicha}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-brand shrink-0"
        >
          <Download size={13} />
          Descargar ficha
        </button>
      </div>

      {tab === 'resumen' && (
        <div className="flex flex-col gap-5">
          <div>
            <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-gray-400">
                <Wrench size={13} />
                Visitas ({cliente.visitas.length})
              </p>
              <button
                onClick={() => setTab('pipeline')}
                className="text-xs text-brand hover:underline"
              >
                Ver todo →
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {cliente.visitas.map((v) => (
                <div
                  key={v.id}
                  onClick={() => navigate(`/visitas/${v.id}`)}
                  className="flex items-center justify-between gap-2 flex-wrap text-sm border border-gray-200 rounded-sm px-3 py-2 hover:bg-brand-light/40 transition-colors cursor-pointer"
                >
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
              <button
                onClick={() => setTab('finanzas')}
                className="text-xs text-brand hover:underline"
              >
                Ver todo →
              </button>
            </div>
            {cargandoPresupuestos && <p className="text-sm text-gray-400">Cargando...</p>}
            {!cargandoPresupuestos && presupuestosCliente.length === 0 && (
              <p className="text-sm text-gray-400">Sin presupuestos</p>
            )}
            <div className="flex flex-col gap-2">
              {presupuestosCliente.map((p) => (
                <div
                  key={p.id}
                  onClick={() =>
                    navigate('/finanzas/presupuestos', { state: { verDocId: p.id, verDocTipo: 'presupuesto' } })
                  }
                  className="flex items-center justify-between gap-2 flex-wrap text-sm border border-gray-200 rounded-sm px-3 py-2 hover:bg-brand-light/40 transition-colors cursor-pointer"
                >
                  <div>
                    <p className="text-gray-900">{p.numero ?? 'Sin número'}</p>
                    <p className="text-xs text-gray-500">{p.fecha_emision ?? 'Sin fecha'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.tipo === 'orientativo' ? (
                      <Badge variant="pendiente">Orientativo</Badge>
                    ) : (
                      <span className="text-xs text-gray-400">Normal</span>
                    )}
                    <span className="text-gray-700">
                      {calcularTotales(p.lineas).totalConIva.toFixed(2)} €
                    </span>
                    <Badge variant={VARIANTE_ESTADO_PRESUPUESTO[p.estado] ?? 'default'}>
                      {p.estado}
                    </Badge>
                    {presupuestoIdsFacturados.has(p.id) && (
                      <Badge variant="confirmada">Facturado</Badge>
                    )}
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
              <button
                onClick={() => setTab('finanzas')}
                className="text-xs text-brand hover:underline"
              >
                Ver todo →
              </button>
            </div>
            {cargandoFacturas && <p className="text-sm text-gray-400">Cargando...</p>}
            {!cargandoFacturas && facturasCliente.length === 0 && (
              <p className="text-sm text-gray-400">Sin facturas</p>
            )}
            <div className="flex flex-col gap-2">
              {facturasCliente.map((f) => (
                <div
                  key={f.id}
                  onClick={() =>
                    navigate('/finanzas/facturas', { state: { verDocId: f.id, verDocTipo: 'factura' } })
                  }
                  className="flex items-center justify-between gap-2 flex-wrap text-sm border border-gray-200 rounded-sm px-3 py-2 hover:bg-brand-light/40 transition-colors cursor-pointer"
                >
                  <div>
                    <p className="text-gray-900">{f.numero ?? 'Sin número'}</p>
                    <p className="text-xs text-gray-500">{f.fecha_factura ?? 'Sin fecha'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-700">
                      {calcularTotales(f.lineas).totalConIva.toFixed(2)} €
                    </span>
                    <Badge variant={VARIANTE_ESTADO_FACTURA[f.estado_cobro] ?? 'default'}>
                      {f.estado_cobro}
                    </Badge>
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
            {!cargandoProyectos && (proyectos?.length ?? 0) === 0 && (
              <p className="text-sm text-gray-400">Sin planning de obra</p>
            )}
            <div className="flex flex-col gap-2">
              {proyectos?.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 flex-wrap text-sm border border-gray-200 rounded-sm px-3 py-2 hover:bg-brand-light/40 transition-colors"
                >
                  <div>
                    <p className="text-gray-900">{p.nombre_obra}</p>
                    <p className="text-xs text-gray-500">
                      {p.fecha_inicio ?? 'Sin fecha de inicio'} · {p.fases.length} fase
                      {p.fases.length !== 1 ? 's' : ''}
                    </p>
                    {p.fecha_fin_garantia && (
                      <span
                        className={`inline-block text-[11px] font-medium rounded-full px-2 py-0.5 border mt-1 ${estadoGarantia(p.fecha_fin_garantia).clase}`}
                      >
                        {estadoGarantia(p.fecha_fin_garantia).texto}
                      </span>
                    )}
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
                    <p key={i} className="text-gray-900">
                      {linea}
                    </p>
                  ))
              ) : (
                <p className="text-gray-900">—</p>
              )}
              {ultimaVisita.direccion_extra && (
                <p className="text-xs text-gray-500 mt-0.5">{ultimaVisita.direccion_extra}</p>
              )}
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
            {ultimaVisita.es_empresa && (
              <div className="col-span-2">
                <p className="text-xs uppercase tracking-wide text-gray-400">Empresa</p>
                <p className="text-gray-900">
                  {ultimaVisita.empresa_nombre || '—'}
                  {ultimaVisita.empresa_cif && (
                    <span className="text-gray-500"> · CIF/SIRET: {ultimaVisita.empresa_cif}</span>
                  )}
                </p>
              </div>
            )}
            {ultimaVisita.referido_por && (
              <div className="col-span-2">
                <p className="text-xs uppercase tracking-wide text-gray-400">Cómo nos conoció</p>
                <p className="text-gray-900">{ultimaVisita.referido_por}</p>
              </div>
            )}
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
                onChange={(e) =>
                  setFormEdicion((f) => f && { ...f, direccion_extra: e.target.value })
                }
              />
            </div>
            <Select
              label="País"
              options={[
                { value: 'España', label: 'España' },
                { value: 'Francia', label: 'Francia' },
              ]}
              value={formEdicion.pais}
              onChange={(e) =>
                setFormEdicion(
                  (f) =>
                    f && {
                      ...f,
                      pais: e.target.value,
                      zona: e.target.value === 'España' ? 'Irún' : 'Hendaye',
                    },
                )
              }
            />
            <Select
              label="Zona"
              options={(formEdicion.pais === 'España' ? catalogos.zonasEs : catalogos.zonasFr).map(
                (v) => ({ value: v, label: v }),
              )}
              value={formEdicion.zona}
              onChange={(e) => setFormEdicion((f) => f && { ...f, zona: e.target.value })}
            />
            <Select
              label="Idioma"
              options={[
                { value: 'Español', label: 'Español' },
                { value: 'Français', label: 'Français' },
              ]}
              value={formEdicion.idioma}
              onChange={(e) => setFormEdicion((f) => f && { ...f, idioma: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 mt-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formEdicion.esEmpresa}
              onChange={(e) => setFormEdicion((f) => f && { ...f, esEmpresa: e.target.checked })}
            />
            El cliente forma parte de una empresa u organización
          </label>
          {formEdicion.esEmpresa && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <Input
                label="Razón social"
                value={formEdicion.empresaNombre}
                onChange={(e) =>
                  setFormEdicion((f) => f && { ...f, empresaNombre: e.target.value })
                }
              />
              <Input
                label="CIF / SIRET"
                value={formEdicion.empresaCif}
                onChange={(e) => setFormEdicion((f) => f && { ...f, empresaCif: e.target.value })}
              />
            </div>
          )}
          <div className="mt-3">
            <Input
              label="Cómo nos conoció / Referido por (opcional)"
              value={formEdicion.referidoPor}
              onChange={(e) => setFormEdicion((f) => f && { ...f, referidoPor: e.target.value })}
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
              <button
                onClick={() => setMostrarFormGaleria(true)}
                className="text-xs text-brand hover:underline"
              >
                + Añadir a galería
              </button>
            </div>
          </div>
          {totalFacturado > 0 && (
            <p className="text-xs text-gray-500 mb-2">
              Total facturado (facturas reales):{' '}
              <span className="font-semibold text-gray-800">{totalFacturado.toFixed(2)} €</span>
            </p>
          )}
          <div className="flex flex-col gap-2">
            {cliente.visitas.map((v) => {
              const importe = importePorVisita(v.id);
              return (
                <div
                  key={v.id}
                  onClick={() => navigate(`/visitas/${v.id}`)}
                  className="flex items-center justify-between gap-2 flex-wrap text-sm border border-gray-200 rounded-sm px-3 py-2 hover:bg-brand-light/40 transition-colors cursor-pointer"
                >
                  <div>
                    <p className="text-gray-900">{fechaVisitaCorta(v.fecha_visita)}</p>
                    <p className="text-xs text-gray-500">
                      {v.tipo} · {v.estado_pipeline}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {importe != null && (
                      <span className="text-xs text-gray-600">
                        {importe.total.toFixed(2)} €{importe.esOrientativo ? ' (orientativo)' : ''}
                      </span>
                    )}
                    <Badge variant={estadoToVariant(v.estado)}>{v.estado}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'historial' && (
        <div>
          {(cargandoNotas || cargandoPresupuestos || cargandoFacturas || cargandoProyectos) && (
            <p className="text-sm text-gray-400">Cargando...</p>
          )}
          {historial.length === 0 && (
            <p className="text-sm text-gray-400">Sin actividad registrada</p>
          )}
          <div className="flex flex-col gap-3">
            {historial.map((e, i) => {
              const Icono = e.icono;
              return (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-brand-light text-brand flex items-center justify-center shrink-0 mt-0.5">
                    <Icono size={13} />
                  </div>
                  <div className="flex-1 min-w-0 border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900">{e.titulo}</p>
                      <p className="text-xs text-gray-400">{fechaVisitaCorta(e.fecha)}</p>
                    </div>
                    {e.detalle && <p className="text-xs text-gray-500 mt-0.5">{e.detalle}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'notas' && (
        <div>
          <div className="flex gap-2 mb-1.5 flex-wrap">
            <Input
              value={notaTexto}
              onChange={(e) => setNotaTexto(e.target.value)}
              placeholder="Escribe una nota..."
              className="flex-1 min-w-[200px]"
            />
            <Input
              type="date"
              value={notaFechaSeguimiento}
              onChange={(e) => setNotaFechaSeguimiento(e.target.value)}
              className="w-40"
              title="Fecha de seguimiento (opcional)"
            />
            <Button
              size="sm"
              disabled={!notaTexto.trim() || agregarNotaMutation.isPending}
              onClick={() =>
                agregarNotaMutation.mutate({
                  texto: notaTexto.trim(),
                  fechaSeguimiento: notaFechaSeguimiento,
                })
              }
            >
              Añadir
            </Button>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            La fecha de seguimiento es opcional — sirve para marcar cuándo hay que retomar el
            contacto.
          </p>

          {cargandoNotas && <p className="text-sm text-gray-400">Cargando notas...</p>}
          {!cargandoNotas && (notas?.length ?? 0) === 0 && (
            <p className="text-sm text-gray-400">Sin notas</p>
          )}
          <div className="flex flex-col gap-2">
            {notas?.map((n) => {
              const hoy = new Date().toISOString().slice(0, 10);
              const seguimientoVencido = n.fecha_seguimiento && n.fecha_seguimiento <= hoy;
              return (
                <div key={n.id} className="border border-gray-200 rounded-sm px-3 py-2">
                  <p
                    className={`text-sm ${n.tipo === 'sistema' ? 'italic text-gray-500' : 'text-gray-900'}`}
                  >
                    {n.texto}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <p className="text-xs text-gray-400">
                      {n.autor} ·{' '}
                      {new Date(n.created_at).toLocaleDateString('es', {
                        day: '2-digit',
                        month: 'short',
                        year: '2-digit',
                      })}
                    </p>
                    {n.fecha_seguimiento && (
                      <span
                        className={`text-[11px] font-medium rounded-full px-2 py-0.5 border ${
                          seguimientoVencido
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-gray-50 text-gray-500 border-gray-200'
                        }`}
                      >
                        Seguimiento: {fechaVisitaCorta(n.fecha_seguimiento)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
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
                <div
                  key={p.id}
                  onClick={() =>
                    navigate('/finanzas/presupuestos', { state: { verDocId: p.id, verDocTipo: 'presupuesto' } })
                  }
                  className="flex items-center justify-between gap-2 flex-wrap text-sm border border-gray-200 rounded-sm px-3 py-2 hover:bg-brand-light/40 transition-colors cursor-pointer"
                >
                  <div>
                    <p className="text-gray-900">{p.numero ?? 'Sin número'}</p>
                    <p className="text-xs text-gray-500">{p.fecha_emision ?? 'Sin fecha'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.tipo === 'orientativo' ? (
                      <Badge variant="pendiente">Orientativo</Badge>
                    ) : (
                      <span className="text-xs text-gray-400">Normal</span>
                    )}
                    <span className="text-gray-700">
                      {calcularTotales(p.lineas).totalConIva.toFixed(2)} €
                    </span>
                    <Badge variant={VARIANTE_ESTADO_PRESUPUESTO[p.estado] ?? 'default'}>
                      {p.estado}
                    </Badge>
                    {presupuestoIdsFacturados.has(p.id) && (
                      <Badge variant="confirmada">Facturado</Badge>
                    )}
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
                <div
                  key={f.id}
                  onClick={() =>
                    navigate('/finanzas/facturas', { state: { verDocId: f.id, verDocTipo: 'factura' } })
                  }
                  className="flex items-center justify-between gap-2 flex-wrap text-sm border border-gray-200 rounded-sm px-3 py-2 hover:bg-brand-light/40 transition-colors cursor-pointer"
                >
                  <div>
                    <p className="text-gray-900">{f.numero ?? 'Sin número'}</p>
                    <p className="text-xs text-gray-500">{f.fecha_factura ?? 'Sin fecha'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-700">
                      {calcularTotales(f.lineas).totalConIva.toFixed(2)} €
                    </span>
                    <Badge variant={VARIANTE_ESTADO_FACTURA[f.estado_cobro] ?? 'default'}>
                      {f.estado_cobro}
                    </Badge>
                    {f.estado_cobro !== 'Cobrada' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRecordandoPago(f);
                        }}
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

      {tab === 'privacidad' && (
        <ClientePrivacidadTab cliente={cliente} visitaIds={visitaIds} onPurgado={onPurgado} />
      )}

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
