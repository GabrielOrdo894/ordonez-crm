import { Select } from '../../components/ui/Select';
import { OPCIONES_DELAI_PAGO, OPCIONES_MEDIO_PAGO, OPCIONES_PENALIZACION, opcionPorLabelFr } from './condicionesPagoOpciones';

export type CondicionesPagoValor = {
  delaiEs: string;
  delaiFr: string;
  penalizacionEs: string;
  penalizacionFr: string;
  medioEs: string;
  medioFr: string;
};

type CondicionesPagoEditorProps = {
  valor: CondicionesPagoValor;
  onChange: (valor: CondicionesPagoValor) => void;
};

export function CondicionesPagoEditor({ valor, onChange }: CondicionesPagoEditorProps) {
  const delaiSeleccionado = opcionPorLabelFr(OPCIONES_DELAI_PAGO, valor.delaiFr) ?? OPCIONES_DELAI_PAGO[0];
  const penalizacionSeleccionada = opcionPorLabelFr(OPCIONES_PENALIZACION, valor.penalizacionFr) ?? OPCIONES_PENALIZACION[0];
  const mediosSeleccionados = new Set(
    valor.medioFr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const toggleMedio = (labelFr: string) => {
    const nuevo = new Set(mediosSeleccionados);
    if (nuevo.has(labelFr)) nuevo.delete(labelFr);
    else nuevo.add(labelFr);
    const opciones = OPCIONES_MEDIO_PAGO.filter((o) => nuevo.has(o.labelFr));
    onChange({
      ...valor,
      medioFr: opciones.map((o) => o.labelFr).join(', '),
      medioEs: opciones.map((o) => o.labelEs).join(', '),
    });
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Select
        label="Plazo de pago"
        options={OPCIONES_DELAI_PAGO.map((o) => ({ value: o.value, label: `${o.labelEs} / ${o.labelFr}` }))}
        value={delaiSeleccionado.value}
        onChange={(e) => {
          const o = OPCIONES_DELAI_PAGO.find((op) => op.value === e.target.value) ?? OPCIONES_DELAI_PAGO[0];
          onChange({ ...valor, delaiEs: o.labelEs, delaiFr: o.labelFr });
        }}
      />
      <Select
        label="Penalización por retraso"
        options={OPCIONES_PENALIZACION.map((o) => ({ value: o.value, label: `${o.labelEs} / ${o.labelFr}` }))}
        value={penalizacionSeleccionada.value}
        onChange={(e) => {
          const o = OPCIONES_PENALIZACION.find((op) => op.value === e.target.value) ?? OPCIONES_PENALIZACION[0];
          onChange({ ...valor, penalizacionEs: o.labelEs, penalizacionFr: o.labelFr });
        }}
      />
      <div className="sm:col-span-2">
        <p className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Medios de pago aceptados</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {OPCIONES_MEDIO_PAGO.map((o) => (
            <label key={o.value} className="flex items-center gap-1.5 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={mediosSeleccionados.has(o.labelFr)}
                onChange={() => toggleMedio(o.labelFr)}
              />
              {o.labelEs} / {o.labelFr}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
