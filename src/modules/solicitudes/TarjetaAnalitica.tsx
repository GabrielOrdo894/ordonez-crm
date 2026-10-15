import type { ReactNode } from 'react';

// Caja con título para los bloques de AsistenteWebPanel.tsx — mismo aspecto que las tarjetas de
// gráficos de DashboardPage.tsx.
export function TarjetaAnalitica({ titulo, children, className = '' }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <div className={`bg-surface border border-gray-200 rounded-sm p-4 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">{titulo}</p>
      {children}
    </div>
  );
}
