import type { EtapaFunnel } from '../../lib/funnelTracking';

// Analítica del asistente web de ordonezrenov.com (tabla `asistente_eventos`, Edge Function
// `asistente-eventos`, 2026-10-15). Una «sesión» es una carga de página con el asistente (código
// aleatorio sin cookies), así que aquí todo se agrega por sesión. Funciones puras: el panel
// (AsistenteWebPanel.tsx) solo carga los eventos y pinta lo que devuelven.

export const INICIO_SEGUIMIENTO = '2026-10-15';

export type EventoAsistente = {
  id: number;
  created_at: string;
  sesion: string;
  evento: string;
  paso: number | null;
  valor: string | null;
  pagina: string | null;
  idioma: string | null;
  dispositivo: string | null;
  solicitud_id: string | null;
};

export type ResultadoSesion = 'enviado' | 'whatsapp' | 'abandono' | 'sin_abrir';

export type SesionAsistente = {
  sesion: string;
  inicio: string;
  fin: string;
  pagina: string;
  idioma: 'es' | 'fr';
  dispositivo: 'movil' | 'escritorio';
  eventos: EventoAsistente[];
  avisoMostrado: boolean;
  abierta: boolean;
  /** Último paso (1-4) que llegó a ver; 0 si no abrió el asistente. */
  pasoMax: number;
  tipo: string | null;
  zona: string | null;
  plazo: string | null;
  whatsappOrigenes: string[];
  enviada: boolean;
  errorEnvio: boolean;
  solicitudId: string | null;
  resultado: ResultadoSesion;
};

// --- Normalización FR → ES (para agregar las dos versiones del asistente juntas) -------------

const TIPO_FR_ES: Record<string, string> = {
  'Salle de bain': 'Baño',
  Cuisine: 'Cocina',
  'Rénovation complète': 'Reforma integral',
  Sols: 'Suelos',
  Façade: 'Fachada',
  Toiture: 'Tejado',
  Maçonnerie: 'Albañilería',
  Autre: 'Otro',
};

const ZONA_FR_ES: Record<string, string> = {
  Hendaye: 'Hendaya',
  'Saint-Jean-de-Luz': 'San Juan de Luz',
  'Saint-Sébastien': 'Donostia',
  Irun: 'Irún',
};

export const ETIQUETA_PLAZO: Record<string, string> = {
  urgente: 'Cuanto antes',
  meses: 'En 1 a 3 meses',
  info: 'Solo se informa',
};

export const ETIQUETA_WHATSAPP: Record<string, string> = {
  flotante: 'Botón verde fijo',
  panel: 'Dentro de un paso',
  error: 'Tras un fallo de envío',
  final: 'Pantalla de gracias',
};

export function normalizarTipo(valor: string | null): string | null {
  if (!valor) return null;
  return TIPO_FR_ES[valor] ?? valor;
}

/** «Otro: Ascain» → «Otro municipio» (para agrupar); el texto escrito se ve en la ruta de la sesión. */
export function normalizarZona(valor: string | null): string | null {
  if (!valor) return null;
  if (/^(otro|autre)\s*:/i.test(valor) || valor === 'Otro municipio' || valor === 'Autre commune') return 'Otro municipio';
  return ZONA_FR_ES[valor] ?? valor;
}

export function normalizarPlazo(valor: string | null): string | null {
  if (!valor) return null;
  if (valor === 'urgent') return 'urgente';
  if (valor === 'mois') return 'meses';
  return valor;
}

// --- Sesiones ---------------------------------------------------------------------------------

function ordenEventos(a: EventoAsistente, b: EventoAsistente): number {
  return a.created_at === b.created_at ? a.id - b.id : a.created_at < b.created_at ? -1 : 1;
}

