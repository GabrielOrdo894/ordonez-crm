import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronRight, Clock, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { BotonExportar } from '../../components/ui/BotonExportar';
import { InfoTooltip } from '../../components/ui/InfoTooltip';
import { GRUPOS_CATEGORIA } from '../finanzas/gastos/categorias';
import { porcentajeIva } from '../finanzas/iva';
import { limitesEjercicio } from '../fiscalidad/calculos';
import { formatearPrecio } from '../finanzas/lineas';
import { hoyLocalIso, isoLocal, sumarDiasIso } from '../../lib/fechas';

// La sociedad empezó a operar como tal en julio de 2026 — no hay TVA que declarar antes.
const INICIO_SOCIEDAD_MES = limitesEjercicio(2026).inicio.slice(0, 7);

type LineaDeclarada = { linea: string; base?: number; taxe?: number };
type Declaracion = {
  mes: string;
  declarado: boolean;
  fecha_declaracion: string | null;
  credito_reportado: number | null;
  // Copia de la CA3 al marcarla como declarada — para avisar si después cambia.
  datos: LineaDeclarada[] | null;
};
type EstadoMes = 'en_curso' | 'disponible' | 'declarado';

function mesISODe(anio: number, mes: number) {
  return `${anio}-${String(mes).padStart(2, '0')}`;
}

function mesAnteriorISO(mesISO: string): string {
  const [a, m] = mesISO.split('-').map(Number);
  const d = new Date(a, m - 2, 1);
  return mesISODe(d.getFullYear(), d.getMonth() + 1);
}

function fechaLimiteDeclaracion(anio: number, mes: number) {
  // Declaración mensual TVA (CA3): vence el día 19 del mes siguiente al declarado.
  return new Date(anio, mes, 19);
}

function generarUltimosMeses(hoy: Date, cantidad: number) {
  return Array.from({ length: cantidad }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    return { anio: d.getFullYear(), mes: d.getMonth() + 1, mesISO: mesISODe(d.getFullYear(), d.getMonth() + 1) };
  });
}

type FacturaFr = {
  id: string;
  numero: string | null;
  cliente_nombre: string | null;
  fecha_factura: string | null;
  tipo_iva: string | null;
  lineas: { es_incluido: boolean; total_sin_iva: number }[];
  fraccion_tva_exigible: number | null;
};

// Un pago real (pagos_factura) de una factura de Francia normal/acompte, con el tipo_iva de su
// factura embebido vía el join — base de la TVA collectée desde 2026-09-08 (ver comentario grande
// más abajo, en la query de `pagos`).
type PagoFr = {
  fecha: string;
  monto: number;
  facturas: { id: string; numero: string | null; cliente_nombre: string | null; tipo_iva: string | null };
};

type GastoFr = {
  id: string;
  descripcion: string | null;
  proveedor: string | null;
  num_factura_proveedor: string | null;
  fecha: string | null;
  tipo_iva: string | null;
  cuenta_contable: string | null;
  importe_base: number | null;
  importe_iva: number | null;
};

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// Derivadas de TIPOS_IVA (iva.ts) en vez de literales propios — asientosContables.ts usa la misma
// fuente para la autoliquidación intracom/importación, así que una tasa nueva solo se cambia en un
// sitio (antes eran dos `0.2` independientes con riesgo real de divergir, corregido 2026-09-08).
const TASA_ESTANDAR = porcentajeIva('TVA_20') / 100;
const TASA_REDUCIDA_10 = porcentajeIva('TVA_10') / 100;
const CUENTAS_IMMOBILISATIONS = GRUPOS_CATEGORIA.find((g) => g.id === 'immobilisations')?.cuentas ?? [];

// Base de una rectificativa que regulariza TVA ya declarada: solo la parte que anula lo que la
// factura original ya había cobrado (fraccion_tva_exigible). La parte de lo no cobrado nunca se
// declaró (TVA sur encaissements) y deducirla declaraba TVA de menos (auditoría 2026-10-01).
function baseFactura(f: FacturaFr) {
  return f.lineas.reduce((s, l) => s + (l.es_incluido ? 0 : l.total_sin_iva), 0) * (f.fraccion_tva_exigible ?? 1);
}

// Base sin IVA de un pago concreto (cash-basis) — todas las líneas de una factura comparten el
// mismo tipo_iva, así que la proporción base/total es uniforme y se puede aplicar directamente al
// importe cobrado (parcial o no) sin volver a leer `lineas`.
function baseSinIvaDePago(p: PagoFr) {
  const pct = porcentajeIva(p.facturas.tipo_iva);
  return pct > 0 ? p.monto / (1 + pct / 100) : p.monto;
}

function fmt(n: number) {
  return `${formatearPrecio(n)}`;
}

