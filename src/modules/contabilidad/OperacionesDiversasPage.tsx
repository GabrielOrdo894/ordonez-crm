import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { useConfirmar } from '../../hooks/useConfirm';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { InfoTooltip } from '../../components/ui/InfoTooltip';
import {
  anularOperacionDiversa,
  etiquetaCuenta,
  registrarOperacionDiversa,
  validarOperacionDiversa,
  type LineaOperacion,
} from '../../lib/asientosContables';
import { fechaCorta, hoyLocalIso } from '../../lib/fechas';
import { formatearPrecio } from '../finanzas/lineas';
import { useAsientosContables } from './useAsientosContables';

// Operaciones diversas (OD): asientos manuales para lo que no nace de una factura, un gasto o un
// cobro — cierre del ejercicio, liquidación y pago de la TVA, IS, cuenta corriente del socio,
// reparto del resultado (auditoría 2026-10-01: antes no había forma de registrarlos).
// Las plantillas solo rellenan las cuentas; los importes los pone quien registra.

type Plantilla = { id: string; nombre: string; concepto: string; cuentas: { cuenta: string; lado: 'debe' | 'haber' }[]; ayuda: string };

const PLANTILLAS: Plantilla[] = [
  {
    id: 'tva-liquidacion',
    nombre: 'Liquidación de la TVA del mes (CA3)',
    concepto: 'Liquidation de la TVA — CA3 de ',
    cuentas: [
      { cuenta: '44571', lado: 'debe' },
      { cuenta: '4452', lado: 'debe' },
      { cuenta: '44566', lado: 'haber' },
      { cuenta: '445662', lado: 'haber' },
      { cuenta: '44551', lado: 'haber' },
    ],
    ayuda: 'Salda la TVA collectée y deducible del mes. La diferencia va a 44551 (a pagar) o, si sale crédito, cambia esa línea por 44567 en el debe.',
  },
  {
    id: 'tva-pago',
    nombre: 'Pago de la TVA a la DGFiP',
    concepto: 'Paiement TVA — CA3 de ',
    cuentas: [
      { cuenta: '44551', lado: 'debe' },
      { cuenta: '512', lado: 'haber' },
    ],
    ayuda: 'El día que se paga el importe de la CA3.',
  },
  {
    id: 'is',
    nombre: 'IS del ejercicio (al cierre)',
    concepto: 'Impôt sur les sociétés — exercice ',
    cuentas: [
      { cuenta: '695', lado: 'debe' },
      { cuenta: '444', lado: 'haber' },
    ],
    ayuda: 'A 31/12, por el IS calculado en la liasse.',
  },
  {
    id: 'is-pago',
    nombre: 'Pago del IS o de un acompte de IS',
    concepto: 'Paiement IS — ',
    cuentas: [
      { cuenta: '444', lado: 'debe' },
      { cuenta: '512', lado: 'haber' },
    ],
    ayuda: 'El día del pago.',
  },
  {
    id: 'cca',
    nombre: 'Gastos pagados por adelantado (cierre)',
    concepto: "Charges constatées d'avance — ",
    cuentas: [
      { cuenta: '486', lado: 'debe' },
      { cuenta: '6', lado: 'haber' },
    ],
    ayuda: 'Parte de un gasto ya contabilizado que corresponde al año siguiente (p. ej. un servicio anual pagado en septiembre). Pon la cuenta de gasto exacta en la segunda línea. El 1 de enero se registra al revés.',
  },
  {
    id: 'encours',
    nombre: 'Obras en curso (cierre)',
    concepto: 'Travaux en cours au 31/12 — ',
    cuentas: [
      { cuenta: '335', lado: 'debe' },
      { cuenta: '7133', lado: 'haber' },
    ],
    ayuda: 'Coste de las obras empezadas y sin factura final a 31/12. El 1 de enero se registra al revés.',
  },
  {
    id: 'reparto',
    nombre: 'Reparto del resultado (tras aprobar las cuentas)',
    concepto: 'Affectation du résultat de l’exercice ',
    cuentas: [
      { cuenta: '110', lado: 'debe' },
      { cuenta: '106', lado: 'haber' },
      { cuenta: '457', lado: 'haber' },
    ],
    ayuda: 'Debe 110 por lo que se reparte; haber 106 por la reserva legal y 457 por los dividendos. Con pérdidas no hace falta: quedan en report à nouveau.',
  },
  {
    id: 'socio',
    nombre: 'Dinero aportado o retirado por el socio (cuenta corriente)',
    concepto: 'Compte courant d’associé — ',
    cuentas: [
      { cuenta: '512', lado: 'debe' },
      { cuenta: '455', lado: 'haber' },
    ],
    ayuda: 'Aportación: debe 512 / haber 455. Para un reembolso al socio, al revés.',
  },
  {
    id: 'capital',
    nombre: 'Liberación del capital depositado',
    concepto: 'Libération du capital social',
    cuentas: [
      { cuenta: '512', lado: 'debe' },
      { cuenta: '467', lado: 'haber' },
    ],
    ayuda: 'Cuando el banco libera el depósito del capital a la cuenta de la EURL.',
  },
];

