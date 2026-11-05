import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase } from '../../lib/supabase';
import { hoyLocalIso, isoHaceDias, sumarDiasIso } from '../../lib/fechas';
import { TOOLTIP_STYLE } from '../../lib/chartStyles';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Table } from '../../components/ui/Table';
import { KpiRow } from '../../components/ui/Kpi';
import { BarrasHorizontales } from './BarrasHorizontales';
import { TarjetaAnalitica } from './TarjetaAnalitica';
import { resultadoReal, type EventoFunnelCruce } from './asistenteWeb';
import {
  ETIQUETA_DISPOSITIVO,
  ETIQUETA_IDIOMA,
  ETIQUETA_SITIO,
  INICIO_MEDICION_WEBS,
  SITIOS_CON_PASOS,
  SITIOS_WEB,
  agruparSesiones,
  clicsPorBoton,
  embudoFormulario,
  formatearDuracion,
  metricasPor,
  metricasPorPagina,
  recorridosFrecuentes,
  resumen,
  sesionesPorDia,
  tiposElegidos,
  type EventoWeb,
  type FilaGrupo,
  type FilaPagina,
  type SesionWeb,
  type SitioWeb,
} from './websFiliales';

// Solicitudes → Webs filiales (2026-11-05, petición de Gabriel): qué hace la gente en
// costabath.com, ordonezfachadas.com y ordonezstudio.com — de dónde llega, qué páginas ve, cuánto
// tiempo, qué botones de contacto pulsa, dónde abandona el formulario y en qué acaban sus
// solicitudes. Datos de `web_eventos` (Edge Function `web-eventos`, script assets/medicion.js de
// cada web). Toda la agregación vive en websFiliales.ts.

const PERIODOS = [
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '90', label: 'Últimos 90 días' },
  { value: 'personalizado', label: 'Personalizado' },
];

const OPCIONES_SITIO = [{ value: 'todas', label: 'Las tres webs' }, ...SITIOS_WEB.map((s) => ({ value: s, label: ETIQUETA_SITIO[s] }))];

const COLORES_SITIO: Record<SitioWeb, string> = { costabath: '#1a5c38', ordonezfachadas: '#5f9878', ordonezstudio: '#b9c9be' };

const COLUMNAS_EVENTO =
  'id, created_at, sitio, sesion, vista_n, evento, numero, valor, pagina, idioma, dispositivo, referente, utm_fuente, utm_medio, utm_campana, solicitud_id';
const TAM_PAGINA = 1000;

async function cargarEventos(desdeIso: string, hastaIso: string): Promise<EventoWeb[]> {
  const filas: EventoWeb[] = [];
  for (let desde = 0; ; desde += TAM_PAGINA) {
    const { data, error } = await supabase
      .from('web_eventos')
      .select(COLUMNAS_EVENTO)
      .gte('created_at', desdeIso)
      .lt('created_at', hastaIso)
      .order('id')
      .range(desde, desde + TAM_PAGINA - 1);
    if (error) throw error;
    filas.push(...((data ?? []) as EventoWeb[]));
    if (!data || data.length < TAM_PAGINA) return filas;
  }
}

const COLUMNAS_GRUPO = (titulo: string) => [
  { key: 'grupo', label: titulo },
  { key: 'sesiones', label: 'Visitas' },
  { key: 'paginasPorSesion', label: 'Págs./visita' },
  { key: 'segundosMedios', label: 'Tiempo medio', render: (r: FilaGrupo) => formatearDuracion(r.segundosMedios), sortValue: (r: FilaGrupo) => r.segundosMedios },
  { key: 'pctRebote', label: 'Rebote', render: (r: FilaGrupo) => `${r.pctRebote}%`, sortValue: (r: FilaGrupo) => r.pctRebote },
  { key: 'contactos', label: 'Contactan', render: (r: FilaGrupo) => `${r.contactos} (${r.pctConversion}%)`, sortValue: (r: FilaGrupo) => r.contactos },
  { key: 'enviados', label: 'Formularios' },
];

