import type { TamanoTitulo } from '../finanzas/DocumentoPreview';

export type ConfigTablaPlanning = {
  lineas: boolean;
  filasIntercaladas: boolean;
  encabezadoColoreado: boolean;
};

export type ConfigPlantillaPlanning = {
  colorPrimario: string;
  colorPendiente: string;
  mostrarLogo: boolean;
  mostrarPresupuesto: boolean;
  mostrarGantt: boolean;
  mostrarTablaFases: boolean;
  // Portada completa (foto + filtro + logo oficial), igual que en los presupuestos — opcional
  // porque cambia el aspecto del PDF de planning que ya está en uso.
  mostrarPortada: boolean;
  tamanoTitulo: TamanoTitulo;
  piePagina: string;
  tabla: ConfigTablaPlanning;
};

export const CONFIG_PLANNING_DEFECTO: ConfigPlantillaPlanning = {
  colorPrimario: '#1a5c38',
  colorPendiente: '#9ca3af',
  mostrarLogo: true,
  mostrarPresupuesto: true,
  mostrarGantt: true,
  mostrarTablaFases: true,
  mostrarPortada: false,
  tamanoTitulo: 'md',
  piePagina: '',
  tabla: { lineas: true, filasIntercaladas: true, encabezadoColoreado: true },
};

const TAMANOS_VALIDOS: TamanoTitulo[] = ['sm', 'md', 'lg'];

export function configPlanningDesde(valor: unknown): ConfigPlantillaPlanning {
  if (!valor || typeof valor !== 'object') return CONFIG_PLANNING_DEFECTO;
  const v = valor as Partial<ConfigPlantillaPlanning>;
  return {
    colorPrimario: v.colorPrimario || CONFIG_PLANNING_DEFECTO.colorPrimario,
    colorPendiente: v.colorPendiente || CONFIG_PLANNING_DEFECTO.colorPendiente,
    mostrarLogo: v.mostrarLogo ?? CONFIG_PLANNING_DEFECTO.mostrarLogo,
    mostrarPresupuesto: v.mostrarPresupuesto ?? CONFIG_PLANNING_DEFECTO.mostrarPresupuesto,
    mostrarGantt: v.mostrarGantt ?? CONFIG_PLANNING_DEFECTO.mostrarGantt,
    mostrarTablaFases: v.mostrarTablaFases ?? CONFIG_PLANNING_DEFECTO.mostrarTablaFases,
    mostrarPortada: v.mostrarPortada ?? CONFIG_PLANNING_DEFECTO.mostrarPortada,
    tamanoTitulo: TAMANOS_VALIDOS.includes(v.tamanoTitulo as TamanoTitulo) ? (v.tamanoTitulo as TamanoTitulo) : 'md',
    piePagina: v.piePagina ?? '',
    tabla: { ...CONFIG_PLANNING_DEFECTO.tabla, ...(v.tabla ?? {}) },
  };
}
