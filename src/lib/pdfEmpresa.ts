import type jsPDF from 'jspdf';
import { supabase } from './supabase';
import { direccionEnDosLineas } from './direcciones';
import { FUENTE_PDF } from './fuentePdf';

export const VERDE_OSCURO: [number, number, number] = [15, 61, 36];
export const VERDE: [number, number, number] = [26, 92, 56];
export const VERDE_CLARO: [number, number, number] = [234, 242, 237];
export const GRIS_FONDO: [number, number, number] = [245, 245, 244];
export const GRIS_BORDE: [number, number, number] = [209, 213, 219];
export const GRIS_TEXTO: [number, number, number] = [107, 114, 128];

// La "garantie décennale" francesa agrupa legalmente estas 3 coberturas — se aclaran en los
// documentos franceses para que el cliente entienda qué incluye el seguro de obra.
export const DECENNALE_BULLETS_FR = [
  'La garantie de Responsabilité Civile Générale',
  'La garantie de Responsabilité Civile Décennale',
  'La garantie des Dommages matériels à votre ouvrage et aux Biens sur chantier',
];

export type EntidadPais = {
  razon_social?: string;
  nombre_titular?: string;
  identificador?: string;
  identificador_extra?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  web?: string;
  banco?: string;
  iban?: string;
  bic?: string;
  seguro?: string;
  num_attestation?: string;
};

export async function cargarEntidad(pais: string): Promise<{ entidad: EntidadPais; logoUrl?: string }> {
  const { data: config, error } = await supabase.from('empresa_config').select('*').eq('id', 1).single();
  if (error) throw error;
  const raiz = (config?.datos ?? {}) as { logo_url?: string; logo_oficial_url?: string; es?: EntidadPais; fr?: EntidadPais };
  const entidad: EntidadPais = (pais === 'Francia' ? raiz.fr : raiz.es) ?? {};
  // El logo oficial (gestionado en Constructor de portadas) es el que va en los documentos.
  // Si aún no se ha configurado, se usa el logo del dashboard como valor de partida.
  return { entidad, logoUrl: raiz.logo_oficial_url || raiz.logo_url };
}

export type ConfigPortada = {
  fotoUrl: string;
  filtroOpacidad: number;
};

export const FOTO_PORTADA_DEFECTO = 'https://ordonezrenov.com/wp-content/uploads/2026/07/login-fachada.webp';

export const CONFIG_PORTADA_DEFECTO: ConfigPortada = {
  fotoUrl: '',
  filtroOpacidad: 45,
};

export function configPortadaDesde(valor: unknown): ConfigPortada {
  if (!valor || typeof valor !== 'object') return CONFIG_PORTADA_DEFECTO;
  const v = valor as Partial<{ foto_url: string; filtro_opacidad: number }>;
  return {
    fotoUrl: v.foto_url || CONFIG_PORTADA_DEFECTO.fotoUrl,
    filtroOpacidad: typeof v.filtro_opacidad === 'number' ? v.filtro_opacidad : CONFIG_PORTADA_DEFECTO.filtroOpacidad,
  };
}

export async function cargarConfigCompleta() {
  const { data: config, error } = await supabase.from('empresa_config').select('*').eq('id', 1).single();
  if (error) throw error;
  return config;
}

export async function urlABase64(url: string): Promise<{ dataUrl: string; formato: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const formato = blob.type.includes('png') ? 'PNG' : 'JPEG';
    return { dataUrl, formato };
  } catch {
    return null;
  }
}

// Foto de portada: jsPDF no soporta WEBP de forma fiable, así que se pasa por canvas antes de
// incrustarla. Además se reduce a un máximo de 1400px de lado y se recodifica a JPEG — la portada
// solo ocupa 115×250mm del PDF, así que una foto de móvil a resolución completa (3000×4000 o más)
// solo añade peso muerto (varios MB) sin ninguna ganancia visual.
export async function urlAFotoPortadaBase64(url: string, maxDim = 1400): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmapUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const img = new Image();
    const { w, h } = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      img.onerror = reject;
      img.src = bitmapUrl;
    });
    const escala = Math.min(1, maxDim / Math.max(w, h));
    const wFinal = Math.round(w * escala);
    const hFinal = Math.round(h * escala);
    const canvas = document.createElement('canvas');
    canvas.width = wFinal;
    canvas.height = hFinal;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, wFinal, hFinal);
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.82), w: wFinal, h: hFinal };
  } catch {
    return null;
  }
}