export function agruparSesiones(eventos: EventoAsistente[]): SesionAsistente[] {
  const porSesion = new Map<string, EventoAsistente[]>();
  for (const e of eventos) {
    const lista = porSesion.get(e.sesion);
    if (lista) lista.push(e);
    else porSesion.set(e.sesion, [e]);
  }
  const sesiones: SesionAsistente[] = [];
  for (const [sesion, lista] of porSesion) {
    lista.sort(ordenEventos);
    const primero = lista[0];
    let pasoMax = 0;
    let tipo: string | null = null;
    let zona: string | null = null;
    let plazo: string | null = null;
    let solicitudId: string | null = null;
    const whatsappOrigenes: string[] = [];
    for (const e of lista) {
      if (e.evento === 'paso' && e.paso != null && e.paso >= 1 && e.paso <= 4) pasoMax = Math.max(pasoMax, e.paso);
      if (e.evento === 'opcion') {
        if (e.paso === 1) tipo = normalizarTipo(e.valor);
        if (e.paso === 2) zona = normalizarZona(e.valor);
        if (e.paso === 3) plazo = normalizarPlazo(e.valor);
      }
      if (e.evento === 'whatsapp') whatsappOrigenes.push(e.valor ?? 'panel');
      if (e.evento === 'enviado' && e.solicitud_id) solicitudId = e.solicitud_id;
    }
    const abierta = lista.some((e) => e.evento === 'abierto') || pasoMax > 0;
    const enviada = lista.some((e) => e.evento === 'enviado');
    const resultado: ResultadoSesion = enviada
      ? 'enviado'
      : whatsappOrigenes.length > 0
        ? 'whatsapp'
        : abierta
          ? 'abandono'
          : 'sin_abrir';
    sesiones.push({
      sesion,
      inicio: primero.created_at,
      fin: lista[lista.length - 1].created_at,
      pagina: lista.find((e) => e.pagina)?.pagina ?? '—',
      idioma: primero.idioma === 'fr' ? 'fr' : 'es',
      dispositivo: primero.dispositivo === 'movil' ? 'movil' : 'escritorio',
      eventos: lista,
      avisoMostrado: lista.some((e) => e.evento === 'aviso'),
      abierta,
      pasoMax,
      tipo,
      zona,
      plazo,
      whatsappOrigenes,
      enviada,
      errorEnvio: lista.some((e) => e.evento === 'error_envio'),
      solicitudId,
      resultado,
    });
  }
  return sesiones.sort((a, b) => (a.inicio < b.inicio ? 1 : a.inicio > b.inicio ? -1 : 0));
}

function pct(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 1000) / 10 : 0;
}

// --- Embudo -----------------------------------------------------------------------------------

export type EscalonEmbudo = { clave: string; etiqueta: string; count: number; pctAnterior: number; pctAbiertos: number };

/** Vistas → abiertos → paso 1..4 → enviados. El aviso no entra en la cadena porque no todas las
 * aperturas vienen de él (sale solo en páginas sin formulario y una vez por visita): va aparte en
 * `resumenAviso`. */
export function embudoAsistente(sesiones: SesionAsistente[]): EscalonEmbudo[] {
  const abiertos = sesiones.filter((s) => s.abierta).length;
  const crudo: { clave: string; etiqueta: string; count: number }[] = [
    { clave: 'vistas', etiqueta: 'Visitas con el asistente', count: sesiones.length },
    { clave: 'abiertos', etiqueta: 'Abren el asistente', count: abiertos },
    ...[1, 2, 3, 4].map((n) => ({
      clave: `paso${n}`,
      etiqueta: ['Paso 1 · tipo de obra', 'Paso 2 · zona', 'Paso 3 · plazo', 'Paso 4 · contacto'][n - 1],
      count: sesiones.filter((s) => s.pasoMax >= n).length,
    })),
    { clave: 'enviados', etiqueta: 'Envían la solicitud', count: sesiones.filter((s) => s.enviada).length },
  ];
  return crudo.map((e, i) => ({
    ...e,
    pctAnterior: i === 0 ? 100 : pct(e.count, crudo[i - 1].count),
    pctAbiertos: e.clave === 'vistas' ? 0 : pct(e.count, abiertos),
  }));
}

