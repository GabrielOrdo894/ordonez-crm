// Analítica de las webs filiales (tabla `web_eventos`, Edge Function `web-eventos`, script
// assets/medicion.js de costabath.com, ordonezfachadas.com y ordonezstudio.com; 2026-11-05). Una
// «sesión» es una visita: las páginas vistas en la misma pestaña, enlazadas por un código aleatorio
// sin cookies. Funciones puras: WebsFilialesPanel.tsx solo carga los eventos y pinta lo que
// devuelven.

export const INICIO_MEDICION_WEBS = '2026-11-05';

export type SitioWeb = 'costabath' | 'ordonezfachadas' | 'ordonezstudio';

export const SITIOS_WEB: SitioWeb[] = ['costabath', 'ordonezfachadas', 'ordonezstudio'];

export const ETIQUETA_SITIO: Record<SitioWeb, string> = {
  costabath: 'Costabath',
  ordonezfachadas: 'Ordoñez Fachadas',
  ordonezstudio: 'Ordoñez Studio',
};

/** Webs cuyo formulario va por pasos (1 tipo de trabajo → 2 obra → 3 contacto). */
export const SITIOS_CON_PASOS: SitioWeb[] = ['costabath', 'ordonezfachadas'];

export type EventoWeb = {
  id: number;
  created_at: string;
  sitio: SitioWeb;
  sesion: string;
  vista_n: number;
  evento: string;
  numero: number | null;
  valor: string | null;
  pagina: string | null;
  idioma: string | null;
  dispositivo: string | null;
  referente: string | null;
  utm_fuente: string | null;
  utm_medio: string | null;
  utm_campana: string | null;
  solicitud_id: string | null;
};

export type VistaPagina = {
  n: number;
  pagina: string;
  inicio: string;
  segundos: number;
  scrollMax: number;
  contactos: number;
  cta: number;
  enviada: boolean;
};

export type TipoClic = 'whatsapp' | 'telefono' | 'email' | 'cta';

export type SesionWeb = {
  id: string;
  sitio: SitioWeb;
  inicio: string;
  fin: string;
  dispositivo: string;
  idioma: string;
  canal: string;
  referente: string | null;
  campana: string | null;
  entrada: string;
  vistas: VistaPagina[];
  segundos: number;
  whatsapp: number;
  telefono: number;
  email: number;
  cta: number;
  clics: { tipo: TipoClic; valor: string; pagina: string }[];
  formInicio: boolean;
  formPasoMax: number;
  formError: boolean;
  enviada: boolean;
  errorEnvio: boolean;
  solicitudId: string | null;
  tipoElegido: string | null;
  /** Pulsa WhatsApp, teléfono o email, o envía el formulario. */
  contacto: boolean;
  /** Una sola página, menos de 10 s y sin ningún clic de contacto ni formulario. */
  rebote: boolean;
};

// --- Canal de procedencia ----------------------------------------------------------------------

const BUSCADORES_OTROS = /duckduckgo|yahoo|ecosia|qwant|yandex|brave|startpage|lilo/;
const REDES = /facebook|instagram|linkedin|^t\.co$|twitter|^x\.com$|pinterest|tiktok|youtube|whatsapp|threads/;
const IA = /chatgpt\.com|openai\.com|perplexity\.ai|gemini\.google|claude\.ai|copilot\.microsoft|chat\.mistral/;
const PROPIAS = /ordonezrenov|costabath|ordonezfachadas|ordonezstudio/;

export function canalDe(referente: string | null, utmFuente: string | null, utmMedio: string | null): string {
  const medio = (utmMedio ?? '').toLowerCase();
  if (/cpc|ppc|paid|ads/.test(medio)) return 'Anuncios';
  const origen = (utmFuente || referente || '').toLowerCase();
  if (!origen) return 'Directo';
  if (/bing/.test(origen)) return 'Bing';
  if (IA.test(origen)) return 'Asistentes de IA';
  if (/google/.test(origen)) return 'Google';
  if (BUSCADORES_OTROS.test(origen)) return 'Otros buscadores';
  if (REDES.test(origen)) return 'Redes sociales';
  if (PROPIAS.test(origen)) return 'Webs propias';
  if (/mail|newsletter/.test(medio) || /mail/.test(origen)) return 'Email';
  return 'Otras webs';
}