// Un documento que suma en una línea de la declaración — se muestra al desplegar la línea para
// saber de dónde sale cada importe (petición de Gabriel 2026-09-29). La suma de los detalles de una
// línea es exactamente su total.
type Detalle = { clave: string; fecha: string | null; documento: string; tercero: string; base?: number; taxe?: number; facturaId?: string };
type Fila = { linea: string; label: string; base?: number; taxe?: number; nota?: string; detalle?: Detalle[] };

function detallePago(p: PagoFr, tasa?: number): Detalle {
  const base = baseSinIvaDePago(p);
  return {
    clave: `pago-${p.facturas.id}-${p.fecha}-${p.monto}`,
    fecha: p.fecha,
    documento: `Cobro ${p.facturas.numero ?? ''}`.trim(),
    tercero: p.facturas.cliente_nombre ?? '—',
    base,
    taxe: tasa != null ? base * tasa : undefined,
    facturaId: p.facturas.id,
  };
}

function detalleRectificativa(f: FacturaFr, tasa?: number): Detalle {
  const base = baseFactura(f);
  return {
    clave: `rect-${f.id}`,
    fecha: f.fecha_factura,
    documento: `Rectificativa ${f.numero ?? ''}`.trim(),
    tercero: f.cliente_nombre ?? '—',
    base,
    taxe: tasa != null ? base * tasa : undefined,
    facturaId: f.id,
  };
}

// `taxe`: 'iva' = IVA deducible del propio gasto; número = autoliquidación (base × tasa).
function detalleGasto(g: GastoFr, taxe?: 'iva' | number): Detalle {
  const base = g.importe_base ?? 0;
  return {
    clave: `gasto-${g.id}`,
    fecha: g.fecha,
    documento: g.num_factura_proveedor ? `Factura ${g.num_factura_proveedor}` : (g.descripcion ?? 'Gasto'),
    tercero: g.proveedor ?? g.descripcion ?? '—',
    base,
    taxe: taxe === 'iva' ? (g.importe_iva ?? 0) : taxe != null ? base * taxe : undefined,
  };
}

function fechaCorta(fecha: string | null) {
  return fecha ? new Date(fecha).toLocaleDateString('es', { day: '2-digit', month: 'short' }) : '—';
}

