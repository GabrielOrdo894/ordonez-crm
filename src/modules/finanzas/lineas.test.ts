import { describe, it, expect } from 'vitest';
import { calcularLinea, calcularTotales, lineaVacia, lineaInvalida, validarLineas, totalLineaMax, calcularTotalesRango } from './lineas';

describe('calcularLinea', () => {
  it('calcula total sin IVA y con IVA a partir de cantidad y precio unitario', () => {
    const linea = calcularLinea({ ...lineaVacia(), cantidad: 3, precio_unit: 100 }, 21);
    expect(linea.total_sin_iva).toBe(300);
    expect(linea.total_con_iva).toBeCloseTo(363, 2);
  });

  it('una línea marcada como incluida no suma nada aunque tenga cantidad/precio', () => {
    const linea = calcularLinea({ ...lineaVacia(), cantidad: 5, precio_unit: 200, es_incluido: true }, 21);
    expect(linea.total_sin_iva).toBe(0);
    expect(linea.total_con_iva).toBe(0);
  });

  it('acepta precio_unit negativo (líneas de deducción)', () => {
    const linea = calcularLinea({ ...lineaVacia(), cantidad: 1, precio_unit: -500 }, 10);
    expect(linea.total_sin_iva).toBe(-500);
    expect(linea.total_con_iva).toBeCloseTo(-550, 2);
  });
});

describe('calcularTotales', () => {
  it('suma los totales de varias líneas, ignorando las incluidas', () => {
    const lineas = [
      calcularLinea({ ...lineaVacia(), cantidad: 2, precio_unit: 100 }, 21),
      calcularLinea({ ...lineaVacia(), cantidad: 1, precio_unit: 50, es_incluido: true }, 21),
      calcularLinea({ ...lineaVacia(), cantidad: 1, precio_unit: 300 }, 10),
    ];
    const { totalSinIva, totalConIva } = calcularTotales(lineas);
    expect(totalSinIva).toBe(500);
    expect(totalConIva).toBeCloseTo(2 * 100 * 1.21 + 300 * 1.1, 2);
  });

  it('con lista vacía devuelve 0', () => {
    expect(calcularTotales([])).toEqual({ totalSinIva: 0, totalConIva: 0 });
  });
});

describe('totalLineaMax / calcularTotalesRango', () => {
  it('usa precio_unit_max si existe, si no cae al precio_unit normal', () => {
    const conMax = { ...lineaVacia(), cantidad: 2, precio_unit: 100, precio_unit_max: 150 };
    const sinMax = { ...lineaVacia(), cantidad: 2, precio_unit: 100 };
    expect(totalLineaMax(conMax, 21).sinIva).toBe(300);
    expect(totalLineaMax(sinMax, 21).sinIva).toBe(200);
  });

  it('una línea incluida no aporta al rango máximo', () => {
    const incluida = { ...lineaVacia(), cantidad: 2, precio_unit: 100, precio_unit_max: 150, es_incluido: true };
    expect(totalLineaMax(incluida, 21)).toEqual({ sinIva: 0, conIva: 0 });
  });

  it('el rango mínimo coincide con calcularTotales', () => {
    const lineas = [calcularLinea({ ...lineaVacia(), cantidad: 1, precio_unit: 100, precio_unit_max: 200 }, 21)];
    const rango = calcularTotalesRango(lineas, 21);
    expect(rango.totalSinIvaMin).toBe(100);
    expect(rango.totalSinIvaMax).toBe(200);
  });
});

describe('lineaInvalida / validarLineas', () => {
  it('una línea vacía es inválida (sin designación/referencia/tipo)', () => {
    expect(lineaInvalida(lineaVacia())).toBe(true);
  });

  it('una línea completa es válida', () => {
    const linea = { ...lineaVacia(), designacion: 'Alicatado baño', referencia: 'REF-1', tipo_servicio: 'Obra' };
    expect(lineaInvalida(linea)).toBe(false);
  });

  it('validarLineas devuelve el primer error encontrado con el número de línea', () => {
    const lineas = [
      { ...lineaVacia(), designacion: 'ok', referencia: 'ok', tipo_servicio: 'Obra' },
      lineaVacia(),
    ];
    expect(validarLineas(lineas)).toMatch(/Línea 2/);
  });

  it('validarLineas devuelve null si todas las líneas son válidas', () => {
    const lineas = [{ ...lineaVacia(), designacion: 'ok', referencia: 'ok', tipo_servicio: 'Obra' }];
    expect(validarLineas(lineas)).toBeNull();
  });
});
