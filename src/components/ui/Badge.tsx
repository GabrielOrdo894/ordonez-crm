import type { CSSProperties, ReactNode } from 'react';

type Variant = 'pendiente' | 'confirmada' | 'realizada' | 'cancelada' | 'vencida' | 'default';

// realizada/cancelada/default usan los tokens de marca/gris (ya reaccionan a data-modo);
// pendiente/confirmada/vencida usan variables propias definidas en globals.css.
const VARIANT_CLASSES: Record<Variant, string> = {
  pendiente: '',
  confirmada: '',
  realizada: 'bg-brand-light text-brand',
  cancelada: 'bg-gray-50 text-gray-500',
  vencida: '',
  default: 'bg-gray-100 text-gray-600',
};

const VARIANT_STYLE: Partial<Record<Variant, CSSProperties>> = {
  pendiente: { backgroundColor: 'rgb(var(--badge-pendiente-bg))', color: 'rgb(var(--badge-pendiente-text))' },
  confirmada: { backgroundColor: 'rgb(var(--badge-confirmada-bg))', color: 'rgb(var(--badge-confirmada-text))' },
  vencida: { backgroundColor: 'rgb(var(--badge-vencida-bg))', color: 'rgb(var(--badge-vencida-text))' },
};

type BadgeProps = {
  variant?: Variant;
  children: ReactNode;
};

export function Badge({ variant = 'default', children }: BadgeProps) {
  return (
    <span
      style={VARIANT_STYLE[variant]}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${VARIANT_CLASSES[variant]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: 'currentColor' }} />
      {children}
    </span>
  );
}

export function estadoToVariant(estado: string | null | undefined): Variant {
  if (!estado) return 'default';
  const map: Record<string, Variant> = {
    Pendiente: 'pendiente',
    Realizada: 'realizada',
    Cancelada: 'cancelada',
  };
  return map[estado] ?? 'default';
}