function TablaSeccion({ columnaBase, columnaTaxe, filas }: { columnaBase?: string; columnaTaxe: string; filas: Fila[] }) {
  const navigate = useNavigate();
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const alternar = (linea: string) =>
    setAbiertas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(linea)) siguiente.delete(linea);
      else siguiente.add(linea);
      return siguiente;
    });
  return (
    <table className="w-full border-collapse text-sm mb-3">
      <thead>
        <tr className="text-xs text-gray-400">
          <th className="text-left py-1 font-medium w-10"></th>
          <th className="text-left py-1 font-medium"></th>
          {columnaBase && <th className="text-right py-1 font-medium w-32">{columnaBase}</th>}
          <th className="text-right py-1 font-medium w-32">{columnaTaxe}</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => {
          const desplegable = (f.detalle?.length ?? 0) > 0;
          const abierta = desplegable && abiertas.has(f.linea);
          return (
            <Fragment key={f.linea}>
              <tr
                className={`border-t border-gray-100 ${desplegable ? 'cursor-pointer hover:bg-brand-light' : ''}`}
                onClick={desplegable ? () => alternar(f.linea) : undefined}
              >
                <td className="py-1.5 text-brand font-semibold">{f.linea}</td>
                <td className="py-1.5 text-gray-700">
                  <span className="inline-flex items-center gap-1">
                    {f.label}
                    {desplegable && (
                      <span className="inline-flex items-center text-xs text-gray-400">
                        {abierta ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        {f.detalle!.length}
                      </span>
                    )}
                  </span>
                </td>
                {columnaBase && <td className="py-1.5 text-right text-gray-600">{f.base != null ? fmt(f.base) : '—'}</td>}
                <td className="py-1.5 text-right text-gray-900 font-medium">{f.taxe != null ? fmt(f.taxe) : '—'}</td>
              </tr>
              {abierta &&
                f.detalle!.map((d, i) => (
                  <tr key={`${d.clave}-${i}`} className="bg-gray-50 text-xs">
                    <td></td>
                    <td className="py-1 pl-4 text-gray-600">
                      <span className="text-gray-400 mr-2">{fechaCorta(d.fecha)}</span>
                      {d.facturaId ? (
                        <button
                          type="button"
                          onClick={() => navigate('/finanzas/facturas', { state: { verDocId: d.facturaId, verDocTipo: 'factura' } })}
                          className="text-brand hover:underline"
                        >
                          {d.documento}
                        </button>
                      ) : (
                        d.documento
                      )}
                      <span className="text-gray-400"> · {d.tercero}</span>
                    </td>
                    {columnaBase && <td className="py-1 text-right text-gray-500">{d.base != null ? fmt(d.base) : '—'}</td>}
                    <td className="py-1 text-right text-gray-700">
                      {columnaBase ? (d.taxe != null ? fmt(d.taxe) : '—') : fmt(d.taxe ?? d.base ?? 0)}
                    </td>
                  </tr>
                ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

export default function AsistenteIvaPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const hoy = useMemo(() => new Date(), []);
  const mesActualISO = mesISODe(hoy.getFullYear(), hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [creditoAnterior, setCreditoAnterior] = useState(0);

  const mesISO = `${anio}-${String(mes).padStart(2, '0')}`;
  const inicioMes = `${mesISO}-01`;
  // Hora local: con toISOString() el último día del mes pasaba a UTC y se quedaba fuera de TODAS las
  // declaraciones (septiembre acababa el 29) — auditoría 2026-09-29.
  const finMes = isoLocal(new Date(anio, mes, 0));

  const { data: declaraciones } = useQuery({
    queryKey: ['declaraciones_iva'],
    queryFn: async () => {
      const { data, error } = await supabase.from('declaraciones_iva').select('*');
      if (error) throw error;
      return data as Declaracion[];
    },
  });

  // El crédit reporté (ligne 22) se carga solo desde la ligne 27 guardada del mes ANTERIOR —
  // antes se reseteaba siempre a 0 y había que volver a teclearlo a mano cada mes (bug real
  // corregido 2026-08-11). Sigue siendo editable por si el importe declarado de verdad difiere.
  useEffect(() => {
    const declaracionAnterior = declaraciones?.find((d) => d.mes === mesAnteriorISO(mesISO));
    setCreditoAnterior(declaracionAnterior?.credito_reportado ?? 0);
  }, [mesISO, declaraciones]);

  const declaracionMesActivo = declaraciones?.find((d) => d.mes === mesISO);
  // `>=` (no `===`) para que un mes FUTURO (alcanzable eligiéndolo a mano en los selectores de
  // Mes/Año, que permiten hasta 2 años vista) también caiga en "en_curso" y no se pueda marcar
  // como declarada — antes solo se bloqueaba el mes actual, cualquier mes posterior quedaba
  // "disponible" sin ningún aviso (bug real corregido 2026-08-11).
  const estadoMesActivo: EstadoMes = mesISO >= mesActualISO ? 'en_curso' : declaracionMesActivo?.declarado ? 'declarado' : 'disponible';

  const marcarDeclaradaMutation = useMutation({
    mutationFn: async (declarado: boolean) => {
      // Guarda también la ligne 27 (crédit à reporter) ya calculada de este mes, para que el mes
      // siguiente la cargue sola como su ligne 22 en vez de tener que teclearla a mano.
      const ligne27 = datos.credito.find((f) => f.linea === '27')?.taxe ?? 0;
      const { error } = await supabase.from('declaraciones_iva').upsert({
        mes: mesISO,
        declarado,
        fecha_declaracion: declarado ? hoyLocalIso() : null,
        credito_reportado: ligne27,
        datos: declarado ? filasExportar.map((f) => ({ linea: f.linea, base: f.base, taxe: f.taxe })) : null,
      });
      if (error) throw error;
      // Mes declarado = periodo cerrado (auditoría 2026-10-01): a partir de aquí lo de este mes no se
      // puede cambiar (la base de datos lo impide); una corrección va como operación diversa en el
      // mes abierto. Al desmarcar, el bloqueo vuelve al mes anterior.
      const { data: config, error: errorConfig } = await supabase
        .from('empresa_config')
        .select('fecha_bloqueo_contable')
        .eq('id', 1)
        .single();
      if (errorConfig) throw errorConfig;
      const actual = config.fecha_bloqueo_contable as string | null;
      const finMesAnterior = sumarDiasIso(inicioMes, -1);
      const nuevo = declarado ? (actual && actual > finMes ? actual : finMes) : actual && actual >= inicioMes ? finMesAnterior : actual;
      if (nuevo !== actual) {
        const { error: errorBloqueo } = await supabase.from('empresa_config').update({ fecha_bloqueo_contable: nuevo }).eq('id', 1);
        if (errorBloqueo) throw errorBloqueo;
      }
      return nuevo;
    },
    onSuccess: (bloqueo, declarado) => {
      queryClient.invalidateQueries({ queryKey: ['declaraciones_iva'] });
      queryClient.invalidateQueries({ queryKey: ['empresa_config'] });
      toast.success(
        declarado
          ? `Declaración marcada como enviada. Periodo contable cerrado hasta el ${bloqueo ? fechaCorta(bloqueo) : '—'}.`
          : 'Declaración desmarcada',
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const mesesTarjetas = useMemo(() => {
    return generarUltimosMeses(hoy, 12)
      .filter((m) => m.mesISO >= INICIO_SOCIEDAD_MES)
      .map((m) => {
      const declaracion = declaraciones?.find((d) => d.mes === m.mesISO);
      const estado: EstadoMes = m.mesISO >= mesActualISO ? 'en_curso' : declaracion?.declarado ? 'declarado' : 'disponible';
      return { ...m, estado, limite: fechaLimiteDeclaracion(m.anio, m.mes) };
    });
  }, [declaraciones, mesActualISO, hoy]);

  // TVA collectée: Reformas Ordoñez declara al COBRO, no a la emisión (confirmado por Gabriel
  // 2026-09-08 — sin "option pour les débits" presentada, es además el régimen legal por defecto
  // para prestations de services). Así que la base gravable del mes es la suma de los PAGOS
  // recibidos ese mes (pagos_factura), no las facturas emitidas ese mes — una factura sin cobrar
  // no aporta nada hasta que se cobra, y un cobro parcial solo aporta esa parte.
  //
  // Excluye tipo='rectificativa' a propósito: una nota de crédito no se "cobra", corrige la base
  // ya declarada de una venta anterior — se sigue reconociendo en el mes de EMISIÓN (ver query de
  // `rectificativas` más abajo), igual que ya funcionaba antes de este cambio.
  const { data: pagos, isLoading: cargandoPagos } = useQuery({
    queryKey: ['pagos_factura', 'iva-fr', mesISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pagos_factura')
        .select('fecha, monto, facturas!inner(id, numero, cliente_nombre, tipo_iva)')
        .is('anulado_en', null)
        .eq('facturas.pais', 'Francia')
        .eq('facturas.estructura_anterior', false)
        .is('facturas.eliminado_en', null)
        .neq('facturas.tipo', 'rectificativa')
        .gte('fecha', inicioMes)
        .lte('fecha', finMes);
      if (error) throw error;
      // Sin tipos de Database generados para el cliente de Supabase, el helper de TS infiere el
      // embed factura_id→facturas como array (cardinalidad genérica) aunque en runtime PostgREST
      // devuelve un único objeto (es un join many-to-one por FK) — de ahí el paso por `unknown`.
      return data as unknown as PagoFr[];
    },
  });

  const { data: rectificativas, isLoading: cargandoRectificativas } = useQuery({
    queryKey: ['facturas', 'iva-fr-rectificativas', mesISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facturas')
        .select('id, numero, cliente_nombre, fecha_factura, tipo_iva, lineas, fraccion_tva_exigible')
        .is('eliminado_en', null)
        .eq('pais', 'Francia')
        .eq('estructura_anterior', false)
        .eq('tipo', 'rectificativa')
        .gte('fecha_factura', inicioMes)
        .lte('fecha_factura', finMes);
      if (error) throw error;
      return data as FacturaFr[];
    },
  });

  const { data: gastos, isLoading: cargandoGastos } = useQuery({
    queryKey: ['gastos', 'iva-fr', mesISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gastos')
        .select('id, descripcion, proveedor, num_factura_proveedor, fecha, tipo_iva, cuenta_contable, importe_base, importe_iva')
        .eq('pais', 'Francia')
        // Un gasto pendiente de revisar todavía no está contabilizado (ni tiene asiento): no deduce
        // IVA hasta que se registra como pagado.
        .eq('estado_gasto', 'pagado')
        .gte('fecha', inicioMes)
        .lte('fecha', finMes);
      if (error) throw error;
      return data as GastoFr[];
    },
  });

  const datos = useMemo(() => {
    const ps = pagos ?? [];
    const rs = rectificativas ?? [];
    const gs = gastos ?? [];

    const pagos20 = ps.filter((p) => p.facturas.tipo_iva === 'TVA_20');
    const pagos10 = ps.filter((p) => p.facturas.tipo_iva === 'TVA_10');
    const pagosExentos = ps.filter((p) => p.facturas.tipo_iva === 'EXENTO');
    const rect20 = rs.filter((f) => f.tipo_iva === 'TVA_20');
    const rect10 = rs.filter((f) => f.tipo_iva === 'TVA_10');
    const rectExentas = rs.filter((f) => f.tipo_iva === 'EXENTO');
    const gastosIntracom = gs.filter((g) => g.tipo_iva === 'INTRACOM');
    // Importación fuera de la UE — desde 2022 se autoliquida en la CA3 igual que una adquisición
    // intracomunitaria, pero en casillas propias y distintas (A4/24, no B2/17 — confirmado por
    // investigación real, auditoría 2026-08-21): la base va en A4 (no en B2) y la TVA autoliquidada
    // se declara/deduce en la casilla 24 (no en la 17), aunque el mecanismo de cálculo interno sea
    // el mismo simple×20% que ya se usaba para intracomunitario.
    const gastosImportacion = gs.filter((g) => g.tipo_iva === 'IMPORTACION');

    const baseB2 = gastosIntracom.reduce((s, g) => s + (g.importe_base ?? 0), 0);
    const baseA4 = gastosImportacion.reduce((s, g) => s + (g.importe_base ?? 0), 0);
    const baseE2 = Math.max(
      0,
      pagosExentos.reduce((s, p) => s + baseSinIvaDePago(p), 0) + rectExentas.reduce((s, f) => s + baseFactura(f), 0),
    );

    // Base gravable = cobros del mes (cash-basis, ver comentario en la query de `pagos` arriba).
    const baseVentas20 = pagos20.reduce((s, p) => s + baseSinIvaDePago(p), 0);
    const baseVentas10 = pagos10.reduce((s, p) => s + baseSinIvaDePago(p), 0);
    const baseA1 = baseVentas20 + baseVentas10;

    const taxe17 = baseB2 * TASA_ESTANDAR;
    const taxe24 = baseA4 * TASA_ESTANDAR;
    // La TVA autoliquidada de B2 (intracom) y A4 (importaciones) va DENTRO de la línea 08 (tipo del
    // 20 %) — la 17 y la 24 son solo "dont". Antes la 08 salía sin ella y, copiada al formulario
    // oficial, se declaraban 1.443 € de menos en septiembre (auditoría TVA 2026-09-29, notice
    // 3310-CA3).
    const base08 = baseVentas20 + baseB2 + baseA4;
    const taxe08 = baseVentas20 * TASA_ESTANDAR + taxe17 + taxe24;
    const base9B = baseVentas10;
    const taxe9B = base9B * TASA_REDUCIDA_10;
    const taxe16 = taxe08 + taxe9B;

    // Rectificativas (notas de crédito): la CA3 no admite importes negativos — la base va en B5
    // (régularisations) y la TVA a recuperar en la línea 21 ("dont régularisation sur TVA
    // collectée"), en positivo.
    const rectGravadas = [...rect20, ...rect10];
    const baseB5 = Math.abs(rectGravadas.reduce((s, f) => s + baseFactura(f), 0));
    const iva21 =
      Math.abs(rect20.reduce((s, f) => s + baseFactura(f), 0)) * TASA_ESTANDAR +
      Math.abs(rect10.reduce((s, f) => s + baseFactura(f), 0)) * TASA_REDUCIDA_10;

    // OJO revisado 2026-08-11 (y de nuevo 2026-08-21 al añadir importación): iva19 no excluye
    // tipo_iva === 'INTRACOM'/'IMPORTACION' a propósito — no hace falta. GastoForm.tsx fuerza
    // `porcentaje = 0` (y por tanto importe_iva = 0) para cualquier gasto marcado como
    // intracomunitario o importación, así que ninguno de los dos aporta nada aquí — su IVA solo
    // entra por taxe17/taxe24 (autoliquidación), sin duplicarse. Si algún día se permite editar
    // importe_iva a mano en esos casos, esto habría que revisarlo.
    const gastosImmo = gs.filter((g) => g.cuenta_contable && CUENTAS_IMMOBILISATIONS.includes(g.cuenta_contable));
    const iva19 = gastosImmo.reduce((s, g) => s + (g.importe_iva ?? 0), 0);
    const gastosOtros = gs.filter(
      (g) =>
        g.tipo_iva !== 'INTRACOM' &&
        g.tipo_iva !== 'IMPORTACION' &&
        (!g.cuenta_contable || !CUENTAS_IMMOBILISATIONS.includes(g.cuenta_contable)),
    );
    const iva20Gastos = gastosOtros.reduce((s, g) => s + (g.importe_iva ?? 0), 0);

    const detalle08 = [
      ...pagos20.map((p) => detallePago(p, TASA_ESTANDAR)),
      ...gastosIntracom.map((g) => detalleGasto(g, TASA_ESTANDAR)),
      ...gastosImportacion.map((g) => detalleGasto(g, TASA_ESTANDAR)),
    ];
    const detalle9B = pagos10.map((p) => detallePago(p, TASA_REDUCIDA_10));
    const positivo = (d: Detalle): Detalle => ({
      ...d,
      base: d.base != null ? Math.abs(d.base) : undefined,
      taxe: d.taxe != null ? Math.abs(d.taxe) : undefined,
    });
    const detalleRect = [
      ...rect20.map((f) => positivo(detalleRectificativa(f, TASA_ESTANDAR))),
      ...rect10.map((f) => positivo(detalleRectificativa(f, TASA_REDUCIDA_10))),
    ];
    const conIva = (g: GastoFr) => (g.importe_iva ?? 0) !== 0;
    const iva20 = iva20Gastos + taxe17 + taxe24;
    const iva22 = creditoAnterior;
    const iva23 = iva19 + iva20 + iva21 + iva22;

    const iva25 = iva23 > taxe16 ? iva23 - taxe16 : 0;
    const iva27 = iva25;
    const iva28 = taxe16 > iva23 ? taxe16 - iva23 : 0;

    return {
      seccionA_taxadas: [
        {
          linea: 'A1',
          label: 'Ventes, prestations de services',
          base: baseA1,
          detalle: [...pagos20.map((p) => detallePago(p)), ...pagos10.map((p) => detallePago(p))],
        },
        // Revisado 2026-08-11: A3 (servicios intracomunitarios) siempre 0 a propósito por ahora
        // — GastoForm.tsx solo tiene un checkbox "intracomunitario" sin distinguir bienes de
        // servicios, así que todo gasto intracom cae en B2 (bienes). Si algún día se compra un
        // servicio a un proveedor de otro país UE (ej. software, consultoría), habría que añadir
        // esa distinción al formulario de gastos para que A3 refleje datos reales.
        { linea: 'A3', label: 'Achats de prestations de services intracommunautaires', base: 0 },
        { linea: 'B2', label: 'Acquisitions intra-communautaires', base: baseB2, detalle: gastosIntracom.map((g) => detalleGasto(g)) },
        { linea: 'A4', label: 'Importations (autoliquidation, hors UE)', base: baseA4, detalle: gastosImportacion.map((g) => detalleGasto(g)) },
        { linea: 'B5', label: 'Régularisations (factures rectificatives)', base: baseB5, detalle: detalleRect.map((d) => ({ ...d, taxe: undefined })) },
      ] as Fila[],
      seccionA_noTaxadas: [
        { linea: 'E1', label: 'Exportations hors UE', base: 0 },
        {
          linea: 'E2',
          label: 'Autres opérations non imposables',
          base: baseE2,
          detalle: [...pagosExentos.map((p) => detallePago(p)), ...rectExentas.map((f) => detalleRectificativa(f))],
        },
        { linea: 'F2', label: 'Livraisons intracommunautaires (Ventes B to B)', base: 0 },
      ] as Fila[],
      tvaBruteFrance: [
        { linea: '08', label: 'Taux normal 20 %', base: base08, taxe: taxe08, detalle: detalle08 },
        { linea: '09', label: 'Taux réduit 5,5 %', base: 0, taxe: 0 },
        { linea: '9B', label: 'Taux réduit 10 %', base: base9B, taxe: taxe9B, detalle: detalle9B },
      ] as Fila[],
      tvaBruteDom: [
        { linea: '10', label: 'Taux normal 8,5 % (DOM)', base: 0, taxe: 0 },
        { linea: '11', label: 'Taux réduit 2,1 % (DOM)', base: 0, taxe: 0 },
      ] as Fila[],
      recapitulatif: [
        { linea: '15', label: 'TVA antérieurement déduite à reverser', taxe: 0 },
        { linea: '16', label: 'Total de la TVA brute due (lignes 08 à 5B)', taxe: taxe16 },
        {
          linea: '17',
          label: 'Dont TVA sur acquisitions intracommunautaires',
          taxe: taxe17,
          detalle: gastosIntracom.map((g) => detalleGasto(g, TASA_ESTANDAR)),
        },
      ] as Fila[],
      tvaDeductible: [
        {
          linea: '19',
          label: 'Biens constituant des immobilisations',
          taxe: iva19,
          detalle: gastosImmo.filter(conIva).map((g) => detalleGasto(g, 'iva')),
        },
        {
          linea: '20',
          label: 'Autres biens et services',
          taxe: iva20,
          detalle: [
            ...gastosOtros.filter(conIva).map((g) => detalleGasto(g, 'iva')),
            ...gastosIntracom.map((g) => detalleGasto(g, TASA_ESTANDAR)),
            ...gastosImportacion.map((g) => detalleGasto(g, TASA_ESTANDAR)),
          ],
        },
        {
          linea: '24',
          label: 'Dont TVA déductible sur importations',
          taxe: taxe24,
          detalle: gastosImportacion.map((g) => detalleGasto(g, TASA_ESTANDAR)),
        },
        { linea: '21', label: 'Autre TVA à déduire (dont régularisation sur TVA collectée)', taxe: iva21, detalle: detalleRect },
        { linea: '22', label: 'Report du crédit de la précédente déclaration', taxe: iva22 },
        { linea: '23', label: 'Total TVA déductible (lignes 19 à 2C)', taxe: iva23 },
      ] as Fila[],
      credito: [
        { linea: '25', label: 'Crédit de TVA (ligne 23 − ligne 16)', taxe: iva25 },
        { linea: '26', label: 'Remboursement de crédit demandé (formulaire N°3519)', taxe: 0 },
        { linea: '27', label: 'Crédit à reporter (ligne 25 − ligne 26)', taxe: iva27 },
      ] as Fila[],
      pagar: [
        { linea: '28', label: 'TVA nette due (ligne 16 − ligne 23)', taxe: iva28 },
        { linea: '32', label: 'Total à payer (ligne 28)', taxe: iva28 },
      ] as Fila[],
    };
  }, [pagos, rectificativas, gastos, creditoAnterior]);

  const filasExportar = useMemo(
    () => [
      ...datos.seccionA_taxadas,
      ...datos.seccionA_noTaxadas,
      ...datos.tvaBruteFrance,
      ...datos.tvaBruteDom,
      ...datos.recapitulatif,
      ...datos.tvaDeductible,
      ...datos.credito,
      ...datos.pagar,
    ],
    [datos],
  );

  const cargando = cargandoPagos || cargandoRectificativas || cargandoGastos;

  // Un mes ya declarado puede cambiar si luego se crea o edita un cobro o un gasto con fecha de ese
  // mes: se avisa de qué líneas difieren de lo declarado (auditoría TVA 2026-09-29). La diferencia no
  // se corrige en esa CA3, sino en la línea 21 (o 15) de una declaración posterior.
  const lineasCambiadas = useMemo(() => {
    const declaradas = declaracionMesActivo?.declarado ? declaracionMesActivo.datos : null;
    if (!declaradas) return [];
    const distinto = (a?: number, b?: number) => Math.abs((a ?? 0) - (b ?? 0)) >= 0.01;
    return filasExportar
      .filter((f) => {
        const antes = declaradas.find((d) => d.linea === f.linea);
        return !antes || distinto(antes.base, f.base) || distinto(antes.taxe, f.taxe);
      })
      .map((f) => f.linea);
  }, [declaracionMesActivo, filasExportar]);

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-5">
        {mesesTarjetas.map((m) => {
          const activa = m.mesISO === mesISO;
          return (
            <button
              key={m.mesISO}
              onClick={() => {
                setAnio(m.anio);
                setMes(m.mes);
              }}
              className={`text-left border rounded-sm p-2.5 transition-colors ${
                activa ? 'border-brand bg-brand-light' : 'border-gray-200 bg-surface hover:border-gray-300'
              }`}
            >
              <p className="text-sm font-semibold text-gray-900">
                {MESES[m.mes - 1]} {m.anio}
              </p>
              {m.estado === 'en_curso' && (
                <span className="flex items-center gap-1 text-[10px] text-amber-600 font-semibold uppercase mt-1">
                  <Clock size={11} />
                  Próximamente
                </span>
              )}
              {m.estado === 'disponible' && (
                <span className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold uppercase mt-1">
                  <Lock size={11} />
                  Pendiente
                </span>
              )}
              {m.estado === 'declarado' && (
                <span className="flex items-center gap-1 text-[10px] text-brand font-semibold uppercase mt-1">
                  <Check size={11} />
                  Declarada
                </span>
              )}
              <p className="text-[10px] text-gray-400 mt-1">Límite: 19 {MESES[m.limite.getMonth()].slice(0, 3)}</p>
            </button>
          );
        })}
      </div>

      <div className="flex items-end gap-2 mb-4 flex-wrap">
        <Select
          label="Mes"
          options={MESES.map((m, i) => ({ value: String(i + 1), label: m }))}
          value={String(mes)}
          onChange={(e) => setMes(Number(e.target.value))}
          className="w-40"
        />
        <Select
          label="Año"
          options={Array.from({ length: 5 }, (_, i) => hoy.getFullYear() - 2 + i).map((a) => ({ value: String(a), label: String(a) }))}
          value={String(anio)}
          onChange={(e) => setAnio(Number(e.target.value))}
          className="w-28"
        />
        <div className="w-56">
          <Input
            label="Crédit reporté (ligne 22)"
            type="number"
            value={creditoAnterior}
            onChange={(e) => setCreditoAnterior(Number(e.target.value))}
          />
        </div>
        <BotonExportar
          nombreArchivo={`declaration_tva_${mesISO}.csv`}
          filas={filasExportar}
          columnas={[
            { key: 'linea', label: 'Ligne' },
            { key: 'label', label: 'Concepto' },
            { key: 'base', label: 'Base HT', valor: (f) => (f.base != null ? f.base.toFixed(2) : '') },
            { key: 'taxe', label: 'Taxe', valor: (f) => (f.taxe != null ? f.taxe.toFixed(2) : '') },
          ]}
        />
      </div>

      {cargando ? (
        <div className="h-96 bg-surface border border-gray-200 rounded-sm animate-pulse" />
      ) : (
        <div className="bg-surface border border-gray-200 rounded-sm p-5 space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div>
              <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                Déclaration de TVA — {MESES[mes - 1]} {anio}
                <InfoTooltip>
                  Régimen de encaissement: las ventas cuentan por fecha de COBRO, no de emisión — una factura sin
                  cobrar no aparece hasta que se cobra.
                </InfoTooltip>
              </p>
              {estadoMesActivo === 'en_curso' && (
                <p className="text-xs text-amber-600 mt-0.5">Mes en curso — podrás declararla en cuanto termine el mes.</p>
              )}
              {estadoMesActivo === 'declarado' && declaracionMesActivo?.fecha_declaracion && (
                <p className="text-xs text-brand mt-0.5">
                  Declarada el {declaracionMesActivo.fecha_declaracion}
                </p>
              )}
              {estadoMesActivo === 'declarado' && lineasCambiadas.length > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-2 py-1 mt-1">
                  Desde que se declaró han cambiado las líneas {lineasCambiadas.join(', ')} (se ha registrado o editado un
                  cobro o gasto de este mes). No se rectifica esta CA3: la diferencia se regulariza en la línea 21 (TVA a
                  favor) o 15 (TVA a reingresar) de la próxima declaración.
                </p>
              )}
            </div>
            {estadoMesActivo !== 'en_curso' && (
              <Button
                size="sm"
                variant={estadoMesActivo === 'declarado' ? 'secondary' : 'primary'}
                onClick={() => marcarDeclaradaMutation.mutate(estadoMesActivo !== 'declarado')}
                disabled={marcarDeclaradaMutation.isPending}
              >
                {estadoMesActivo === 'declarado' ? 'Desmarcar como declarada' : 'Marcar como declarada'}
              </Button>
            )}
          </div>

          <div>
            <p className="text-sm font-bold text-gray-900 mb-3">A — Montant des opérations réalisées</p>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand bg-brand-light px-2 py-1 mb-1">
              Opérations taxées (HT)
            </p>
            <TablaSeccion columnaTaxe="Base hors taxe" filas={datos.seccionA_taxadas.map((f) => ({ ...f, taxe: f.base }))} />

            <p className="text-xs font-semibold uppercase tracking-wide text-brand bg-brand-light px-2 py-1 mb-1">
              Opérations non taxées
            </p>
            <TablaSeccion columnaTaxe="Base hors taxe" filas={datos.seccionA_noTaxadas.map((f) => ({ ...f, taxe: f.base }))} />
          </div>

          <div className="border-t border-gray-200 pt-5">
            <p className="text-sm font-bold text-gray-900 mb-3">B — Décompte de la TVA à payer</p>

            <p className="text-xs font-semibold uppercase tracking-wide text-brand bg-brand-light px-2 py-1 mb-1">TVA brute</p>
            <p className="text-xs text-gray-400 mb-1">Opérations réalisées en France Métropolitaine</p>
            <TablaSeccion columnaBase="Base hors taxe" columnaTaxe="Taxe due" filas={datos.tvaBruteFrance} />

            <p className="text-xs text-gray-400 mb-1">Opérations réalisées dans les DOM</p>
            <TablaSeccion columnaBase="Base hors taxe" columnaTaxe="Taxe due" filas={datos.tvaBruteDom} />

            <p className="text-xs text-gray-400 mb-1">Récapitulatif</p>
            <TablaSeccion columnaTaxe="Taxe due" filas={datos.recapitulatif} />

            <p className="text-xs font-semibold uppercase tracking-wide text-brand bg-brand-light px-2 py-1 mb-1 mt-3">
              TVA déductible
            </p>
            <TablaSeccion columnaTaxe="Taxe déductible" filas={datos.tvaDeductible} />
          </div>

          <div className="border-t border-gray-200 pt-5">
            <p className="text-sm font-bold text-gray-900 mb-3">Crédit de TVA</p>
            <TablaSeccion columnaTaxe="Taxe" filas={datos.credito} />
          </div>

          <div className="border-t border-gray-200 pt-5">
            <p className="text-sm font-bold text-gray-900 mb-3">Taxe à payer</p>
            <TablaSeccion columnaTaxe="Taxe due" filas={datos.pagar} />
          </div>
        </div>
      )}
    </div>
  );
}