// --- Sesiones ----------------------------------------------------------------------------------

function sesionVacia(id: string, e: EventoWeb): SesionWeb {
  return {
    id,
    sitio: e.sitio,
    inicio: e.created_at,
    fin: e.created_at,
    dispositivo: e.dispositivo ?? 'escritorio',
    idioma: e.idioma ?? 'es',
    canal: 'Directo',
    referente: null,
    campana: null,
    entrada: '/',
    vistas: [],
    segundos: 0,
    whatsapp: 0,
    telefono: 0,
    email: 0,
    cta: 0,
    clics: [],
    formInicio: false,
    formPasoMax: 0,
    formError: false,
    enviada: false,
    errorEnvio: false,
    solicitudId: null,
    tipoElegido: null,
    contacto: false,
    rebote: false,
  };
}

export function agruparSesiones(eventos: EventoWeb[]): SesionWeb[] {
  const porSesion = new Map<string, EventoWeb[]>();
  for (const e of [...eventos].sort((a, b) => a.id - b.id)) {
    const lista = porSesion.get(e.sesion);
    if (lista) lista.push(e);
    else porSesion.set(e.sesion, [e]);
  }

  const sesiones: SesionWeb[] = [];
  for (const [id, evs] of porSesion) {
    const s = sesionVacia(id, evs[0]);
    s.fin = evs[evs.length - 1].created_at;
    const vistas = new Map<number, VistaPagina>();
    const vistaDe = (e: EventoWeb) => {
      let v = vistas.get(e.vista_n);
      if (!v) {
        v = { n: e.vista_n, pagina: e.pagina ?? '/', inicio: e.created_at, segundos: 0, scrollMax: 0, contactos: 0, cta: 0, enviada: false };
        vistas.set(e.vista_n, v);
      }
      return v;
    };
    let primeraVista: EventoWeb | null = null;
    for (const e of evs) {
      const v = vistaDe(e);
      switch (e.evento) {
        case 'vista':
          v.pagina = e.pagina ?? v.pagina;
          v.inicio = e.created_at;
          if (!primeraVista || e.vista_n < primeraVista.vista_n) primeraVista = e;
          break;
        case 'scroll':
          v.scrollMax = Math.max(v.scrollMax, e.numero ?? 0);
          break;
        case 'tiempo':
          v.segundos = Math.max(v.segundos, e.numero ?? 0);
          break;
        case 'whatsapp':
        case 'telefono':
        case 'email':
        case 'cta':
          s[e.evento] += 1;
          if (e.evento === 'cta') v.cta += 1;
          else v.contactos += 1;
          s.clics.push({ tipo: e.evento, valor: e.valor ?? '—', pagina: v.pagina });
          break;
        case 'form_inicio':
          s.formInicio = true;
          s.formPasoMax = Math.max(s.formPasoMax, 1);
          break;
        case 'form_paso':
          s.formInicio = true;
          s.formPasoMax = Math.max(s.formPasoMax, e.numero ?? 1);
          if (e.numero === 2 && e.valor) s.tipoElegido = e.valor;
          break;
        case 'form_error':
          s.formError = true;
          break;
        case 'enviado':
          s.formInicio = true;
          s.enviada = true;
          v.enviada = true;
          s.solicitudId = e.solicitud_id ?? s.solicitudId;
          break;
        case 'error_envio':
          s.errorEnvio = true;
          break;
      }
    }
    s.vistas = [...vistas.values()].sort((a, b) => a.n - b.n);
    const origen = primeraVista ?? evs[0];
    s.entrada = s.vistas[0]?.pagina ?? origen.pagina ?? '/';
    s.referente = origen.referente;
    s.campana = origen.utm_campana;
    s.canal = canalDe(origen.referente, origen.utm_fuente, origen.utm_medio);
    s.segundos = s.vistas.reduce((t, v) => t + v.segundos, 0);
    s.contacto = s.whatsapp + s.telefono + s.email > 0 || s.enviada;
    s.rebote = s.vistas.length <= 1 && s.segundos < 10 && !s.contacto && s.cta === 0 && !s.formInicio;
    sesiones.push(s);
  }
  return sesiones.sort((a, b) => b.inicio.localeCompare(a.inicio));
}

