import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { BotonExportar } from '../../components/ui/BotonExportar';
import { GRUPOS_CATEGORIA } from '../finanzas/gastos/categorias';
import { limitesEjercicio } from '../fiscalidad/calculos';

// La sociedad empezó a operar como tal en julio de 2026 — no hay TVA que declarar antes.
const INICIO_SOCIEDAD_MES = limitesEjercicio(2026).inicio.slice(0, 7);

type Declaracion = { mes: string; declarado: boolean; fecha_declaracion: string | null };
type EstadoMes = 'en_curso' | 'disponible' | 'declarado';

function mesISODe(anio: number, mes: number) {
  return `${anio}-${String(mes).padStart(2, '0')}`;
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
  fecha_factura: string | null;
  tipo_iva: string | null;
  lineas: { es_incluido: boolean; total_sin_iva: number }[];
};

type GastoFr = {
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

const TASA_ESTANDAR = 0.2;
const CUENTAS_IMMOBILISATIONS = GRUPOS_CATEGORIA.find((g) => g.id === 'immobilisations')?.cuentas ?? [];

function baseFactura(f: FacturaFr) {
  return f.lineas.reduce((s, l) => s + (l.es_incluido ? 0 : l.total_sin_iva), 0);
}

function fmt(n: number) {
  return `${n.toFixed(2)} €`;
}

type Fila = { linea: string; label: string; base?: number; taxe?: number; nota?: string };

function TablaSeccion({ columnaBase, columnaTaxe, filas }: { columnaBase?: string; columnaTaxe: string; filas: Fila[] }) {
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
        {filas.map((f) => (
          <tr key={f.linea} className="border-t border-gray-100">
            <td className="py-1.5 text-brand font-semibold">{f.linea}</td>
            <td className="py-1.5 text-gray-700">{f.label}</td>
            {columnaBase && <td className="py-1.5 text-right text-gray-600">{f.base != null ? fmt(f.base) : '—'}</td>}
            <td className="py-1.5 text-right text-gray-900 font-medium">{f.taxe != null ? fmt(f.taxe) : '—'}</td>
          </tr>
        ))}
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
  const finMes = new Date(anio, mes, 0).toISOString().slice(0, 10);

  useEffect(() => {
    setCreditoAnterior(0);
  }, [mesISO]);

  const { data: declaraciones } = useQuery({
    queryKey: ['declaraciones_iva'],
    queryFn: async () => {
      const { data, error } = await supabase.from('declaraciones_iva').select('*');
      if (error) throw error;
      return data as Declaracion[];
    },
  });

  const declaracionMesActivo = declaraciones?.find((d) => d.mes === mesISO);
  const estadoMesActivo: EstadoMes = mesISO === mesActualISO ? 'en_curso' : declaracionMesActivo?.declarado ? 'declarado' : 'disponible';

  const marcarDeclaradaMutation = useMutation({
    mutationFn: async (declarado: boolean) => {
      const { error } = await supabase
        .from('declaraciones_iva')
        .upsert({ mes: mesISO, declarado, fecha_declaracion: declarado ? new Date().toISOString().slice(0, 10) : null });
      if (error) throw error;
    },
    onSuccess: (_data, declarado) => {
      queryClient.invalidateQueries({ queryKey: ['declaraciones_iva'] });
      toast.success(declarado ? 'Declaración marcada como enviada' : 'Declaración desmarcada');
    },
    onError: (error) => toast.error(error.message),
  });

  const mesesTarjetas = useMemo(() => {
    return generarUltimosMeses(hoy, 12)
      .filter((m) => m.mesISO >= INICIO_SOCIEDAD_MES)
      .map((m) => {
      const declaracion = declaraciones?.find((d) => d.mes === m.mesISO);
      const estado: EstadoMes = m.mesISO === mesActualISO ? 'en_curso' : declaracion?.declarado ? 'declarado' : 'disponible';
      return { ...m, estado, limite: fechaLimiteDeclaracion(m.anio, m.mes) };
    });
  }, [declaraciones, mesActualISO, hoy]);

  const { data: facturas, isLoading: cargandoFacturas } = useQuery({
    queryKey: ['facturas', 'iva-fr', mesISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facturas')
        .select('fecha_factura, tipo_iva, lineas')
        .is('eliminado_en', null)
        .eq('pais', 'Francia')
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
        .select('fecha, tipo_iva, cuenta_contable, importe_base, importe_iva')
        .eq('pais', 'Francia')
        .gte('fecha', inicioMes)
        .lte('fecha', finMes);
      if (error) throw error;
      return data as GastoFr[];
    },
  });

  const datos = useMemo(() => {
    const fs = facturas ?? [];
    const gs = gastos ?? [];

    const facturas20 = fs.filter((f) => f.tipo_iva === 'TVA_20');
    const facturas10 = fs.filter((f) => f.tipo_iva === 'TVA_10');
    const facturasExentas = fs.filter((f) => f.tipo_iva === 'EXENTO');
    const gastosIntracom = gs.filter((g) => g.tipo_iva === 'INTRACOM');

    const baseVentasGravadas = [...facturas20, ...facturas10].reduce((s, f) => s + baseFactura(f), 0);
    const baseA1 = baseVentasGravadas;
    const baseB2 = gastosIntracom.reduce((s, g) => s + (g.importe_base ?? 0), 0);
    const baseE2 = facturasExentas.reduce((s, f) => s + baseFactura(f), 0);

    const base08 = facturas20.reduce((s, f) => s + baseFactura(f), 0);
    const taxe08 = base08 * TASA_ESTANDAR;
    const base9B = facturas10.reduce((s, f) => s + baseFactura(f), 0);
    const taxe9B = base9B * 0.1;

    const taxe17 = baseB2 * TASA_ESTANDAR;
    const taxe16 = taxe08 + taxe9B + taxe17;

    const iva19 = gs
      .filter((g) => g.cuenta_contable && CUENTAS_IMMOBILISATIONS.includes(g.cuenta_contable))
      .reduce((s, g) => s + (g.importe_iva ?? 0), 0);
    const iva20Gastos = gs
      .filter((g) => g.tipo_iva !== 'INTRACOM' && (!g.cuenta_contable || !CUENTAS_IMMOBILISATIONS.includes(g.cuenta_contable)))
      .reduce((s, g) => s + (g.importe_iva ?? 0), 0);
    const iva20 = iva20Gastos + taxe17;
    const iva22 = creditoAnterior;
    const iva23 = iva19 + iva20 + iva22;

    const iva25 = iva23 > taxe16 ? iva23 - taxe16 : 0;
    const iva27 = iva25;
    const iva28 = taxe16 > iva23 ? taxe16 - iva23 : 0;

    return {
      seccionA_taxadas: [
        { linea: 'A1', label: 'Ventes, prestations de services', base: baseA1 },
        { linea: 'A3', label: 'Achats de prestations de services intracommunautaires', base: 0 },
        { linea: 'B2', label: 'Acquisitions intra-communautaires', base: baseB2 },
        { linea: 'B5', label: 'Régularisations', base: 0 },
      ] as Fila[],
      seccionA_noTaxadas: [
        { linea: 'E1', label: 'Exportations hors UE', base: 0 },
        { linea: 'E2', label: 'Autres opérations non imposables', base: baseE2 },
        { linea: 'F2', label: 'Livraisons intracommunautaires (Ventes B to B)', base: 0 },
      ] as Fila[],
      tvaBruteFrance: [
        { linea: '08', label: 'Taux normal 20 %', base: base08, taxe: taxe08 },
        { linea: '09', label: 'Taux réduit 5,5 %', base: 0, taxe: 0 },
        { linea: '9B', label: 'Taux réduit 10 %', base: base9B, taxe: taxe9B },
      ] as Fila[],
      tvaBruteDom: [
        { linea: '10', label: 'Taux normal 8,5 % (DOM)', base: 0, taxe: 0 },
        { linea: '11', label: 'Taux réduit 2,1 % (DOM)', base: 0, taxe: 0 },
      ] as Fila[],
      recapitulatif: [
        { linea: '15', label: 'TVA antérieurement déduite à reverser', taxe: 0 },
        { linea: '16', label: 'Total de la TVA brute due (lignes 08 à 5B)', taxe: taxe16 },
        { linea: '17', label: 'Dont TVA sur acquisitions intracommunautaires', taxe: taxe17 },
      ] as Fila[],
      tvaDeductible: [
        { linea: '19', label: 'Biens constituant des immobilisations', taxe: iva19 },
        { linea: '20', label: 'Autres biens et services', taxe: iva20 },
        { linea: '21', label: 'Autre TVA à déduire', taxe: 0 },
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
  }, [facturas, gastos, creditoAnterior]);

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

  const cargando = cargandoFacturas || cargandoGastos;

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
              <p className="text-sm font-bold text-gray-900">
                Déclaration de TVA — {MESES[mes - 1]} {anio}
              </p>
              {estadoMesActivo === 'en_curso' && (
                <p className="text-xs text-amber-600 mt-0.5">Mes en curso — podrás declararla en cuanto termine el mes.</p>
              )}
              {estadoMesActivo === 'declarado' && declaracionMesActivo?.fecha_declaracion && (
                <p className="text-xs text-brand mt-0.5">
                  Declarada el {declaracionMesActivo.fecha_declaracion}
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
