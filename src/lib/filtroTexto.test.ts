import { describe, expect, it } from 'vitest';
import { valorIlikeParaOr } from './filtroTexto';

describe('valorIlikeParaOr', () => {
  it('envuelve el texto entre comillas dobles con comodines a los lados', () => {
    expect(valorIlikeParaOr('Ordoñez')).toBe('"%Ordoñez%"');
  });

  it('no rompe la sintaxis del filtro con una coma (nombres tipo "Dupont, Marie")', () => {
    expect(valorIlikeParaOr('Dupont, Marie')).toBe('"%Dupont, Marie%"');
  });

  it('escapa paréntesis sin necesidad de tratamiento especial (quedan dentro de las comillas)', () => {
    expect(valorIlikeParaOr('Casa (2ª planta)')).toBe('"%Casa (2ª planta)%"');
  });

  it('escapa comillas dobles literales para no cerrar el valor antes de tiempo', () => {
    expect(valorIlikeParaOr('El "bueno"')).toBe('"%El \\"bueno\\"%"');
  });

  it('escapa barras invertidas literales', () => {
    expect(valorIlikeParaOr('C:\\ruta')).toBe('"%C:\\\\ruta%"');
  });
});