export function dimensionesImagen(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = dataUrl;
  });
}

export function ajustarCaja(w: number, h: number, maxW: number, maxH: number) {
  const ratio = Math.min(maxW / w, maxH / h);
  return { w: w * ratio, h: h * ratio };
}

export function totalPaginasPdf(doc: unknown): number {
  return ((doc as { internal: { getNumberOfPages: () => number } }).internal).getNumberOfPages();
}

export function hexARgb(hex: string): [number, number, number] {
  const limpio = (hex || '#1a5c38').replace('#', '');
  const normalizado = limpio.length === 3 ? limpio.split('').map((c) => c + c).join('') : limpio;
  const num = parseInt(normalizado, 16) || 0x1a5c38;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function oscurecerHex(hex: string, factor = 0.55): [number, number, number] {
  const [r, g, b] = hexARgb(hex);
  return [Math.round(r * factor), Math.round(g * factor), Math.round(b * factor)];
}

export function aclararHex(hex: string, mezcla = 0.88): [number, number, number] {
  const [r, g, b] = hexARgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * mezcla);
  return [mix(r), mix(g), mix(b)];
}

// ---- Portada compartida (presupuestos y plannings) ----
// Extraída a un único sitio para que la portada de ambos documentos no diverja con el tiempo:
// misma foto/filtro/logo oficial/franja verde/tagline, solo cambia el texto que se le pasa.

type RGB = [number, number, number];

function iconoCalendario(doc: jsPDF, x: number, y: number, s: number, color: RGB) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y + s * 0.2, s, s * 0.72, 0.5, 0.5);
  doc.line(x, y + s * 0.44, x + s, y + s * 0.44);
  doc.line(x + s * 0.24, y, x + s * 0.24, y + s * 0.3);
  doc.line(x + s * 0.76, y, x + s * 0.76, y + s * 0.3);
}

function iconoDocumento(doc: jsPDF, x: number, y: number, s: number, color: RGB) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y, s * 0.74, s, 0.4, 0.4);
  const lx = x + s * 0.14;
  const lw = s * 0.46;
  [0.26, 0.5, 0.74].forEach((f) => doc.line(lx, y + s * f, lx + lw, y + s * f));
}

function iconoPin(doc: jsPDF, x: number, y: number, s: number, color: RGB) {
  doc.setFillColor(...color);
  doc.circle(x + s / 2, y + s * 0.36, s * 0.36, 'F');
  doc.setFillColor(255, 255, 255);
  doc.circle(x + s / 2, y + s * 0.36, s * 0.15, 'F');
  doc.setFillColor(...color);
  doc.triangle(x + s * 0.28, y + s * 0.58, x + s * 0.72, y + s * 0.58, x + s / 2, y + s * 1.05, 'F');
}

function iconoBullet(doc: jsPDF, x: number, y: number, color: RGB) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.3);
  doc.circle(x, y, 0.9, 'S');
}

// Anillo hueco (deja ver el fondo verde) con un tejado en arco abierto por abajo — como el icono
// de la imagen de inspiración, no una casa cerrada con puerta.
function iconoCasa(doc: jsPDF, cx: number, cy: number, r: number) {
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.5);
  doc.circle(cx, cy, r, 'S');

  const w = r * 1.05;
  const h = r * 1.25;
  doc.setLineWidth(1.5);
  doc.setLineJoin('round');
  doc.lines(
    [
      [0, (-2 * h) / 3],
      [w / 2, -h / 3],
      [w / 2, h / 3],
      [0, (2 * h) / 3],
    ],
    cx - w / 2,
    cy + h / 2,
    [1, 1],
    'S',
    false,
  );
}

export type FilaIconoPortada = { icono: 'calendario' | 'documento'; etiqueta: string; valor: string };

