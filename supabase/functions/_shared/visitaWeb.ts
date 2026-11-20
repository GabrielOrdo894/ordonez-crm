// Visita reservada por el cliente desde la página de contacto de ordonezrenov.com (variante B del test A/B,
// 2026-11-20, decisión de Gabriel): `solicitud-web` crea la visita como si el equipo la diera de alta en
// VisitaForm.tsx, con su evento de Calendar y la confirmación al cliente.
// Lógica pura, sin Deno ni Supabase, para poder probarla con Vitest. Los catálogos y el formato del
// teléfono copian los del frontend (src/modules/visitas/catalogos.ts, src/modules/clientes/types.ts) y
// el payload del evento copia construirEventoPayload de src/lib/googleCalendar.ts: si cambian allí,
// cambiarlos aquí también (los tests comparan el teléfono con la función del frontend).

export type PaisVisita = 'España' | 'Francia';

// Mismas zonas que CATALOGOS_VISITAS_DEFECTO (y que empresa_config.datos.visitas_catalogos a 2026-11-20).
const ZONAS_ES = ['Irún', 'Hondarribia', 'Donostia/San Sebastián', 'Rentería', 'Bera de Bidasoa'];
const ZONAS_FR = ['Hendaye', 'Urrugne', 'Ciboure', 'Saint-Jean-de-Luz', 'Biriatou', 'Guéthary', 'Biarritz', 'Bayonne'];
const ZONA_OTRO: Record<PaisVisita, string> = { España: 'Otro ES', Francia: 'Autre FR' };

// Municipios del formulario de la web (valores en español también en la versión FR) → país y zona del CRM.
const MUNICIPIOS: Record<string, { pais: PaisVisita; zona: string }> = {
  Irún: { pais: 'España', zona: 'Irún' },
  Hondarribia: { pais: 'España', zona: 'Hondarribia' },
  Donostia: { pais: 'España', zona: 'Donostia/San Sebastián' },
  Errenteria: { pais: 'España', zona: 'Rentería' },
  Hendaya: { pais: 'Francia', zona: 'Hendaye' },
  Urrugne: { pais: 'Francia', zona: 'Urrugne' },
  Biriatou: { pais: 'Francia', zona: 'Biriatou' },
  Ciboure: { pais: 'Francia', zona: 'Ciboure' },
  'Saint-Jean-de-Luz': { pais: 'Francia', zona: 'Saint-Jean-de-Luz' },
  Guéthary: { pais: 'Francia', zona: 'Guéthary' },
  Bidart: { pais: 'Francia', zona: 'Autre FR' },
  Biarritz: { pais: 'Francia', zona: 'Biarritz' },
};

function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Igual que zonaDesdeCiudad de VisitaForm.tsx: coincidencia por inclusión en los dos sentidos.
function zonaDesdeCiudad(ciudad: string, pais: PaisVisita): string | null {
  const ciudadNorm = normalizarTexto(ciudad);
  if (!ciudadNorm) return null;
  const zonas = pais === 'España' ? ZONAS_ES : ZONAS_FR;
  return zonas.find((z) => {
    const zNorm = normalizarTexto(z);
    return ciudadNorm.includes(zNorm) || zNorm.includes(ciudadNorm);
  }) ?? null;
}

