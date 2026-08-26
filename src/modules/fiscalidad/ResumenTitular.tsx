import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

type ResumenTitularProps = {
  icono: LucideIcon;
  children: ReactNode;
};

/** Titular grande en lenguaje claro para el principio de una pestaña técnica — una frase con la
 * cifra que de verdad importa, antes de cualquier tabla o desglose. El resto de la explicación
 * técnica (por qué, cómo se calcula) vive en el FAQ de cada pestaña, no aquí. */
export function ResumenTitular({ icono: Icono, children }: ResumenTitularProps) {
  return (
    <div className="bg-brand-light border border-gray-200 rounded-sm p-4 flex items-start gap-3">
      <span className="w-9 h-9 rounded-sm bg-surface flex items-center justify-center shrink-0 text-brand">
        <Icono size={18} />
      </span>
      <p className="text-[15px] text-gray-900 leading-snug">{children}</p>
    </div>
  );
}
