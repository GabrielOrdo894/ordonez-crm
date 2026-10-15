import { describe, it, expect } from 'vitest';
import {
  abandonoPorPaso,
  agruparSesiones,
  datosSankey,
  describirEvento,
  embudoAsistente,
  metricasPor,
  nombreNodoSankey,
  normalizarZona,
  opcionesElegidas,
  resultadoReal,
  resumenAviso,
  resumenWhatsapp,
  type EventoAsistente,
} from './asistenteWeb';

let id = 0;
function ev(sesion: string, evento: string, extra: Partial<EventoAsistente> = {}): EventoAsistente {
  id++;
  return {
    id,
    created_at: `2026-10-15T10:00:${String(id).padStart(2, '0')}Z`,
    sesion,
    evento,
    paso: null,
    valor: null,
    pagina: '/irun/',
    idioma: 'es',
    dispositivo: 'movil',
    solicitud_id: null,
    ...extra,
  };
}

// a: envía · b: abandona en el paso 2 · c: se va a WhatsApp en el paso 1 (versión francesa) ·
// d: solo carga la página · e: pulsa el WhatsApp fijo sin abrir el asistente
function escenario(): EventoAsistente[] {
  return [
    ev('a', 'vista'),
    ev('a', 'aviso'),
    ev('a', 'abierto', { valor: 'aviso' }),
    ev('a', 'paso', { paso: 1 }),
    ev('a', 'opcion', { paso: 1, valor: 'Baño' }),
    ev('a', 'paso', { paso: 2 }),
    ev('a', 'opcion', { paso: 2, valor: 'Irún' }),
    ev('a', 'paso', { paso: 3 }),
    ev('a', 'opcion', { paso: 3, valor: 'urgente' }),
    ev('a', 'paso', { paso: 4 }),
    ev('a', 'error_validacion', { paso: 4, valor: 'faltan' }),
    ev('a', 'enviado', { paso: 4, solicitud_id: 'sol-1' }),
    ev('b', 'vista', { pagina: '/donostia/' }),
    ev('b', 'abierto', { pagina: '/donostia/', valor: 'boton' }),
    ev('b', 'paso', { paso: 1, pagina: '/donostia/' }),
    ev('b', 'opcion', { paso: 1, valor: 'Cocina', pagina: '/donostia/' }),
    ev('b', 'paso', { paso: 2, pagina: '/donostia/' }),
    ev('b', 'cerrado', { paso: 2, pagina: '/donostia/' }),
    ev('c', 'vista', { idioma: 'fr', dispositivo: 'escritorio', pagina: '/fr/' }),
    ev('c', 'abierto', { idioma: 'fr', dispositivo: 'escritorio', pagina: '/fr/', valor: 'boton' }),
    ev('c', 'paso', { paso: 1, idioma: 'fr', dispositivo: 'escritorio', pagina: '/fr/' }),
    ev('c', 'whatsapp', { paso: 1, valor: 'panel', idioma: 'fr', dispositivo: 'escritorio', pagina: '/fr/' }),
    ev('d', 'vista'),
    ev('e', 'vista'),
    ev('e', 'whatsapp', { paso: 0, valor: 'flotante' }),
  ];
}

