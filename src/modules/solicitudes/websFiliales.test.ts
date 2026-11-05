import { describe, expect, it } from 'vitest';
import {
  agruparSesiones,
  canalDe,
  clicsPorBoton,
  embudoFormulario,
  formatearDuracion,
  metricasPor,
  metricasPorPagina,
  recorridosFrecuentes,
  resumen,
  sesionesPorDia,
  tiposElegidos,
  type EventoWeb,
} from './websFiliales';

let id = 0;
function ev(sesion: string, vista_n: number, evento: string, extra: Partial<EventoWeb> = {}): EventoWeb {
  id += 1;
  return {
    id,
    created_at: `2026-11-05T10:${String(id).padStart(2, '0')}:00Z`,
    sitio: 'costabath',
    sesion,
    vista_n,
    evento,
    numero: null,
    valor: null,
    pagina: '/',
    idioma: 'es',
    dispositivo: 'movil',
    referente: null,
    utm_fuente: null,
    utm_medio: null,
    utm_campana: null,
    solicitud_id: null,
    ...extra,
  };
}

describe('canalDe', () => {
  it('clasifica la procedencia', () => {
    expect(canalDe(null, null, null)).toBe('Directo');
    expect(canalDe('google.fr', null, null)).toBe('Google');
    expect(canalDe('com.google.android.googlequicksearchbox', null, null)).toBe('Google');
    expect(canalDe('google.com', 'google', 'cpc')).toBe('Anuncios');
    expect(canalDe('bing.com', null, null)).toBe('Bing');
    expect(canalDe('l.instagram.com', null, null)).toBe('Redes sociales');
    expect(canalDe('chatgpt.com', null, null)).toBe('Asistentes de IA');
    expect(canalDe('gemini.google.com', null, null)).toBe('Asistentes de IA');
    expect(canalDe('claude.ai', null, null)).toBe('Asistentes de IA');
    expect(canalDe(null, 'prueba-claude', null)).toBe('Otras webs');
    expect(canalDe('ordonezrenov.com', null, null)).toBe('Webs propias');
    expect(canalDe('pagesjaunes.fr', null, null)).toBe('Otras webs');
    expect(canalDe(null, 'facebook', null)).toBe('Redes sociales');
  });
});

