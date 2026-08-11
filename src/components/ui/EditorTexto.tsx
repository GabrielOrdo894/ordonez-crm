import { useEffect, useRef, useState } from 'react';
import { Bold, Italic, List, ListOrdered, Type } from 'lucide-react';
import { convertirHtmlAMarcado } from '../../lib/pegarHtmlComoMarcado';

// Editor de texto enriquecido WYSIWYG: cada línea es un bloque independiente con su propio tipo
// (normal/viñeta/numerada) y estilo (normal/negrita/cursiva) — nunca formato mixto dentro de una
// misma línea, la misma limitación que ya tenía la sintaxis "**negrita**"/"- viñeta" que interpreta
// src/lib/textoEnriquecido.ts al generar los PDF (jsPDF no soporta estilos mixtos en un mismo
// doc.text). Esa restricción es justo lo que permite implementar esto como WYSIWYG real sin los
// problemas típicos de un editor de texto enriquecido de propósito general: no hace falta control
// de formato a nivel de carácter, así que cada línea puede ser un <div contentEditable> de una sola
// línea, gobernado de forma "no controlada" (React nunca reescribe su contenido mientras se edita,
// solo al montarse o al recibir un `value` externo distinto del que este editor acaba de emitir) —
// así se evita el problema clásico de contentEditable+React de perder el cursor en cada tecleo.
//
// El valor externo (`value`/`onChange`) sigue siendo el mismo string plano de siempre
// ("- **texto**", etc.), 100% compatible con lo ya guardado en Supabase y con generarPdf*.ts.

type TipoLinea = 'normal' | 'lista' | 'numerada';
type EstiloLinea = 'normal' | 'negrita' | 'cursiva';

type Bloque = {
  id: string;
  tipo: TipoLinea;
  estilo: EstiloLinea;
  texto: string;
};

function crearId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function lineaABloque(lineaOriginal: string): Bloque {
  let texto = lineaOriginal;
  let tipo: TipoLinea = 'normal';
  if (texto.startsWith('- ') || texto.startsWith('* ')) {
    tipo = 'lista';
    texto = texto.slice(2);
  } else if (texto.startsWith('#. ')) {
    tipo = 'numerada';
    texto = texto.slice(3);
  }

  let estilo: EstiloLinea = 'normal';
  if (texto.startsWith('**') && texto.endsWith('**') && texto.length > 4) {
    estilo = 'negrita';
    texto = texto.slice(2, -2);
  } else if (
    (texto.startsWith('*') && texto.endsWith('*') && texto.length > 2) ||
    (texto.startsWith('_') && texto.endsWith('_') && texto.length > 2)
  ) {
    estilo = 'cursiva';
    texto = texto.slice(1, -1);
  }

  return { id: crearId(), tipo, estilo, texto };
}

function valorABloques(valor: string): Bloque[] {
  const lineas = (valor ?? '').split('\n').map(lineaABloque);
  return lineas.length > 0 ? lineas : [lineaABloque('')];
}

function bloqueALinea(b: Bloque): string {
  const prefijo = b.tipo === 'lista' ? '- ' : b.tipo === 'numerada' ? '#. ' : '';
  const cuerpo = b.estilo === 'negrita' ? `**${b.texto}**` : b.estilo === 'cursiva' ? `*${b.texto}*` : b.texto;
  return `${prefijo}${cuerpo}`;
}

function bloquesAValor(bloques: Bloque[]): string {
  return bloques.map(bloqueALinea).join('\n');
}

// --- Helpers de cursor/selección dentro de un <div contentEditable> de una sola línea de texto ---

