import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';
import { Select } from './Select';

type Accion = {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
};

type BulkActionsBarProps = {
  count: number;
  onCancelar: () => void;
  acciones: Accion[];
};

export function BulkActionsBar({ count, onCancelar, acciones }: BulkActionsBarProps) {
  const [seleccionada, setSeleccionada] = useState(acciones[0]?.label ?? '');

  useEffect(() => {
    if (!acciones.some((a) => a.label === seleccionada)) setSeleccionada(acciones[0]?.label ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acciones.map((a) => a.label).join('|')]);

  if (count === 0) return null;

  const accionActiva = acciones.find((a) => a.label === seleccionada);

  return (
    <div className="bg-brand-light border border-gray-200 rounded-sm px-3 py-2 mb-3 flex items-center justify-between">
      <span className="text-sm font-medium text-brand">{count} seleccionado{count > 1 ? 's' : ''}</span>
      <div className="flex items-center gap-2">
        <Select
          className="w-48"
          value={seleccionada}
          onChange={(e) => setSeleccionada(e.target.value)}
          options={acciones.map((a) => ({ value: a.label, label: a.label }))}
        />
        <Button
          size="sm"
          variant={accionActiva?.variant ?? 'primary'}
          onClick={() => accionActiva?.onClick()}
          disabled={!accionActiva || accionActiva.disabled}
        >
          Aplicar
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancelar}>
          <X size={13} className="inline -mt-0.5 mr-1" />
          Cancelar
        </Button>
      </div>
    </div>
  );
}
