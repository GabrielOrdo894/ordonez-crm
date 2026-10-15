import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { hoyLocalIso, isoHaceDias, sumarDiasIso } from '../../lib/fechas';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Table } from '../../components/ui/Table';
import { KpiRow } from '../../components/ui/Kpi';
import { BarrasHorizontales } from './BarrasHorizontales';
import { AsistenteSankey } from './AsistenteSankey';
import { AsistenteSesiones } from './AsistenteSesiones';
import { TarjetaAnalitica } from './TarjetaAnalitica';
import {
  INICIO_SEGUIMIENTO,
  abandonoPorPaso,
  agruparSesiones,
  datosSankey,
  embudoAsistente,
  metricasPor,
  opcionesElegidas,
  resultadoReal,
  resumenAviso,
  resumenWhatsapp,
  type EventoAsistente,
  type EventoFunnelCruce,
  type MetricasGrupo,
} from './asistenteWeb';

// Solicitudes → Asistente web (2026-10-15, petición de Gabriel): qué hace la gente con el
// asistente fijo de abajo a la derecha de ordonezrenov.com — embudo, rutas, dónde se van, qué
// eligen, desde qué página y en qué acaban las solicitudes. Datos de `asistente_eventos`, que
// rellena la Edge Function `asistente-eventos`. Toda la agregación vive en asistenteWeb.ts.

const PERIODOS = [
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '90', label: 'Últimos 90 días' },
  { value: 'personalizado', label: 'Personalizado' },
];

const COLUMNAS_EVENTO = 'id, created_at, sesion, evento, paso, valor, pagina, idioma, dispositivo, solicitud_id';
const TAM_PAGINA = 1000;

async function cargarEventos(desdeIso: string, hastaIso: string): Promise<EventoAsistente[]> {
  const filas: EventoAsistente[] = [];
  for (let desde = 0; ; desde += TAM_PAGINA) {
    const { data, error } = await supabase
      .from('asistente_eventos')
      .select(COLUMNAS_EVENTO)
      .gte('created_at', desdeIso)
      .lt('created_at', hastaIso)
      .order('id')
      .range(desde, desde + TAM_PAGINA - 1);
    if (error) throw error;
    filas.push(...((data ?? []) as EventoAsistente[]));
    if (!data || data.length < TAM_PAGINA) return filas;
  }
}

const COLUMNAS_GRUPO = (titulo: string) => [
  { key: 'grupo', label: titulo },
  { key: 'vistas', label: 'Visitas' },
  { key: 'abiertos', label: 'Abren', render: (r: MetricasGrupo) => `${r.abiertos} (${r.pctApertura}%)`, sortValue: (r: MetricasGrupo) => r.abiertos },
  { key: 'enviados', label: 'Envían' },
  { key: 'pctConversion', label: 'Conversión', render: (r: MetricasGrupo) => `${r.pctConversion}%` },
  { key: 'whatsapp', label: 'WhatsApp' },
];