function obtenerOffsetCaret(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return (el.textContent ?? '').length;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return (el.textContent ?? '').length;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

function haySeleccionEnRango(): boolean {
  const sel = window.getSelection();
  return !!sel && !sel.isCollapsed;
}

function idDeNodo(nodo: Node | null): string | null {
  let el = nodo instanceof Element ? nodo : nodo?.parentElement ?? null;
  while (el) {
    const id = el.getAttribute('data-bloque-id');
    if (id) return id;
    el = el.parentElement;
  }
  return null;
}

// Aunque cada línea sea un contentEditable independiente, el navegador sí arrastra una Selection
// visual de forma nativa entre varios (es un concepto a nivel de documento, no por elemento) — lo
// que no hace solo es saber qué significa "borrar"/"escribir encima" cuando esa selección cruza
// dos raíces editables distintas. Por eso se detecta aquí y se gestiona a mano en vez de dejar
// pasar la tecla.
function haySeleccionCruzandoBloques(): boolean {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return false;
  const idInicio = idDeNodo(sel.anchorNode);
  const idFin = idDeNodo(sel.focusNode);
  return !!idInicio && !!idFin && idInicio !== idFin;
}

function colocarCaret(el: HTMLElement, offset: number) {
  let textNode = el.firstChild;
  if (!textNode) textNode = el.appendChild(document.createTextNode(''));
  const max = (textNode.textContent ?? '').length;
  const pos = Math.max(0, Math.min(offset, max));
  const range = document.createRange();
  range.setStart(textNode, pos);
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  el.focus();
}

function xDelCaret(el: HTMLElement): number {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rect = range.getClientRects()[0];
    if (rect) return rect.left;
  }
  return el.getBoundingClientRect().left;
}

type DocConCaretApis = Document & {
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
};

function offsetDesdePuntoX(el: HTMLElement, x: number, y: number): number {
  const doc = document as DocConCaretApis;
  let range: Range | null = null;
  if (doc.caretRangeFromPoint) {
    range = doc.caretRangeFromPoint(x, y);
  } else if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
    }
  }
  if (!range || !el.contains(range.startContainer)) return (el.textContent ?? '').length;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

// Compara la posición vertical del caret con el propio borde del bloque — así una línea larga que
// envuelve en varias líneas visuales solo cede el foco al bloque anterior/siguiente cuando el
// cursor está en su primera/última línea visual, no en cualquier punto intermedio.
function estaEnPrimeraLineaVisual(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  const rect = range.getClientRects()[0];
  if (!rect) return true;
  return rect.top - el.getBoundingClientRect().top < 8;
}

function estaEnUltimaLineaVisual(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  const rect = range.getClientRects()[0];
  if (!rect) return true;
  return el.getBoundingClientRect().bottom - rect.bottom < 8;
}

type LineaEditableProps = {
  id: string;
  textoInicial: string;
  negrita: boolean;
  cursiva: boolean;
  onInputTexto: (id: string, texto: string) => void;
  onEnter: (id: string, antes: string, despues: string) => void;
  onBackspaceInicio: (id: string) => void;
  onDeleteFinal: (id: string) => void;
  onArrowUp: (id: string, x: number) => void;
  onArrowDown: (id: string, x: number) => void;
  onShiftArrowUp: (id: string) => void;
  onShiftArrowDown: (id: string) => void;
  onBorrarSeleccionCruzada: (insertar: string) => boolean;
  onPegar: (id: string, antes: string, despues: string, markdown: string) => void;
  onFoco: (id: string) => void;
  registrarRef: (id: string, el: HTMLDivElement | null) => void;
};

