// Catálogos de Visitas (zonas, tipos de reforma, empleados, horarios) — antes vivían como
// constantes hardcodeadas en VisitaForm.tsx, así que añadir una zona nueva o cambiar un horario
// exigía tocar código y desplegar. Ahora viven en empresa_config.datos.visitas_catalogos, editables
// desde Configuración → Visitas (mejora real, auditoría de Visitas 2026-08-18).
export type CatalogosVisitas = {
  zonasEs: string[];
  zonasFr: string[];
  tiposReforma: string[];
  empleados: string[];
  horasHabituales: string[];
  horasSabado: string[];
};

// Mismos valores que ya estaban hardcodeados — el comportamiento no cambia hasta que alguien
// edite el catálogo desde Configuración.
export const CATALOGOS_VISITAS_DEFECTO: CatalogosVisitas = {
  zonasEs: ['Irún', 'Hondarribia', 'Donostia/San Sebastián', 'Rentería', 'Bera de Bidasoa', 'Otro ES'],
  zonasFr: ['Hendaye', 'Urrugne', 'Saint-Jean-de-Luz', 'Bayonne', 'Autre FR'],
  tiposReforma: [
    'Baño', 'Cocina', 'Reforma integral', 'Pintura', 'Suelos', 'Fachada', 'Fontanería', 'Electricidad',
    'Seguimiento de obra', 'Otro',
  ],
  empleados: ['Ricardo Ordoñez', 'Ricardo Ordoñez y Gabriel', 'Ricardo Ordoñez y Santiago', 'Gabriel Ordoñez'],
  horasHabituales: ['12:00', '12:30', '13:00', '17:00', '17:30', '18:00'],
  horasSabado: ['12:00', '12:30', '13:00'],
};

function listaValida(v: unknown, defecto: string[]): string[] {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string') ? (v as string[]) : defecto;
}

export function catalogosVisitasDesde(valor: unknown): CatalogosVisitas {
  if (!valor || typeof valor !== 'object') return CATALOGOS_VISITAS_DEFECTO;
  const v = valor as Partial<CatalogosVisitas>;
  return {
    zonasEs: listaValida(v.zonasEs, CATALOGOS_VISITAS_DEFECTO.zonasEs),
    zonasFr: listaValida(v.zonasFr, CATALOGOS_VISITAS_DEFECTO.zonasFr),
    tiposReforma: listaValida(v.tiposReforma, CATALOGOS_VISITAS_DEFECTO.tiposReforma),
    empleados: listaValida(v.empleados, CATALOGOS_VISITAS_DEFECTO.empleados),
    horasHabituales: listaValida(v.horasHabituales, CATALOGOS_VISITAS_DEFECTO.horasHabituales),
    horasSabado: listaValida(v.horasSabado, CATALOGOS_VISITAS_DEFECTO.horasSabado),
  };
}