export function AsistenteWebPanel({ onAbrirSolicitud }: { onAbrirSolicitud: (id: string) => void }) {
  const [periodo, setPeriodo] = useState('30');
  const [desdeCustom, setDesdeCustom] = useState(isoHaceDias(30));
  const [hastaCustom, setHastaCustom] = useState(hoyLocalIso());

  const { desde, hasta } = useMemo(
    () => (periodo === 'personalizado' ? { desde: desdeCustom, hasta: hastaCustom } : { desde: isoHaceDias(Number(periodo) - 1), hasta: hoyLocalIso() }),
    [periodo, desdeCustom, hastaCustom],
  );
  // Días naturales en hora local: del inicio de `desde` al final de `hasta`.
  const desdeIso = new Date(`${desde}T00:00:00`).toISOString();
  const hastaIso = new Date(`${sumarDiasIso(hasta, 1)}T00:00:00`).toISOString();

  const { data: eventos, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['asistente_eventos', desdeIso, hastaIso],
    queryFn: () => cargarEventos(desdeIso, hastaIso),
    enabled: !!desde && !!hasta && desde <= hasta,
  });

  const sesiones = useMemo(() => agruparSesiones(eventos ?? []), [eventos]);
  const embudo = useMemo(() => embudoAsistente(sesiones), [sesiones]);
  const aviso = useMemo(() => resumenAviso(sesiones), [sesiones]);
  const abandonos = useMemo(() => abandonoPorPaso(sesiones), [sesiones]);
  const whatsapp = useMemo(() => resumenWhatsapp(sesiones), [sesiones]);
  const opciones = useMemo(() => opcionesElegidas(sesiones), [sesiones]);
  const sankey = useMemo(() => datosSankey(sesiones), [sesiones]);
  const porPagina = useMemo(() => metricasPor(sesiones, (s) => s.pagina), [sesiones]);
  const porIdioma = useMemo(() => metricasPor(sesiones, (s) => (s.idioma === 'fr' ? 'Francés' : 'Español')), [sesiones]);
  const porDispositivo = useMemo(() => metricasPor(sesiones, (s) => (s.dispositivo === 'movil' ? 'Móvil' : 'Ordenador')), [sesiones]);

  const solicitudIds = useMemo(() => [...new Set(sesiones.map((s) => s.solicitudId).filter((x): x is string => !!x))].sort(), [sesiones]);

  // Cruce con el embudo de Solicitudes: primero los eventos de esas solicitudes (visita y
  // vinculación a presupuesto) y después los de sus presupuestos (enviado, aceptado, acompte).
  const { data: eventosFunnel } = useQuery({
    queryKey: ['funnel_eventos', 'asistente-web', solicitudIds],
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

  // Misma consulta (clave, columnas y forma) que SolicitudesPage.tsx: comparten caché.
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

  const total = sesiones.length;
  const abiertos = embudo.find((e) => e.clave === 'abiertos')!;
  const enviados = embudo.find((e) => e.clave === 'enviados')!;
  const totalAbandonos = sesiones.filter((s) => s.resultado === 'abandono').length;
  const errores = sesiones.filter((s) => s.errorEnvio).length;
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : '—');

  return (
    <div>
      <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Asistente web</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Botón «Visita técnica gratuita» y WhatsApp fijos abajo a la derecha de ordonezrenov.com. Cada visita es una carga de página, sin cookies.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <Select label="Período" options={PERIODOS} value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="w-44" />
          {periodo === 'personalizado' && (
            <>
              <Input label="Desde" type="date" value={desdeCustom} min={INICIO_SEGUIMIENTO} onChange={(e) => setDesdeCustom(e.target.value)} />
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
      ) : total === 0 ? (
        <div className="bg-surface border border-gray-200 rounded-sm p-8 text-center">
          <p className="text-sm text-gray-600">Todavía no hay datos en este período: el seguimiento empezó el 15/10/2026.</p>
          <p className="text-xs text-gray-400 mt-1">Lo anterior solo está en Google Analytics (eventos asistente_*).</p>
        </div>
      ) : (
        <>
          <KpiRow
            items={[
              { label: 'Visitas con el asistente', valor: total },
              { label: 'Abren el asistente', valor: abiertos.count, valorSecundario: `${pct(abiertos.count, total)} de las visitas` },
              {
                label: 'Envían la solicitud',
                valor: enviados.count,
                valorSecundario: `${pct(enviados.count, abiertos.count)} de los que abren`,
                acento: true,
              },
              { label: 'Van a WhatsApp', valor: whatsapp.sesiones, valorSecundario: `${whatsapp.clics} clics` },
              { label: 'Abandonan', valor: totalAbandonos, valorSecundario: `${pct(totalAbandonos, abiertos.count)} de los que abren` },
              {
                label: 'Aviso mostrado',
                valor: aviso.mostrados,
                valorSecundario: `${aviso.abiertosTrasAviso} abren con él (${aviso.pctApertura}%)`,
              },
              ...(errores > 0 ? [{ label: 'Envíos fallidos', valor: errores, valorSecundario: 'Revisar solicitud-web' }] : []),
            ]}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <TarjetaAnalitica titulo="Embudo del asistente">
              <BarrasHorizontales datos={embudo} campoNombre="etiqueta" campoValor="count" campoPct="pctAnterior" anchoEtiqueta={160} />
              <p className="text-xs text-gray-400 mt-1">El porcentaje de cada barra es sobre el escalón anterior.</p>
            </TarjetaAnalitica>
            <TarjetaAnalitica titulo="Dónde se quedan (abandonos por último paso visto)">
              <BarrasHorizontales
                datos={abandonos.map((a) => ({ paso: ['Paso 1 · tipo', 'Paso 2 · zona', 'Paso 3 · plazo', 'Paso 4 · contacto'][a.paso - 1], count: a.count, pct: a.pctDeLosQueLlegaron }))}
                campoNombre="paso"
                campoValor="count"
                campoPct="pct"
                vacio="Nadie ha abandonado en este período"
              />
              <p className="text-xs text-gray-400 mt-1">
                Se cuenta como abandono quien abre y no envía ni pasa a WhatsApp. El porcentaje es sobre los que llegaron a ese paso.
              </p>
            </TarjetaAnalitica>
          </div>

          <TarjetaAnalitica titulo="Rutas: abre → tipo de obra → zona → plazo → resultado" className="mb-4">
            <AsistenteSankey datos={sankey} />
            <p className="text-xs text-gray-400 mt-1">
              El grosor es el número de visitas. Quien se queda a medias va directo de su último paso al resultado. Zonas: las 5 más elegidas y el resto en «Otras zonas».
            </p>
          </TarjetaAnalitica>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <TarjetaAnalitica titulo="Tipo de obra elegido">
              <BarrasHorizontales datos={opciones.tipos} campoNombre="nombre" campoValor="count" campoPct="pct" anchoEtiqueta={110} />
            </TarjetaAnalitica>
            <TarjetaAnalitica titulo="Zona elegida">
              <BarrasHorizontales datos={opciones.zonas} campoNombre="nombre" campoValor="count" campoPct="pct" anchoEtiqueta={110} />
            </TarjetaAnalitica>
            <TarjetaAnalitica titulo="Plazo elegido">
              <BarrasHorizontales datos={opciones.plazos} campoNombre="nombre" campoValor="count" campoPct="pct" anchoEtiqueta={110} />
            </TarjetaAnalitica>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <TarjetaAnalitica titulo="WhatsApp">
              <p className="text-xs text-gray-500 mb-1">Desde qué botón</p>
              <BarrasHorizontales datos={whatsapp.porOrigen} campoNombre="etiqueta" campoValor="count" anchoEtiqueta={150} vacio="Nadie ha pulsado WhatsApp en este período" />
              <p className="text-xs text-gray-500 mt-3 mb-1">En qué momento</p>
              <BarrasHorizontales datos={whatsapp.porPaso} campoNombre="etiqueta" campoValor="count" anchoEtiqueta={150} vacio="—" />
            </TarjetaAnalitica>
            <TarjetaAnalitica titulo="Resultado real de las solicitudes enviadas">
              {solicitudIds.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">Ninguna solicitud enviada desde el asistente en este período</p>
              ) : (
                <>
                  <BarrasHorizontales datos={resultado} campoNombre="etiqueta" campoValor="count" campoPct="pct" anchoEtiqueta={160} />
                  <p className="text-xs text-gray-400 mt-1">
                    Cruzado con el embudo de Solicitudes. Porcentajes sobre las solicitudes enviadas; los presupuestos orientativos no cuentan.
                  </p>
                </>
              )}
            </TarjetaAnalitica>
          </div>

          <TarjetaAnalitica titulo="Por página" className="mb-4">
            <Table columns={COLUMNAS_GRUPO('Página')} data={porPagina} emptyMessage="Sin datos" />
          </TarjetaAnalitica>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <TarjetaAnalitica titulo="Por idioma">
              <Table columns={COLUMNAS_GRUPO('Idioma')} data={porIdioma} />
            </TarjetaAnalitica>
            <TarjetaAnalitica titulo="Por dispositivo">
              <Table columns={COLUMNAS_GRUPO('Dispositivo')} data={porDispositivo} />
            </TarjetaAnalitica>
          </div>

          <TarjetaAnalitica titulo="Últimas visitas y su ruta paso a paso">
            <AsistenteSesiones sesiones={sesiones} onAbrirSolicitud={onAbrirSolicitud} />
          </TarjetaAnalitica>
        </>
      )}
    </div>
  );
}
