import { describe, expect, it } from 'vitest';
import {
  construirAsientosAcompte,
  construirFacturaAcompte,
  construirLineaAcompte,
  hoyParis,
  motivoSinAcompte,
  porcentajeIva,
  type PresupuestoParaAcompte,
} from './acompteAutomatico.ts';
import { calcularLinea, getTiposServicio, lineaVacia } from '../../../src/modules/finanzas/lineas';
import { TIPOS_IVA } from '../../../src/modules/finanzas/iva';
import { construirAsientosFacturaEmision } from '../../../src/lib/asientosContables';

const base: PresupuestoParaAcompte = {
  id: 'p1',
  numero: 'P-2026-0104',
  titulo: 'Devis — Réfection de carrelage céramique',
  tipo: 'normal',
  avenant_de_id: null,
  eliminado_en: null,
  estado: 'Aceptado',
  visita_id: 'v1',
  cliente_nombre: 'SARL ITSAS ZALDI',
  cliente_dir: '9 rue des Figuiers',
  cliente_tel: '+33 6 76 52 66 16',
  cliente_email: 'itsaszaldi@yahoo.com',
  idioma: 'Français',
  pais: 'Francia',
  tipo_iva: 'TVA_20',
  plan_pago: [
    { concepto: 'Acompte à la signature du devis', porcentaje: 50, importe: 930 },
    { concepto: 'Solde à la réception des travaux', porcentaje: 50, importe: 930 },
  ],
};

describe('motivoSinAcompte', () => {
  it('procede con un presupuesto aceptado de dos plazos y sin facturas', () => {
    expect(motivoSinAcompte(base, 0)).toBeNull();
  });
  it('no crea nada si ya hay facturas, si es orientativo, avenant o un solo plazo', () => {
    expect(motivoSinAcompte(base, 1)).not.toBeNull();
    expect(motivoSinAcompte({ ...base, tipo: 'orientativo' }, 0)).not.toBeNull();
    expect(motivoSinAcompte({ ...base, avenant_de_id: 'x' }, 0)).not.toBeNull();
    expect(motivoSinAcompte({ ...base, plan_pago: [{ concepto: 'Total', porcentaje: 100, importe: 1860 }] }, 0)).not.toBeNull();
    expect(motivoSinAcompte({ ...base, plan_pago: [] }, 0)).not.toBeNull();
    expect(motivoSinAcompte({ ...base, estado: 'Pendiente' }, 0)).not.toBeNull();
    expect(motivoSinAcompte({ ...base, eliminado_en: '2026-11-10' }, 0)).not.toBeNull();
  });
});

describe('construirLineaAcompte', () => {
  it('reproduce la factura AC-2026-0014 creada a mano', () => {
    expect(construirLineaAcompte(base)).toEqual({
      designacion: 'Acompte — Acompte à la signature du devis',
      referencia: 'AC-01',
      descripcion: 'Cet acompte correspond à 50% du devis P-2026-0104.',
      unidad: 'forfait',
      tipo_servicio: 'Prestations de services BIC',
      cantidad: 1,
      precio_unit: 775,
      total_sin_iva: 775,
      total_con_iva: 930,
      es_incluido: false,
    });
  });

  it.each([
    ['TVA_10', 'Français', 1234.56],
    ['TVA_20', 'Français', 999.99],
    ['IVA_21', 'Español', 2500],
    ['IVA_10', 'Español', 333.33],
    ['EXENTO', 'Español', 800],
  ])('coincide con calcularLinea del frontend (%s)', (tipoIva, idioma, importe) => {
    const p = { ...base, tipo_iva: tipoIva, idioma, plan_pago: [{ concepto: 'X', porcentaje: 30, importe }, { concepto: 'Y', porcentaje: 70, importe: 1 }] };
    const pct = porcentajeIva(tipoIva);
    const linea = construirLineaAcompte(p);
    const precioSinIva = pct > 0 ? importe / (1 + pct / 100) : importe;
    const esperada = calcularLinea(
      {
        ...lineaVacia(),
        designacion: 'Acompte — X',
        referencia: 'AC-01',
        tipo_servicio: getTiposServicio(idioma === 'Français' ? 'fr' : 'es')[1],
        descripcion: linea.descripcion,
        unidad: 'forfait',
        cantidad: 1,
        precio_unit: Math.round(precioSinIva * 100) / 100,
      },
      pct,
    );
    expect(linea).toEqual(esperada);
  });

  it('usa la misma tabla de IVA que el frontend', () => {
    for (const t of TIPOS_IVA) expect(porcentajeIva(t.value)).toBe(t.porcentaje);
  });
});

describe('construirAsientosAcompte', () => {
  it('coincide con construirAsientosFacturaEmision del frontend', () => {
    for (const tipoIva of ['TVA_10', 'TVA_20', 'EXENTO']) {
      const fila = construirFacturaAcompte({ ...base, tipo_iva: tipoIva }, '2026-11-10');
      const f = { id: 'f1', numero: 'AC-2026-0099', cliente_nombre: fila.cliente_nombre, fecha_factura: '2026-11-10', lineas: fila.lineas };
      expect(construirAsientosAcompte(f)).toEqual(construirAsientosFacturaEmision({ ...f, tipo: 'acompte' }));
    }
  });
});

describe('construirFacturaAcompte', () => {
  it('vence a los 7 días y copia los datos del presupuesto', () => {
    const fila = construirFacturaAcompte(base, '2026-11-28');
    expect(fila.fecha_vence).toBe('2026-12-05');
    expect(fila).toMatchObject({ tipo: 'acompte', presupuesto_id: 'p1', pais: 'Francia', tipo_iva: 'TVA_20', metodo_pago: 'Transferencia' });
  });
});

describe('hoyParis', () => {
  it('usa la hora de Francia, no UTC', () => {
    expect(hoyParis(new Date('2026-11-10T23:30:00Z'))).toBe('2026-11-11');
  });
});
