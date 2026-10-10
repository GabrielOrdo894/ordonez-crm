import { supabase } from '../../lib/supabase';
import type { FotoGaleria, GaleriaProyecto, TipoFoto } from './types';

// Galería v2 (auditoría 2026-10-10): todo lo que toca archivos y el array `fotos` pasa por aquí —
// GaleriaDetallePage, /rapido (envios.ts) y la cola sin conexión. Reglas:
//  - Cada foto se guarda dos veces: original (≤ 2000 px, WebP) y miniatura (480 px, WebP). Supabase
//    no tiene transformaciones de imagen en este plan, así que sin miniatura cada rejilla descargaba
//    la foto entera (1,5 MB de media).
//  - Un vídeo lleva un póster (fotograma JPEG) y su duración; nunca se usa <video> como miniatura.
//  - El array `fotos` se escribe con comprobación optimista sobre `updated_at`: si otro usuario lo
//    cambió mientras tanto, se relee y se vuelve a aplicar el cambio en vez de pisarlo.
//  - Al borrar: primero la fila, después los archivos. Un archivo huérfano es inofensivo; una foto
//    con enlace roto en la ficha no.

export const BUCKET = 'galeria';
export const MAX_FOTOS_PROYECTO = 20;
export const TAMANO_MAX_FOTO = 25 * 1024 * 1024; // antes de optimizar
export const TAMANO_MAX_VIDEO = 50 * 1024 * 1024; // tope por archivo del plan de Supabase
const LADO_MAX_ORIGINAL = 2000;
const LADO_MINIATURA = 480;
const CALIDAD_ORIGINAL = 0.82;
const CALIDAD_MINIATURA = 0.78;
const MIMES_VIDEO = ['video/mp4', 'video/quicktime', 'video/webm'];

export function pathDesdeUrl(url: string): string | null {
  const marca = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marca);
  return idx === -1 ? null : decodeURIComponent(url.slice(idx + marca.length));
}

/** Todos los archivos del bucket que pertenecen a una foto (original, miniatura, póster). */
export function pathsDeFoto(f: Pick<FotoGaleria, 'url' | 'thumb_url' | 'poster_url'>): string[] {
  return [f.url, f.thumb_url, f.poster_url]
    .map((u) => (u ? pathDesdeUrl(u) : null))
    .filter((p): p is string => !!p);
}

export type ValidacionArchivo = { ok: true; clase: 'foto' | 'video' } | { ok: false; motivo: string };