export function resumenAviso(sesiones: SesionAsistente[]) {
  const conAviso = sesiones.filter((s) => s.avisoMostrado);
  const abiertosTrasAviso = sesiones.filter((s) => s.eventos.some((e) => e.evento === 'abierto' && e.valor === 'aviso')).length;
  const cerrados = conAviso.filter((s) => s.eventos.some((e) => e.evento === 'aviso_cerrado')).length;
  return { mostrados: conAviso.length, abiertosTrasAviso, cerrados, pctApertura: pct(abiertosTrasAviso, conAviso.length) };
}

/** Sesiones que abrieron y no enviaron ni fueron a WhatsApp, por el último paso que vieron. */
export function abandonoPorPaso(sesiones: SesionAsistente[]) {
  const abandonos = sesiones.filter((s) => s.resultado === 'abandono');
  return [1, 2, 3, 4].map((paso) => {
    const count = abandonos.filter((s) => s.pasoMax === paso).length;
    const llegaron = sesiones.filter((s) => s.pasoMax >= paso).length;
    return { paso, count, pctDeLosQueLlegaron: pct(count, llegaron), pctAbandonos: pct(count, abandonos.length) };
  });
}

// --- WhatsApp ---------------------------------------------------------------------------------

export function resumenWhatsapp(sesiones: SesionAsistente[]) {
  const porOrigen = new Map<string, number>();
  const porPaso = new Map<number, number>();
  let clics = 0;
  for (const s of sesiones) {
    for (const e of s.eventos) {
      if (e.evento !== 'whatsapp') continue;
      clics++;
      const origen = e.valor ?? 'panel';
      porOrigen.set(origen, (porOrigen.get(origen) ?? 0) + 1);
      const paso = e.paso ?? 0;
      porPaso.set(paso, (porPaso.get(paso) ?? 0) + 1);
    }
  }
  return {
    clics,
    sesiones: sesiones.filter((s) => s.whatsappOrigenes.length > 0).length,
    porOrigen: [...porOrigen.entries()]
      .map(([origen, count]) => ({ origen, etiqueta: ETIQUETA_WHATSAPP[origen] ?? origen, count }))
      .sort((a, b) => b.count - a.count),
    porPaso: [...porPaso.entries()]
      .map(([paso, count]) => ({ paso, etiqueta: paso === 0 ? 'Sin abrir el asistente' : paso === 5 ? 'Tras enviar' : `Paso ${paso}`, count }))
      .sort((a, b) => a.paso - b.paso),
  };
}

// --- Opciones elegidas ------------------------------------------------------------------------

export type Reparto = { nombre: string; count: number; pct: number };

function reparto(valores: (string | null)[], etiqueta?: (v: string) => string): Reparto[] {
  const conteo = new Map<string, number>();
  for (const v of valores) if (v) conteo.set(v, (conteo.get(v) ?? 0) + 1);
  const total = [...conteo.values()].reduce((a, b) => a + b, 0);
  return [...conteo.entries()]
    .map(([v, count]) => ({ nombre: etiqueta ? etiqueta(v) : v, count, pct: pct(count, total) }))
    .sort((a, b) => b.count - a.count);
}

export function opcionesElegidas(sesiones: SesionAsistente[]) {
  return {
    tipos: reparto(sesiones.map((s) => s.tipo)),
    zonas: reparto(sesiones.map((s) => s.zona)),
    plazos: reparto(sesiones.map((s) => s.plazo), (v) => ETIQUETA_PLAZO[v] ?? v),
  };
}

// --- Rutas (diagrama Sankey) ------------------------------------------------------------------

export type DatosSankey = { nodes: { name: string }[]; links: { source: number; target: number; value: number }[] };

