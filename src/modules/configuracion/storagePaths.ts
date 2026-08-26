// Mismo patrón que pathGaleriaDesdeUrl en PapeleraPage.tsx — extrae el path de Storage de una URL
// pública del bucket 'empresa', para poder borrar el logo/foto anterior tras subir uno nuevo
// (ConfiguracionPage.tsx, ConstructorPortadaPage.tsx). Sin esto, cada subida con un nombre
// Date.now() distinto dejaba el archivo anterior huérfano en el bucket (bug real corregido
// 2026-08-18).
export function pathEmpresaDesdeUrl(url: string): string | null {
  const marca = '/storage/v1/object/public/empresa/';
  const idx = url.indexOf(marca);
  return idx === -1 ? null : url.slice(idx + marca.length);
}
