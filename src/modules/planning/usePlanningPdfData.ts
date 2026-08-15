import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cargarEntidad, cargarConfigCompleta } from '../../lib/pdfEmpresa';
import { calcularTotales } from '../finanzas/lineas';
import { configPlanningDesde } from './configPlanning';
import type { Presupuesto } from '../finanzas/presupuestos/types';

/** Datos compartidos por PlanningObraDetalle.tsx y PlanningVistaPrevia.tsx para generar el PDF del
 * planning (entidad/logo según el país, plantilla configurada, idioma y total del presupuesto) —
 * antes duplicado casi igual en ambos componentes. Cada componente sigue construyendo su propio
 * objeto de datos para `generarPdfPlanning` (uno usa el estado local en edición, el otro los
 * datos del servidor), solo esta parte común vive aquí. */
export function usePlanningPdfData(presupuesto: Presupuesto | null) {
  const pais = presupuesto?.pais ?? 'España';
  const idioma: 'es' | 'fr' = presupuesto?.idioma === 'Français' ? 'fr' : 'es';

  const { data: entidadInfo } = useQuery({
    queryKey: ['empresa_config', 'entidad', pais],
    queryFn: () => cargarEntidad(pais),
  });

  const { data: config } = useQuery({
    queryKey: ['empresa_config', 'completa'],
    queryFn: cargarConfigCompleta,
  });

  const configPlanning = useMemo(
    () => configPlanningDesde((config?.datos as { plantilla_planning?: unknown })?.plantilla_planning),
    [config],
  );

  const presupuestoTotal = presupuesto ? calcularTotales(presupuesto.lineas).totalConIva : null;

  return { pais, idioma, entidadInfo, configPlanning, presupuestoTotal };
}