// --- Resúmenes ---------------------------------------------------------------------------------

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const media = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

export type Resumen = {
  sesiones: number;
  paginasVistas: number;
  paginasPorSesion: number;
  segundosMedios: number;
  pctRebote: number;
  contactos: number;
  whatsapp: number;
  telefono: number;
  email: number;
  formIniciados: number;
  enviados: number;
  pctConversion: number;
};

export function resumen(sesiones: SesionWeb[]): Resumen {
  const n = sesiones.length;
  const paginasVistas = sesiones.reduce((t, s) => t + s.vistas.length, 0);
  const contactos = sesiones.filter((s) => s.contacto).length;
  return {
    sesiones: n,
    paginasVistas,
    paginasPorSesion: n ? Math.round((paginasVistas / n) * 10) / 10 : 0,
    segundosMedios: media(sesiones.map((s) => s.segundos)),
    pctRebote: pct(sesiones.filter((s) => s.rebote).length, n),
    contactos,
    whatsapp: sesiones.filter((s) => s.whatsapp > 0).length,
    telefono: sesiones.filter((s) => s.telefono > 0).length,
    email: sesiones.filter((s) => s.email > 0).length,
    formIniciados: sesiones.filter((s) => s.formInicio).length,
    enviados: sesiones.filter((s) => s.enviada).length,
    pctConversion: pct(contactos, n),
  };
}

export type FilaGrupo = Resumen & { id: string; grupo: string };

/** Mismas métricas que `resumen`, agrupadas por la clave que se pase, de más a menos sesiones. */
export function metricasPor(sesiones: SesionWeb[], clave: (s: SesionWeb) => string): FilaGrupo[] {
  const grupos = new Map<string, SesionWeb[]>();
  for (const s of sesiones) {
    const k = clave(s);
    const lista = grupos.get(k);
    if (lista) lista.push(s);
    else grupos.set(k, [s]);
  }
  return [...grupos.entries()]
    .map(([grupo, lista]) => ({ id: grupo, grupo, ...resumen(lista) }))
    .sort((a, b) => b.sesiones - a.sesiones || a.grupo.localeCompare(b.grupo));
}

export function diaLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Sesiones por día y por web, con todos los días del período aunque no haya visitas. */
export function sesionesPorDia(sesiones: SesionWeb[], desde: string, hasta: string) {
  const filas = new Map<string, { dia: string } & Record<SitioWeb, number>>();
  for (const d = new Date(`${desde}T12:00:00`); diaLocal(d.toISOString()) <= hasta; d.setDate(d.getDate() + 1)) {
    const dia = diaLocal(d.toISOString());
    filas.set(dia, { dia, costabath: 0, ordonezfachadas: 0, ordonezstudio: 0 });
  }
  for (const s of sesiones) {
    const fila = filas.get(diaLocal(s.inicio));
    if (fila) fila[s.sitio] += 1;
  }
  return [...filas.values()];
}

export type FilaPagina = {
  id: string;
  sitio: SitioWeb;
  pagina: string;
  vistas: number;
  entradas: number;
  segundosMedios: number;
  pctScroll75: number;
  contactos: number;
  cta: number;
  enviados: number;
};

export function metricasPorPagina(sesiones: SesionWeb[]): FilaPagina[] {
  const filas = new Map<string, FilaPagina & { segundos: number[]; scroll75: number }>();
  for (const s of sesiones) {
    s.vistas.forEach((v, i) => {
      const id = `${s.sitio}${v.pagina}`;
      let f = filas.get(id);
      if (!f) {
        f = { id, sitio: s.sitio, pagina: v.pagina, vistas: 0, entradas: 0, segundosMedios: 0, pctScroll75: 0, contactos: 0, cta: 0, enviados: 0, segundos: [], scroll75: 0 };
        filas.set(id, f);
      }
      f.vistas += 1;
      if (i === 0) f.entradas += 1;
      if (v.segundos > 0) f.segundos.push(v.segundos);
      if (v.scrollMax >= 75) f.scroll75 += 1;
      f.contactos += v.contactos;
      f.cta += v.cta;
      if (v.enviada) f.enviados += 1;
    });
  }
  return [...filas.values()]
    .map(({ segundos, scroll75, ...f }) => ({ ...f, segundosMedios: media(segundos), pctScroll75: pct(scroll75, f.vistas) }))
    .sort((a, b) => b.vistas - a.vistas || a.id.localeCompare(b.id));
}