const ETIQUETA_RESULTADO: Record<Exclude<ResultadoSesion, 'sin_abrir'>, string> = {
  enviado: 'Envía la solicitud',
  whatsapp: 'Se va a WhatsApp',
  abandono: 'Abandona',
};

/** Abierto → tipo → zona (las `maxZonas` más elegidas + «Otras zonas») → plazo → resultado. Una
 * sesión que se queda a medias enlaza su última etapa directamente con el resultado. Los nombres
 * de nodo llevan prefijo de nivel por dentro para que «Otro» (tipo) y «Otro municipio» (zona) no
 * se fundan y el grafo no tenga ciclos; el prefijo se quita al pintar (`nombreNodoSankey`). */
export function datosSankey(sesiones: SesionAsistente[], maxZonas = 5): DatosSankey {
  const abiertas = sesiones.filter((s) => s.abierta);
  const zonasTop = new Set(
    reparto(abiertas.map((s) => s.zona))
      .slice(0, maxZonas)
      .map((r) => r.nombre),
  );
  const indice = new Map<string, number>();
  const nodes: { name: string }[] = [];
  const nodo = (clave: string) => {
    let i = indice.get(clave);
    if (i == null) {
      i = nodes.length;
      indice.set(clave, i);
      nodes.push({ name: clave });
    }
    return i;
  };
  const enlaces = new Map<string, number>();
  const sumar = (a: number, b: number) => {
    const k = `${a}>${b}`;
    enlaces.set(k, (enlaces.get(k) ?? 0) + 1);
  };
  for (const s of abiertas) {
    const etapas = [nodo('0|Abre el asistente')];
    if (s.tipo) etapas.push(nodo(`1|${s.tipo}`));
    if (s.tipo && s.zona) etapas.push(nodo(`2|${zonasTop.has(s.zona) ? s.zona : 'Otras zonas'}`));
    if (s.tipo && s.zona && s.plazo) etapas.push(nodo(`3|${ETIQUETA_PLAZO[s.plazo] ?? s.plazo}`));
    const res = s.resultado === 'sin_abrir' ? 'abandono' : s.resultado;
    etapas.push(nodo(`4|${ETIQUETA_RESULTADO[res]}`));
    for (let i = 0; i < etapas.length - 1; i++) sumar(etapas[i], etapas[i + 1]);
  }
  const links = [...enlaces.entries()].map(([k, value]) => {
    const [source, target] = k.split('>').map(Number);
    return { source, target, value };
  });
  return { nodes, links };
}

export function nombreNodoSankey(nombre: string): string {
  return nombre.replace(/^\d\|/, '');
}

// --- Por página / idioma / dispositivo --------------------------------------------------------

export type MetricasGrupo = {
  id: string;
  grupo: string;
  vistas: number;
  abiertos: number;
  enviados: number;
  whatsapp: number;
  pctApertura: number;
  pctConversion: number;
};

export function metricasPor(sesiones: SesionAsistente[], clave: (s: SesionAsistente) => string): MetricasGrupo[] {
  const grupos = new Map<string, SesionAsistente[]>();
  for (const s of sesiones) {
    const k = clave(s);
    const lista = grupos.get(k);
    if (lista) lista.push(s);
    else grupos.set(k, [s]);
  }
  return [...grupos.entries()]
    .map(([grupo, lista]) => {
      const abiertos = lista.filter((s) => s.abierta).length;
      const enviados = lista.filter((s) => s.enviada).length;
      return {
        id: grupo,
        grupo,
        vistas: lista.length,
        abiertos,
        enviados,
        whatsapp: lista.filter((s) => s.whatsappOrigenes.length > 0).length,
        pctApertura: pct(abiertos, lista.length),
        pctConversion: pct(enviados, lista.length),
      };
    })
    .sort((a, b) => b.vistas - a.vistas);
}

// --- Ruta legible de una sesión ---------------------------------------------------------------

