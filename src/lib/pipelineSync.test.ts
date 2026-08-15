import { describe, it, expect, vi } from 'vitest';

// pipelineSync.ts importa el cliente real de Supabase (createClient), que revienta en test/CI sin
// VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY reales — etapaAutomatica no lo necesita, es pura.
vi.mock('./supabase', () => ({ supabase: {} }));

const { etapaAutomatica, etapaMaximaAlcanzada } = await import('./pipelineSync');

function senales(overrides: Partial<Parameters<typeof etapaAutomatica>[0]> = {}) {
  return {
    visitaEstado: null,
    visitaTieneFecha: false,
    presupuestos: [],
    proyectoEstado: null,
    facturaCobrada: false,
    ...overrides,
  };
}

describe('etapaAutomatica', () => {
  it('sin ninguna señal, la etapa es Contacto', () => {
    expect(etapaAutomatica(senales())).toBe('Contacto');
  });

  it('visita con fecha pero no realizada → Visita programada', () => {
    expect(etapaAutomatica(senales({ visitaTieneFecha: true }))).toBe('Visita programada');
  });

  it('visita realizada → Visita realizada', () => {
    expect(etapaAutomatica(senales({ visitaEstado: 'Realizada', visitaTieneFecha: true }))).toBe('Visita realizada');
  });

  it('con un presupuesto Pendiente → Presupuesto enviado', () => {
    expect(etapaAutomatica(senales({ presupuestos: [{ estado: 'Pendiente' }] }))).toBe('Presupuesto enviado');
  });

  it('con un presupuesto Aceptado → Presupuesto aceptado, aunque también haya uno Pendiente', () => {
    expect(
      etapaAutomatica(senales({ presupuestos: [{ estado: 'Pendiente' }, { estado: 'Aceptado' }] })),
    ).toBe('Presupuesto aceptado');
  });

  it('proyecto En curso → En obra, aunque el presupuesto siga Aceptado', () => {
    expect(
      etapaAutomatica(senales({ presupuestos: [{ estado: 'Aceptado' }], proyectoEstado: 'En curso' })),
    ).toBe('En obra');
  });

  it('proyecto Pausado también cuenta como En obra', () => {
    expect(etapaAutomatica(senales({ proyectoEstado: 'Pausado' }))).toBe('En obra');
  });

  it('proyecto Finalizado → Finalizado', () => {
    expect(etapaAutomatica(senales({ proyectoEstado: 'Finalizado' }))).toBe('Finalizado');
  });

  it('factura cobrada → Finalizado aunque el proyecto siga En curso', () => {
    expect(etapaAutomatica(senales({ proyectoEstado: 'En curso', facturaCobrada: true }))).toBe('Finalizado');
  });

  it('único presupuesto Rechazado → Perdido', () => {
    expect(etapaAutomatica(senales({ presupuestos: [{ estado: 'Rechazado' }] }))).toBe('Perdido');
  });

  it('todos los presupuestos Rechazados → Perdido', () => {
    expect(
      etapaAutomatica(senales({ presupuestos: [{ estado: 'Rechazado' }, { estado: 'Rechazado' }] })),
    ).toBe('Perdido');
  });

  it('un presupuesto Rechazado pero otro Pendiente → sigue Presupuesto enviado, no Perdido', () => {
    expect(
      etapaAutomatica(senales({ presupuestos: [{ estado: 'Rechazado' }, { estado: 'Pendiente' }] })),
    ).toBe('Presupuesto enviado');
  });

  it('visita Cancelada sin presupuestos → Perdido', () => {
    expect(etapaAutomatica(senales({ visitaEstado: 'Cancelada', visitaTieneFecha: true }))).toBe('Perdido');
  });

  it('visita Cancelada pero con presupuesto Aceptado → Presupuesto aceptado, no Perdido', () => {
    expect(
      etapaAutomatica(senales({ visitaEstado: 'Cancelada', presupuestos: [{ estado: 'Aceptado' }] })),
    ).toBe('Presupuesto aceptado');
  });
});

describe('etapaMaximaAlcanzada', () => {
  it('sin máxima previa, adopta la nueva etapa', () => {
    expect(etapaMaximaAlcanzada('Visita realizada', null)).toBe('Visita realizada');
  });

  it('avanza cuando la nueva etapa está más adelante que la máxima previa', () => {
    expect(etapaMaximaAlcanzada('Presupuesto enviado', 'Visita realizada')).toBe('Presupuesto enviado');
  });

  it('"Perdido" (fuera del embudo lineal) conserva la máxima previa en vez de perderla', () => {
    expect(etapaMaximaAlcanzada('Perdido', 'Presupuesto enviado')).toBe('Presupuesto enviado');
  });

  it('un retroceso manual no baja la máxima ya alcanzada', () => {
    expect(etapaMaximaAlcanzada('Contacto', 'Presupuesto aceptado')).toBe('Presupuesto aceptado');
  });
});
