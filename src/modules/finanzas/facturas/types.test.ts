import { describe, it, expect } from 'vitest';
import { lineaDeduccionAcomptes } from './types';
import { calcularLinea, lineaVacia } from '../lineas';

function acompteDe(totalSinIva: number, numero: string) {
  const linea = calcularLinea({ ...lineaVacia(), cantidad: 1, precio_unit: totalSinIva }, 21);
  return { numero, lineas: [linea] };
}

describe('lineaDeduccionAcomptes', () => {
  it('el precio unitario es el negativo de la suma de los acomptes previos', () => {
    const linea = lineaDeduccionAcomptes([acompteDe(1000, 'F-1'), acompteDe(500, 'F-2')], 'IVA_21', 'Español');
    expect(linea.precio_unit).toBe(-1500);
    expect(linea.total_sin_iva).toBe(-1500);
  });

  it('nunca cuenta las líneas es_incluido del acompte', () => {
    const conIncluida = {
      numero: 'F-1',
      lineas: [
        calcularLinea({ ...lineaVacia(), cantidad: 1, precio_unit: 1000 }, 21),
        calcularLinea({ ...lineaVacia(), cantidad: 1, precio_unit: 999, es_incluido: true }, 21),
      ],
    };
    const linea = lineaDeduccionAcomptes([conIncluida], 'IVA_21', 'Español');
    expect(linea.precio_unit).toBe(-1000);
  });

  it('genera una línea con referencia y tipo_servicio válidos (no falla validarLineas)', () => {
    const linea = lineaDeduccionAcomptes([acompteDe(500, 'F-1')], 'IVA_21', 'Español');
    expect(linea.designacion.trim()).not.toBe('');
    expect(linea.referencia.trim()).not.toBe('');
    expect(linea.tipo_servicio).not.toBe('—');
  });

  it('usa terminología francesa cuando el idioma del documento es Français', () => {
    const linea = lineaDeduccionAcomptes([acompteDe(500, 'F-1')], 'TVA_10', 'Français');
    expect(linea.designacion).toBe('Déduction acompte(s)');
    expect(linea.tipo_servicio).toBe('Prestations de services BIC');
  });

  it('usa terminología española por defecto', () => {
    const linea = lineaDeduccionAcomptes([acompteDe(500, 'F-1')], 'IVA_21', 'Español');
    expect(linea.designacion).toBe('Deducción de anticipo(s)');
    expect(linea.tipo_servicio).toBe('Prestación de servicios');
  });

  it('sin acomptes, la deducción es 0', () => {
    const linea = lineaDeduccionAcomptes([], 'IVA_21', 'Español');
    expect(linea.precio_unit).toBe(-0);
    expect(linea.total_sin_iva).toBe(-0);
  });
});
