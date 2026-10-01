import { supabase } from '../../lib/supabase';
import { calcularKmIdaYVuelta } from '../../lib/calcularKmIdaYVuelta';
import { insertarGastoKilometricoPendiente } from '../../lib/gastoKilometrico';
import type { NuevoGasto } from '../finanzas/gastos/types';
import { abrirOCrearFichaGaleria, cargarObrasDisponibles, type ObraGaleria } from '../galeria/obras';
import type { FotoGaleria, TipoFoto } from '../galeria/types';
import { esErrorDeRed, listarPendientes, marcarError, mensajeError, quitarPendiente, type ArchivoPendiente, type EnvioKm, type Pendiente } from './colaOffline';

// Envíos de la pantalla de acciones rápidas — los usan tanto el envío directo (con cobertura) como
// la cola sin conexión (colaOffline.ts), para que lo que llega a Gastos/Galería sea idéntico.

type GoogleGeocodingWindow = {
  google?: {
    maps?: {
      importLibrary: (libreria: string) => Promise<{
        Geocoder: new () => {
          geocode: (peticion: { location: { lat: number; lng: number } }) => Promise<{ results: { formatted_address: string }[] }>;
        };
      }>;
    };
  };
};

export async function direccionDesdeCoordenadas(lat: number, lng: number): Promise<string | null> {
  const google = (window as unknown as GoogleGeocodingWindow).google;
  if (!google?.maps?.importLibrary) return null;
  try {
    const { Geocoder } = await google.maps.importLibrary('geocoding');
    const { results } = await new Geocoder().geocode({ location: { lat, lng } });
    return results[0]?.formatted_address ?? null;
  } catch {
    return null;
  }
}

// ---- Kilometraje -------------------------------------------------------------------------------

// `idEnvio`: id del envío de la cola offline, usado como id del gasto (y de su justificante) para que
// un reintento no duplique nada si el primer intento llegó a guardarse (auditoría 2026-10-01).
export async function enviarKm(envio: EnvioKm, idEnvio?: string): Promise<void> {
  // Registrado sin conexión: dirección y km se calculan ahora, con las coordenadas de entonces.
  const [direccion, km] = await Promise.all([
    envio.direccion ?? direccionDesdeCoordenadas(envio.lat, envio.lng),
    envio.km ?? calcularKmIdaYVuelta({ lat: envio.lat, lng: envio.lng }),
  ]);
  if (envio.visitaId) {
    const { data: existente, error } = await supabase.from('gastos').select('id').eq('visita_id', envio.visitaId).limit(1);
    if (error) throw error;
    if (existente && existente.length > 0) {
      if (idEnvio && existente[0].id === idEnvio) return; // reintento del mismo envío
      throw new Error('Esta visita ya tiene un gasto de kilometraje registrado');
    }
  }
  await insertarGastoKilometricoPendiente({
    fecha: envio.fecha,
    etiqueta: envio.etiquetaVisita ?? direccion ?? `${envio.lat.toFixed(5)}, ${envio.lng.toFixed(5)}`,
    km,
    visitaId: envio.visitaId,
    id: idEnvio,
  });
}

// ---- Foto de ticket → gasto pendiente de completar ---------------------------------------------

// Mismo bucket privado y misma convención de path que GastoForm.tsx (gastos/<uuid>.<ext>). El gasto
// se crea 'pendiente' sin importe ni cuenta — se completa desde Gastos en el ordenador, y hasta que
// se confirma no genera asiento contable (igual que el kilometraje automático).
export async function enviarTicket(
  { fecha, nota, foto }: { fecha: string; nota: string; foto: ArchivoPendiente },
  idEnvio?: string,
): Promise<void> {
  const extension = foto.nombre.split('.').pop() ?? 'jpg';
  const idGasto = idEnvio ?? crypto.randomUUID();
  const path = `gastos/${idGasto}.${extension}`;
  // upsert: un reintento sobrescribe el mismo fichero en vez de dejar otro huérfano.
  const { error: errorSubida } = await supabase.storage
    .from('justificantes')
    .upload(path, foto.archivo, { contentType: foto.mime, upsert: !!idEnvio });
  if (errorSubida) throw errorSubida;

  const nuevo: NuevoGasto = {
    fecha,
    descripcion: `Ticket pendiente de completar${nota.trim() ? ` — ${nota.trim()}` : ''} (foto desde el móvil)`,
    categoria: null,
    proveedor: null,
    proveedor_id: null,
    importe_base: 0,
    tipo_iva: null,
    importe_iva: 0,
    pais: 'Francia', // todos los gastos van a la EURL francesa (decisión de Gabriel 2026-09-26)
    cuenta_contable: null,
    visita_id: null,
    adjunto_url: path,
    adjunto_nombre: foto.nombre,
    adjunto_tipo: foto.mime,
    num_factura_proveedor: null,
    inmovilizado_id: null,
    km: null,
    vehiculo_cv: null,
    estado_gasto: 'pendiente',
  };
  const { error } = await supabase.from('gastos').insert({ ...nuevo, id: idGasto });
  if (error && idEnvio && error.code === '23505') return; // ya guardado en un intento anterior
  if (error) {
    // El gasto no se creó: no dejar el fichero huérfano en el bucket (best-effort).
    const { error: errorBorrado } = await supabase.storage.from('justificantes').remove([path]);
    if (errorBorrado) console.warn('No se pudo borrar el justificante huérfano:', errorBorrado.message);
    throw error;
  }
}

