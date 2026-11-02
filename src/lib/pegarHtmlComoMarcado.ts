// Convierte HTML pegado (Word, Google Docs, páginas web...) a la sintaxis ligera de
// textoEnriquecido.ts ("**negrita**", "- viñeta", "#. numerada", línea en blanco = espaciado) —
// así un T&C con formato real no se pega como texto plano sin estructura. Solo reconoce negrita/
// cursiva cuando envuelven la línea ENTERA (no palabras sueltas): jsPDF no soporta estilos mixtos
// dentro de un mismo doc.text, la misma limitación que ya tiene el editor manual.
const TAGS_BLOQUE = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'TR'];

function normalizarEspacios(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

function analizarBloque(el: HTMLElement): { texto: string; negrita: boolean; cursiva: boolean } {
  const texto = normalizarEspacios(el.textContent ?? '');
  const soloHijo = el.childNodes.length === 1 && el.children.length === 1 ? el.children[0] : null;
  const envuelveTodoEn = (tags: string[]) =>
    !!soloHijo && tags.includes(soloHijo.tagName) && normalizarEspacios(soloHijo.textContent ?? '') === texto && texto !== '';
  return {
    texto,
    negrita: envuelveTodoEn(['B', 'STRONG']),
    cursiva: envuelveTodoEn(['I', 'EM']),
  };
}

function marcarLinea(lineas: string[], texto: string, negrita: boolean, cursiva: boolean, prefijo = '') {
  if (!texto) {
    if (lineas[lineas.length - 1] !== '') lineas.push('');
    return;
  }
  const cuerpo = negrita ? `**${texto}**` : cursiva ? `*${texto}*` : texto;
  lineas.push(`${prefijo}${cuerpo}`);
}

function recorrer(nodo: ParentNode, lineas: string[]) {
  for (const hijo of Array.from(nodo.childNodes)) {
    if (!(hijo instanceof HTMLElement)) continue;
    const tag = hijo.tagName;
    if (tag === 'UL' || tag === 'OL') {
      for (const li of Array.from(hijo.children)) {
        if (li.tagName !== 'LI') continue;
        const { texto, negrita, cursiva } = analizarBloque(li as HTMLElement);
        marcarLinea(lineas, texto, negrita, cursiva, tag === 'OL' ? '#. ' : '- ');
      }
      continue;
    }
    if (TAGS_BLOQUE.includes(tag)) {
      const { texto, negrita, cursiva } = analizarBloque(hijo);
      marcarLinea(lineas, texto, negrita, cursiva);
      continue;
    }
    // Contenedores sin bloques propios (spans envolviendo todo, etc.) — seguir bajando.
    recorrer(hijo, lineas);
  }
}

export function convertirHtmlAMarcado(html: string): string {
  const documento = new DOMParser().parseFromString(html, 'text/html');
  const lineas: string[] = [];
  recorrer(documento.body, lineas);

  while (lineas.length && lineas[0] === '') lineas.shift();
  while (lineas.length && lineas[lineas.length - 1] === '') lineas.pop();

  if (lineas.length > 0) return lineas.join('\n');

  // Sin bloques reconocibles (ej. solo spans sueltos en la raíz) — usar el texto plano tal cual.
  return normalizarEspacios(documento.body.textContent ?? '');
}

// Limpieza del texto pegado en el editor (2026-11-02, petición de Gabriel): un chat de WhatsApp
// copiado trae en cada línea la marca de hora y el remitente — «[2/11, 8:53] +34 657 58 51 71: …»
// en iPhone, «2/11/26, 8:53 - Gema Arnaiz: …» en Android — y tandas de líneas vacías. Se quitan
// esas marcas y se dejan como mucho una línea vacía seguida, sin tocar el resto del texto ni la
// sintaxis de viñetas/negrita.
const MARCA_WHATSAPP = /^\s*\[?\d{1,2}\/\d{1,2}(?:\/\d{2,4})?,?\s+\d{1,2}:\d{2}(?::\d{2})?\]?\s*(?:-\s*)?[^:\n]{1,60}:\s?/;

export function limpiarTextoPegado(texto: string): string {
  const lineas = texto.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(MARCA_WHATSAPP, '').trimEnd());
  const salida: string[] = [];
  for (const l of lineas) {
    if (l.trim() === '' && (salida.length === 0 || salida[salida.length - 1].trim() === '')) continue;
    salida.push(l);
  }
  while (salida.length && salida[salida.length - 1].trim() === '') salida.pop();
  return salida.join('\n');
}