describe('agruparSesiones', () => {
  it('resume cada carga de página con su resultado', () => {
    const s = Object.fromEntries(agruparSesiones(escenario()).map((x) => [x.sesion, x]));
    expect(s.a.resultado).toBe('enviado');
    expect(s.a.solicitudId).toBe('sol-1');
    expect(s.a.pasoMax).toBe(4);
    expect(s.a.tipo).toBe('Baño');
    expect(s.b.resultado).toBe('abandono');
    expect(s.b.pasoMax).toBe(2);
    expect(s.c.resultado).toBe('whatsapp');
    expect(s.c.idioma).toBe('fr');
    expect(s.d.resultado).toBe('sin_abrir');
    expect(s.e.resultado).toBe('whatsapp');
    expect(s.e.abierta).toBe(false);
  });

  it('normaliza las opciones francesas a las españolas', () => {
    const [s] = agruparSesiones([
      ev('f', 'abierto'),
      ev('f', 'opcion', { paso: 1, valor: 'Salle de bain' }),
      ev('f', 'opcion', { paso: 2, valor: 'Saint-Jean-de-Luz' }),
      ev('f', 'opcion', { paso: 3, valor: 'mois' }),
    ]);
    expect([s.tipo, s.zona, s.plazo]).toEqual(['Baño', 'San Juan de Luz', 'meses']);
  });

  it('se queda con la última opción si vuelve atrás y cambia', () => {
    const [s] = agruparSesiones([
      ev('g', 'opcion', { paso: 1, valor: 'Baño' }),
      ev('g', 'volver', { paso: 2 }),
      ev('g', 'opcion', { paso: 1, valor: 'Cocina' }),
    ]);
    expect(s.tipo).toBe('Cocina');
  });
});

describe('normalizarZona', () => {
  it('agrupa los municipios escritos a mano', () => {
    expect(normalizarZona('Otro: Ascain')).toBe('Otro municipio');
    expect(normalizarZona('Autre : Ascain')).toBe('Otro municipio');
    expect(normalizarZona('Hendaye')).toBe('Hendaya');
    expect(normalizarZona('Ciboure')).toBe('Ciboure');
  });
});

describe('embudoAsistente', () => {
  it('cuenta cada escalón con su porcentaje', () => {
    const e = Object.fromEntries(embudoAsistente(agruparSesiones(escenario())).map((x) => [x.clave, x]));
    expect(e.vistas.count).toBe(5);
    expect(e.abiertos.count).toBe(3);
    expect(e.abiertos.pctAnterior).toBe(60);
    expect(e.paso1.count).toBe(3);
    expect(e.paso2.count).toBe(2);
    expect(e.paso4.count).toBe(1);
    expect(e.enviados.count).toBe(1);
    expect(e.enviados.pctAbiertos).toBe(33.3);
  });
});

describe('resumenAviso', () => {
  it('cuenta los avisos y las aperturas que vinieron de él', () => {
    expect(resumenAviso(agruparSesiones(escenario()))).toEqual({ mostrados: 1, abiertosTrasAviso: 1, cerrados: 0, pctApertura: 100 });
  });
});

describe('abandonoPorPaso', () => {
  it('reparte los abandonos por el último paso visto', () => {
    const a = abandonoPorPaso(agruparSesiones(escenario()));
    expect(a.find((x) => x.paso === 2)?.count).toBe(1);
    expect(a.find((x) => x.paso === 1)?.count).toBe(0);
    expect(a.find((x) => x.paso === 2)?.pctDeLosQueLlegaron).toBe(50);
  });
});

describe('resumenWhatsapp', () => {
  it('separa el botón fijo de los enlaces del panel', () => {
    const w = resumenWhatsapp(agruparSesiones(escenario()));
    expect(w.clics).toBe(2);
    expect(w.sesiones).toBe(2);
    expect(w.porOrigen.map((o) => o.origen).sort()).toEqual(['flotante', 'panel']);
    expect(w.porPaso.find((p) => p.paso === 0)?.etiqueta).toBe('Sin abrir el asistente');
  });
});

describe('opcionesElegidas', () => {
  it('reparte tipos, zonas y plazos', () => {
    const o = opcionesElegidas(agruparSesiones(escenario()));
    expect(o.tipos.map((t) => t.nombre).sort()).toEqual(['Baño', 'Cocina']);
    expect(o.plazos).toEqual([{ nombre: 'Cuanto antes', count: 1, pct: 100 }]);
  });
});