// ---- Fotos de obra → galería -------------------------------------------------------------------

export const MAX_FOTOS_PROYECTO = 20;

// Mismo flujo que GaleriaMediaPage.tsx: ficha creada al vuelo si la obra no la tiene todavía
// (abrirOCrearFichaGaleria, sin duplicados), bucket público `galeria`, y las fotos nuevas se añaden
// al final de su categoría respetando el máximo de 20 por proyecto.
export async function enviarFotosObra({ obra, tipoFoto, fotos }: { obra: ObraGaleria; tipoFoto: TipoFoto; fotos: ArchivoPendiente[] }) {
  const galeriaId = await abrirOCrearFichaGaleria(obra);
  const { data: proyecto, error: errorProyecto } = await supabase.from('galeria').select('fotos').eq('id', galeriaId).single();
  if (errorProyecto) throw errorProyecto;
  const actuales = ((proyecto?.fotos ?? []) as FotoGaleria[]).slice();
  if (actuales.length + fotos.length > MAX_FOTOS_PROYECTO) {
    throw new Error(`Máximo ${MAX_FOTOS_PROYECTO} fotos por obra (ya hay ${actuales.length})`);
  }
  const deCategoria = actuales.filter((f) => f.tipo === tipoFoto);
  let orden = deCategoria.length > 0 ? Math.max(...deCategoria.map((f) => f.orden)) + 1 : 0;
  const nuevas: FotoGaleria[] = [];
  for (const foto of fotos) {
    const path = `${galeriaId}/${crypto.randomUUID()}_${foto.nombre}`;
    const { error: errorSubida } = await supabase.storage.from('galeria').upload(path, foto.archivo, { contentType: foto.mime });
    if (errorSubida) throw errorSubida;
    const { data } = supabase.storage.from('galeria').getPublicUrl(path);
    nuevas.push({ url: data.publicUrl, nombre: foto.nombre, tipo: tipoFoto, orden, tipo_archivo: 'foto', titulo: null, descripcion: null });
    orden += 1;
  }
  const { error } = await supabase.from('galeria').update({ fotos: [...actuales, ...nuevas] }).eq('id', galeriaId);
  if (error) throw error;
  return { galeriaId, subidas: nuevas.length };
}

// ---- Envío de la cola --------------------------------------------------------------------------

async function enviarPendiente(p: Pendiente): Promise<void> {
  if (p.tipo === 'km') return enviarKm(p, p.id);
  if (p.tipo === 'ticket') return enviarTicket(p, p.id);
  // La obra se vuelve a leer ahora: si mientras tanto se le creó la ficha de galería, se usa esa
  // (con la copia guardada en el móvil se crearía otra ficha duplicada).
  const obra = (await cargarObrasDisponibles()).find((o) => o.clave === p.obraClave);
  if (!obra) throw new Error(`La obra "${p.obraNombre}" ya no está disponible en el CRM`);
  await enviarFotosObra({ obra, tipoFoto: p.tipoFoto as TipoFoto, fotos: p.fotos });
}

let enviando = false;

/** Envía todo lo pendiente, en orden. Se para al primer fallo de red (se reintentará al volver la
 * cobertura); un error de datos se guarda en el propio envío y se sigue con el resto. */
export async function procesarCola(): Promise<{ enviados: number; conError: number } | null> {
  // Una sola pestaña a la vez (la app instalada y el navegador comparten la cola de IndexedDB): el
  // candado `enviando` solo protegía dentro de la misma pestaña.
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('crm-cola-rapido', { ifAvailable: true }, (lock) => (lock ? procesarColaEnEstaPestana() : null));
  }
  return procesarColaEnEstaPestana();
}

async function procesarColaEnEstaPestana(): Promise<{ enviados: number; conError: number } | null> {
  if (enviando) return null;
  enviando = true;
  let enviados = 0;
  let conError = 0;
  try {
    for (const p of await listarPendientes()) {
      try {
        await enviarPendiente(p);
        await quitarPendiente(p.id);
        enviados += 1;
      } catch (err) {
        if (esErrorDeRed(err)) break;
        conError += 1;
        await marcarError(p, mensajeError(err));
      }
    }
  } finally {
    enviando = false;
  }
  return { enviados, conError };
}
