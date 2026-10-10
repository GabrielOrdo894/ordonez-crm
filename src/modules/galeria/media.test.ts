import { describe, it, expect } from 'vitest';
import { validarArchivo, errorDeCupo, siguienteOrden, reordenarCategoria, moverACategoria, pathDesdeUrl, pathsDeFoto, MAX_FOTOS_PROYECTO } from './media';
import { miniaturaDe, portadaDe, type FotoGaleria } from './types';

const foto = (url: string, tipo: FotoGaleria['tipo'], orden: number, extra: Partial<FotoGaleria> = {}): FotoGaleria => ({
  url,
  nombre: url,
  tipo,
  orden,
  tipo_archivo: 'foto',
  titulo: null,
  descripcion: null,
  ...extra,
});

describe('validarArchivo', () => {
  it('acepta fotos y vídeos habituales', () => {
    expect(validarArchivo({ name: 'a.jpg', type: 'image/jpeg', size: 1000 })).toEqual({ ok: true, clase: 'foto' });
    expect(validarArchivo({ name: 'a.mov', type: 'video/quicktime', size: 1000 })).toEqual({ ok: true, clase: 'video' });
  });
  it('rechaza HEIC con explicación para el iPhone', () => {
    const r = validarArchivo({ name: 'IMG_1.HEIC', type: '', size: 1000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('iPhone');
  });
  it('rechaza por tamaño, GIF, vídeos raros y otros tipos', () => {
    expect(validarArchivo({ name: 'a.jpg', type: 'image/jpeg', size: 30 * 1024 * 1024 }).ok).toBe(false);
    expect(validarArchivo({ name: 'a.gif', type: 'image/gif', size: 10 }).ok).toBe(false);
    expect(validarArchivo({ name: 'a.avi', type: 'video/x-msvideo', size: 10 }).ok).toBe(false);
    expect(validarArchivo({ name: 'a.mp4', type: 'video/mp4', size: 60 * 1024 * 1024 }).ok).toBe(false);
    expect(validarArchivo({ name: 'a.pdf', type: 'application/pdf', size: 10 }).ok).toBe(false);
  });
});

describe('errorDeCupo y siguienteOrden', () => {
  it('avisa cuando no caben', () => {
    const fotos = Array.from({ length: MAX_FOTOS_PROYECTO - 2 }, (_, i) => foto(`f${i}`, 'antes', i));
    expect(errorDeCupo(fotos, 2)).toBeNull();
    expect(errorDeCupo(fotos, 3)).toContain('Solo caben 2');
    expect(errorDeCupo([...fotos, foto('x', 'antes', 18), foto('y', 'antes', 19)], 1)).toContain('máximo');
  });
  it('numera por categoría, no globalmente', () => {
    const fotos = [foto('a', 'antes', 0), foto('b', 'antes', 1), foto('c', 'despues', 0)];
    expect(siguienteOrden(fotos, 'antes')).toBe(2);
    expect(siguienteOrden(fotos, 'despues')).toBe(1);
    expect(siguienteOrden(fotos, 'durante')).toBe(0);
  });
});

describe('reordenarCategoria', () => {
  it('mueve dentro de la categoría y renumera sin tocar las demás', () => {
    const fotos = [foto('a', 'antes', 0), foto('b', 'antes', 1), foto('c', 'antes', 2), foto('d', 'despues', 0)];
    const r = reordenarCategoria(fotos, 'antes', 'c', 'a');
    const antes = r.filter((f) => f.tipo === 'antes').sort((x, y) => x.orden - y.orden).map((f) => f.url);
    expect(antes).toEqual(['c', 'a', 'b']);
    expect(r.find((f) => f.url === 'd')?.orden).toBe(0);
  });
  it('no cambia nada si origen o destino no existen', () => {
    const fotos = [foto('a', 'antes', 0)];
    expect(reordenarCategoria(fotos, 'antes', 'a', 'zzz')).toBe(fotos);
  });
});

describe('moverACategoria', () => {
  it('pone las movidas al final de la nueva categoría', () => {
    const fotos = [foto('a', 'antes', 0), foto('b', 'antes', 1), foto('c', 'despues', 0)];
    const r = moverACategoria(fotos, new Set(['a']), 'despues');
    const a = r.find((f) => f.url === 'a')!;
    expect(a.tipo).toBe('despues');
    expect(a.orden).toBe(1);
    expect(r).toHaveLength(3);
  });
  it('ignora las que ya están en esa categoría', () => {
    const fotos = [foto('a', 'antes', 0)];
    expect(moverACategoria(fotos, new Set(['a']), 'antes')).toBe(fotos);
  });
});

describe('rutas del bucket', () => {
  it('extrae el path de una URL pública y de sus derivados', () => {
    const base = 'https://x.supabase.co/storage/v1/object/public/galeria/';
    expect(pathDesdeUrl(`${base}abc/1.webp`)).toBe('abc/1.webp');
    expect(pathDesdeUrl('https://otro.com/foto.jpg')).toBeNull();
    const f = foto(`${base}abc/1.webp`, 'antes', 0, { thumb_url: `${base}abc/1_thumb.webp`, poster_url: null });
    expect(pathsDeFoto(f)).toEqual(['abc/1.webp', 'abc/1_thumb.webp']);
  });
});

describe('miniaturaDe y portadaDe', () => {
  it('prefiere miniatura, luego póster, luego original', () => {
    expect(miniaturaDe(foto('o', 'antes', 0, { thumb_url: 't' }))).toBe('t');
    expect(miniaturaDe(foto('o', 'antes', 0, { poster_url: 'p' }))).toBe('p');
    expect(miniaturaDe(foto('o', 'antes', 0))).toBe('o');
  });
  it('usa la portada elegida, si no la primera de después, si no la primera foto', () => {
    const fotos = [foto('v', 'antes', 0, { tipo_archivo: 'video' }), foto('a', 'antes', 1), foto('d', 'despues', 0)];
    expect(portadaDe({ fotos, portada_url: 'a' })?.url).toBe('a');
    expect(portadaDe({ fotos, portada_url: 'no-existe' })?.url).toBe('d');
    expect(portadaDe({ fotos: fotos.slice(0, 2), portada_url: null })?.url).toBe('a');
    expect(portadaDe({ fotos: [], portada_url: null })).toBeNull();
  });
});
