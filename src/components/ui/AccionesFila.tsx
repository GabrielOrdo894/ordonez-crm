import type { LucideIcon } from 'lucide-react';
import { MoreHorizontal } from 'lucide-react';
import { DropdownMenu, type AccionMenu } from './DropdownMenu';

export type AccionRapida = {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  tono?: 'brand' | 'neutro' | 'peligro';
};

type AccionesFilaProps = {
  rapidas?: AccionRapida[];
  menu: AccionMenu[];
};

const TONOS: Record<NonNullable<AccionRapida['tono']>, string> = {
  brand: 'bg-brand text-white hover:bg-brand-dark',
  neutro: 'bg-gray-100 text-gray-500 hover:bg-gray-200',
  peligro: 'bg-red-50 text-red-600 hover:bg-red-100',
};

export function AccionesFila({ rapidas = [], menu }: AccionesFilaProps) {
  return (
    <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
      <div className="acciones-fila-idle flex items-center gap-1 text-gray-400 group-hover:hidden">
        <span className="text-xs">Acciones</span>
        <MoreHorizontal size={14} />
      </div>
      <div className="acciones-fila-pill hidden items-center gap-1 bg-surface border border-gray-200 shadow-sm rounded-full pl-1 pr-1 py-1 group-hover:flex animate-[scale-in_120ms_ease-out]">
        {rapidas.map((accion, i) => (
          <button
            key={i}
            type="button"
            title={accion.label}
            onClick={accion.onClick}
            className={`h-6 w-6 flex items-center justify-center rounded-full transition-colors ${TONOS[accion.tono ?? 'neutro']}`}
          >
            <accion.icon size={13} />
          </button>
        ))}
        <DropdownMenu acciones={menu} />
      </div>
    </div>
  );
}