// Cada línea es un contentEditable "no controlado": su texto lo gobierna el DOM mientras el
// usuario escribe (React nunca lo reescribe en cada tecleo, solo se fija una vez al montar). Por
// eso `textoInicial` deliberadamente solo se usa dentro del efecto con deps [] — cambios
// posteriores de esa prop mientras el mismo bloque sigue montado se ignoran a propósito.
function LineaEditable({
  id,
  textoInicial,
  negrita,
  cursiva,
  onInputTexto,
  onEnter,
  onBackspaceInicio,
  onDeleteFinal,
  onArrowUp,
  onArrowDown,
  onShiftArrowUp,
  onShiftArrowDown,
  onBorrarSeleccionCruzada,
  onPegar,
  onFoco,
  registrarRef,
}: LineaEditableProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.textContent = textoInicial;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    registrarRef(id, ref.current);
    return () => registrarRef(id, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = e.currentTarget;

    // Con una selección arrastrada (o extendida con Shift+flecha) que cruza varios bloques, borrar
    // o escribir encima se gestiona aparte — cada bloque solo sabe editar su propio texto.
    if (haySeleccionCruzandoBloques()) {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        onBorrarSeleccionCruzada('');
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        onBorrarSeleccionCruzada('');
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onBorrarSeleccionCruzada(e.key);
        return;
      }
      // Otras teclas (flechas, Home/End...) se dejan pasar tal cual.
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const offset = obtenerOffsetCaret(el);
      const texto = el.textContent ?? '';
      onEnter(id, texto.slice(0, offset), texto.slice(offset));
      return;
    }
    if (e.key === 'Backspace') {
      if (obtenerOffsetCaret(el) === 0 && !haySeleccionEnRango()) {
        e.preventDefault();
        onBackspaceInicio(id);
      }
      return;
    }
    if (e.key === 'Delete') {
      const largo = (el.textContent ?? '').length;
      if (obtenerOffsetCaret(el) === largo && !haySeleccionEnRango()) {
        e.preventDefault();
        onDeleteFinal(id);
      }
      return;
    }
    // Cada bloque es un contentEditable independiente, así que el navegador no sabe extender la
    // selección de forma nativa hacia el bloque de al lado — sin este caso aparte, Shift+flecha
    // quedaría interceptado igual que la navegación simple y rompería la selección en vez de
    // extenderla (por eso comprueba shiftKey antes que nada, no después).
    const soloShift = e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (e.key === 'ArrowUp' && soloShift && estaEnPrimeraLineaVisual(el)) {
      e.preventDefault();
      onShiftArrowUp(id);
      return;
    }
    if (e.key === 'ArrowDown' && soloShift && estaEnUltimaLineaVisual(el)) {
      e.preventDefault();
      onShiftArrowDown(id);
      return;
    }
    const esNavegacionSimple = !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (e.key === 'ArrowUp' && esNavegacionSimple && estaEnPrimeraLineaVisual(el)) {
      e.preventDefault();
      onArrowUp(id, xDelCaret(el));
      return;
    }
    if (e.key === 'ArrowDown' && esNavegacionSimple && estaEnUltimaLineaVisual(el)) {
      e.preventDefault();
      onArrowDown(id, xDelCaret(el));
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const plano = e.clipboardData.getData('text/plain');
    const markdown = html.trim() ? convertirHtmlAMarcado(html) : plano;
    if (!markdown) return;
    const el = e.currentTarget;
    const offset = obtenerOffsetCaret(el);
    const texto = el.textContent ?? '';
    onPegar(id, texto.slice(0, offset), texto.slice(offset), markdown);
  };

  return (
    <div
      ref={ref}
      data-bloque-id={id}
      contentEditable
      suppressContentEditableWarning
      className={`flex-1 min-w-0 outline-none whitespace-pre-wrap break-words leading-6 ${negrita ? 'font-bold' : ''} ${
        cursiva ? 'italic' : ''
      }`}
      onInput={(e) => onInputTexto(id, e.currentTarget.textContent ?? '')}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onFocus={() => onFoco(id)}
    />
  );
}

type EditorTextoProps = {
  label?: string;
  value: string;
  onChange: (valor: string) => void;
  className?: string;
  compact?: boolean;
  placeholder?: string;
  rows?: number;
};

type FocoPendiente = { id: string; offset: number | 'inicio' | 'fin' };