export type EscalonEmbudo = { clave: string; etiqueta: string; count: number; pctAnterior: number };

/** Embudo del formulario. Con pasos (Costabath/Fachadas): visita → empieza → elige el tipo →
 * datos de la obra → envía. Sin pasos (Studio): visita → empieza → envía. */
export function embudoFormulario(sesiones: SesionWeb[], conPasos: boolean): EscalonEmbudo[] {
  const escalones: [string, string, number][] = [
    ['sesiones', 'Visitas', sesiones.length],
    ['inicio', 'Empiezan el formulario', sesiones.filter((s) => s.formInicio).length],
  ];
  if (conPasos) {
    escalones.push(['paso2', 'Eligen el tipo de trabajo', sesiones.filter((s) => s.formPasoMax >= 2 || s.enviada).length]);
    escalones.push(['paso3', 'Llegan a sus datos', sesiones.filter((s) => s.formPasoMax >= 3 || s.enviada).length]);
  }
  escalones.push(['enviados', 'Envían la solicitud', sesiones.filter((s) => s.enviada).length]);
  return escalones.map(([clave, etiqueta, count], i) => ({
    clave,
    etiqueta,
    count,
    pctAnterior: i === 0 ? 100 : pct(count, escalones[i - 1][2]),
  }));
}

export const ETIQUETA_CLIC: Record<TipoClic, string> = {
  whatsapp: 'WhatsApp',
  telefono: 'Teléfono',
  email: 'Email',
  cta: 'Botón de contacto',
};

/** Qué botones de contacto se pulsan: tipo, lugar y texto del botón, de más a menos clics. */
export function clicsPorBoton(sesiones: SesionWeb[], limite = 15) {
  const cuenta = new Map<string, number>();
  for (const s of sesiones) {
    for (const c of s.clics) {
      const k = `${ETIQUETA_CLIC[c.tipo]} · ${c.valor}`;
      cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
    }
  }
  return [...cuenta.entries()]
    .map(([boton, count]) => ({ boton, count }))
    .sort((a, b) => b.count - a.count || a.boton.localeCompare(b.boton))
    .slice(0, limite);
}

/** Recorridos más repetidos (hasta 4 páginas); las visitas de una sola página no cuentan. */
export function recorridosFrecuentes(sesiones: SesionWeb[], limite = 10) {
  const cuenta = new Map<string, { count: number; contactos: number }>();
  for (const s of sesiones) {
    if (s.vistas.length < 2) continue;
    const paginas = s.vistas.map((v) => v.pagina);
    const ruta = paginas.slice(0, 4).join(' → ') + (paginas.length > 4 ? ' → …' : '');
    const f = cuenta.get(ruta) ?? { count: 0, contactos: 0 };
    f.count += 1;
    if (s.contacto) f.contactos += 1;
    cuenta.set(ruta, f);
  }
  return [...cuenta.entries()]
    .map(([ruta, f]) => ({ id: ruta, ruta, ...f }))
    .sort((a, b) => b.count - a.count || a.ruta.localeCompare(b.ruta))
    .slice(0, limite);
}

export function tiposElegidos(sesiones: SesionWeb[]) {
  const cuenta = new Map<string, number>();
  for (const s of sesiones) if (s.tipoElegido) cuenta.set(s.tipoElegido, (cuenta.get(s.tipoElegido) ?? 0) + 1);
  const total = [...cuenta.values()].reduce((a, b) => a + b, 0);
  return [...cuenta.entries()]
    .map(([nombre, count]) => ({ nombre, count, pct: pct(count, total) }))
    .sort((a, b) => b.count - a.count || a.nombre.localeCompare(b.nombre));
}

export function formatearDuracion(segundos: number): string {
  if (segundos < 60) return `${segundos} s`;
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return s ? `${m} min ${String(s).padStart(2, '0')} s` : `${m} min`;
}

export const ETIQUETA_DISPOSITIVO: Record<string, string> = { movil: 'Móvil', tablet: 'Tablet', escritorio: 'Ordenador' };
export const ETIQUETA_IDIOMA: Record<string, string> = { es: 'Español', fr: 'Francés', eu: 'Euskera' };