describe('datosSankey', () => {
  it('solo incluye sesiones abiertas, sin ciclos y con el resultado al final', () => {
    const d = datosSankey(agruparSesiones(escenario()));
    const nombres = d.nodes.map((n) => nombreNodoSankey(n.name));
    expect(nombres).toContain('Abre el asistente');
    expect(nombres).toContain('Envía la solicitud');
    expect(nombres).toContain('Abandona');
    expect(nombres).toContain('Se va a WhatsApp');
    // Cada enlace va de un nivel al siguiente o a uno posterior: nunca hacia atrás.
    for (const l of d.links) {
      expect(Number(d.nodes[l.source].name[0])).toBeLessThan(Number(d.nodes[l.target].name[0]));
    }
    const salidaAbre = d.links.filter((l) => d.nodes[l.source].name === '0|Abre el asistente').reduce((a, l) => a + l.value, 0);
    expect(salidaAbre).toBe(3);
  });

  it('agrupa las zonas menos elegidas en «Otras zonas»', () => {
    const eventos = ['Irún', 'Irún', 'Lezo'].flatMap((zona, i) => [
      ev(`z${i}`, 'abierto'),
      ev(`z${i}`, 'opcion', { paso: 1, valor: 'Baño' }),
      ev(`z${i}`, 'opcion', { paso: 2, valor: zona }),
    ]);
    const nombres = datosSankey(agruparSesiones(eventos), 1).nodes.map((n) => n.name);
    expect(nombres).toContain('2|Irún');
    expect(nombres).toContain('2|Otras zonas');
    expect(nombres).not.toContain('2|Lezo');
  });
});

describe('metricasPor', () => {
  it('calcula aperturas y conversión por página', () => {
    const m = Object.fromEntries(metricasPor(agruparSesiones(escenario()), (s) => s.pagina).map((x) => [x.grupo, x]));
    expect(m['/irun/']).toMatchObject({ vistas: 3, abiertos: 1, enviados: 1, whatsapp: 1 });
    expect(m['/irun/'].pctConversion).toBe(33.3);
    expect(m['/donostia/']).toMatchObject({ vistas: 1, abiertos: 1, enviados: 0 });
  });
});

describe('describirEvento', () => {
  it('traduce los eventos a frases', () => {
    expect(describirEvento(ev('x', 'opcion', { paso: 3, valor: 'mois' }))).toBe('Elige plazo: En 1 a 3 meses');
    expect(describirEvento(ev('x', 'whatsapp', { valor: 'flotante' }))).toBe('Pulsa WhatsApp (botón verde fijo)');
  });
});

describe('resultadoReal', () => {
  it('sigue las solicitudes hasta presupuesto por el evento de vinculación', () => {
    const r = Object.fromEntries(
      resultadoReal(
        ['s1', 's2'],
        [
          { etapa: 'visita_agendada', solicitud_id: 's1', presupuesto_id: null },
          { etapa: 'solicitud_vinculada_presupuesto', solicitud_id: 's1', presupuesto_id: 'p1' },
          { etapa: 'presupuesto_enviado', solicitud_id: null, presupuesto_id: 'p1' },
          { etapa: 'presupuesto_aceptado', solicitud_id: null, presupuesto_id: 'p1' },
          { etapa: 'presupuesto_enviado', solicitud_id: null, presupuesto_id: 'p-otra' },
          { etapa: 'visita_agendada', solicitud_id: 'otra', presupuesto_id: null },
        ],
      ).map((x) => [x.etapa, x]),
    );
    expect(r.enviadas.count).toBe(2);
    expect(r.visita_agendada.count).toBe(1);
    expect(r.presupuesto_enviado.count).toBe(1);
    expect(r.presupuesto_aceptado.pct).toBe(50);
  });

  it('no cuenta presupuestos orientativos', () => {
    const r = resultadoReal(
      ['s1'],
      [
        { etapa: 'solicitud_vinculada_presupuesto', solicitud_id: 's1', presupuesto_id: 'po' },
        { etapa: 'presupuesto_aceptado', solicitud_id: null, presupuesto_id: 'po' },
      ],
      new Set(['po']),
    );
    expect(r.find((x) => x.etapa === 'presupuesto_aceptado')?.count).toBe(0);
  });
});