function mb(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

/** Comprueba tipo y tamaño antes de tocar nada — el mensaje va directo al usuario. */
export function validarArchivo(file: { name: string; type: string; size: number }): ValidacionArchivo {
  const tipo = file.type.toLowerCase();
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  if (tipo === 'image/heic' || tipo === 'image/heif' || ext === 'heic' || ext === 'heif') {
    return {
      ok: false,
      motivo: `"${file.name}" es una foto HEIC de iPhone y no se vería en Android ni en Windows. En el iPhone: Ajustes → Cámara → Formatos → «Más compatible», o elígela desde la galería del móvil (la convierte sola).`,
    };
  }
  if (tipo.startsWith('image/')) {
    if (tipo === 'image/gif') return { ok: false, motivo: `"${file.name}": los GIF no se admiten` };
    if (file.size > TAMANO_MAX_FOTO) return { ok: false, motivo: `"${file.name}" pesa ${mb(file.size)}; el máximo por foto es ${mb(TAMANO_MAX_FOTO)}` };
    return { ok: true, clase: 'foto' };
  }
  if (tipo.startsWith('video/')) {
    if (!MIMES_VIDEO.includes(tipo)) return { ok: false, motivo: `"${file.name}": solo se admiten vídeos MP4, MOV o WebM` };
    if (file.size > TAMANO_MAX_VIDEO) {
      return { ok: false, motivo: `"${file.name}" pesa ${mb(file.size)}; el máximo por vídeo es ${mb(TAMANO_MAX_VIDEO)}. Graba clips cortos o recórtalo antes.` };
    }
    return { ok: true, clase: 'video' };
  }
  return { ok: false, motivo: `"${file.name}": solo se admiten fotos o vídeos` };
}

/** Mensaje de error si no caben `cuantas` fotos más en la obra, o null si caben. */
export function errorDeCupo(fotos: FotoGaleria[], cuantas: number): string | null {
  const quedan = MAX_FOTOS_PROYECTO - fotos.length;
  if (cuantas <= quedan) return null;
  if (quedan <= 0) return `La obra ya tiene ${MAX_FOTOS_PROYECTO} fotos/vídeos, el máximo. Borra alguna para subir más.`;
  return `Solo caben ${quedan} más (máximo ${MAX_FOTOS_PROYECTO} por obra) y has elegido ${cuantas}.`;
}

export function siguienteOrden(fotos: FotoGaleria[], tipo: TipoFoto): number {
  const deTipo = fotos.filter((f) => f.tipo === tipo);
  return deTipo.length > 0 ? Math.max(...deTipo.map((f) => f.orden)) + 1 : 0;
}

/** Reordena dentro de una categoría y renumera `orden` de 0 a n; el resto de categorías no cambia. */
export function reordenarCategoria(fotos: FotoGaleria[], tipo: TipoFoto, desdeUrl: string, hastaUrl: string): FotoGaleria[] {
  const deTipo = fotos.filter((f) => f.tipo === tipo).sort((a, b) => a.orden - b.orden);
  const desde = deTipo.findIndex((f) => f.url === desdeUrl);
  const hasta = deTipo.findIndex((f) => f.url === hastaUrl);
  if (desde === -1 || hasta === -1 || desde === hasta) return fotos;
  const [movida] = deTipo.splice(desde, 1);
  deTipo.splice(hasta, 0, movida);
  const renumeradas = deTipo.map((f, i) => ({ ...f, orden: i }));
  return [...fotos.filter((f) => f.tipo !== tipo), ...renumeradas];
}

/** Cambia de categoría un conjunto de fotos: van al final de la nueva, el resto conserva su orden. */
export function moverACategoria(fotos: FotoGaleria[], urls: Set<string>, tipo: TipoFoto): FotoGaleria[] {
  const quedan = fotos.filter((f) => !urls.has(f.url));
  const movidas = fotos.filter((f) => urls.has(f.url) && f.tipo !== tipo).sort((a, b) => a.orden - b.orden);
  if (movidas.length === 0) return fotos;
  let orden = siguienteOrden(quedan, tipo);
  const conOrden = movidas.map((f) => ({ ...f, tipo, orden: orden++ }));
  const sinMover = fotos.filter((f) => urls.has(f.url) && f.tipo === tipo);
  return [...quedan, ...sinMover, ...conOrden];
}

// ---- Procesado en el navegador ----------------------------------------------------------------

async function redimensionar(origen: Blob, ladoMax: number, calidad: number): Promise<{ blob: Blob; ancho: number; alto: number }> {
  // createImageBitmap aplica la orientación EXIF por defecto — no corregirla a mano (doble giro).
  const bitmap = await createImageBitmap(origen);
  const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.max(1, Math.round(bitmap.width * escala));
  const alto = Math.max(1, Math.round(bitmap.height * escala));
  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('El navegador no permite procesar la imagen');
  }
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', calidad));
  if (!blob) throw new Error('No se pudo convertir la imagen');
  return { blob, ancho, alto };
}

export type FotoPreparada = { original: Blob; miniatura: Blob; ancho: number; alto: number };

export async function prepararFoto(file: Blob): Promise<FotoPreparada> {
  const grande = await redimensionar(file, LADO_MAX_ORIGINAL, CALIDAD_ORIGINAL).catch(() => {
    throw new Error('No se pudo leer la imagen (¿formato no compatible con este navegador?)');
  });
  const pequena = await redimensionar(grande.blob, LADO_MINIATURA, CALIDAD_MINIATURA);
  // Si el WebP sale más grande que el archivo que ya teníamos (raro: fotos muy pequeñas), se deja el
  // de entrada tal cual.
  const original = grande.blob.size < file.size || !(file instanceof File) ? grande.blob : file;
  return { original, miniatura: pequena.blob, ancho: grande.ancho, alto: grande.alto };
}

export type VideoPreparado = { poster: Blob | null; duracion: number | null; ancho: number | null; alto: number | null };

/** Fotograma del vídeo para la miniatura + duración. Si el navegador no puede decodificarlo
 * (p. ej. HEVC de iPhone en Android/Windows), avisa: nadie más podría verlo tampoco. */