export type OpcionesPortada = {
  margen: number;
  colorRgb: RGB;
  colorOscuroRgb: RGB;
  colorSecundarioRgb: RGB;
  colorClaroRgb: RGB;
  fotoUrl: string;
  filtroOpacidad: number;
  logoActivo: { dataUrl: string; formato: string } | null;
  razonSocial: string;
  tituloDoc: string;
  tamanoTitulo: number;
  interlineaTitulo: number;
  proyecto?: { label: string; titulo: string };
  descripcion: string;
  filas: FilaIconoPortada[];
  entidad: EntidadPais;
  pais: string;
  labelCif: string;
  labelEmpresa: string;
  tagline: string;
};

export async function dibujarPortada(doc: jsPDF, o: OpcionesPortada): Promise<void> {
  const { margen, colorRgb, colorOscuroRgb, colorSecundarioRgb, colorClaroRgb } = o;
  const fotoPortada = await urlAFotoPortadaBase64(o.fotoUrl);
  const bandaTopIzq = 228;
  const bandaTopDer = 246;

  // Foto (recorte "cover" sin deformar, cubriendo x:95-210 · y:0-250).
  if (fotoPortada) {
    const escala = Math.max(115 / fotoPortada.w, 250 / fotoPortada.h);
    const wImg = fotoPortada.w * escala;
    const hImg = fotoPortada.h * escala;
    doc.addImage(fotoPortada.dataUrl, 'JPEG', 95 - (wImg - 115) / 2, -(hImg - 250) / 2, wImg, hImg);
  } else {
    doc.setFillColor(...colorClaroRgb);
    doc.rect(95, 0, 115, 250, 'F');
  }
  // Filtro blanco sobre la foto — la aclara para que el texto y los iconos destaquen encima.
  const opacidadFiltro = Math.min(1, Math.max(0, o.filtroOpacidad / 100));
  if (fotoPortada && opacidadFiltro > 0) {
    doc.setGState(doc.GState({ opacity: opacidadFiltro }));
    doc.setFillColor(255, 255, 255);
    doc.rect(95, 0, 115, 250, 'F');
    doc.setGState(doc.GState({ opacity: 1 }));
  }
  // Recorte diagonal de la foto: cubre la cuña superior-izquierda con blanco (jsPDF no tiene clip-path).
  doc.setFillColor(255, 255, 255);
  doc.lines([[150, 0], [-37, 250], [-113, 0]], 0, 0, [1, 1], 'F', true);
  // Franja verde inferior, con el borde superior en diagonal.
  doc.setFillColor(...colorOscuroRgb);
  doc.lines([[210, bandaTopDer - bandaTopIzq], [0, 297 - bandaTopDer], [-210, 0]], 0, bandaTopIzq, [1, 1], 'F', true);

  const anchoTitulo = 92;

  // Cabecera: logo + razón social
  let xHead = margen;
  if (o.logoActivo) {
    const dim = await dimensionesImagen(o.logoActivo.dataUrl);
    const caja = ajustarCaja(dim.w, dim.h, 16, 16);
    doc.addImage(o.logoActivo.dataUrl, o.logoActivo.formato, margen, 14, caja.w, caja.h);
    xHead = margen + caja.w + 5;
  }
  doc.setTextColor(...colorOscuroRgb);
  doc.setFont(FUENTE_PDF, 'bold');
  doc.setFontSize(12);
  doc.text(o.razonSocial || 'Reformas Ordoñez', xHead, 22);

  // Título grande + línea de acento
  let yTitulo = 78;
  doc.setFont(FUENTE_PDF, 'bold');
  doc.setFontSize(o.tamanoTitulo);
  doc.setTextColor(...colorOscuroRgb);
  const lineasTitulo = doc.splitTextToSize(o.tituloDoc, anchoTitulo);
  doc.text(lineasTitulo, margen, yTitulo);
  yTitulo += lineasTitulo.length * o.interlineaTitulo + 3;

  doc.setDrawColor(...colorSecundarioRgb);
  doc.setLineWidth(1.2);
  doc.line(margen, yTitulo, margen + 32, yTitulo);
  doc.setLineWidth(0.2);
  yTitulo += 10;

  if (o.proyecto?.titulo) {
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(o.proyecto.label, margen, yTitulo);
    yTitulo += 6;
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...colorOscuroRgb);
    const lineasProyecto = doc.splitTextToSize(o.proyecto.titulo, anchoTitulo);
    doc.text(lineasProyecto, margen, yTitulo);
    yTitulo += lineasProyecto.length * 6.5 + 5;
  }

  doc.setFont(FUENTE_PDF, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRIS_TEXTO);
  const lineasDesc = doc.splitTextToSize(o.descripcion, anchoTitulo);
  doc.text(lineasDesc, margen, yTitulo);
  yTitulo += lineasDesc.length * 4.6 + 14;

  // Filas con icono (fecha de emisión / número, u otros datos según el documento)
  const sIcono = 7;
  for (const fila of o.filas) {
    if (fila.icono === 'calendario') iconoCalendario(doc, margen, yTitulo - 5.5, sIcono, colorRgb);
    else iconoDocumento(doc, margen, yTitulo - 5.5, sIcono, colorRgb);
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(fila.etiqueta.toUpperCase(), margen + sIcono + 3, yTitulo - 6);
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text(fila.valor || '—', margen + sIcono + 3, yTitulo - 1);
    yTitulo += 13;
  }

  // Franja verde: datos de empresa (izquierda) + tagline con icono (derecha)
  const xBandaIzq = margen;
  const anchoBandaIzq = 95;
  const yBanda = bandaTopIzq + 15;
  doc.setFont(FUENTE_PDF, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(o.labelEmpresa, xBandaIzq, yBanda);
  doc.setFontSize(10.5);
  doc.text(o.entidad.razon_social || 'Reformas Ordoñez', xBandaIzq, yBanda + 6.5);

  const [dirL1, dirL2] = direccionEnDosLineas(o.entidad.direccion);
  const lineasEmpresa: { texto: string; pin?: boolean }[] = [];
  if (dirL1) lineasEmpresa.push({ texto: dirL1, pin: true });
  if (dirL2) lineasEmpresa.push({ texto: dirL2 });
  if (o.entidad.telefono) lineasEmpresa.push({ texto: o.entidad.telefono });
  if (o.entidad.email) lineasEmpresa.push({ texto: o.entidad.email });
  if (o.entidad.identificador) lineasEmpresa.push({ texto: `${o.labelCif}: ${o.entidad.identificador}` });
  if (o.entidad.identificador_extra) {
    lineasEmpresa.push({ texto: o.pais === 'Francia' ? `TVA: ${o.entidad.identificador_extra}` : o.entidad.identificador_extra });
  }

  doc.setFont(FUENTE_PDF, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(230, 238, 233);
  let yEmpresa = yBanda + 13;
  const blanco: RGB = [255, 255, 255];
  for (const linea of lineasEmpresa) {
    if (linea.pin) {
      iconoPin(doc, xBandaIzq - 0.3, yEmpresa - 4.2, 3.6, blanco);
    } else {
      iconoBullet(doc, xBandaIzq + 1, yEmpresa - 1.4, blanco);
    }
    doc.text(linea.texto, xBandaIzq + 6, yEmpresa);
    yEmpresa += 5;
  }

  // Línea divisoria corta y centrada en la franja (no de borde a borde) — deja aire arriba y
  // abajo, como en la imagen de inspiración.
  const centroFranja = (bandaTopIzq + 297) / 2;
  const largoDivisoria = 38;
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.2);
  doc.line(
    xBandaIzq + anchoBandaIzq,
    centroFranja - largoDivisoria / 2,
    xBandaIzq + anchoBandaIzq,
    centroFranja + largoDivisoria / 2,
  );

  const xBandaDer = xBandaIzq + anchoBandaIzq + 12;
  const anchoBandaDer = 210 - margen - xBandaDer;
  const rCasa = 6.5;
  const cxCasa = xBandaDer + rCasa;
  const cyCasa = centroFranja - 5;
  iconoCasa(doc, cxCasa, cyCasa, rCasa);

  doc.setFont(FUENTE_PDF, 'italic');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  const lineasTagline = doc.splitTextToSize(o.tagline, anchoBandaDer);
  doc.text(lineasTagline, cxCasa - rCasa, cyCasa + rCasa + 8);

  doc.addPage();
}
