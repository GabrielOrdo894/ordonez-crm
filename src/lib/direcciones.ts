// Las direcciones de Google Maps vienen como "calle, código postal ciudad, país" en una sola
// cadena. Se muestran en dos líneas: la calle, y debajo el código postal + ciudad + país.
export function direccionEnDosLineas(direccion: string | null | undefined): [string, string] {
  const texto = (direccion ?? '').trim();
  if (!texto) return ['', ''];
  const idx = texto.indexOf(', ');
  if (idx === -1) return [texto, ''];
  return [texto.slice(0, idx), texto.slice(idx + 2)];
}