describe('agruparSesiones', () => {
  const eventos = [
    // Visita 1: Google → portada (40 s, scroll 75) → precios (20 s) → WhatsApp → formulario enviado.
    ev('a', 1, 'vista', { referente: 'google.fr' }),
    ev('a', 1, 'scroll', { numero: 25 }),
    ev('a', 1, 'scroll', { numero: 75 }),
    ev('a', 1, 'tiempo', { numero: 30 }),
    ev('a', 1, 'tiempo', { numero: 40 }),
    ev('a', 2, 'vista', { pagina: '/precios' }),
    ev('a', 2, 'whatsapp', { pagina: '/precios', valor: 'botón fijo · WhatsApp' }),
    ev('a', 2, 'form_inicio', { pagina: '/precios' }),
    ev('a', 2, 'form_paso', { pagina: '/precios', numero: 2, valor: 'Baño completo' }),
    ev('a', 2, 'form_paso', { pagina: '/precios', numero: 3 }),
    ev('a', 2, 'enviado', { pagina: '/precios', solicitud_id: '11111111-1111-1111-1111-111111111111' }),
    ev('a', 2, 'tiempo', { pagina: '/precios', numero: 20 }),
    // Visita 2: directa, una página, 4 s, nada más → rebote.
    ev('b', 1, 'vista', { sitio: 'ordonezstudio', dispositivo: 'escritorio' }),
    ev('b', 1, 'tiempo', { sitio: 'ordonezstudio', dispositivo: 'escritorio', numero: 4 }),
    // Visita 3: una página pero llama por teléfono → no es rebote.
    ev('c', 1, 'vista', { pagina: '/contacto' }),
    ev('c', 1, 'telefono', { pagina: '/contacto', valor: 'cabecera · Llamar' }),
  ];
  const sesiones = agruparSesiones(eventos);
  const a = sesiones.find((s) => s.id === 'a')!;
  const b = sesiones.find((s) => s.id === 'b')!;
  const c = sesiones.find((s) => s.id === 'c')!;

  it('reconstruye la visita con sus páginas, tiempo y formulario', () => {
    expect(a.vistas.map((v) => v.pagina)).toEqual(['/', '/precios']);
    expect(a.vistas[0].segundos).toBe(40);
    expect(a.vistas[0].scrollMax).toBe(75);
    expect(a.segundos).toBe(60);
    expect(a.canal).toBe('Google');
    expect(a.entrada).toBe('/');
    expect(a.whatsapp).toBe(1);
    expect(a.formPasoMax).toBe(3);
    expect(a.tipoElegido).toBe('Baño completo');
    expect(a.enviada).toBe(true);
    expect(a.solicitudId).toBe('11111111-1111-1111-1111-111111111111');
    expect(a.contacto).toBe(true);
    expect(a.rebote).toBe(false);
  });

  it('marca el rebote solo sin interacción', () => {
    expect(b.rebote).toBe(true);
    expect(b.canal).toBe('Directo');
    expect(c.rebote).toBe(false);
    expect(c.contacto).toBe(true);
  });

  it('resume las métricas', () => {
    const r = resumen(sesiones);
    expect(r.sesiones).toBe(3);
    expect(r.paginasVistas).toBe(4);
    expect(r.paginasPorSesion).toBe(1.3);
    expect(r.pctRebote).toBe(33.3);
    expect(r.contactos).toBe(2);
    expect(r.enviados).toBe(1);
    expect(r.telefono).toBe(1);
  });

  it('agrupa por web y por página', () => {
    const porSitio = metricasPor(sesiones, (s) => s.sitio);
    expect(porSitio.map((f) => [f.grupo, f.sesiones])).toEqual([
      ['costabath', 2],
      ['ordonezstudio', 1],
    ]);
    const paginas = metricasPorPagina(sesiones);
    const portada = paginas.find((p) => p.id === 'costabath/')!;
    expect(portada.vistas).toBe(1);
    expect(portada.entradas).toBe(1);
    expect(portada.pctScroll75).toBe(100);
    const precios = paginas.find((p) => p.id === 'costabath/precios')!;
    expect(precios.contactos).toBe(1);
    expect(precios.enviados).toBe(1);
    expect(precios.entradas).toBe(0);
  });

  it('calcula el embudo del formulario con y sin pasos', () => {
    const conPasos = embudoFormulario(sesiones, true);
    expect(conPasos.map((e) => e.count)).toEqual([3, 1, 1, 1, 1]);
    expect(conPasos[1].pctAnterior).toBe(33.3);
    expect(embudoFormulario(sesiones, false).map((e) => e.clave)).toEqual(['sesiones', 'inicio', 'enviados']);
  });

  it('cuenta botones, recorridos y tipos elegidos', () => {
    expect(clicsPorBoton(sesiones)).toEqual([
      { boton: 'Teléfono · cabecera · Llamar', count: 1 },
      { boton: 'WhatsApp · botón fijo · WhatsApp', count: 1 },
    ]);
    expect(recorridosFrecuentes(sesiones)).toEqual([{ id: '/ → /precios', ruta: '/ → /precios', count: 1, contactos: 1 }]);
    expect(tiposElegidos(sesiones)).toEqual([{ nombre: 'Baño completo', count: 1, pct: 100 }]);
  });

  it('reparte las visitas por día con todos los días del período', () => {
    const dias = sesionesPorDia(sesiones, '2026-11-04', '2026-11-06');
    expect(dias.map((d) => d.dia)).toEqual(['2026-11-04', '2026-11-05', '2026-11-06']);
    expect(dias[1].costabath).toBe(2);
    expect(dias[1].ordonezstudio).toBe(1);
  });
});

describe('formatearDuracion', () => {
  it('formatea segundos y minutos', () => {
    expect(formatearDuracion(45)).toBe('45 s');
    expect(formatearDuracion(60)).toBe('1 min');
    expect(formatearDuracion(125)).toBe('2 min 05 s');
  });
});