const hora = (iso: string) =>
  new Date(iso).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function resultadoSesion(s: SesionWeb): string {
  if (s.enviada) return 'Solicitud enviada';
  const partes = [s.whatsapp && 'WhatsApp', s.telefono && 'Teléfono', s.email && 'Email'].filter(Boolean);
  if (partes.length) return partes.join(' + ');
  if (s.formInicio) return 'Formulario a medias';
  if (s.rebote) return 'Rebote';
  return '—';
}

export function WebsFilialesPanel({ onAbrirSolicitud }: { onAbrirSolicitud: (id: string) => void }) {
  const [periodo, setPeriodo] = useState('30');
  const [sitio, setSitio] = useState<'todas' | SitioWeb>('todas');
  const [desdeCustom, setDesdeCustom] = useState(isoHaceDias(30));
  const [hastaCustom, setHastaCustom] = useState(hoyLocalIso());

  const { desde, hasta } = useMemo(
    () =>
      periodo === 'personalizado'
        ? { desde: desdeCustom, hasta: hastaCustom }
        : { desde: isoHaceDias(Number(periodo) - 1), hasta: hoyLocalIso() },
    [periodo, desdeCustom, hastaCustom],
  );
  const desdeIso = new Date(`${desde}T00:00:00`).toISOString();
  const hastaIso = new Date(`${sumarDiasIso(hasta, 1)}T00:00:00`).toISOString();

  const { data: eventos, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['web_eventos', desdeIso, hastaIso],
    queryFn: () => cargarEventos(desdeIso, hastaIso),
    enabled: !!desde && !!hasta && desde <= hasta,
  });

  // Solicitudes que llegaron al CRM desde estas webs en el período (también las de antes de medir
  // o de quien bloquea el script), para comparar con lo medido.
  const { data: solicitudesCrm } = useQuery({
    queryKey: ['solicitudes', 'webs-filiales', desdeIso, hastaIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('solicitudes')
        .select('id, fuente')
        .in('fuente', SITIOS_WEB)
        .gte('created_at', desdeIso)
        .lt('created_at', hastaIso);
      if (error) throw error;
      return (data ?? []) as { id: string; fuente: SitioWeb }[];
    },
  });

  const todas = useMemo(() => agruparSesiones(eventos ?? []), [eventos]);
  const sesiones = useMemo(() => (sitio === 'todas' ? todas : todas.filter((s) => s.sitio === sitio)), [todas, sitio]);
  const total = useMemo(() => resumen(sesiones), [sesiones]);
  const porSitio = useMemo(() => metricasPor(todas, (s) => ETIQUETA_SITIO[s.sitio]), [todas]);
  const porDia = useMemo(() => sesionesPorDia(sesiones, desde, hasta), [sesiones, desde, hasta]);
  const porCanal = useMemo(() => metricasPor(sesiones, (s) => s.canal), [sesiones]);
  const porPagina = useMemo(() => metricasPorPagina(sesiones), [sesiones]);
  const porDispositivo = useMemo(() => metricasPor(sesiones, (s) => ETIQUETA_DISPOSITIVO[s.dispositivo] ?? s.dispositivo), [sesiones]);
  const porIdioma = useMemo(() => metricasPor(sesiones, (s) => ETIQUETA_IDIOMA[s.idioma] ?? s.idioma), [sesiones]);
  const conPasos = sitio !== 'todas' && SITIOS_CON_PASOS.includes(sitio);
  const embudo = useMemo(() => embudoFormulario(sesiones, conPasos), [sesiones, conPasos]);
  const botones = useMemo(() => clicsPorBoton(sesiones), [sesiones]);
  const recorridos = useMemo(() => recorridosFrecuentes(sesiones), [sesiones]);
  const tipos = useMemo(() => tiposElegidos(sesiones), [sesiones]);

  const solicitudIds = useMemo(
    () => [...new Set(sesiones.map((s) => s.solicitudId).filter((x): x is string => !!x))].sort(),
    [sesiones],
  );

  // Cruce con el embudo de Solicitudes (mismo método que el panel del asistente web).
  const { data: eventosFunnel } = useQuery({
    queryKey: ['funnel_eventos', 'webs-filiales', solicitudIds],
    enabled: solicitudIds.length > 0,
    queryFn: async () => {
      const { data: deSolicitud, error } = await supabase
        .from('funnel_eventos')
        .select('etapa, solicitud_id, presupuesto_id')
        .in('solicitud_id', solicitudIds);
      if (error) throw error;
      const filas = (deSolicitud ?? []) as EventoFunnelCruce[];
      const presIds = [...new Set(filas.map((f) => f.presupuesto_id).filter((x): x is string => !!x))];
      if (presIds.length === 0) return filas;
      const { data: dePresupuesto, error: errorPres } = await supabase
        .from('funnel_eventos')
        .select('etapa, solicitud_id, presupuesto_id')
        .in('presupuesto_id', presIds);
      if (errorPres) throw errorPres;
      return [...filas, ...((dePresupuesto ?? []) as EventoFunnelCruce[])];
    },
  });

  // Misma consulta (clave, columnas y forma) que SolicitudesPage.tsx y AsistenteWebPanel.tsx.
  const { data: presupuestosOrientativoIds } = useQuery({
    queryKey: ['presupuestos', 'ids-orientativos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('presupuestos').select('id').eq('tipo', 'orientativo').is('eliminado_en', null);
      if (error) throw error;
      return new Set((data ?? []).map((p) => p.id as string));
    },
  });

  const resultado = useMemo(
    () => resultadoReal(solicitudIds, eventosFunnel ?? [], presupuestosOrientativoIds),
    [solicitudIds, eventosFunnel, presupuestosOrientativoIds],
  );

  const solicitudesEnCrm = (solicitudesCrm ?? []).filter((s) => sitio === 'todas' || s.fuente === sitio).length;
  const errores = sesiones.filter((s) => s.errorEnvio).length;
  const sitiosGrafico = sitio === 'todas' ? SITIOS_WEB : [sitio];

  const columnasPagina = [
    ...(sitio === 'todas' ? [{ key: 'sitio', label: 'Web', render: (r: FilaPagina) => ETIQUETA_SITIO[r.sitio] }] : []),
    { key: 'pagina', label: 'Página' },
    { key: 'vistas', label: 'Vistas' },
    { key: 'entradas', label: 'Entradas' },
    { key: 'segundosMedios', label: 'Tiempo medio', render: (r: FilaPagina) => formatearDuracion(r.segundosMedios), sortValue: (r: FilaPagina) => r.segundosMedios },
    { key: 'pctScroll75', label: 'Leen el 75 %', render: (r: FilaPagina) => `${r.pctScroll75}%`, sortValue: (r: FilaPagina) => r.pctScroll75 },
    { key: 'contactos', label: 'WhatsApp/tel./email' },
    { key: 'cta', label: 'Botón contacto' },
    { key: 'enviados', label: 'Formularios' },
  ];

  const columnasSesion = [
    { key: 'inicio', label: 'Cuándo', render: (s: SesionWeb) => hora(s.inicio), sortValue: (s: SesionWeb) => s.inicio },
    ...(sitio === 'todas' ? [{ key: 'sitio', label: 'Web', render: (s: SesionWeb) => ETIQUETA_SITIO[s.sitio] }] : []),
    { key: 'canal', label: 'Procedencia', render: (s: SesionWeb) => (s.referente && s.canal !== 'Directo' ? `${s.canal} (${s.referente})` : s.canal) },
    {
      key: 'ruta',
      label: 'Páginas',
      render: (s: SesionWeb) => (
        <span className="text-xs">
          {s.vistas
            .slice(0, 5)
            .map((v) => v.pagina)
            .join(' → ')}
          {s.vistas.length > 5 ? ' → …' : ''}
        </span>
      ),
      sortValue: (s: SesionWeb) => s.vistas.length,
    },
    { key: 'segundos', label: 'Tiempo', render: (s: SesionWeb) => formatearDuracion(s.segundos), sortValue: (s: SesionWeb) => s.segundos },
    { key: 'dispositivo', label: 'Dispositivo', render: (s: SesionWeb) => ETIQUETA_DISPOSITIVO[s.dispositivo] ?? s.dispositivo },
    {
      key: 'resultado',
      label: 'Resultado',
      render: (s: SesionWeb) =>
        s.solicitudId ? (
          <button type="button" className="text-brand hover:underline" onClick={() => onAbrirSolicitud(s.solicitudId!)}>
            Solicitud enviada
          </button>
        ) : (
          resultadoSesion(s)
        ),
      sortValue: (s: SesionWeb) => resultadoSesion(s),
    },
  ];

  return (
    <div>
      <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Webs filiales</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            costabath.com, ordonezfachadas.com y ordonezstudio.com. Medición propia sin cookies: cada visita son las páginas vistas en la misma pestaña.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <Select label="Web" options={OPCIONES_SITIO} value={sitio} onChange={(e) => setSitio(e.target.value as 'todas' | SitioWeb)} className="w-44" />
          <Select label="Período" options={PERIODOS} value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="w-44" />
          {periodo === 'personalizado' && (
            <>
              <Input label="Desde" type="date" value={desdeCustom} min={INICIO_MEDICION_WEBS} onChange={(e) => setDesdeCustom(e.target.value)} />
              <Input label="Hasta" type="date" value={hastaCustom} onChange={(e) => setHastaCustom(e.target.value)} />
            </>
          )}
          <Button variant="secondary" onClick={() => refetch()} disabled={isFetching} className="flex items-center gap-1.5">
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Actualizar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400 py-10 text-center">Cargando…</p>
      ) : total.sesiones === 0 ? (
        <div className="bg-surface border border-gray-200 rounded-sm p-8 text-center">
          <p className="text-sm text-gray-600">Todavía no hay visitas medidas en este período: la medición empezó el 05/11/2026.</p>
          {solicitudesEnCrm > 0 && <p className="text-xs text-gray-400 mt-1">Solicitudes recibidas de estas webs en el período: {solicitudesEnCrm}.</p>}
        </div>
      ) : (
        <>
          <KpiRow
            items={[
              { label: 'Visitas', valor: total.sesiones, valorSecundario: `${total.paginasVistas} páginas vistas` },
              { label: 'Páginas por visita', valor: total.paginasPorSesion },
              { label: 'Tiempo medio', valor: formatearDuracion(total.segundosMedios) },
              { label: 'Rebote', valor: `${total.pctRebote}%`, valorSecundario: '1 página, < 10 s y sin clics' },
              {
                label: 'Contactan',
                valor: total.contactos,
                valorSecundario: `${total.pctConversion}% de las visitas`,
                acento: true,
              },
              { label: 'WhatsApp / teléfono', valor: `${total.whatsapp} / ${total.telefono}`, valorSecundario: `${total.email} por email` },
              { label: 'Formularios enviados', valor: total.enviados, valorSecundario: `${total.formIniciados} lo empiezan` },
              { label: 'Solicitudes en el CRM', valor: solicitudesEnCrm, valorSecundario: 'Llegadas de estas webs' },
              ...(errores > 0 ? [{ label: 'Envíos fallidos', valor: errores, valorSecundario: 'Revisar solicitud-web' }] : []),
            ]}
          />

          {sitio === 'todas' && (
            <TarjetaAnalitica titulo="Comparación entre webs" className="mb-4">
              <Table columns={COLUMNAS_GRUPO('Web')} data={porSitio} />
            </TarjetaAnalitica>
          )}

          <TarjetaAnalitica titulo="Visitas por día" className="mb-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={porDia} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis
                  dataKey="dia"
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickFormatter={(d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(d) => `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}`} />
                {sitiosGrafico.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
                {sitiosGrafico.map((s) => (
                  <Bar key={s} dataKey={s} name={ETIQUETA_SITIO[s]} stackId="a" fill={COLORES_SITIO[s]} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </TarjetaAnalitica>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <TarjetaAnalitica titulo="Embudo del formulario">
              <BarrasHorizontales datos={embudo} campoNombre="etiqueta" campoValor="count" campoPct="pctAnterior" anchoEtiqueta={170} />
              <p className="text-xs text-gray-400 mt-1">
                El porcentaje es sobre el escalón anterior.
                {!conPasos && ' Elige Costabath o Fachadas para ver también los pasos de su formulario.'}
              </p>
            </TarjetaAnalitica>
            <TarjetaAnalitica titulo="Botones de contacto que se pulsan">
              <BarrasHorizontales datos={botones} campoNombre="boton" campoValor="count" anchoEtiqueta={260} vacio="Nadie ha pulsado ningún botón de contacto en este período" />
              <p className="text-xs text-gray-400 mt-1">Tipo · dónde estaba el botón · qué ponía.</p>
            </TarjetaAnalitica>
          </div>

          <TarjetaAnalitica titulo="De dónde llegan" className="mb-4">
            <Table columns={COLUMNAS_GRUPO('Procedencia')} data={porCanal} />
            <p className="text-xs text-gray-400 mt-2">
              «Directo» incluye también enlaces desde apps que no dicen de dónde vienen (WhatsApp, email). Para campañas, añade ?utm_source=… a los enlaces.
            </p>
          </TarjetaAnalitica>

          <TarjetaAnalitica titulo="Por página" className="mb-4">
            <Table columns={columnasPagina} data={porPagina} emptyMessage="Sin datos" />
            <p className="text-xs text-gray-400 mt-2">«Entradas»: visitas que empiezan en esa página. «Leen el 75 %»: vistas que bajan al menos hasta el 75 % de la página.</p>
          </TarjetaAnalitica>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <TarjetaAnalitica titulo="Recorridos más repetidos (2 páginas o más)">
              <Table
                columns={[
                  { key: 'ruta', label: 'Recorrido' },
                  { key: 'count', label: 'Visitas' },
                  { key: 'contactos', label: 'Contactan' },
                ]}
                data={recorridos}
                emptyMessage="Ninguna visita ha pasado de una página"
              />
            </TarjetaAnalitica>
            <TarjetaAnalitica titulo="Resultado real de los formularios enviados">
              {solicitudIds.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">Ningún formulario enviado y medido en este período</p>
              ) : (
                <>
                  <BarrasHorizontales datos={resultado} campoNombre="etiqueta" campoValor="count" campoPct="pct" anchoEtiqueta={160} />
                  <p className="text-xs text-gray-400 mt-1">Cruzado con el embudo de Solicitudes. Los presupuestos orientativos no cuentan.</p>
                </>
              )}
            </TarjetaAnalitica>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <TarjetaAnalitica titulo="Tipo de trabajo elegido">
              <BarrasHorizontales datos={tipos} campoNombre="nombre" campoValor="count" campoPct="pct" anchoEtiqueta={130} vacio="Nadie ha elegido tipo en este período" />
            </TarjetaAnalitica>
            <TarjetaAnalitica titulo="Por dispositivo">
              <Table columns={COLUMNAS_GRUPO('Dispositivo').slice(0, 6)} data={porDispositivo} />
            </TarjetaAnalitica>
            <TarjetaAnalitica titulo="Por idioma">
              <Table columns={COLUMNAS_GRUPO('Idioma').slice(0, 6)} data={porIdioma} />
            </TarjetaAnalitica>
          </div>

          <TarjetaAnalitica titulo="Últimas visitas">
            <Table columns={columnasSesion} data={sesiones.slice(0, 200)} emptyMessage="Sin visitas" />
            {sesiones.length > 200 && <p className="text-xs text-gray-400 mt-2">Se muestran las 200 más recientes.</p>}
          </TarjetaAnalitica>
        </>
      )}
    </div>
  );
}