// País: el de la dirección de Google Places; si no viene, el del municipio; si el municipio es «Otro»,
// el del idioma de la página. Zona: la ciudad de Places, luego el municipio (si es del mismo país) y
// por último «Otro ES»/«Autre FR».
export function deducirPaisZona(opts: {
  municipio: string;
  ciudad: string;
  paisDireccion: string;
  idioma: 'es' | 'fr';
}): { pais: PaisVisita; zona: string } {
  const porMunicipio = MUNICIPIOS[opts.municipio] ?? null;
  // En la variante B el municipio es la ciudad de la dirección: si no casa con la lista del formulario,
  // se busca entre las zonas de cada país.
  const ciudades = [opts.ciudad, opts.municipio].filter(Boolean);
  const paisPorCiudad = ciudades.some((c) => zonaDesdeCiudad(c, 'Francia'))
    ? 'Francia'
    : ciudades.some((c) => zonaDesdeCiudad(c, 'España'))
      ? 'España'
      : null;
  const pais: PaisVisita =
    opts.paisDireccion === 'España' || opts.paisDireccion === 'Francia'
      ? opts.paisDireccion
      : porMunicipio?.pais ?? paisPorCiudad ?? (opts.idioma === 'fr' ? 'Francia' : 'España');
  const zona =
    ciudades.map((c) => zonaDesdeCiudad(c, pais)).find(Boolean) ??
    (porMunicipio && porMunicipio.pais === pais ? porMunicipio.zona : null) ??
    ZONA_OTRO[pais];
  return { pais, zona };
}

// La web ofrece «Otra reforma»; en el catálogo de tipos del CRM es «Otro».
export function tipoVisitaDesdeWeb(tipo: string): string {
  return !tipo || tipo === 'Otra reforma' ? 'Otro' : tipo;
}

// Misma regla que dividirNombreCompleto (src/modules/clientes/types.ts): primera palabra = nombre.
export function dividirNombreCompleto(nombreCompleto: string): { nombre: string; apellidos: string } {
  const partes = nombreCompleto.trim().split(/\s+/).filter(Boolean);
  return { nombre: partes[0] ?? '', apellidos: partes.slice(1).join(' ') };
}

// Ricardo no habla francés: en las visitas en francés va con Santiago.
export function empleadoPorIdioma(idioma: 'es' | 'fr'): string {
  return idioma === 'fr' ? 'Ricardo Ordoñez y Santiago' : 'Ricardo Ordoñez';
}