export async function prepararVideo(file: File): Promise<VideoPreparado> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  const url = URL.createObjectURL(file);
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
      video.addEventListener(
        'error',
        () =>
          reject(
            new Error(
              `"${file.name}" no se puede reproducir en este navegador (si es de iPhone, probablemente es HEVC: Ajustes → Cámara → Formatos → «Más compatible»)`,
            ),
          ),
        { once: true },
      );
    });
    const duracion = Number.isFinite(video.duration) ? video.duration : null;
    video.currentTime = Math.min(1, (duracion ?? 0) / 2);
    await new Promise<void>((resolve) => video.addEventListener('seeked', () => resolve(), { once: true }));
    // Safari pinta el fotograma un frame más tarde de `seeked` (WebKit #236604).
    await new Promise<void>((resolve) => {
      const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => void };
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => resolve());
      else requestAnimationFrame(() => resolve());
    });
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    let poster: Blob | null = null;
    if (ctx && canvas.width > 0) {
      ctx.drawImage(video, 0, 0);
      const fotograma = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
      poster = fotograma ? (await redimensionar(fotograma, LADO_MINIATURA, CALIDAD_MINIATURA)).blob : null;
    }
    return { poster, duracion, ancho: video.videoWidth || null, alto: video.videoHeight || null };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
  }
}

// ---- Subida ---------------------------------------------------------------------------------

function extensionDe(nombre: string, mime: string): string {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'video/quicktime') return 'mov';
  if (mime === 'video/webm') return 'webm';
  if (mime === 'video/mp4') return 'mp4';
  return nombre.split('.').pop()?.toLowerCase() || 'bin';
}

async function subirAlBucket(path: string, blob: Blob, contentType: string): Promise<string> {
  // Rutas únicas e inmutables: la caché del navegador puede guardarlas un año sin riesgo.
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType, cacheControl: '31536000' });
  if (error) throw new Error(error.message);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Procesa y sube un archivo ya validado. Devuelve el elemento para el array `fotos` (sin guardarlo
 * en la fila: eso lo hace guardarFotos). Si algo falla a medias, borra lo que llegó a subirse. */
export type ArchivoASubir = { archivo: Blob; nombre: string; mime: string; lastModified?: number };

export async function subirArchivo(galeriaId: string, entrada: ArchivoASubir, tipo: TipoFoto, orden: number): Promise<FotoGaleria> {
  const file = entrada.archivo instanceof File ? entrada.archivo : new File([entrada.archivo], entrada.nombre, { type: entrada.mime, lastModified: entrada.lastModified });
  const esVideo = file.type.startsWith('video/');
  const id = crypto.randomUUID();
  const subidos: string[] = [];
  try {
    if (!esVideo) {
      const prep = await prepararFoto(file);
      const ext = extensionDe(file.name, prep.original.type || file.type);
      const pathOriginal = `${galeriaId}/${id}.${ext}`;
      const pathThumb = `${galeriaId}/${id}_thumb.webp`;
      const url = await subirAlBucket(pathOriginal, prep.original, prep.original.type || file.type);
      subidos.push(pathOriginal);
      const thumbUrl = await subirAlBucket(pathThumb, prep.miniatura, 'image/webp');
      subidos.push(pathThumb);
      return {
        url,
        nombre: file.name,
        tipo,
        orden,
        tipo_archivo: 'foto',
        titulo: null,
        descripcion: null,
        thumb_url: thumbUrl,
        poster_url: null,
        ancho: prep.ancho,
        alto: prep.alto,
        duracion: null,
        fecha_captura: file.lastModified ? new Date(file.lastModified).toISOString() : null,
      };
    }
    const prep = await prepararVideo(file);
    const pathVideo = `${galeriaId}/${id}.${extensionDe(file.name, file.type)}`;
    const url = await subirAlBucket(pathVideo, file, file.type);
    subidos.push(pathVideo);
    let posterUrl: string | null = null;
    if (prep.poster) {
      const pathPoster = `${galeriaId}/${id}_poster.webp`;
      posterUrl = await subirAlBucket(pathPoster, prep.poster, 'image/webp');
      subidos.push(pathPoster);
    }
    return {
      url,
      nombre: file.name,
      tipo,
      orden,
      tipo_archivo: 'video',
      titulo: null,
      descripcion: null,
      thumb_url: null,
      poster_url: posterUrl,
      ancho: prep.ancho,
      alto: prep.alto,
      duracion: prep.duracion,
      fecha_captura: file.lastModified ? new Date(file.lastModified).toISOString() : null,
    };
  } catch (err) {
    if (subidos.length > 0) await supabase.storage.from(BUCKET).remove(subidos);
    throw err;
  }
}

// ---- Escritura del array `fotos` ----------------------------------------------------------------

