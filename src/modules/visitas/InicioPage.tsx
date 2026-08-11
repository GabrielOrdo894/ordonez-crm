import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Receipt,
  FileText,
  Percent,
  Wallet,
  Users,
  Globe,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Inbox,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { notaSistema } from '../../lib/notaSistema';
import { useAuth, type Rol } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useConfirmar } from '../../hooks/useConfirm';
import { Badge, estadoToVariant } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { calcularTotales } from '../finanzas/lineas';
import { porcentajeIva } from '../finanzas/iva';
import { useFiscalConfig } from '../fiscalidad/useFiscalConfig';
import { useEcheances } from '../fiscalidad/useEcheances';
import { limitesEjercicio } from '../fiscalidad/calculos';
import { TOOLTIP_STYLE } from '../../lib/chartStyles';
import { ETAPAS_PIPELINE } from '../clientes/types';
import { estadoSeguimiento, type PresupuestoConRespuesta, type Solicitud } from '../solicitudes/types';
import { CalendarioMini } from './CalendarioMini';
import { ResenaGoogleBanner } from './ResenaGoogleBanner';
import { NotificacionesBell } from '../notificaciones/NotificacionesBell';
import { VisitaResumenModal, urlGoogleMaps } from './VisitaResumenModal';
import type { Visita } from './types';
import type { Factura } from '../finanzas/facturas/types';
import type { Presupuesto } from '../finanzas/presupuestos/types';
import type { Gasto } from '../finanzas/gastos/types';
import type { EcheanceFiscal } from '../fiscalidad/types';
import { fechaVisitaCorta } from '../../lib/fechas';
import type { VisitaModalContext } from '../../components/layout/AppLayout';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const ORDEN_KPI = ['general', 'marketing', 'contabilidad'] as const;

function vistaKpiPorDefecto(rol: Rol): (typeof ORDEN_KPI)[number] {
  if (rol === 'gestion') return 'marketing';
  if (rol === 'contable') return 'contabilidad';
  return 'general';
}

const MENSAJE_ROL: Record<Rol, string> = {
  admin: 'Resumen general de la actividad de hoy.',
  gestion: 'Estas son tus próximas visitas y tareas pendientes.',
  contable: 'Visitas realizadas pendientes de facturar y seguimiento.',
};

function saludoHora() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}


function bandera(pais: string | null) {
  if (pais === 'España') return '🇪🇸';
  if (pais === 'Francia') return '🇫🇷';
  return '';
}

function iniciales(nombre: string) {
  return nombre
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function ultimosMeses(n: number) {
  const meses: string[] = [];
  const hoy = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return meses;
}

function etiquetaMes(mesISO: string) {
  const [anio, mes] = mesISO.split('-');
  return `${MESES[Number(mes) - 1]} ${anio.slice(-2)}`;
}

function bordeEstado(estado: Visita['estado']) {
  if (estado === 'Pendiente') return 'border-amber-500';
  if (estado === 'Realizada') return 'border-brand';
  return 'border-gray-300';
}

function ItemVisita({ visita, onAbrir }: { visita: Visita; onAbrir: () => void }) {
  const mapsUrl = urlGoogleMaps(visita);
  return (
    <div className={`border-l-2 pl-2 py-1 ${bordeEstado(visita.estado)}`}>
      <div onClick={onAbrir} className="cursor-pointer">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-bold text-gray-900">
            {visita.fecha_visita && fechaVisitaCorta(visita.fecha_visita)} · {visita.hora_visita?.slice(0, 5)}
          </p>
          <Badge variant={estadoToVariant(visita.estado)}>{visita.estado}</Badge>
        </div>
        <p className="text-sm text-gray-700">
          {visita.nombre} {visita.apellidos}
        </p>
        {mapsUrl && visita.direccion && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-xs font-medium text-brand hover:underline mt-0.5"
          >
            <MapPin size={12} className="shrink-0" />
            <span className="truncate">{visita.direccion}</span>
          </a>
        )}
        <p className="text-xs text-gray-400 mt-0.5">
          {visita.tipo} · {visita.zona} {bandera(visita.pais)}
        </p>
        {visita.descripcion && <p className="text-xs text-gray-400 mt-0.5 truncate">{visita.descripcion}</p>}
      </div>
    </div>
  );
}

function ItemEvento({ echeance, onAbrir }: { echeance: EcheanceFiscal; onAbrir: () => void }) {
  return (
    <div onClick={onAbrir} className="border-l-2 border-purple-500 pl-2 py-1 cursor-pointer">
      <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
        <Landmark size={12} className="shrink-0 text-purple-500" />
        {echeance.titulo}
      </p>
      <p className="text-xs text-gray-500">
        {fechaVisitaCorta(echeance.fecha_limite)} {echeance.organismo && `· ${echeance.organismo}`}
      </p>
    </div>
  );
}

function TarjetaHeader({
  icon: Icon,
  badge,
  titulo,
  to,
  state,
}: {
  icon: LucideIcon;
  badge: string;
  titulo: string;
  to?: string;
  state?: unknown;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className={`w-7 h-7 rounded-sm flex items-center justify-center shrink-0 ${badge}`}>
          <Icon size={15} />
        </span>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{titulo}</p>
      </div>
      {to && (
        <Link
          to={to}
          state={state}
          className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-brand hover:bg-brand-light shrink-0"
        >
          <ChevronRight size={14} />
        </Link>
      )}
    </div>
  );
}