export function sumarMinutos(hora: string, minutos: number): string {
  const [h, m] = hora.slice(0, 5).split(':').map(Number);
  const total = (((h * 60 + m + minutos) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** «lunes 23 de noviembre, 18:00» */
export function textoFechaHora(fecha: string, hora: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  const semana = d.toLocaleDateString('es', { weekday: 'long', timeZone: 'UTC' });
  const dia = d.toLocaleDateString('es', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  return `${semana} ${dia}, ${hora.slice(0, 5)}`;
}

// ── Teléfono: copia de nucleoTelefono / esTelefonoOtroPais / formatearTelefonoVisual del frontend ──
type PaisTelefono = 'ES' | 'FR';
const PREFIJO_TELEFONO: Record<PaisTelefono, string> = { ES: '+34', FR: '+33' };
const GRUPOS_TELEFONO: Record<PaisTelefono, number[]> = { ES: [3, 2, 2, 2], FR: [1, 2, 2, 2, 2] };

function nucleoTelefono(bruto: string): { pais: PaisTelefono; nucleo: string } | null {
  const digitos = bruto.replace(/\D/g, '');
  const conMas = bruto.startsWith('+');
  let nucleoFr: string | null = null;
  if (digitos.startsWith('33') && digitos.length === 11) nucleoFr = digitos.slice(2);
  else if (!conMas && digitos.startsWith('0033') && digitos.length === 13) nucleoFr = digitos.slice(4);
  else if (!conMas && digitos.startsWith('0') && digitos.length === 10) nucleoFr = digitos.slice(1);
  if (nucleoFr && nucleoFr.length === 9) return { pais: 'FR', nucleo: nucleoFr };
  let nucleoEs: string | null = null;
  if (digitos.startsWith('34') && digitos.length === 11) nucleoEs = digitos.slice(2);
  else if (!conMas && digitos.startsWith('0034') && digitos.length === 13) nucleoEs = digitos.slice(4);
  if (nucleoEs && nucleoEs.length === 9) return { pais: 'ES', nucleo: nucleoEs };
  return null;
}

function esTelefonoOtroPais(bruto: string): boolean {
  if (!bruto.startsWith('+')) return false;
  const digitos = bruto.replace(/\D/g, '');
  if (digitos.startsWith('34') || digitos.startsWith('33')) return false;
  return digitos.length >= 8 && digitos.length <= 15;
}

/** «+34 659 88 47 06» / «+33 6 87 52 40 12»; un número ambiguo se devuelve tal cual. */
export function formatearTelefonoVisual(tel: string | null | undefined): string {
  if (!tel) return '';
  const bruto = tel.trim();
  const info = nucleoTelefono(bruto);
  if (!info) return esTelefonoOtroPais(bruto) ? bruto.replace(/\s+/g, ' ') : bruto;
  const trozos: string[] = [];
  let pos = 0;
  for (const largo of GRUPOS_TELEFONO[info.pais]) {
    if (pos >= info.nucleo.length) break;
    trozos.push(info.nucleo.slice(pos, pos + largo));
    pos += largo;
  }
  return `${PREFIJO_TELEFONO[info.pais]} ${trozos.join(' ')}`;
}

// ── Evento de Google Calendar: copia de construirEventoPayload (src/lib/googleCalendar.ts) ──
export type EventoVisita = {
  tipo: string | null;
  nombre: string;
  apellidos: string;
  telefono: string;
  email: string | null;
  idioma: string | null;
  descripcion: string | null;
  direccion: string | null;
  direccion_extra: string | null;
  zona: string | null;
  pais: string | null;
  empleado: string | null;
  estado: string | null;
  fecha_visita: string;
  hora_visita: string;
  hora_fin_visita: string | null;
};

function etiquetaIdiomaTitulo(idioma: string | null): string {
  if (idioma === 'Français') return ' (Francés)';
  if (idioma === 'Español') return ' (Español)';
  return '';
}

// Un día antes y el mismo día a las 8:00, como popup del móvil (ver recordatoriosVisita del frontend).
function recordatoriosVisita(hora: string) {
  const [h, m] = hora.split(':').map(Number);
  const minutosHasta8am = h * 60 + m - 8 * 60;
  const overrides: { method: 'popup'; minutes: number }[] = [{ method: 'popup', minutes: 24 * 60 }];
  if (minutosHasta8am > 0) overrides.push({ method: 'popup', minutes: minutosHasta8am });
  return { useDefault: false, overrides };
}

export function construirEventoPayload(v: EventoVisita) {
  const hora = v.hora_visita.slice(0, 5);
  return {
    summary: `Visita Tecnica - ${v.tipo ?? 'Sin especificar'}${etiquetaIdiomaTitulo(v.idioma)}`,
    location: v.direccion ?? '',
    description: [
      'CLIENTE',
      `Nombre: ${v.nombre} ${v.apellidos}`,
      `Tel: ${formatearTelefonoVisual(v.telefono)}`,
      `Email: ${v.email || 'No indicado'}`,
      `Idioma: ${v.idioma || 'No indicado'}`,
      `Dirección: ${[v.direccion, v.direccion_extra].filter(Boolean).join(' — ') || 'No indicada'}`,
      `Zona: ${v.zona ?? ''} · ${v.pais ?? ''}`,
      '',
      'TRABAJO',
      `Tipo: ${v.tipo ?? 'Sin especificar'}`,
      `Descripción: ${v.descripcion || 'Sin descripción'}`,
      '',
      `Asignado: ${v.empleado ?? 'Sin asignar'}`,
    ].join('\n'),
    start: { dateTime: `${v.fecha_visita}T${hora}:00`, timeZone: 'Europe/Paris' },
    end: {
      dateTime: `${v.fecha_visita}T${v.hora_fin_visita?.slice(0, 5) || sumarMinutos(hora, 60)}:00`,
      timeZone: 'Europe/Paris',
    },
    colorId: v.estado === 'Realizada' ? '10' : v.estado === 'Cancelada' ? '8' : '5',
    reminders: recordatoriosVisita(hora),
  };
}