type FilaFotos = { fotos: FotoGaleria[]; updated_at: string };

async function leerFotos(galeriaId: string): Promise<FilaFotos> {
  const { data, error } = await supabase.from('galeria').select('fotos, updated_at').eq('id', galeriaId).single();
  if (error) throw new Error(error.message);
  return { fotos: (data.fotos ?? []) as FotoGaleria[], updated_at: data.updated_at as string };
}

/** Aplica `mutar` sobre el array actual y lo guarda solo si nadie lo cambió desde `updatedAtVisto`;
 * si alguien lo cambió, relee y vuelve a aplicar `mutar` (que debe ser pura) sobre lo nuevo. */
export async function guardarFotos(
  galeriaId: string,
  updatedAtVisto: string | null,
  mutar: (fotos: FotoGaleria[]) => FotoGaleria[],
): Promise<FilaFotos> {
  let fila = updatedAtVisto ? null : await leerFotos(galeriaId);
  let visto = updatedAtVisto ?? fila!.updated_at;
  for (let intento = 0; intento < 3; intento++) {
    if (!fila) fila = await leerFotos(galeriaId);
    const nuevas = mutar(fila.fotos);
    const { data, error } = await supabase
      .from('galeria')
      .update({ fotos: nuevas })
      .eq('id', galeriaId)
      .eq('updated_at', visto)
      .select('fotos, updated_at');
    if (error) throw new Error(error.message);
    if (data && data.length > 0) return { fotos: data[0].fotos as FotoGaleria[], updated_at: data[0].updated_at as string };
    // Conflicto: otro usuario guardó entre medias. Releer y reintentar sobre lo suyo.
    fila = await leerFotos(galeriaId);
    visto = fila.updated_at;
  }
  throw new Error('Otra persona está modificando esta obra a la vez; recarga la página y vuelve a intentarlo');
}

/** Borra del bucket los archivos de varias fotos en una sola llamada. Devuelve cuántas fallaron. */
export async function borrarArchivos(fotos: FotoGaleria[]): Promise<number> {
  const paths = fotos.flatMap(pathsDeFoto);
  if (paths.length === 0) return 0;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  return error ? fotos.length : 0;
}

/** Descarga un archivo del bucket como Blob (por la API, sin depender de CORS del CDN). */
export async function descargarBlob(url: string): Promise<Blob> {
  const path = pathDesdeUrl(url);
  if (path) {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (!error && data) return data;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar ${url}`);
  return res.blob();
}

/** Para compartir por WhatsApp: un WebP a veces llega como sticker, un JPEG siempre como foto. */
export async function comoJpeg(f: FotoGaleria): Promise<File> {
  const origen = await descargarBlob(f.url);
  const bitmap = await createImageBitmap(origen);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  bitmap.close();
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!jpeg) throw new Error('No se pudo convertir la foto');
  return new File([jpeg], f.nombre.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

/** Fotos antiguas (de antes de la v2) sin miniatura ni medidas: se generan a partir del original la
 * primera vez que alguien abre la obra. Devuelve true si cambió algo. Best-effort: un fallo en una
 * foto no impide completar las demás. */
export async function completarMiniaturas(proyecto: Pick<GaleriaProyecto, 'id' | 'fotos' | 'updated_at'>): Promise<boolean> {
  const pendientes = proyecto.fotos.filter((f) => f.tipo_archivo === 'foto' && !f.thumb_url);
  if (pendientes.length === 0) return false;
  const generadas = new Map<string, Partial<FotoGaleria>>();
  for (const f of pendientes) {
    const path = pathDesdeUrl(f.url);
    if (!path) continue;
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(path);
      if (error || !data) continue;
      const { blob } = await redimensionar(data, LADO_MINIATURA, CALIDAD_MINIATURA);
      const grande = await createImageBitmap(data);
      const medidas = { ancho: grande.width, alto: grande.height };
      grande.close();
      const pathThumb = path.replace(/\.[^./]+$/, '') + '_thumb.webp';
      const thumbUrl = await subirAlBucket(pathThumb, blob, 'image/webp');
      generadas.set(f.url, { thumb_url: thumbUrl, ...medidas });
    } catch (err) {
      console.warn('No se pudo generar la miniatura de', f.nombre, err);
    }
  }
  if (generadas.size === 0) return false;
  await guardarFotos(proyecto.id, null, (fotos) => fotos.map((f) => (generadas.has(f.url) ? { ...f, ...generadas.get(f.url) } : f)));
  return true;
}
