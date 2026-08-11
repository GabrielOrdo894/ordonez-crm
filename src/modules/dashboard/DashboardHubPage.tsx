import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import DashboardGeneralPage from './DashboardGeneralPage';
import DashboardPage from './DashboardPage';
import DashboardContablePage from '../contabilidad/DashboardContablePage';
import RentabilidadPage from './RentabilidadPage';

type Pestana = 'general' | 'marketing' | 'contabilidad' | 'rentabilidad';

function pestanaPorDefecto(rol: string): Pestana {
  if (rol === 'contable') return 'contabilidad';
  if (rol === 'gestion') return 'marketing';
  return 'general';
}

export default function DashboardHubPage() {
  const { rol } = useAuth();
  const [pestana, setPestana] = useState<Pestana>('general');
  const pestanaTocada = useRef(false);
  useEffect(() => {
    if (!pestanaTocada.current) setPestana(pestanaPorDefecto(rol));
  }, [rol]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {(
          [
            { value: 'general', label: 'General' },
            { value: 'marketing', label: 'Marketing' },
            { value: 'contabilidad', label: 'Contabilidad' },
            { value: 'rentabilidad', label: 'Rentabilidad' },
          ] as const
        ).map((t) => (
          <button
            key={t.value}
            onClick={() => {
              pestanaTocada.current = true;
              setPestana(t.value);
            }}
            className={`px-3 py-1.5 rounded-sm text-xs font-semibold uppercase tracking-wide border transition-colors ${
              pestana === t.value
                ? 'bg-brand text-white border-brand'
                : 'bg-surface border-gray-200 text-gray-600 hover:border-brand'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {pestana === 'general' && <DashboardGeneralPage />}
      {pestana === 'marketing' && <DashboardPage />}
      {pestana === 'contabilidad' && <DashboardContablePage />}
      {pestana === 'rentabilidad' && <RentabilidadPage />}
    </div>
  );
}
