import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UploadCloud,
  Link2,
  Ban,
  Undo2,
  Check,
  Paperclip,
  Trash2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { KpiRow } from '../../components/ui/Kpi';
import { InfoTooltip } from '../../components/ui/InfoTooltip';
import { BulkActionsBar } from '../../components/ui/BulkActionsBar';
import { useSeleccionMultiple } from '../../hooks/useSeleccionMultiple';
import { parseOfx } from '../../lib/ofx';
import { fechaVisitaCorta, sumarDiasIso } from '../../lib/fechas';
import { GastoForm } from '../finanzas/gastos/GastoForm';
import { ConciliarMovimientoModal } from './ConciliarMovimientoModal';
import { ConexionBancoPanel } from './ConexionBancoPanel';
import { useAuth } from '../../hooks/useAuth';
import { formatearPrecio, formatearPrecioEntero } from '../finanzas/lineas';
import {
  SELECT_MOVIMIENTO_CON_ENLACES,
  aplicarRegla,
  borrarRegla,
  cargarGastosLibres,
  cargarPagosLibres,
  cargarReglas,
  conciliarAutomaticos,
  crearGastoPendienteDesdeMovimiento,
  deshacerConciliacion,
  facturasParaSugerir,
  facturasPendientesDeCobro,
  guardarRegla,
  vincularACobrosExistentes,
  vincularAGastos,
  vincularMovimientoAFactura,
  type EnlaceMovimiento,
  type MovimientoConEnlaces,
} from '../../lib/conciliacionBancaria';
import {
  comercioDeMovimiento,
  reglaQueAplica,
  sugerirParaCobro,
  sugerirParaPago,
  type Sugerencia,
} from '../../lib/sugerenciasConciliacion';

const FILTROS = ['Pendiente', 'Sin justificante', 'Vinculado', 'Ignorado', 'Todos'] as const;
type Filtro = (typeof FILTROS)[number];

const VARIANTE_ESTADO = {
  Pendiente: 'pendiente',
  Vinculado: 'realizada',
  Ignorado: 'cancelada',
} as const;
const INVALIDAR = [
  'movimientos_banco',
  'facturas',
  'pagos_factura',
  'asientos_contables',
  'gastos',
  'reglas_banco',
  'conciliacion',
];

function etiquetaEnlace(e: EnlaceMovimiento): string {
  if (e.pago_id)
    return `${e.facturas?.numero ?? 'Factura'}${e.pago_previo ? ' (cobro ya registrado)' : ''}`;
  if (e.gasto_id) {
    const pendiente = e.gastos?.estado_gasto === 'pendiente' ? ' · gasto pendiente' : '';
    return `${e.gastos?.proveedor ?? 'Gasto'}${pendiente}`;
  }
  return e.concepto ?? 'Operación en el libro';
}

/** Un pago necesita justificante si no está conciliado con nada o si alguno de sus gastos no lo
 * tiene. Las operaciones diversas (TVA, comisiones, socio, peajes) no lo piden. */
function faltaJustificante(m: MovimientoConEnlaces): boolean {
  if (m.importe >= 0 || m.estado === 'Ignorado') return false;
  const enlaces = m.movimientos_banco_enlaces ?? [];
  if (enlaces.length === 0) return true;
  return enlaces.some((e) => e.gasto_id && !e.gastos?.adjunto_url);
}

function textoSugerencia(s: Sugerencia): string {
  if (s.tipo === 'regla') {
    const r = s.regla;
    return r.accion === 'ignorar'
      ? `Regla: ignorar`
      : r.accion === 'operacion'
        ? `Regla: ${r.descripcion ?? 'operación'} (${r.contrapartida})`
        : `Regla: gasto ${r.cuenta_contable ?? ''}`;
  }
  return s.motivo;
}

