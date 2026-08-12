export type Linea = {
  designacion: string;
  referencia: string;
  descripcion: string;
  unidad: string;
  tipo_servicio: string;
  cantidad: number;
  precio_unit: number;
  precio_unit_max?: number;
  total_sin_iva: number;
  total_con_iva: number;
  es_incluido: boolean;
};

export const UNIDADES = ['ud', 'm2', 'ml', 'h', 'forfait'];

// Categorización de la línea — en factura FR es obligatoria por normativa (ver docs/finanzas.md).
// Cada idioma usa su propia terminología legal, no una traducción literal de la otra.
const TIPOS_SERVICIO_FR = ['Travaux', 'Prestations de services BIC', 'Fournitures', "Main d'œuvre", '—'];
const TIPOS_SERVICIO_ES = ['Obra', 'Prestación de servicios', 'Suministro de materiales', 'Mano de obra', '—'];

export function getTiposServicio(idioma?: 'es' | 'fr'): string[] {
  return idioma === 'fr' ? TIPOS_SERVICIO_FR : TIPOS_SERVICIO_ES;
}

// Línea guardada en el catálogo reutilizable (tabla lineas_catalogo) — ver LineasEditor.tsx y
// CatalogoLineasSection.tsx.
export type LineaCatalogo = {
  id: string;
  designacion: string;
  referencia: string | null;
  descripcion: string | null;
  unidad: string | null;
  tipo_servicio: string | null;
  precio_unit: number | null;
  idioma: string | null; // 'es' | 'fr' — según el idioma del documento donde debe sugerirse
};

// Limpia restos de notación LaTeX que a veces se pegan en descripciones (ej. de informes técnicos
// generados con IA) — "$\ge 45\text{ A}$" o "$4,34 \text{ m}^2$" — y muestra "m2"/"m^2" con
// superíndice real (el carácter unicode ² lo soportan directamente las fuentes base de jsPDF).
export function formatearUnidadTexto(texto: string): string {
  return texto
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\$/g, '')
    .replace(/\\ge\b/g, '≥')
    .replace(/\\le\b/g, '≤')
    .replace(/\\ne\b/g, '≠')
    .replace(/\bm\s*\^?\s*2\b/gi, 'm²')
    .replace(/ {2,}/g, ' ');
}

function agruparMiles(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// "1234.5" -> "1 234,50€" — separador de miles con espacio y decimales con coma, como en los
// documentos franceses/españoles.
export function formatearPrecio(valor: number): string {
  const [entero, decimales] = valor.toFixed(2).split('.');
  return `${agruparMiles(entero)},${decimales}€`;
}

// "1234.5, 1600" -> "1 234,50 – 1 600,00€" — para presupuestos orientativos (precio en rango).
export function formatearRangoPrecio(min: number, max: number): string {
  const [minEntero, minDec] = min.toFixed(2).split('.');
  const [maxEntero, maxDec] = max.toFixed(2).split('.');
  return `${agruparMiles(minEntero)},${minDec} – ${agruparMiles(maxEntero)},${maxDec}€`;
}

export function lineaVacia(): Linea {
  return {
    designacion: '',
    referencia: '',
    descripcion: '',
    unidad: 'ud',
    tipo_servicio: '—',
    cantidad: 1,
    precio_unit: 0,
    total_sin_iva: 0,
    total_con_iva: 0,
    es_incluido: false,
  };
}

export function calcularLinea(linea: Linea, porcentajeIvaLinea: number): Linea {
  const totalSinIva = linea.es_incluido ? 0 : linea.cantidad * linea.precio_unit;
  const totalConIva = totalSinIva * (1 + porcentajeIvaLinea / 100);
  return { ...linea, total_sin_iva: totalSinIva, total_con_iva: totalConIva };
}

export function calcularTotales(lineas: Linea[]) {
  const totalSinIva = lineas.reduce((s, l) => s + (l.es_incluido ? 0 : l.total_sin_iva), 0);
  const totalConIva = lineas.reduce((s, l) => s + (l.es_incluido ? 0 : l.total_con_iva), 0);
  return { totalSinIva, totalConIva };
}

export function totalLineaMax(linea: Linea, porcentajeIvaLinea: number) {
  if (linea.es_incluido) return { sinIva: 0, conIva: 0 };
  const sinIva = linea.cantidad * (linea.precio_unit_max ?? linea.precio_unit);
  return { sinIva, conIva: sinIva * (1 + porcentajeIvaLinea / 100) };
}

export function calcularTotalesRango(lineas: Linea[], porcentajeIvaLinea: number) {
  const { totalSinIva: totalSinIvaMin, totalConIva: totalConIvaMin } = calcularTotales(lineas);
  const totalSinIvaMax = lineas.reduce((s, l) => s + totalLineaMax(l, porcentajeIvaLinea).sinIva, 0);
  const totalConIvaMax = lineas.reduce((s, l) => s + totalLineaMax(l, porcentajeIvaLinea).conIva, 0);
  return { totalSinIvaMin, totalConIvaMin, totalSinIvaMax, totalConIvaMax };
}

// Designación, referencia y tipo de servicio son obligatorios en toda línea — el IVA del
// documento (no orientativo) ya está garantizado por SelectorIva, que siempre tiene un valor.
export function lineaInvalida(linea: Linea): boolean {
  return !linea.designacion.trim() || !linea.referencia.trim() || !linea.tipo_servicio || linea.tipo_servicio === '—';
}

export function validarLineas(lineas: Linea[]): string | null {
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (!l.designacion.trim()) return `Línea ${i + 1}: falta la designación`;
    if (!l.referencia.trim()) return `Línea ${i + 1}: falta la referencia`;
    if (!l.tipo_servicio || l.tipo_servicio === '—') return `Línea ${i + 1}: falta el tipo de servicio`;
  }
  return null;
}