const lineaVaciaOd = (): LineaOperacion => ({ cuenta: '', debe: 0, haber: 0 });

export default function OperacionesDiversasPage() {
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const { data: asientos, isLoading } = useAsientosContables();

  const [fecha, setFecha] = useState(hoyLocalIso());
  const [concepto, setConcepto] = useState('');
  const [lineas, setLineas] = useState<LineaOperacion[]>([lineaVaciaOd(), lineaVaciaOd()]);
  const [plantillaId, setPlantillaId] = useState('');

  const { data: bloqueo } = useQuery({
    queryKey: ['empresa_config', 'bloqueo-contable'],
    queryFn: async () => {
      const { data, error } = await supabase.from('empresa_config').select('fecha_bloqueo_contable').eq('id', 1).single();
      if (error) throw error;
      return (data.fecha_bloqueo_contable as string | null) ?? null;
    },
  });

  const plantilla = PLANTILLAS.find((p) => p.id === plantillaId) ?? null;

  const aplicarPlantilla = (id: string) => {
    setPlantillaId(id);
    const p = PLANTILLAS.find((x) => x.id === id);
    if (!p) return;
    setConcepto(p.concepto);
    setLineas(p.cuentas.map((c) => ({ cuenta: c.cuenta, debe: 0, haber: 0 })));
  };

  const totalDebe = lineas.reduce((t, l) => t + (l.debe || 0), 0);
  const totalHaber = lineas.reduce((t, l) => t + (l.haber || 0), 0);
  const descuadre = Math.round((totalDebe - totalHaber) * 100) / 100;

  const operaciones = useMemo(() => {
    const porDocumento = new Map<string, { id: string; fecha: string; concepto: string; lineas: typeof asientos; creado: string }>();
    for (const a of asientos ?? []) {
      if (a.documento_tipo !== 'operacion') continue;
      const op = porDocumento.get(a.documento_id) ?? { id: a.documento_id, fecha: a.fecha, concepto: a.concepto, lineas: [], creado: a.created_at };
      op.lineas!.push(a);
      if (!a.concepto.endsWith('(rectificación)')) {
        op.concepto = a.concepto;
        op.fecha = a.fecha < op.fecha ? a.fecha : op.fecha;
      }
      porDocumento.set(a.documento_id, op);
    }
    return [...porDocumento.values()]
      .map((op) => {
        const netos = new Map<string, number>();
        for (const l of op.lineas ?? []) netos.set(l.cuenta, (netos.get(l.cuenta) ?? 0) + l.debe - l.haber);
        const anulada = [...netos.values()].every((n) => Math.abs(n) < 0.005);
        const importe = (op.lineas ?? []).filter((l) => !l.concepto.endsWith('(rectificación)')).reduce((t, l) => t + l.debe, 0);
        return { ...op, anulada, importe };
      })
      .sort((a, b) => b.creado.localeCompare(a.creado));
  }, [asientos]);

  const guardarMutation = useMutation({
    mutationFn: () => registrarOperacionDiversa(lineas, concepto, fecha),
    onSuccess: () => {
      toast.success('Operación registrada en el libro diario');
      setConcepto('');
      setLineas([lineaVaciaOd(), lineaVaciaOd()]);
      setPlantillaId('');
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['asientos_contables'] }),
  });

  const anularMutation = useMutation({
    mutationFn: (id: string) => anularOperacionDiversa(id, hoyLocalIso()),
    onSuccess: () => toast.success('Operación anulada (se ha registrado su asiento inverso con fecha de hoy)'),
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['asientos_contables'] }),
  });

  const handleGuardar = () => {
    const error = validarOperacionDiversa(lineas, concepto, fecha);
    if (error) return toast.error(error);
    if (bloqueo && fecha <= bloqueo) {
      return toast.error(`El periodo está cerrado hasta el ${fechaCorta(bloqueo)}: usa una fecha posterior.`);
    }
    guardarMutation.mutate();
  };

  const handleAnular = async (id: string, nombre: string) => {
    const ok = await confirmar({
      mensaje: `¿Anular "${nombre}"? Se registra el asiento inverso con fecha de hoy; el original se conserva (el libro diario no se borra).`,
      textoConfirmar: 'Anular operación',
      peligroso: true,
    });
    if (ok) anularMutation.mutate(id);
  };

  const cambiarLinea = (i: number, cambios: Partial<LineaOperacion>) =>
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...cambios } : l)));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-1.5">
          Operaciones diversas (Francia)
          <InfoTooltip>
            Asientos manuales en el libro diario para lo que no sale de una factura, un gasto o un cobro: cierre del ejercicio,
            TVA, IS, cuenta corriente del socio, reparto del resultado. Se registran igual que el resto: no se pueden editar ni
            borrar, solo anular con su asiento inverso.
          </InfoTooltip>
        </h1>
        {bloqueo && (
          <p className="text-xs text-gray-500 mt-1">Periodo contable cerrado hasta el {fechaCorta(bloqueo)} (CA3 declaradas o ejercicio cerrado).</p>
        )}
      </div>

      <section className="bg-surface border border-gray-200 rounded-sm p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-1">Nueva operación</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select
            label="Plantilla (opcional)"
            options={[{ value: '', label: '— Sin plantilla —' }, ...PLANTILLAS.map((p) => ({ value: p.id, label: p.nombre }))]}
            value={plantillaId}
            onChange={(e) => aplicarPlantilla(e.target.value)}
          />
          <Input label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <Input label="Concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej. Liquidation TVA septembre 2026" />
        </div>
        {plantilla && <p className="text-xs text-gray-500">{plantilla.ayuda}</p>}

        <div className="space-y-2">
          {lineas.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px_120px_32px] gap-2 items-end">
              <Input
                label={i === 0 ? 'Cuenta PCG' : undefined}
                value={l.cuenta}
                onChange={(e) => cambiarLinea(i, { cuenta: e.target.value.replace(/\D/g, '') })}
                hint={l.cuenta.length >= 3 ? etiquetaCuenta(l.cuenta) : undefined}
              />
              <Input
                label={i === 0 ? 'Debe' : undefined}
                type="number"
                min={0}
                value={l.debe || ''}
                onChange={(e) => cambiarLinea(i, { debe: Math.max(0, Number(e.target.value)), haber: 0 })}
              />
              <Input
                label={i === 0 ? 'Haber' : undefined}
                type="number"
                min={0}
                value={l.haber || ''}
                onChange={(e) => cambiarLinea(i, { haber: Math.max(0, Number(e.target.value)), debe: 0 })}
              />
              <button
                type="button"
                onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}
                className="text-gray-400 hover:text-red-600 pb-2"
                title="Quitar línea"
                disabled={lineas.length <= 2}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setLineas((ls) => [...ls, lineaVaciaOd()])}>
            <Plus size={14} /> Añadir línea
          </Button>
          <p className={`text-sm ${descuadre === 0 ? 'text-gray-600' : 'text-red-600 font-medium'}`}>
            Debe {formatearPrecio(totalDebe)} · Haber {formatearPrecio(totalHaber)}
            {descuadre !== 0 && ` · descuadre ${formatearPrecio(descuadre)}`}
          </p>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleGuardar} disabled={guardarMutation.isPending}>
            {guardarMutation.isPending ? 'Registrando...' : 'Registrar en el libro diario'}
          </Button>
        </div>
      </section>

      <section className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-1 mb-3">Operaciones registradas</p>
        {isLoading ? (
          <p className="text-sm text-gray-400">Cargando...</p>
        ) : operaciones.length === 0 ? (
          <p className="text-sm text-gray-400">Todavía no hay operaciones diversas.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {operaciones.map((op) => (
              <div key={op.id} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-sm ${op.anulada ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{op.concepto}</p>
                  <p className="text-xs text-gray-500">
                    {fechaCorta(op.fecha)} · {formatearPrecio(op.importe)} ·{' '}
                    {[...new Set((op.lineas ?? []).map((l) => l.cuenta))].join(', ')}
                    {op.anulada && ' · anulada'}
                  </p>
                </div>
                {!op.anulada && (
                  <Button variant="secondary" size="sm" onClick={() => handleAnular(op.id, op.concepto)} disabled={anularMutation.isPending}>
                    Anular
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