export default function InicioPage() {
  const { abrirNuevaVisita, abrirEditarVisita } = useOutletContext<VisitaModalContext>();
  const { user, rol } = useAuth();
  const { config: configFiscal } = useFiscalConfig();
  const { echeances } = useEcheances();
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [vistaKpi, setVistaKpi] = useState<'general' | 'marketing' | 'contabilidad'>('general');
  const vistaKpiTocada = useRef(false);
  useEffect(() => {
    if (!vistaKpiTocada.current) setVistaKpi(vistaKpiPorDefecto(rol));
  }, [rol]);
  const [kpiDist, setKpiDist] = useState(0);
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);
  const [visitaResumen, setVisitaResumen] = useState<Visita | null>(null);

  const calendarioRef = useRef<HTMLDivElement>(null);
  const proximasListRef = useRef<HTMLDivElement>(null);
  const [alturaPanel, setAlturaPanel] = useState<number | undefined>(undefined);
  const [desbordaProximas, setDesbordaProximas] = useState(false);

  const nombre = (user?.user_metadata?.nombre as string) || user?.email || '';
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;

  const cambiarVistaKpi = (nueva: (typeof ORDEN_KPI)[number]) => {
    vistaKpiTocada.current = true;
    const prevIdx = ORDEN_KPI.indexOf(vistaKpi);
    const nuevaIdx = ORDEN_KPI.indexOf(nueva);
    const diff = nuevaIdx - prevIdx;
    const magnitud = Math.abs(diff) === 2 ? 56 : 28;
    setKpiDist(diff === 0 ? 0 : diff > 0 ? magnitud : -magnitud);
    setVistaKpi(nueva);
  };

  const { data: visitas, isLoading } = useQuery({
    queryKey: ['visitas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visitas')
        .select('*')
        .is('eliminado_en', null)
        .order('fecha_visita', { ascending: true });
      if (error) throw error;
      return data as Visita[];
    },
  });

  const { data: facturas } = useQuery({
    queryKey: ['facturas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('facturas').select('*').is('eliminado_en', null);
      if (error) throw error;
      return data as Factura[];
    },
  });

  const { data: presupuestos } = useQuery({
    queryKey: ['presupuestos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('presupuestos').select('*').is('eliminado_en', null);
      if (error) throw error;
      return data as Presupuesto[];
    },
  });

  const { data: solicitudesResumen } = useQuery({
    queryKey: ['solicitudes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('solicitudes').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Solicitud[];
    },
  });

  const { data: seguimientosResumen } = useQuery({
    queryKey: ['presupuestos', 'respuestas-pendientes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select(
          'id, numero, cliente_nombre, cliente_email, idioma, ultima_respuesta_cliente_resumen, ultima_respuesta_cliente_fecha, ultima_respuesta_revisada, mensaje_seguimiento_generado, mensaje_seguimiento_enviado, mensaje_seguimiento_enviado_en',
        )
        .is('eliminado_en', null)
        .not('ultima_respuesta_cliente_fecha', 'is', null)
        .order('ultima_respuesta_cliente_fecha', { ascending: false });
      if (error) throw error;
      return data as PresupuestoConRespuesta[];
    },
  });

  const { data: gastos } = useQuery({
    queryKey: ['gastos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('gastos').select('*');
      if (error) throw error;
      return data as Gasto[];
    },
  });

  // Solo alimenta el bloque de KPI (resumenFinanciero) — el calendario y las listas de visitas
  // de esta página siguen mostrando todo, sin filtrar por país.
  const ORDEN_PAIS = ['Francia', 'todos', 'España'] as const;
  const [vistaPais, setVistaPais] = useState<(typeof ORDEN_PAIS)[number]>('todos');
  const visitasKpi = useMemo(
    () => (vistaPais === 'todos' ? visitas : (visitas ?? []).filter((v) => v.pais === vistaPais)),
    [visitas, vistaPais],
  );
  const facturasKpi = useMemo(
    () => (vistaPais === 'todos' ? facturas : (facturas ?? []).filter((f) => f.pais === vistaPais)),
    [facturas, vistaPais],
  );
  const presupuestosKpi = useMemo(
    () => (vistaPais === 'todos' ? presupuestos : (presupuestos ?? []).filter((p) => p.pais === vistaPais)),
    [presupuestos, vistaPais],
  );
  const gastosKpi = useMemo(
    () => (vistaPais === 'todos' ? gastos : (gastos ?? []).filter((g) => g.pais === vistaPais)),
    [gastos, vistaPais],
  );

  const marcarRealizadasMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('visitas').update({ estado: 'Realizada' }).in('id', ids);
      if (error) throw error;
      for (const id of ids) {
        await notaSistema(id, 'Visita marcada automáticamente como realizada (fecha y hora ya pasadas)');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visitas'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const cancelarVisitaMutation = useMutation({
    mutationFn: async (visita: Visita) => {
      const { error } = await supabase.from('visitas').update({ estado: 'Cancelada' }).eq('id', visita.id);
      if (error) throw error;
      await notaSistema(visita.id, 'Visita cancelada');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visitas'] });
      toast.success('Visita cancelada');
      setVisitaResumen(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const hoyISO = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const hoyMesISO = hoyISO.slice(0, 7);

  const datosGrafico = useMemo(() => {
    const meses = ultimosMeses(12);
    const entradasPorMes = new Map<string, number>();
    const salidasPorMes = new Map<string, number>();
    // Desglose por país independiente del selector de arriba — solo alimenta las barras apiladas
    // por color de la vista Consolidado.
    const entradasEsPorMes = new Map<string, number>();
    const entradasFrPorMes = new Map<string, number>();
    const salidasEsPorMes = new Map<string, number>();
    const salidasFrPorMes = new Map<string, number>();

    for (const f of facturasKpi ?? []) {
      if (!f.fecha_pago || f.monto_pagado == null) continue;
      const mes = f.fecha_pago.slice(0, 7);
      entradasPorMes.set(mes, (entradasPorMes.get(mes) ?? 0) + f.monto_pagado);
    }

    for (const g of gastosKpi ?? []) {
      if (!g.fecha) continue;
      const mes = g.fecha.slice(0, 7);
      const total = (g.importe_base ?? 0) + (g.importe_iva ?? 0);
      salidasPorMes.set(mes, (salidasPorMes.get(mes) ?? 0) + total);
    }

    for (const f of facturas ?? []) {
      if (!f.fecha_pago || f.monto_pagado == null) continue;
      const mes = f.fecha_pago.slice(0, 7);
      const mapa = f.pais === 'Francia' ? entradasFrPorMes : entradasEsPorMes;
      mapa.set(mes, (mapa.get(mes) ?? 0) + f.monto_pagado);
    }

    for (const g of gastos ?? []) {
      if (!g.fecha) continue;
      const mes = g.fecha.slice(0, 7);
      const total = (g.importe_base ?? 0) + (g.importe_iva ?? 0);
      const mapa = g.pais === 'Francia' ? salidasFrPorMes : salidasEsPorMes;
      mapa.set(mes, (mapa.get(mes) ?? 0) + total);
    }

    return meses.map((mes) => {
      const entradas = entradasPorMes.get(mes) ?? 0;
      const salidas = salidasPorMes.get(mes) ?? 0;
      return {
        mes: etiquetaMes(mes),
        entradas,
        salidas,
        resultado: entradas - salidas,
        entradasEs: entradasEsPorMes.get(mes) ?? 0,
        entradasFr: entradasFrPorMes.get(mes) ?? 0,
        salidasEs: salidasEsPorMes.get(mes) ?? 0,
        salidasFr: salidasFrPorMes.get(mes) ?? 0,
      };
    });
  }, [facturasKpi, gastosKpi, facturas, gastos]);

  const plafondTramo15 = useMemo(() => {
    const ejercicio = limitesEjercicio(new Date().getFullYear());
    return configFiscal('is_plafond_reduit', 42500) * (ejercicio.meses / 12);
  }, [configFiscal]);

  const facturasUrgentes = useMemo(() => {
    const vencidas = (facturasKpi ?? []).filter((f) => f.estado_cobro === 'Vencida');
    const pendientes = (facturasKpi ?? []).filter(
      (f) => f.estado_cobro === 'Pendiente' || f.estado_cobro === 'Cobrada parcialmente',
    );
    return {
      vencidas,
      pendientes,
      lista: [...vencidas, ...pendientes]
        .sort((a, b) => (a.fecha_vence ?? '').localeCompare(b.fecha_vence ?? ''))
        .slice(0, 3),
    };
  }, [facturasKpi]);

  const presupuestosPendientes = useMemo(() => {
    const pendientes = (presupuestosKpi ?? []).filter((p) => p.estado === 'Pendiente');
    return {
      pendientes,
      lista: [...pendientes].sort((a, b) => (b.fecha_emision ?? '').localeCompare(a.fecha_emision ?? '')).slice(0, 3),
    };
  }, [presupuestosKpi]);

  const resumenIva = useMemo(() => {
    const repercutido = (facturasKpi ?? [])
      .filter((f) => (f.fecha_factura ?? '').slice(0, 7) === hoyMesISO)
      .reduce((s, f) => {
        const { totalSinIva, totalConIva } = calcularTotales(f.lineas);
        return s + (totalConIva - totalSinIva);
      }, 0);
    const deducible = (gastosKpi ?? [])
      .filter((g) => (g.fecha ?? '').slice(0, 7) === hoyMesISO)
      .reduce((s, g) => s + (g.importe_iva ?? 0), 0);
    return { repercutido, deducible, saldo: repercutido - deducible };
  }, [facturasKpi, gastosKpi, hoyMesISO]);

  const resultadoTotal = useMemo(() => {
    let ingresosSinIva = 0;
    let ingresosConIva = 0;
    for (const f of facturasKpi ?? []) {
      if (!f.fecha_pago || f.monto_pagado == null) continue;
      const pct = porcentajeIva(f.tipo_iva);
      const conIva = f.monto_pagado;
      const sinIva = pct > 0 ? conIva / (1 + pct / 100) : conIva;
      ingresosConIva += conIva;
      ingresosSinIva += sinIva;
    }
    let gastosSinIva = 0;
    let gastosConIva = 0;
    for (const g of gastosKpi ?? []) {
      gastosSinIva += g.importe_base ?? 0;
      gastosConIva += (g.importe_base ?? 0) + (g.importe_iva ?? 0);
    }
    return { sinIva: ingresosSinIva - gastosSinIva, conIva: ingresosConIva - gastosConIva };
  }, [facturasKpi, gastosKpi]);

  const marketing = useMemo(() => {
    const visitasEsteMes = (visitasKpi ?? []).filter((v) => (v.fecha_visita ?? '').slice(0, 7) === hoyMesISO);

    const [anioM, mesM] = hoyMesISO.split('-').map(Number);
    const fechaAnteriorM = new Date(anioM, mesM - 2, 1);
    const mesAnteriorISO = `${fechaAnteriorM.getFullYear()}-${String(fechaAnteriorM.getMonth() + 1).padStart(2, '0')}`;
    const visitasMesAnterior = (visitasKpi ?? []).filter((v) => (v.fecha_visita ?? '').slice(0, 7) === mesAnteriorISO).length;
    const deltaVisitas =
      visitasMesAnterior > 0 ? ((visitasEsteMes.length - visitasMesAnterior) / visitasMesAnterior) * 100 : null;

    const origenPorCanal = new Map<string, number>();
    for (const v of visitasEsteMes) {
      const canal = v.contacto ?? 'Otro';
      origenPorCanal.set(canal, (origenPorCanal.get(canal) ?? 0) + 1);
    }
    const origenOrdenado = Array.from(origenPorCanal.entries()).sort((a, b) => b[1] - a[1]);

    const etapas = ETAPAS_PIPELINE as readonly string[];
    const idxRealizada = etapas.indexOf('Visita realizada');
    const idxEnviado = etapas.indexOf('Presupuesto enviado');
    const idxAceptado = etapas.indexOf('Presupuesto aceptado');
    const realizadas = visitasEsteMes.filter((v) => etapas.indexOf(v.estado_pipeline) >= idxRealizada).length;
    const enviados = visitasEsteMes.filter((v) => etapas.indexOf(v.estado_pipeline) >= idxEnviado).length;
    const aceptados = visitasEsteMes.filter((v) => etapas.indexOf(v.estado_pipeline) >= idxAceptado).length;

    const pctEnviados = realizadas > 0 ? Math.round((enviados / realizadas) * 100) : 0;
    const pctAceptados = enviados > 0 ? Math.round((aceptados / enviados) * 100) : 0;
    const pctAceptadosTotal = realizadas > 0 ? Math.round((aceptados / realizadas) * 100) : 0;

    const espana = visitasEsteMes.filter((v) => v.pais === 'España').length;
    const francia = visitasEsteMes.filter((v) => v.pais === 'Francia').length;

    return {
      totalVisitas: visitasEsteMes.length,
      visitasMesAnterior,
      deltaVisitas,
      origenOrdenado,
      realizadas,
      enviados,
      aceptados,
      pctEnviados,
      pctAceptados,
      pctAceptadosTotal,
      espana,
      francia,
    };
  }, [visitasKpi, hoyMesISO]);

  const contabilidadMes = useMemo(() => {
    const calcularMes = (mesISO: string) => {
      const ingresos = (facturasKpi ?? [])
        .filter((f) => (f.fecha_pago ?? '').slice(0, 7) === mesISO && f.monto_pagado != null)
        .reduce((s, f) => s + (f.monto_pagado ?? 0), 0);
      const gastosDelMes = (gastosKpi ?? [])
        .filter((g) => (g.fecha ?? '').slice(0, 7) === mesISO)
        .reduce((s, g) => s + (g.importe_base ?? 0) + (g.importe_iva ?? 0), 0);
      return { ingresos, gastos: gastosDelMes, resultado: ingresos - gastosDelMes };
    };

    const [anio, mes] = hoyMesISO.split('-').map(Number);
    const fechaAnterior = new Date(anio, mes - 2, 1);
    const mesAnteriorISO = `${fechaAnterior.getFullYear()}-${String(fechaAnterior.getMonth() + 1).padStart(2, '0')}`;

    const actual = calcularMes(hoyMesISO);
    const anterior = calcularMes(mesAnteriorISO);

    const deltaIngresos = anterior.ingresos > 0 ? ((actual.ingresos - anterior.ingresos) / anterior.ingresos) * 100 : null;
    const deltaGastos = anterior.gastos > 0 ? ((actual.gastos - anterior.gastos) / anterior.gastos) * 100 : null;
    const margen = actual.ingresos > 0 ? (actual.resultado / actual.ingresos) * 100 : null;

    const ingresosSerie = [
      { etiqueta: 'Ant.', valor: Math.round(anterior.ingresos * 100) / 100 },
      { etiqueta: 'Actual', valor: Math.round(actual.ingresos * 100) / 100 },
    ];
    const gastosSerie = [
      { etiqueta: 'Ant.', valor: Math.round(anterior.gastos * 100) / 100 },
      { etiqueta: 'Actual', valor: Math.round(actual.gastos * 100) / 100 },
    ];

    // Desglose por país del mes actual — independiente del selector de arriba, solo se muestra
    // en la vista Consolidado de los KPI "Ingresos del mes" y "Resultado del mes".
    const ingresosPorPais = (pais: string) =>
      (facturas ?? [])
        .filter((f) => f.pais === pais && (f.fecha_pago ?? '').slice(0, 7) === hoyMesISO && f.monto_pagado != null)
        .reduce((s, f) => s + (f.monto_pagado ?? 0), 0);
    const gastosPorPais = (pais: string) =>
      (gastos ?? [])
        .filter((g) => g.pais === pais && (g.fecha ?? '').slice(0, 7) === hoyMesISO)
        .reduce((s, g) => s + (g.importe_base ?? 0) + (g.importe_iva ?? 0), 0);
    const ingresosEs = ingresosPorPais('España');
    const ingresosFr = ingresosPorPais('Francia');
    const resultadoEs = ingresosEs - gastosPorPais('España');
    const resultadoFr = ingresosFr - gastosPorPais('Francia');

    return { ...actual, deltaIngresos, deltaGastos, margen, ingresosSerie, gastosSerie, ingresosEs, ingresosFr, resultadoEs, resultadoFr };
  }, [facturasKpi, gastosKpi, facturas, gastos, hoyMesISO]);

  const solicitudesNuevasLista = (solicitudesResumen ?? []).filter((s) => s.estado === 'Nueva');
  const nuevasSolicitudes = solicitudesNuevasLista.length;
  const borradoresSolicitudes = (solicitudesResumen ?? []).filter((s) => s.estado === 'Borrador').length;
  const nuevosSeguimientos = (seguimientosResumen ?? []).filter((p) => estadoSeguimiento(p) === 'Nueva').length;
  const previaSolicitudesNuevas = solicitudesNuevasLista.slice(0, 3);

  const eventosCalendario = useMemo(
    () => echeances.filter((e) => !e.completada).map((e) => ({ fecha: e.fecha_limite, titulo: e.titulo })),
    [echeances],
  );

  type ItemPanel = { fecha: string; tipo: 'visita'; visita: Visita } | { fecha: string; tipo: 'evento'; echeance: EcheanceFiscal };

  const proximosItems = useMemo<ItemPanel[]>(() => {
    const items: ItemPanel[] = [];
    for (const v of visitas ?? []) {
      if (v.fecha_visita && v.fecha_visita >= hoyISO && v.estado !== 'Cancelada' && v.estado !== 'Realizada') {
        items.push({ fecha: v.fecha_visita, tipo: 'visita', visita: v });
      }
    }
    for (const e of echeances) {
      if (!e.completada && e.fecha_limite >= hoyISO) items.push({ fecha: e.fecha_limite, tipo: 'evento', echeance: e });
    }
    return items.sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 8);
  }, [visitas, echeances, hoyISO]);

  const itemsDelDiaSeleccionado = useMemo<ItemPanel[]>(() => {
    if (!diaSeleccionado) return [];
    const items: ItemPanel[] = [];
    for (const v of visitas ?? []) {
      if (v.fecha_visita === diaSeleccionado) items.push({ fecha: v.fecha_visita, tipo: 'visita', visita: v });
    }
    for (const e of echeances) {
      if (e.fecha_limite === diaSeleccionado) items.push({ fecha: e.fecha_limite, tipo: 'evento', echeance: e });
    }
    return items;
  }, [visitas, echeances, diaSeleccionado]);

  const listaVisitasPanel = diaSeleccionado ? itemsDelDiaSeleccionado : proximosItems;

  useEffect(() => {
    if (!visitas || marcarRealizadasMutation.isPending) return;
    const ahora = new Date();
    const idsPasadas = visitas
      .filter((v) => v.estado === 'Pendiente' && v.fecha_visita)
      .filter((v) => new Date(`${v.fecha_visita}T${(v.hora_visita ?? '00:00').slice(0, 5)}:00`) < ahora)
      .map((v) => v.id);
    if (idsPasadas.length > 0) marcarRealizadasMutation.mutate(idsPasadas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitas]);

  useEffect(() => {
    const el = calendarioRef.current;
    if (!el) return;
    const actualizar = () => setAlturaPanel(el.getBoundingClientRect().height);
    actualizar();
    const observer = new ResizeObserver(actualizar);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = proximasListRef.current;
    setDesbordaProximas(!!el && el.scrollHeight > el.clientHeight + 1);
  }, [listaVisitasPanel, alturaPanel]);

  const saludo = (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10 sm:mb-16 pt-4">
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-11 h-11 sm:w-14 sm:h-14 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-brand-light flex items-center justify-center text-brand text-lg font-bold shrink-0">
            {iniciales(nombre)}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 truncate">
            {saludoHora()}, {nombre.split(' ')[0] || nombre}
          </p>
          <p className="text-sm text-gray-500 mt-1 sm:mt-2">{MENSAJE_ROL[rol]}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <NotificacionesBell />
        <Button onClick={() => abrirNuevaVisita()} className="px-4 py-2 text-sm">
          + Nueva visita
        </Button>
        <Button
          variant="secondary"
          onClick={() => navigate('/finanzas/presupuestos', { state: { autoCrear: true } })}
          className="px-4 py-2 text-sm"
        >
          + Nuevo presupuesto
        </Button>
      </div>
    </div>
  );

  const resumenFinanciero = (
    <div className="mb-4">
      <div className="bg-surface border border-gray-200 rounded-sm p-4 mb-4 max-w-5xl mx-auto">
        <div className="flex items-center gap-4 flex-wrap mb-3">
          {vistaPais === 'todos' ? (
            <>
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2.5 h-2.5 rounded-sm bg-brand inline-block" /> Entradas España
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#5f9a78' }} /> Entradas Francia
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-400 inline-block" /> Salidas España
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-300 inline-block" /> Salidas Francia
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2.5 h-2.5 rounded-sm bg-gray-500 inline-block" /> Resultado
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2.5 h-2.5 rounded-sm bg-brand inline-block" /> Entradas
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-400 inline-block" /> Salidas
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2.5 h-2.5 rounded-sm bg-gray-500 inline-block" /> Resultado
              </span>
            </>
          )}
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={datosGrafico}>
            <CartesianGrid stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={55} />
            <Tooltip formatter={(valor) => `${Number(valor).toFixed(2)} €`} contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ display: 'none' }} />
            {vistaPais === 'todos' ? (
              <>
                <Bar dataKey="entradasEs" name="Entradas España" stackId="entradas" fill="#1a5c38" />
                <Bar dataKey="entradasFr" name="Entradas Francia" stackId="entradas" fill="#5f9a78" radius={[4, 4, 0, 0]} />
                <Bar dataKey="salidasEs" name="Salidas España" stackId="salidas" fill="#fb7185" />
                <Bar dataKey="salidasFr" name="Salidas Francia" stackId="salidas" fill="#fda4af" radius={[4, 4, 0, 0]} />
              </>
            ) : (
              <>
                <Bar dataKey="entradas" name="Entradas" fill="#1a5c38" radius={[4, 4, 0, 0]} />
                <Bar dataKey="salidas" name="Salidas" fill="#fb7185" radius={[4, 4, 0, 0]} />
              </>
            )}
            <Line dataKey="resultado" name="Resultado" stroke="#4b5563" strokeWidth={2} dot={{ r: 3 }} />
            {rol === 'contable' && (
              <ReferenceLine
                y={plafondTramo15}
                stroke="#dc2626"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                label={{ value: `Límite tramo 15% IS (${plafondTramo15.toFixed(0)} €)`, position: 'insideTopRight', fill: '#dc2626', fontSize: 11 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-center gap-3 mb-3">
        <button
          onClick={() => setVistaPais(ORDEN_PAIS[(ORDEN_PAIS.indexOf(vistaPais) - 1 + ORDEN_PAIS.length) % ORDEN_PAIS.length])}
          className="p-1.5 rounded-full border border-gray-200 bg-surface text-gray-500 hover:border-brand hover:text-brand transition-colors"
          aria-label="Ver Francia"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2 min-w-[110px] justify-center">
          <span className="text-sm font-semibold text-gray-800">
            {vistaPais === 'todos' ? 'Consolidado' : vistaPais}
          </span>
          <div className="flex items-center gap-1">
            {ORDEN_PAIS.map((p) => (
              <button
                key={p}
                onClick={() => setVistaPais(p)}
                aria-label={`Ver ${p === 'todos' ? 'consolidado' : p}`}
                className={`h-1.5 rounded-full transition-all ${
                  p === vistaPais ? 'bg-brand w-5' : 'bg-gray-300 w-1.5 hover:bg-gray-400'
                }`}
              />
            ))}
          </div>
        </div>
        <button
          onClick={() => setVistaPais(ORDEN_PAIS[(ORDEN_PAIS.indexOf(vistaPais) + 1) % ORDEN_PAIS.length])}
          className="p-1.5 rounded-full border border-gray-200 bg-surface text-gray-500 hover:border-brand hover:text-brand transition-colors"
          aria-label="Ver España"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex items-center justify-center mb-4">
        <div className="inline-flex items-center gap-1 bg-gray-100 rounded-full p-1 flex-wrap justify-center">
          {(['general', 'marketing', 'contabilidad'] as const).map((v) => (
            <button
              key={v}
              onClick={() => cambiarVistaKpi(v)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide transition-colors ${
                vistaKpi === v ? 'bg-surface text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {v === 'general' ? 'General' : v === 'marketing' ? 'Marketing' : 'Contabilidad'}
            </button>
          ))}
        </div>
      </div>

      {vistaKpi === 'general' && (
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-[kpi-slide-in_220ms_ease-out]"
        style={{ ['--kpi-dist' as string]: `${kpiDist}px` } as CSSProperties}
      >
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <TarjetaHeader icon={Receipt} badge="bg-blue-50 text-blue-600" titulo="Facturas" to="/finanzas/facturas" />
          <div className="flex gap-4 mb-3">
            <div>
              <p className="text-xs text-gray-400">Vencidas</p>
              <p className="text-sm font-semibold text-red-600">{facturasUrgentes.vencidas.length}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Pendientes</p>
              <p className="text-sm font-semibold text-amber-600">{facturasUrgentes.pendientes.length}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {facturasUrgentes.lista.length === 0 && <p className="text-xs text-gray-400">Sin facturas urgentes</p>}
            {facturasUrgentes.lista.map((f) => (
              <div key={f.id} className="text-xs border-t border-gray-100 pt-2">
                <p className="text-gray-900 font-medium">
                  {f.numero} · {f.cliente_nombre}
                </p>
                <p className="text-gray-500">
                  Vence {f.fecha_vence ?? '—'} · {calcularTotales(f.lineas).totalConIva.toFixed(2)} €
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <TarjetaHeader icon={FileText} badge="bg-amber-50 text-amber-600" titulo="Presupuestos" to="/finanzas/presupuestos" />
          <div className="mb-3">
            <p className="text-xs text-gray-400">Pendientes de respuesta</p>
            <p className="text-sm font-semibold text-amber-600">{presupuestosPendientes.pendientes.length}</p>
          </div>
          <div className="flex flex-col gap-2">
            {presupuestosPendientes.lista.length === 0 && <p className="text-xs text-gray-400">Sin presupuestos pendientes</p>}
            {presupuestosPendientes.lista.map((p) => (
              <div key={p.id} className="text-xs border-t border-gray-100 pt-2">
                <p className="text-gray-900 font-medium">
                  {p.numero} · {p.cliente_nombre}
                </p>
                <p className="text-gray-500">
                  {p.fecha_emision ?? '—'} · {calcularTotales(p.lineas).totalConIva.toFixed(2)} €
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <TarjetaHeader icon={Percent} badge="bg-violet-50 text-violet-600" titulo="IVA / TVA · este mes" to="/fiscalidad/tva" />
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Repercutido</span>
              <span className="text-gray-900">{resumenIva.repercutido.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Deducible</span>
              <span className="text-gray-900">{resumenIva.deducible.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between border-t border-gray-100 pt-1.5 font-semibold">
              <span className="text-gray-700">{resumenIva.saldo >= 0 ? 'A pagar' : 'A favor'}</span>
              <span className={resumenIva.saldo >= 0 ? 'text-red-600' : 'text-brand'}>
                {Math.abs(resumenIva.saldo).toFixed(2)} €
              </span>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <TarjetaHeader icon={Wallet} badge="bg-brand-light text-brand" titulo="Resultado total" to="/contabilidad/resultado" />
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Sin IVA</span>
              <span className={`font-semibold ${resultadoTotal.sinIva >= 0 ? 'text-brand' : 'text-red-600'}`}>
                {resultadoTotal.sinIva.toFixed(2)} €
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Con IVA</span>
              <span className={`font-semibold ${resultadoTotal.conIva >= 0 ? 'text-brand' : 'text-red-600'}`}>
                {resultadoTotal.conIva.toFixed(2)} €
              </span>
            </div>
          </div>
        </div>
      </div>
      )}

      {vistaKpi === 'marketing' && (
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-[kpi-slide-in_220ms_ease-out]"
        style={{ ['--kpi-dist' as string]: `${kpiDist}px` } as CSSProperties}
      >
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <TarjetaHeader icon={Users} badge="bg-blue-50 text-blue-600" titulo="Visitas este mes" />
          <p className="text-2xl font-semibold text-gray-900">{marketing.totalVisitas}</p>
          <p className="text-xs text-gray-400 mt-1">
            {marketing.visitasMesAnterior} el mes anterior
            {marketing.deltaVisitas != null && (
              <span className={marketing.deltaVisitas >= 0 ? 'text-brand' : 'text-red-600'}>
                {' '}
                ({marketing.deltaVisitas >= 0 ? '+' : ''}
                {marketing.deltaVisitas.toFixed(0)}%)
              </span>
            )}
          </p>
        </div>

        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <TarjetaHeader icon={Globe} badge="bg-violet-50 text-violet-600" titulo="Origen de clientes" />
          {marketing.origenOrdenado.length === 0 ? (
            <p className="text-xs text-gray-400">Sin visitas este mes</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {marketing.origenOrdenado.slice(0, 4).map(([canal, cantidad]) => (
                <div key={canal} className="flex justify-between text-sm">
                  <span className="text-gray-600">{canal}</span>
                  <span className="text-gray-900 font-medium">{cantidad}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <TarjetaHeader icon={TrendingUp} badge="bg-emerald-50 text-emerald-600" titulo="Tasa de conversión" />
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Visitas realizadas</span>
              <span className="text-gray-900 font-medium">{marketing.realizadas}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Presupuestos enviados</span>
              <span className="text-gray-900 font-medium">
                {marketing.enviados} <span className="text-gray-400">({marketing.pctEnviados}%)</span>
              </span>
            </div>
            <div className="flex justify-between border-t border-gray-100 pt-1.5">
              <span className="text-gray-700 font-semibold">Aceptados</span>
              <span className="text-brand font-semibold">
                {marketing.aceptados} <span className="text-gray-400 font-normal">({marketing.pctAceptadosTotal}%)</span>
              </span>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <TarjetaHeader icon={MapPin} badge="bg-amber-50 text-amber-600" titulo="Visitas por país" />
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">🇪🇸 España</span>
              <span className="text-gray-900 font-medium">{marketing.espana}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-sm overflow-hidden">
              <div
                className="h-1.5 bg-brand"
                style={{ width: `${marketing.totalVisitas > 0 ? (marketing.espana / marketing.totalVisitas) * 100 : 0}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-gray-600">🇫🇷 Francia</span>
              <span className="text-gray-900 font-medium">{marketing.francia}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-sm overflow-hidden">
              <div
                className="h-1.5 bg-gray-500"
                style={{ width: `${marketing.totalVisitas > 0 ? (marketing.francia / marketing.totalVisitas) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>
      )}

      {vistaKpi === 'contabilidad' && (
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-[kpi-slide-in_220ms_ease-out]"
        style={{ ['--kpi-dist' as string]: `${kpiDist}px` } as CSSProperties}
      >
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <TarjetaHeader icon={TrendingUp} badge="bg-brand-light text-brand" titulo="Ingresos del mes" to="/contabilidad/ingresos" />
          <p className="text-2xl font-semibold text-brand">{contabilidadMes.ingresos.toFixed(2)} €</p>
          {vistaPais === 'todos' && (
            <p className="text-xs text-gray-500 mb-1">
              🇪🇸 España: {contabilidadMes.ingresosEs.toFixed(2)} € · 🇫🇷 Francia: {contabilidadMes.ingresosFr.toFixed(2)} €
            </p>
          )}
          {contabilidadMes.deltaIngresos != null && (
            <p className={`text-xs mb-1 ${contabilidadMes.deltaIngresos >= 0 ? 'text-brand' : 'text-red-600'}`}>
              {contabilidadMes.deltaIngresos >= 0 ? '+' : ''}
              {contabilidadMes.deltaIngresos.toFixed(0)}% vs mes anterior
            </p>
          )}
          <ResponsiveContainer width="100%" height={44}>
            <BarChart data={contabilidadMes.ingresosSerie} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
              <XAxis dataKey="etiqueta" hide />
              <YAxis hide />
              <Bar dataKey="valor" fill="#1a5c38" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <TarjetaHeader icon={TrendingDown} badge="bg-rose-50 text-rose-500" titulo="Gastos del mes" to="/contabilidad/gastos" />
          <p className="text-2xl font-semibold text-rose-500">{contabilidadMes.gastos.toFixed(2)} €</p>
          {contabilidadMes.deltaGastos != null && (
            <p className={`text-xs mb-1 ${contabilidadMes.deltaGastos <= 0 ? 'text-brand' : 'text-rose-500'}`}>
              {contabilidadMes.deltaGastos >= 0 ? '+' : ''}
              {contabilidadMes.deltaGastos.toFixed(0)}% vs mes anterior
            </p>
          )}
          <ResponsiveContainer width="100%" height={44}>
            <BarChart data={contabilidadMes.gastosSerie} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
              <XAxis dataKey="etiqueta" hide />
              <YAxis hide />
              <Bar dataKey="valor" fill="#fb7185" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <TarjetaHeader icon={Wallet} badge="bg-blue-50 text-blue-600" titulo="Resultado del mes" to="/contabilidad/resultado" />
          <p className={`text-2xl font-semibold ${contabilidadMes.resultado >= 0 ? 'text-brand' : 'text-rose-500'}`}>
            {contabilidadMes.resultado.toFixed(2)} €
          </p>
          {vistaPais === 'todos' && (
            <p className="text-xs text-gray-500 mb-1">
              🇪🇸 España: {contabilidadMes.resultadoEs.toFixed(2)} € · 🇫🇷 Francia: {contabilidadMes.resultadoFr.toFixed(2)} €
            </p>
          )}
          {contabilidadMes.margen != null && (
            <div className="flex items-center gap-1 mt-1">
              {contabilidadMes.margen >= 0 ? (
                <TrendingUp size={13} className="text-brand" />
              ) : (
                <TrendingDown size={13} className="text-rose-500" />
              )}
              <p className="text-xs text-gray-500">Margen: {contabilidadMes.margen.toFixed(0)}%</p>
            </div>
          )}
        </div>

        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <TarjetaHeader icon={Percent} badge="bg-violet-50 text-violet-600" titulo="IVA / TVA · este mes" to="/fiscalidad/tva" />
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Repercutido</span>
              <span className="text-gray-900">{resumenIva.repercutido.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Deducible</span>
              <span className="text-gray-900">{resumenIva.deducible.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between border-t border-gray-100 pt-1.5 font-semibold">
              <span className="text-gray-700">{resumenIva.saldo >= 0 ? 'A pagar' : 'A favor'}</span>
              <span className={resumenIva.saldo >= 0 ? 'text-red-600' : 'text-brand'}>
                {Math.abs(resumenIva.saldo).toFixed(2)} €
              </span>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div>
        {saludo}
        <ResenaGoogleBanner />
        {resumenFinanciero}
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr_320px] gap-4">
          <div className="h-96 bg-surface border border-gray-200 rounded-sm animate-pulse" />
          <div className="h-96 bg-surface border border-gray-200 rounded-sm animate-pulse" />
          <div className="h-96 bg-surface border border-gray-200 rounded-sm animate-pulse" />
        </div>
      </div>
    );
  }

  if (!visitas || visitas.length === 0) {
    return (
      <div>
        {saludo}
        <ResenaGoogleBanner />
        {resumenFinanciero}
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <p className="text-sm text-gray-400">No hay visitas registradas</p>
          <Button onClick={() => abrirNuevaVisita()}>+ Nueva visita</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {saludo}
      <ResenaGoogleBanner />
      {resumenFinanciero}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr_320px] gap-4 items-start">
      <div ref={calendarioRef}>
        <CalendarioMini
          visitas={visitas}
          onVer={() => {}}
          onEditar={abrirEditarVisita}
          ocultarPanelInferior
          onSeleccionarDia={setDiaSeleccionado}
          eventosExtra={eventosCalendario}
        />
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4 flex flex-col" style={{ maxHeight: alturaPanel }}>
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3 shrink-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            {diaSeleccionado ? `Eventos · ${fechaVisitaCorta(diaSeleccionado)}` : 'Próximos eventos'}
          </p>
          {diaSeleccionado && (
            <button onClick={() => setDiaSeleccionado(null)} className="text-xs text-brand hover:underline">
              Ver próximos
            </button>
          )}
        </div>
        <div ref={proximasListRef} className="flex-1 min-h-0 overflow-hidden flex flex-col gap-2">
          {listaVisitasPanel.length === 0 && (
            <p className="text-sm text-gray-400">{diaSeleccionado ? 'Sin eventos ese día' : 'Sin eventos próximos'}</p>
          )}
          {listaVisitasPanel.map((item) =>
            item.tipo === 'visita' ? (
              <ItemVisita key={`v-${item.visita.id}`} visita={item.visita} onAbrir={() => setVisitaResumen(item.visita)} />
            ) : (
              <ItemEvento key={`e-${item.echeance.id}`} echeance={item.echeance} onAbrir={() => navigate('/fiscalidad/calendario')} />
            ),
          )}
        </div>
        {desbordaProximas && (
          <Link
            to="/calendario"
            className="shrink-0 text-xs text-brand hover:underline pt-2 mt-1 border-t border-gray-100"
          >
            Ver el resto en el calendario →
          </Link>
        )}
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4 flex flex-col" style={{ maxHeight: alturaPanel }}>
        <TarjetaHeader icon={Inbox} badge="bg-rose-50 text-rose-600" titulo="Solicitudes" to="/solicitudes/entrantes" />
        <div className="shrink-0 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Solicitudes nuevas</span>
            <span className={`text-lg font-semibold ${nuevasSolicitudes > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {nuevasSolicitudes}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 pt-3">
            <span className="text-sm text-gray-600">Borradores sin enviar</span>
            <span className="text-lg font-semibold text-gray-900">{borradoresSolicitudes}</span>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 pt-3">
            <span className="text-sm text-gray-600">Respuestas nuevas a revisar</span>
            <span className={`text-lg font-semibold ${nuevosSeguimientos > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {nuevosSeguimientos}
            </span>
          </div>
          {nuevasSolicitudes === 0 && borradoresSolicitudes === 0 && nuevosSeguimientos === 0 && (
            <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">Todo al día — sin pendientes.</p>
          )}
        </div>
        {previaSolicitudesNuevas.length > 0 && (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-2 border-t border-gray-100 mt-3 pt-3">
            {previaSolicitudesNuevas.map((s) => (
              <div
                key={s.id}
                onClick={() => navigate('/solicitudes/entrantes')}
                className="border-l-2 border-rose-500 pl-2 py-1 cursor-pointer"
              >
                <p className="text-sm font-medium text-gray-900 truncate">{s.nombre || s.email || 'Sin nombre'}</p>
                <p className="text-xs text-gray-500 truncate">
                  {s.tipo_reforma || 'Tipo de reforma sin especificar'} · {fechaVisitaCorta(s.created_at.slice(0, 10))}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>

      <VisitaResumenModal
        visita={visitaResumen}
        onClose={() => setVisitaResumen(null)}
        onModificar={(v) => {
          setVisitaResumen(null);
          abrirEditarVisita(v);
        }}
        onCancelar={async (v) => {
          if (!(await confirmar(`¿Cancelar la visita de ${v.nombre} ${v.apellidos}?`))) return;
          cancelarVisitaMutation.mutate(v);
        }}
      />
    </div>
  );
}
