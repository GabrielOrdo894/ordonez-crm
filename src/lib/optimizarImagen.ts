// Redimensiona y recomprime una imagen en el navegador antes de subirla (Canvas API) — sin esto,
// una foto de móvil de 8-12 MB se sube tal cual a Storage, pesa de más y tarda en cargar en la
// Galería (petición de Gabriel 2026-09-10: "que todas las imágenes allí sean optimizadas").
// Los vídeos NO se tocan aquí — recomprimir vídeo en el navegador necesitaría una librería pesada
// (ffmpeg.wasm) para un beneficio dudoso; se mantiene solo el límite de tamaño ya existente.
const LADO_MAX_PX = 2000;
const CALIDAD_JPEG = 0.82;

export async function optimizarImagen(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const escala = Math.min(1, LADO_MAX_PX / Math.max(bitmap.width, bitmap.height));
  // Ya es lo bastante pequeña — no merece la pena recomprimir (evita perder calidad sin necesidad).
  if (escala === 1 && file.size < 1.5 * 1024 * 1024) {
    bitmap.close();
    return file;
  }

  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);
  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', CALIDAD_JPEG));
  if (!blob || blob.size >= file.size) return file;

  const nombre = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], nombre, { type: 'image/jpeg' });
}