export default function BancoPage() {
  const toast = useToast();
  const { user } = useAuth();
  const nombreUsuarioActual = (user?.user_metadata?.nombre as string) || user?.email || 'Sistema';
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('Pendiente');
  const [movimientoAConciliar, setMovimientoAConciliar] = useState<MovimientoConEnlaces | null>(
    null,
  );
  const [gastoDesde, setGastoDesde] = useState<{
    m: MovimientoConEnlaces;
    patron: string | null;
  } | null>(null);
  const [verReglas, setVerReglas] = useState(false);
  const { seleccion, toggleFila, toggleTodas, limpiar } = useSeleccionMultiple();

  const invalidar = () => {
    for (const k of INVALIDAR) queryClient.invalidateQueries({ queryKey: [k] });
  };

  const { data: movimientos, isLoading } = useQuery({
    queryKey: ['movimientos_banco', 'con-enlaces'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('movimientos_banco')
        .select(SELECT_MOVIMIENTO_CON_ENLACES)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as MovimientoConEnlaces[];
    },
  });

  const hayPendientes = (movimientos ?? []).some((m) => m.estado === 'Pendiente');
  const fechaMasAntigua = (movimientos ?? [])
    .filter((m) => m.estado === 'Pendiente')
    .reduce((min, m) => (m.fecha < min ? m.fecha : min), '9999-12-31');
  const desdeGastos = hayPendientes ? sumarDiasIso(fechaMasAntigua, -60) : '';
  const { data: pagosLibres } = useQuery({
    queryKey: ['conciliacion', 'pagos-libres'],
    enabled: hayPendientes,
    queryFn: cargarPagosLibres,
  });
  const { data: gastosLibres } = useQuery({
    queryKey: ['conciliacion', 'gastos-libres', desdeGastos],
    enabled: hayPendientes,
    queryFn: () => cargarGastosLibres(desdeGastos),
  });
  const { data: facturas } = useQuery({
    queryKey: ['facturas', 'pendientes-vinculo'],
    enabled: hayPendientes,
    queryFn: facturasPendientesDeCobro,
  });
  const { data: reglas } = useQuery({ queryKey: ['reglas_banco'], queryFn: cargarReglas });

  const sugerencias = useMemo(() => {
    const mapa = new Map<string, Sugerencia[]>();
    const pendientesFactura = facturasParaSugerir(facturas ?? []);
    for (const m of movimientos ?? []) {
      if (m.estado !== 'Pendiente') continue;
      mapa.set(
        m.id,
        m.importe >= 0
          ? sugerirParaCobro(m, pagosLibres ?? [], pendientesFactura, reglas ?? [])
          : sugerirParaPago(m, gastosLibres ?? [], reglas ?? []),
      );
    }
    return mapa;
  }, [movimientos, pagosLibres, gastosLibres, facturas, reglas]);

  const aceptarSugerencia = async (m: MovimientoConEnlaces, s: Sugerencia) => {
    if (s.tipo === 'pagos') await vincularACobrosExistentes(m, s.pagos);
    else if (s.tipo === 'gastos') await vincularAGastos(m, s.gastos);
    else if (s.tipo === 'factura') {
      const factura = (facturas ?? []).find((f) => f.id === s.factura.id);
      if (!factura) throw new Error('La factura ya no está pendiente.');
      await vincularMovimientoAFactura(m, factura, 'manual');
    } else await aplicarRegla(m, s.regla);
  };

  const aceptarMutation = useMutation({
    mutationFn: async ({ m, s }: { m: MovimientoConEnlaces; s: Sugerencia }) =>
      aceptarSugerencia(m, s),
    onSuccess: () => {
      invalidar();
      toast.success('Movimiento conciliado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Acciones en bloque sobre los pendientes seleccionados. Cada movimiento va por separado: un fallo
  // no corta los demás y se resume al final.
  const enBloqueMutation = useMutation({
    mutationFn: async (accion: 'sugerencias' | 'reglas' | 'gastos' | 'ignorar') => {
      const elegidos = (movimientos ?? []).filter(
        (m) => seleccion.has(m.id) && m.estado === 'Pendiente',
      );
      let hechos = 0;
      const fallos: string[] = [];
      for (const m of elegidos) {
        try {
          if (accion === 'sugerencias') {
            const s = sugerencias.get(m.id)?.[0];
            if (!s) continue;
            await aceptarSugerencia(m, s);
          } else if (accion === 'reglas') {
            const r = reglaQueAplica(m, reglas ?? []);
            if (!r) continue;
            await aplicarRegla(m, r);
          } else if (accion === 'gastos') {
            if (m.importe >= 0) continue;
            await crearGastoPendienteDesdeMovimiento(m, reglaQueAplica(m, reglas ?? []));
          } else {
            const { error } = await supabase
              .from('movimientos_banco')
              .update({ estado: 'Ignorado' })
              .eq('id', m.id)
              .eq('estado', 'Pendiente');
            if (error) throw error;
          }
          hechos++;
        } catch (e) {
          fallos.push(
            `${fechaVisitaCorta(m.fecha)} ${formatearPrecio(m.importe)}: ${(e as Error).message}`,
          );
        }
      }
      return { hechos, fallos, total: elegidos.length };
    },
    onSuccess: ({ hechos, fallos, total }) => {
      invalidar();
      limpiar();
      if (hechos > 0) toast.success(`${hechos} de ${total} movimiento(s) resueltos`);
      else if (fallos.length === 0)
        toast.warning('Ninguno de los seleccionados tenía sugerencia o regla aplicable');
      for (const f of fallos) toast.error(f);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const ignorarMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('movimientos_banco')
        .update({ estado: 'Ignorado' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success('Movimiento ignorado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Deshace la conciliación: anula los cobros creados desde el banco y las operaciones diversas, nunca
  // los cobros que ya estaban registrados a mano ni los gastos (esos se corrigen en Gastos).
  const deshacerMutation = useMutation({
    mutationFn: async (m: MovimientoConEnlaces) => {
      if (m.estado === 'Ignorado') {
        const { error } = await supabase
          .from('movimientos_banco')
          .update({ estado: 'Pendiente' })
          .eq('id', m.id);
        if (error) throw error;
        return m;
      }
      await deshacerConciliacion(m, nombreUsuarioActual);
      return m;
    },
    onSuccess: (m) => {
      invalidar();
      const hayGastos = (m.movimientos_banco_enlaces ?? []).some((e) => e.gasto_id);
      toast.success(
        hayGastos
          ? 'Conciliación deshecha. Los gastos se conservan: corrígelos en Gastos si hace falta'
          : 'Conciliación deshecha',
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const borrarReglaMutation = useMutation({
    mutationFn: borrarRegla,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reglas_banco'] });
      toast.success('Regla eliminada');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleSubirArchivo = async (file: File) => {
    setSubiendo(true);
    try {
      const texto = await file.text();
      const parseados = parseOfx(texto);
      if (parseados.length === 0) {
        toast.error('No se ha encontrado ningún movimiento en el fichero. ¿Es un OFX válido?');
        return;
      }
      const { data: existentes, error: errorExistentes } = await supabase
        .from('movimientos_banco')
        .select('fitid')
        .in(
          'fitid',
          parseados.map((m) => m.fitid),
        );
      if (errorExistentes) throw errorExistentes;
      const fitidsExistentes = new Set((existentes ?? []).map((m) => m.fitid));
      const nuevos = parseados.filter((m) => !fitidsExistentes.has(m.fitid));

      if (nuevos.length === 0) {
        toast.success('Todos los movimientos de este fichero ya estaban importados');
        return;
      }

      const { error: errorInsert } = await supabase.from('movimientos_banco').insert(
        nuevos.map((m) => ({
          fitid: m.fitid,
          fecha: m.fecha,
          importe: m.importe,
          tipo: m.importe >= 0 ? 'Credito' : 'Debito',
          descripcion: m.descripcion,
          archivo_origen: file.name,
        })),
      );
      if (errorInsert) throw errorInsert;

      const omitidos = parseados.length - nuevos.length;
      toast.success(
        `${nuevos.length} movimientos nuevos importados${omitidos > 0 ? ` (${omitidos} ya existían)` : ''}`,
      );
      // Lo que coincide sin duda (cobro o gasto ya registrado, factura con ese pendiente exacto) se
      // concilia solo; el resto se queda Pendiente con su sugerencia.
      const { conciliados, avisos } = await conciliarAutomaticos();
      if (conciliados > 0) toast.success(`${conciliados} conciliado(s) automáticamente`);
      for (const a of avisos) toast.warning(a);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo leer el fichero');
    } finally {
      invalidar();
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const filtrados = (movimientos ?? []).filter((m) => {
    if (filtro === 'Todos') return true;
    if (filtro === 'Sin justificante') return faltaJustificante(m);
    return m.estado === filtro;
  });

  const kpis = (() => {
    const lista = movimientos ?? [];
    const pendientes = lista.filter((m) => m.estado === 'Pendiente');
    const conSugerencia = pendientes.filter((m) => (sugerencias.get(m.id) ?? []).length > 0).length;
    return [
      { label: 'Pendientes de conciliar', valor: pendientes.length },
      { label: 'Con sugerencia', valor: conSugerencia },
      {
        label: 'Pagos sin justificante',
        valor: lista.filter(faltaJustificante).length,
        acento: true,
      },
      {
        label: 'Importe pendiente',
        valor: `+${formatearPrecioEntero(pendientes.filter((m) => m.importe >= 0).reduce((s, m) => s + m.importe, 0))} / −${formatearPrecioEntero(
          Math.abs(pendientes.filter((m) => m.importe < 0).reduce((s, m) => s + m.importe, 0)),
        )}`,
      },
    ];
  })();

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-1.5">
          Movimientos bancarios
          <InfoTooltip>
            Cada movimiento del banco se concilia con lo que lo explica: un cobro ya registrado o
            una factura pendiente, uno o varios gastos, o una operación del libro (TVA, comisiones,
            socio, préstamo, peajes). Lo que coincide sin duda se concilia solo al importar; el
            resto muestra una sugerencia para aceptarla con un clic. Las reglas se aprenden al
            conciliar a mano («Recordar para los próximos…»).
          </InfoTooltip>
        </h1>
      </div>

      <ConexionBancoPanel />

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <label
          className={`flex items-center gap-2 border border-dashed rounded-sm px-4 py-2.5 text-sm cursor-pointer transition-colors ${
            subiendo
              ? 'border-gray-200 text-gray-400'
              : 'border-brand text-brand hover:bg-brand-light/40'
          }`}
        >
          <UploadCloud size={16} />
          {subiendo ? 'Importando...' : 'Importar fichero OFX'}
          <input
            ref={inputRef}
            type="file"
            accept=".ofx,.qfx"
            disabled={subiendo}
            onChange={(e) => e.target.files?.[0] && handleSubirArchivo(e.target.files[0])}
            className="hidden"
          />
        </label>
        <div className="inline-flex rounded-sm border border-gray-200 overflow-hidden text-xs ml-auto">
          {FILTROS.map((f) => (
            <button
              key={f}
              onClick={() => {
                setFiltro(f);
                limpiar();
              }}
              className={`px-2.5 py-1.5 ${filtro === f ? 'bg-brand text-white' : 'bg-surface text-gray-600 hover:bg-gray-50'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <KpiRow items={kpis} />

      <div className="mt-4">
        <BulkActionsBar
          count={seleccion.size}
          onCancelar={limpiar}
          acciones={[
            {
              label: 'Aceptar sugerencias',
              onClick: () => enBloqueMutation.mutate('sugerencias'),
              disabled: enBloqueMutation.isPending,
            },
            {
              label: 'Aplicar reglas',
              onClick: () => enBloqueMutation.mutate('reglas'),
              disabled: enBloqueMutation.isPending,
            },
            {
              label: 'Crear gastos pendientes',
              onClick: () => enBloqueMutation.mutate('gastos'),
              disabled: enBloqueMutation.isPending,
            },
            {
              label: 'Ignorar',
              onClick: () => enBloqueMutation.mutate('ignorar'),
              disabled: enBloqueMutation.isPending,
            },
          ]}
        />
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden">
        <Table
          loading={isLoading}
          data={filtrados}
          seleccion={seleccion}
          onToggleFila={toggleFila}
          onToggleTodas={toggleTodas}
          emptyMessage={
            filtro === 'Pendiente'
              ? 'No queda nada por conciliar'
              : 'Sin movimientos con este filtro'
          }
          columns={[
            { key: 'fecha', label: 'Fecha', render: (m) => fechaVisitaCorta(m.fecha) },
            {
              key: 'descripcion',
              label: 'Descripción',
              render: (m) => (
                <div className="min-w-0 max-w-md">
                  <p className="font-medium text-gray-900 truncate">
                    {m.contraparte || comercioDeMovimiento(m.descripcion) || m.descripcion}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{m.descripcion}</p>
                </div>
              ),
            },
            {
              key: 'importe',
              label: 'Importe',
              render: (m) => (
                <span className={m.importe >= 0 ? 'text-brand font-medium' : 'text-gray-900'}>
                  {formatearPrecio(m.importe)}
                </span>
              ),
            },
            {
              key: 'estado',
              label: 'Estado',
              render: (m) => (
                <div className="flex flex-col items-start gap-1">
                  <Badge variant={VARIANTE_ESTADO[m.estado]}>{m.estado}</Badge>
                  {faltaJustificante(m) && m.estado === 'Vinculado' && (
                    <span className="text-[11px] text-amber-700 flex items-center gap-1">
                      <Paperclip size={11} /> Falta justificante
                    </span>
                  )}
                </div>
              ),
            },
            {
              key: 'conciliacion',
              label: 'Conciliado con / sugerencia',
              sortable: false,
              render: (m) => {
                if (m.estado === 'Vinculado') {
                  const enlaces = m.movimientos_banco_enlaces ?? [];
                  return (
                    <div className="text-xs text-gray-600 max-w-xs">
                      {enlaces.length === 0
                        ? '—'
                        : enlaces.map((e) => (
                            <p key={e.id} className="truncate">
                              {etiquetaEnlace(e)}
                            </p>
                          ))}
                    </div>
                  );
                }
                if (m.estado !== 'Pendiente') return null;
                const s = sugerencias.get(m.id)?.[0];
                if (!s) return <span className="text-xs text-gray-400">Sin sugerencia</span>;
                return (
                  <div className="flex items-center gap-2 max-w-xs">
                    <span
                      className={`text-xs truncate ${s.exacta ? 'text-brand' : 'text-gray-600'}`}
                      title={textoSugerencia(s)}
                    >
                      {textoSugerencia(s)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        aceptarMutation.mutate({ m, s });
                      }}
                      disabled={aceptarMutation.isPending}
                      title="Aceptar sugerencia"
                      className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full bg-brand text-white hover:bg-brand-dark disabled:opacity-50"
                    >
                      <Check size={13} />
                    </button>
                  </div>
                );
              },
            },
            {
              key: 'acciones',
              label: '',
              sortable: false,
              render: (m) => (
                <div className="flex items-center justify-end gap-1.5">
                  {m.estado === 'Pendiente' && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setMovimientoAConciliar(m)}
                      >
                        <Link2 size={13} className="mr-1" />
                        Conciliar
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => ignorarMutation.mutate(m.id)}
                        title="Ignorar"
                      >
                        <Ban size={13} />
                      </Button>
                    </>
                  )}
                  {m.estado !== 'Pendiente' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => deshacerMutation.mutate(m)}
                      disabled={deshacerMutation.isPending}
                    >
                      <Undo2 size={13} className="mr-1" />
                      Deshacer
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm mt-4">
        <button
          onClick={() => setVerReglas((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-800"
        >
          {verReglas ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          Reglas automáticas ({reglas?.length ?? 0})
          <span className="text-xs font-normal text-gray-400 ml-2">
            Se crean al conciliar marcando «Recordar para los próximos…»
          </span>
        </button>
        {verReglas && (
          <div className="border-t border-gray-200 divide-y divide-gray-100">
            {(reglas ?? []).length === 0 && (
              <p className="text-sm text-gray-400 px-4 py-3">Todavía no hay reglas.</p>
            )}
            {(reglas ?? []).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <div className="min-w-0">
                  <p className="text-gray-900">
                    Si {r.sentido === 'pago' ? 'un pago' : 'un ingreso'} contiene{' '}
                    <span className="font-medium">«{r.patron}»</span>
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {r.accion === 'ignorar'
                      ? 'Ignorarlo'
                      : r.accion === 'operacion'
                        ? `Registrar en el libro contra ${r.contrapartida}${r.descripcion ? ` · ${r.descripcion}` : ''}`
                        : `Crear gasto pendiente${r.cuenta_contable ? ` · cuenta ${r.cuenta_contable}` : ''}${r.tipo_iva ? ` · ${r.tipo_iva}` : ''}`}
                    {r.veces_aplicada > 0 && ` · aplicada ${r.veces_aplicada} vez/veces`}
                  </p>
                </div>
                <button
                  onClick={() => borrarReglaMutation.mutate(r.id)}
                  title="Eliminar regla"
                  className="h-7 w-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConciliarMovimientoModal
        movimiento={movimientoAConciliar}
        onClose={() => setMovimientoAConciliar(null)}
        onAbrirFormularioGasto={(m, patron) => {
          setMovimientoAConciliar(null);
          setGastoDesde({ m, patron });
        }}
      />

      {gastoDesde && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto animate-[fade-in_150ms_ease-out]">
          <div className="bg-transparent w-full">
            <GastoForm
              onClose={() => setGastoDesde(null)}
              prefill={{
                fecha: gastoDesde.m.fecha,
                descripcion:
                  comercioDeMovimiento(gastoDesde.m.descripcion) || gastoDesde.m.descripcion || '',
                importeTotal: Math.abs(gastoDesde.m.importe),
              }}
              onGuardado={async (gastoId) => {
                const { m, patron } = gastoDesde;
                const { error } = await supabase
                  .from('movimientos_banco')
                  .update({ estado: 'Vinculado', gasto_id: gastoId })
                  .eq('id', m.id)
                  .eq('estado', 'Pendiente');
                if (error) {
                  toast.error(
                    `Gasto creado, pero no se pudo conciliar el movimiento: ${error.message}`,
                  );
                  return;
                }
                if (patron) {
                  // La regla toma la cuenta, el IVA y el proveedor definitivos del gasto guardado.
                  const { data: g, error: errorGasto } = await supabase
                    .from('gastos')
                    .select('cuenta_contable, tipo_iva, proveedor_id')
                    .eq('id', gastoId)
                    .single();
                  if (errorGasto)
                    toast.error(`No se pudo leer el gasto para la regla: ${errorGasto.message}`);
                  else {
                    try {
                      await guardarRegla({
                        patron,
                        sentido: 'pago',
                        accion: 'gasto',
                        cuenta_contable: g.cuenta_contable,
                        tipo_iva: g.tipo_iva,
                        proveedor_id: g.proveedor_id,
                        descripcion: null,
                        contrapartida: null,
                      });
                      toast.success(`Regla guardada para «${patron}»`);
                    } catch (e) {
                      toast.error(`No se pudo guardar la regla: ${(e as Error).message}`);
                    }
                  }
                }
                invalidar();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
