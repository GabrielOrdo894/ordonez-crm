import { describe, expect, it } from 'vitest';
import { limpiarTextoPegado } from './pegarHtmlComoMarcado';

describe('limpiarTextoPegado', () => {
  it('quita las marcas de hora y remitente de un chat de WhatsApp exportado desde iPhone', () => {
    const pegado = [
      "[2/11, 8:53] +34 600 00 00 00: Bonjour. J'aurais besoin d'un devis.",
      '[2/11, 8:55] +34 600 00 00 00: Hola, vivo en Hendaya',
      '[2/11, 9:26] +34 600 00 00 00: Mi mail es cliente@example.com',
    ].join('\n');
    expect(limpiarTextoPegado(pegado)).toBe(
      ["Bonjour. J'aurais besoin d'un devis.", 'Hola, vivo en Hendaya', 'Mi mail es cliente@example.com'].join('\n'),
    );
  });

  it('quita las marcas del formato de Android (fecha, guion y nombre)', () => {
    const pegado = '2/11/26, 8:53 - Cliente Ejemplo: Necesito un presupuesto\n2/11/26, 8:54 - Cliente Ejemplo: para el baño';
    expect(limpiarTextoPegado(pegado)).toBe('Necesito un presupuesto\npara el baño');
  });

  it('no toca un texto normal con dos puntos ni los saltos de línea sencillos', () => {
    const texto = 'Pide: diagnóstico y pintura.\n\nVivienda: villa 10.';
    expect(limpiarTextoPegado(texto)).toBe(texto);
  });

  it('colapsa varias líneas vacías seguidas y recorta las de los extremos', () => {
    expect(limpiarTextoPegado('\n\nHola\n\n\n\nAdiós\n\n')).toBe('Hola\n\nAdiós');
  });

  it('respeta la sintaxis de viñetas y negrita del editor', () => {
    const texto = '- **Retirada** de azulejo\n- Colocación nueva';
    expect(limpiarTextoPegado(texto)).toBe(texto);
  });
});