export function EditorTexto({ label, value, onChange, className = '', compact, placeholder, rows }: EditorTextoProps) {
  const [bloques, setBloques] = useState<Bloque[]>(() => valorABloques(value));
  const bloquesRef = useRef<Bloque[]>(bloques);
  const ultimoValorEmitido = useRef(value);
  const refsBloques = useRef<Map<string, HTMLDivElement>>(new Map());
  const focoPendiente = useRef<FocoPendiente | null>(null);
  const [bloqueEnFocoId, setBloqueEnFocoId] = useState<string | null>(null);
  // Selection.extend() mueve el punto "foco" de la selección sin mover el foco real del DOM (el
  // contentEditable donde se originó la selección sigue siendo quien recibe los eventos de
  // teclado) — así que hay que llevar la cuenta a mano de cuántos bloques se ha extendido la
  // selección desde el bloque donde empezó, o cada nuevo Shift+flecha recalcularía siempre "un
  // bloque más allá del original" en vez de avanzar progresivamente.
  const extensionSeleccion = useRef<{ origenId: string; pasos: number } | null>(null);

  // Reset solo cuando `value` cambia por una razón AJENA a este editor (otro registro cargado,
  // "Cancelar" en el formulario, etc.) — si el cambio es simplemente el eco de nuestro propio
  // onChange, `value` coincidirá con `ultimoValorEmitido.current` y no se toca nada (evita
  // remontar todas las líneas, y con ello perder el cursor, en cada tecleo).
  useEffect(() => {
    if (value !== ultimoValorEmitido.current) {
      const nuevo = valorABloques(value);
      bloquesRef.current = nuevo;
      setBloques(nuevo);
      ultimoValorEmitido.current = value;
    }
  }, [value]);

  useEffect(() => {
    const pendiente = focoPendiente.current;
    if (!pendiente) return;
    focoPendiente.current = null;
    const el = refsBloques.current.get(pendiente.id);
    if (!el) return;
    const largo = (el.textContent ?? '').length;
    const offset = pendiente.offset === 'inicio' ? 0 : pendiente.offset === 'fin' ? largo : pendiente.offset;
    colocarCaret(el, offset);
  }, [bloques]);

  const actualizarBloques = (nuevo: Bloque[]) => {
    bloquesRef.current = nuevo;
    setBloques(nuevo);
    const valor = bloquesAValor(nuevo);
    ultimoValorEmitido.current = valor;
    onChange(valor);
  };

  const registrarRef = (id: string, el: HTMLDivElement | null) => {
    if (el) refsBloques.current.set(id, el);
    else refsBloques.current.delete(id);
  };

  const handleFoco = (id: string) => {
    extensionSeleccion.current = null;
    setBloqueEnFocoId(id);
  };

  const handleInputTexto = (id: string, texto: string) => {
    extensionSeleccion.current = null;
    actualizarBloques(bloquesRef.current.map((b) => (b.id === id ? { ...b, texto } : b)));
  };

  const handleEnter = (id: string, antes: string, despues: string) => {
    extensionSeleccion.current = null;
    const actual = bloquesRef.current;
    const idx = actual.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const bloqueActual = actual[idx];
    const elActual = refsBloques.current.get(id);
    if (elActual) elActual.textContent = antes;

    // Enter en una viñeta/numeración vacía sale de la lista (convierte esa misma línea en
    // párrafo normal, sin crear una línea nueva) en vez de encadenar otra viñeta vacía — el
    // mismo gesto estándar de Word/Notion/Google Docs.
    if (bloqueActual.tipo !== 'normal' && antes === '' && despues === '') {
      const copiaSalir = [...actual];
      copiaSalir[idx] = { ...bloqueActual, tipo: 'normal' };
      focoPendiente.current = { id, offset: 'inicio' };
      actualizarBloques(copiaSalir);
      return;
    }

    const continuarLista = bloqueActual.tipo !== 'normal';
    const nuevoBloque: Bloque = {
      id: crearId(),
      tipo: continuarLista ? bloqueActual.tipo : 'normal',
      estilo: 'normal',
      texto: despues,
    };

    const copia = [...actual];
    copia[idx] = { ...bloqueActual, texto: antes };
    copia.splice(idx + 1, 0, nuevoBloque);
    focoPendiente.current = { id: nuevoBloque.id, offset: 'inicio' };
    actualizarBloques(copia);
  };

  const handleBackspaceInicio = (id: string) => {
    extensionSeleccion.current = null;
    const actual = bloquesRef.current;
    const idx = actual.findIndex((b) => b.id === id);
    if (idx <= 0) return;
    const anterior = actual[idx - 1];
    const actualBloque = actual[idx];
    const textoUnido = anterior.texto + actualBloque.texto;
    const elAnterior = refsBloques.current.get(anterior.id);
    if (elAnterior) elAnterior.textContent = textoUnido;

    const copia = actual.filter((_, i) => i !== idx);
    copia[idx - 1] = { ...anterior, texto: textoUnido };
    focoPendiente.current = { id: anterior.id, offset: anterior.texto.length };
    actualizarBloques(copia);
  };

  const handleDeleteFinal = (id: string) => {
    extensionSeleccion.current = null;
    const actual = bloquesRef.current;
    const idx = actual.findIndex((b) => b.id === id);
    if (idx === -1 || idx >= actual.length - 1) return;
    const siguiente = actual[idx + 1];
    const actualBloque = actual[idx];
    const textoUnido = actualBloque.texto + siguiente.texto;
    const el = refsBloques.current.get(id);
    if (el) el.textContent = textoUnido;

    const copia = actual.filter((_, i) => i !== idx + 1);
    copia[idx] = { ...actualBloque, texto: textoUnido };
    focoPendiente.current = { id, offset: actualBloque.texto.length };
    actualizarBloques(copia);
  };

  const handleArrowUp = (id: string, x: number) => {
    extensionSeleccion.current = null;
    const actual = bloquesRef.current;
    const idx = actual.findIndex((b) => b.id === id);
    if (idx <= 0) return;
    const destino = actual[idx - 1];
    const elDestino = refsBloques.current.get(destino.id);
    if (elDestino) {
      const rect = elDestino.getBoundingClientRect();
      const y = rect.bottom - 4;
      colocarCaret(elDestino, offsetDesdePuntoX(elDestino, x, y));
    }
    setBloqueEnFocoId(destino.id);
  };

  const handleArrowDown = (id: string, x: number) => {
    extensionSeleccion.current = null;
    const actual = bloquesRef.current;
    const idx = actual.findIndex((b) => b.id === id);
    if (idx === -1 || idx >= actual.length - 1) return;
    const destino = actual[idx + 1];
    const elDestino = refsBloques.current.get(destino.id);
    if (elDestino) {
      const rect = elDestino.getBoundingClientRect();
      const y = rect.top + 4;
      colocarCaret(elDestino, offsetDesdePuntoX(elDestino, x, y));
    }
    setBloqueEnFocoId(destino.id);
  };

  // El navegador no extiende una Selection de forma nativa entre dos <div contentEditable>
  // independientes — Selection.extend() sí funciona a través de esa frontera (mueve el extremo
  // "foco" de la selección sin tocar el "ancla"), así que Shift+flecha en el borde de un bloque se
  // gestiona a mano en vez de dejar pasar la tecla.
  // `id` es siempre el bloque donde arrancó la selección (el foco real del DOM no se mueve al
  // extender vía Selection.extend), así que sucesivas pulsaciones de Shift+flecha necesitan la
  // cuenta de `pasos` para avanzar bloque a bloque en vez de recalcular siempre "uno más allá del
  // bloque original".
  const handleShiftArrowUp = (id: string) => {
    const actual = bloquesRef.current;
    const idxOrigen = actual.findIndex((b) => b.id === id);
    if (idxOrigen === -1) return;
    if (!extensionSeleccion.current || extensionSeleccion.current.origenId !== id) {
      extensionSeleccion.current = { origenId: id, pasos: 0 };
    }
    const pasos = extensionSeleccion.current.pasos - 1;
    const idxDestino = idxOrigen + pasos;
    if (idxDestino < 0) return;
    extensionSeleccion.current.pasos = pasos;

    const destino = actual[idxDestino];
    const elDestino = refsBloques.current.get(destino.id);
    const sel = window.getSelection();
    if (!elDestino || !sel) return;
    const nodo: ChildNode = elDestino.firstChild ?? elDestino.appendChild(document.createTextNode(''));
    // Bloque destino "hacia arriba": se selecciona entero, así que el foco va al principio.
    sel.extend(nodo, 0);
  };

  const handleShiftArrowDown = (id: string) => {
    const actual = bloquesRef.current;
    const idxOrigen = actual.findIndex((b) => b.id === id);
    if (idxOrigen === -1) return;
    if (!extensionSeleccion.current || extensionSeleccion.current.origenId !== id) {
      extensionSeleccion.current = { origenId: id, pasos: 0 };
    }
    const pasos = extensionSeleccion.current.pasos + 1;
    const idxDestino = idxOrigen + pasos;
    if (idxDestino >= actual.length) return;
    extensionSeleccion.current.pasos = pasos;

    const destino = actual[idxDestino];
    const elDestino = refsBloques.current.get(destino.id);
    const sel = window.getSelection();
    if (!elDestino || !sel) return;
    const nodo: ChildNode = elDestino.firstChild ?? elDestino.appendChild(document.createTextNode(''));
    // Bloque destino "hacia abajo": se selecciona entero, así que el foco va al final.
    sel.extend(nodo, (nodo.textContent ?? '').length);
  };

  // Calcula (sin tocar el estado todavía) cómo quedaría el array de bloques si se fusionara en
  // uno solo el tramo cubierto por una selección que cruza varios bloques — lo usan tanto borrar
  // como pegar, para no duplicar la misma cuenta de índices/offsets dos veces.
  const resolverBorradoCruzado = (): { bloques: Bloque[]; idUnido: string; offset: number } | null => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const idInicio = idDeNodo(range.startContainer);
    const idFin = idDeNodo(range.endContainer);
    if (!idInicio || !idFin || idInicio === idFin) return null;

    const actual = bloquesRef.current;
    const idxInicio = actual.findIndex((b) => b.id === idInicio);
    const idxFin = actual.findIndex((b) => b.id === idFin);
    if (idxInicio === -1 || idxFin === -1) return null;
    const elInicio = refsBloques.current.get(idInicio);
    const elFin = refsBloques.current.get(idFin);
    if (!elInicio || !elFin) return null;

    const preInicio = range.cloneRange();
    preInicio.selectNodeContents(elInicio);
    preInicio.setEnd(range.startContainer, range.startOffset);
    const textoAntes = preInicio.toString();

    const preFin = range.cloneRange();
    preFin.selectNodeContents(elFin);
    preFin.setStart(range.endContainer, range.endOffset);
    const textoDespues = preFin.toString();

    const bloqueInicio = actual[idxInicio];
    const textoUnido = textoAntes + textoDespues;
    const copia = actual.filter((_, i) => i < idxInicio || i > idxFin);
    copia.splice(idxInicio, 0, { ...bloqueInicio, texto: textoUnido });
    return { bloques: copia, idUnido: bloqueInicio.id, offset: textoAntes.length };
  };

  const aplicarBorradoCruzado = (insertar: string): boolean => {
    extensionSeleccion.current = null;
    const resuelto = resolverBorradoCruzado();
    if (!resuelto) return false;
    const bloqueUnido = resuelto.bloques.find((b) => b.id === resuelto.idUnido)!;
    const nuevoTexto = bloqueUnido.texto.slice(0, resuelto.offset) + insertar + bloqueUnido.texto.slice(resuelto.offset);
    const elUnido = refsBloques.current.get(resuelto.idUnido);
    if (elUnido) elUnido.textContent = nuevoTexto;
    const bloquesFinal = resuelto.bloques.map((b) => (b.id === resuelto.idUnido ? { ...b, texto: nuevoTexto } : b));
    focoPendiente.current = { id: resuelto.idUnido, offset: resuelto.offset + insertar.length };
    actualizarBloques(bloquesFinal);
    return true;
  };

  const handlePegar = (id: string, antes: string, despues: string, markdown: string) => {
    // Si había una selección cruzando varios bloques en el momento de pegar, primero se fusiona
    // ese tramo en uno solo (sin re-renderizar todavía) y se pega sobre el punto de unión
    // resultante, en vez de sobre la posición de un único bloque que ya no refleja la selección.
    let idEfectivo = id;
    let antesEfectivo = antes;
    let despuesEfectivo = despues;
    let actual = bloquesRef.current;
    const resuelto = resolverBorradoCruzado();
    if (resuelto) {
      bloquesRef.current = resuelto.bloques;
      actual = resuelto.bloques;
      const bloqueUnido = resuelto.bloques.find((b) => b.id === resuelto.idUnido)!;
      idEfectivo = resuelto.idUnido;
      antesEfectivo = bloqueUnido.texto.slice(0, resuelto.offset);
      despuesEfectivo = bloqueUnido.texto.slice(resuelto.offset);
    }

    const pegados = valorABloques(markdown);
    const idx = actual.findIndex((b) => b.id === idEfectivo);
    if (idx === -1) return;

    if (pegados.length === 1) {
      // Pegado de una sola línea: se inserta el texto plano en la línea actual sin heredar el
      // formato de origen, para no cambiar sin querer el estilo de la línea donde se pega.
      const nuevoTexto = antesEfectivo + pegados[0].texto + despuesEfectivo;
      const el = refsBloques.current.get(idEfectivo);
      if (el) el.textContent = nuevoTexto;
      focoPendiente.current = { id: idEfectivo, offset: antesEfectivo.length + pegados[0].texto.length };
      actualizarBloques(actual.map((b, i) => (i === idx ? { ...b, texto: nuevoTexto } : b)));
      return;
    }

    // Pegado de varias líneas (ej. copiado de Word/Google Docs): sí conserva su propia estructura
    // (viñetas, negrita/cursiva por línea) — es contenido con formato propio, no una palabra suelta.
    const primero: Bloque = { ...pegados[0], id: crearId(), texto: antesEfectivo + pegados[0].texto };
    const ultimo: Bloque = { ...pegados[pegados.length - 1], id: crearId(), texto: pegados[pegados.length - 1].texto + despuesEfectivo };
    const intermedios = pegados.slice(1, -1).map((b) => ({ ...b, id: crearId() }));
    const insertados = [primero, ...intermedios, ultimo];

    const copia = [...actual];
    copia.splice(idx, 1, ...insertados);
    focoPendiente.current = { id: ultimo.id, offset: pegados[pegados.length - 1].texto.length };
    actualizarBloques(copia);
  };

  const aplicarEstilo = (estilo: EstiloLinea) => {
    const id = bloqueEnFocoId ?? bloquesRef.current[bloquesRef.current.length - 1]?.id;
    if (!id) return;
    actualizarBloques(bloquesRef.current.map((b) => (b.id === id ? { ...b, estilo: b.estilo === estilo ? 'normal' : estilo } : b)));
  };

  const aplicarTipo = (tipo: TipoLinea) => {
    const id = bloqueEnFocoId ?? bloquesRef.current[bloquesRef.current.length - 1]?.id;
    if (!id) return;
    actualizarBloques(bloquesRef.current.map((b) => (b.id === id ? { ...b, tipo: b.tipo === tipo ? 'normal' : tipo } : b)));
  };

  const limpiarFormato = () => {
    const id = bloqueEnFocoId ?? bloquesRef.current[bloquesRef.current.length - 1]?.id;
    if (!id) return;
    actualizarBloques(bloquesRef.current.map((b) => (b.id === id ? { ...b, tipo: 'normal', estilo: 'normal' } : b)));
  };

  const botones = [
    { icon: Bold, title: 'Negrita', onClick: () => aplicarEstilo('negrita') },
    { icon: Italic, title: 'Cursiva', onClick: () => aplicarEstilo('cursiva') },
    { icon: List, title: 'Viñeta', onClick: () => aplicarTipo('lista') },
    { icon: ListOrdered, title: 'Numeración', onClick: () => aplicarTipo('numerada') },
    { icon: Type, title: 'Texto normal', onClick: limpiarFormato },
  ];

  const vacioCompleto = bloques.length === 1 && bloques[0].texto === '';
  const lineHeightPx = 24; // leading-6
  const minHeight = (rows ?? (compact ? 2 : 3)) * lineHeightPx;

  let contadorNumerada = 0;

  return (
    <div className={className}>
      {label && <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</label>}
      <div className="border border-gray-200 rounded-sm focus-within:border-brand overflow-hidden">
        <div className="flex items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-1.5 py-1">
          {botones.map(({ icon: Icon, title, onClick }) => (
            <button
              key={title}
              type="button"
              title={title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={onClick}
              className="p-1 rounded-sm text-gray-500 hover:text-brand hover:bg-brand-light"
            >
              <Icon size={13} />
            </button>
          ))}
        </div>
        <div className="relative px-2.5 py-1.5 text-sm" style={{ minHeight }}>
          {vacioCompleto && placeholder && (
            <span className="absolute left-2.5 top-1.5 text-gray-400 pointer-events-none select-none">{placeholder}</span>
          )}
          <div className="flex flex-col gap-0.5">
            {bloques.map((b) => {
              contadorNumerada = b.tipo === 'numerada' ? contadorNumerada + 1 : 0;
              return (
                <div key={b.id} className="flex items-start gap-1.5">
                  {b.tipo !== 'normal' && (
                    <span className="select-none shrink-0 text-gray-500 leading-6 w-4 text-right">
                      {b.tipo === 'lista' ? '•' : `${contadorNumerada}.`}
                    </span>
                  )}
                  <LineaEditable
                    id={b.id}
                    textoInicial={b.texto}
                    negrita={b.estilo === 'negrita'}
                    cursiva={b.estilo === 'cursiva'}
                    onInputTexto={handleInputTexto}
                    onEnter={handleEnter}
                    onBackspaceInicio={handleBackspaceInicio}
                    onDeleteFinal={handleDeleteFinal}
                    onArrowUp={handleArrowUp}
                    onArrowDown={handleArrowDown}
                    onShiftArrowUp={handleShiftArrowUp}
                    onShiftArrowDown={handleShiftArrowDown}
                    onBorrarSeleccionCruzada={aplicarBorradoCruzado}
                    onPegar={handlePegar}
                    onFoco={handleFoco}
                    registrarRef={registrarRef}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
