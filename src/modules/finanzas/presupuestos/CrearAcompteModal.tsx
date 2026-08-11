import { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { lineaVacia, calcularLinea, calcularTotales } from '../lineas';
import type { Linea } from '../lineas';
import { porcentajeIva } from '../iva';
import type { Presupuesto } from './types';

function fechaHoy() {
  return new Date().toISOString().slice(0, 10);
}

type Modo = 'porcentaje' | 'fijo';

type CrearAcompteModalProps = {
  presupuesto: Presupuesto | null;
  onClose: () => void;
  onCrear: (opts: { linea: Linea; fecha: string }) => void;
};

export function CrearAcompteModal({ presupuesto, onClose, onCrear }: CrearAcompteModalProps) {
  const [modo, setModo] = useState<Modo>('porcentaje');
  const [plazoIdx, setPlazoIdx] = useState(0);
  const [importeFijo, setImporteFijo] = useState(0);
  const [fecha, setFecha] = useState(fechaHoy());
  const [descripcion, setDescripcion] = useState('');
  const [descripcionManual, setDescripcionManual] = useState(false);

  useEffect(() => {
    if (!presupuesto) return;
    setModo(presupuesto.plan_pago.length > 0 ? 'porcentaje' : 'fijo');
    setPlazoIdx(0);
    setImporteFijo(0);
    setFecha(fechaHoy());
    setDescripcionManual(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presupuesto?.id]);

  const pct = porcentajeIva(presupuesto?.tipo_iva ?? null);
  const totalPresupuesto = presupuesto ? calcularTotales(presupuesto.lineas).totalConIva : 0;
  const plazoActual = presupuesto?.plan_pago[plazoIdx];
  const importeTtc = modo === 'porcentaje' ? (plazoActual?.importe ?? 0) : importeFijo;
  const porcentajeEfectivo =
    modo === 'porcentaje' ? (plazoActual?.porcentaje ?? 0) : totalPresupuesto > 0 ? Math.round((importeFijo / totalPresupuesto) * 1000) / 10 : 0;

  useEffect(() => {
    if (!presupuesto || descripcionManual) return;
    const esFr = presupuesto.idioma === 'Français';
    const numero = presupuesto.numero ?? '';
    const texto = esFr
      ? `Cet acompte correspond à ${porcentajeEfectivo}% du devis ${numero}.`
      : `Este anticipo corresponde al ${porcentajeEfectivo}% del presupuesto ${numero}.`;
    setDescripcion(texto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presupuesto, modo, plazoIdx, importeFijo, porcentajeEfectivo, descripcionManual]);

  if (!presupuesto) return null;

  const handleCrear = () => {
    const precioSinIva = pct > 0 ? importeTtc / (1 + pct / 100) : importeTtc;
    const linea = calcularLinea(
      {
        ...lineaVacia(),
        designacion: `Acompte — ${modo === 'porcentaje' ? (plazoActual?.concepto ?? '') : 'Anticipo'}`,
        descripcion,
        unidad: 'forfait',
        cantidad: 1,
        precio_unit: Math.round(precioSinIva * 100) / 100,
      },
      pct,
    );
    onCrear({ linea, fecha });
  };

  const puedeCrear = importeTtc > 0;

  return (
    <Modal
      open={!!presupuesto}
      onClose={onClose}
      title={`Crear anticipo — ${presupuesto.numero ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleCrear} disabled={!puedeCrear}>
            Continuar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Fecha del anticipo" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />

        <div>
          <p className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Cálculo del importe</p>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setModo('porcentaje')}
              disabled={presupuesto.plan_pago.length === 0}
              className={`px-2.5 py-1 rounded-full text-xs border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                modo === 'porcentaje' ? 'bg-brand text-white border-brand' : 'bg-surface text-gray-600 border-gray-200 hover:border-brand'
              }`}
            >
              Porcentaje del plan de pago
            </button>
            <button
              type="button"
              onClick={() => setModo('fijo')}
              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                modo === 'fijo' ? 'bg-brand text-white border-brand' : 'bg-surface text-gray-600 border-gray-200 hover:border-brand'
              }`}
            >
              Importe fijo (IVA incluido)
            </button>
          </div>

          {modo === 'porcentaje' ? (
            presupuesto.plan_pago.length > 0 ? (
              <Select
                label="Plazo"
                value={String(plazoIdx)}
                onChange={(e) => setPlazoIdx(Number(e.target.value))}
                options={presupuesto.plan_pago.map((p, i) => ({
                  value: String(i),
                  label: `${p.concepto} · ${p.porcentaje}% · ${p.importe.toFixed(2)} €`,
                }))}
              />
            ) : (
              <p className="text-xs text-gray-400">Este presupuesto no tiene plan de pago definido.</p>
            )
          ) : (
            <Input
              label="Importe del anticipo (IVA incluido)"
              type="number"
              value={importeFijo}
              onChange={(e) => setImporteFijo(Number(e.target.value))}
              hint={totalPresupuesto > 0 ? `≈ ${porcentajeEfectivo}% del total del presupuesto (${totalPresupuesto.toFixed(2)} €)` : undefined}
            />
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Descripción</label>
            {descripcionManual && (
              <button type="button" onClick={() => setDescripcionManual(false)} className="text-xs text-brand hover:underline">
                Restablecer texto automático
              </button>
            )}
          </div>
          <textarea
            value={descripcion}
            onChange={(e) => {
              setDescripcion(e.target.value);
              setDescripcionManual(true);
            }}
            rows={3}
            className="w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none resize-y"
          />
        </div>

        <p className="text-sm text-gray-500 border-t border-gray-100 pt-3">
          Importe del anticipo: <span className="font-semibold text-gray-900">{importeTtc.toFixed(2)} €</span> (IVA incluido)
        </p>
      </div>
    </Modal>
  );
}