export function describirEvento(e: EventoAsistente): string {
  switch (e.evento) {
    case 'vista':
      return 'Carga la página';
    case 'aviso':
      return 'Se le muestra el aviso';
    case 'aviso_cerrado':
      return 'Cierra el aviso';
    case 'abierto':
      return e.valor === 'aviso' ? 'Abre el asistente (con el aviso a la vista)' : 'Abre el asistente';
    case 'paso':
      return `Ve el paso ${e.paso}`;
    case 'opcion': {
      if (e.paso === 1) return `Elige tipo de obra: ${e.valor ?? '—'}`;
      if (e.paso === 2) return `Elige zona: ${e.valor ?? '—'}`;
      const plazo = normalizarPlazo(e.valor);
      return `Elige plazo: ${plazo ? (ETIQUETA_PLAZO[plazo] ?? plazo) : '—'}`;
    }
    case 'volver':
      return `Vuelve atrás desde el paso ${e.paso}`;
    case 'cerrado':
      return `Cierra el asistente en el paso ${e.paso}`;
    case 'whatsapp':
      return `Pulsa WhatsApp (${(ETIQUETA_WHATSAPP[e.valor ?? 'panel'] ?? e.valor ?? '').toLowerCase()})`;
    case 'error_validacion':
      return e.valor === 'email' ? 'Email no válido' : 'Falta nombre o teléfono';
    case 'enviado':
      return 'Envía la solicitud';
    case 'error_envio':
      return 'Falla el envío';
    default:
      return e.evento;
  }
}

// --- Resultado real (cruce con el embudo de Solicitudes) --------------------------------------

export type EventoFunnelCruce = { etapa: EtapaFunnel; solicitud_id: string | null; presupuesto_id: string | null };

/** De las solicitudes enviadas desde el asistente, cuántas llegan a visita, presupuesto enviado,
 * presupuesto aceptado y primer acompte. Las etapas de presupuesto cuelgan del presupuesto, no de
 * la solicitud: se enlazan por el evento `solicitud_vinculada_presupuesto`, que lleva los dos ids.
 * Los presupuestos orientativos no cuentan (mismo criterio que el embudo de Solicitudes). */
export function resultadoReal(
  solicitudIds: string[],
  eventos: EventoFunnelCruce[],
  excluirPresupuestoIds?: Set<string>,
) {
  const ids = new Set(solicitudIds);
  const presDeSolicitud = new Map<string, string>();
  for (const e of eventos) {
    if (e.etapa === 'solicitud_vinculada_presupuesto' && e.solicitud_id && e.presupuesto_id && ids.has(e.solicitud_id)) {
      if (!excluirPresupuestoIds?.has(e.presupuesto_id)) presDeSolicitud.set(e.presupuesto_id, e.solicitud_id);
    }
  }
  const alcanzadas = (etapa: EtapaFunnel) => {
    const set = new Set<string>();
    for (const e of eventos) {
      if (e.etapa !== etapa) continue;
      if (e.solicitud_id && ids.has(e.solicitud_id)) set.add(e.solicitud_id);
      else if (e.presupuesto_id && presDeSolicitud.has(e.presupuesto_id)) set.add(presDeSolicitud.get(e.presupuesto_id)!);
    }
    return set.size;
  };
  const total = ids.size;
  return [
    { etapa: 'enviadas', etiqueta: 'Solicitudes enviadas', count: total },
    { etapa: 'visita_agendada', etiqueta: 'Visita agendada', count: alcanzadas('visita_agendada') },
    { etapa: 'presupuesto_enviado', etiqueta: 'Presupuesto enviado', count: alcanzadas('presupuesto_enviado') },
    { etapa: 'presupuesto_aceptado', etiqueta: 'Presupuesto aceptado', count: alcanzadas('presupuesto_aceptado') },
    { etapa: 'primer_acompte_cobrado', etiqueta: 'Primer acompte cobrado', count: alcanzadas('primer_acompte_cobrado') },
  ].map((r) => ({ ...r, pct: pct(r.count, total) }));
}
