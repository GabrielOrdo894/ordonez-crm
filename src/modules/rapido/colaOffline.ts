import { isAuthRetryableFetchError } from '@supabase/supabase-js';

// Cola de envíos sin conexión de la pantalla de acciones rápidas (2026-09-28, petición de Gabriel:
// "que estemos en un lugar y se pueda registrar la ubicación y dejar que se envíe cuando tengas
// internet"). Lo que se hace sin cobertura (kilometraje, foto de ticket, fotos de obra) se guarda en
// el propio móvil (IndexedDB, que admite las fotos como Blob) y se envía después con las MISMAS
// funciones que el envío directo (envios.ts) — la cola no tiene lógica de negocio propia.
// Si el móvil borra los datos del sitio o se desinstala la app antes de enviarse, se pierde.

export type ArchivoPendiente = { archivo: Blob; nombre: string; mime: string };

export type EnvioKm = {
  tipo: 'km';
  fecha: string; // día en que se registró, no el del envío
  lat: number;
  lng: number;
  direccion: string | null; // null = sin conexión al registrar, se calcula al enviarse
  km: number | null; // null = se calcula al enviarse (o se completa en Gastos si Google falla)
  visitaId: string | null;
  etiquetaVisita: string | null;
};

export type EnvioTicket = { tipo: 'ticket'; fecha: string; nota: string; foto: ArchivoPendiente };

export type EnvioFotos = {
  tipo: 'fotos';
  obraClave: string;
  obraNombre: string;
  tipoFoto: string;
  fotos: ArchivoPendiente[];
};

export type Envio = EnvioKm | EnvioTicket | EnvioFotos;
export type Pendiente = Envio & { id: string; creado: string; ultimoError?: string };

const BD = 'crm-rapido';
const ALMACEN = 'pendientes';
export const EVENTO_COLA = 'crm-rapido-cola';

function abrirBd(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(BD, 1);
    peticion.onupgradeneeded = () => peticion.result.createObjectStore(ALMACEN, { keyPath: 'id' });
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error ?? new Error('No se pudo abrir el almacenamiento del móvil'));
  });
}

async function operar<T>(modo: IDBTransactionMode, fn: (almacen: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const bd = await abrirBd();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = bd.transaction(ALMACEN, modo);
      const peticion = fn(tx.objectStore(ALMACEN));
      tx.oncomplete = () => resolve(peticion.result);
      tx.onerror = () => reject(tx.error ?? new Error('Error en el almacenamiento del móvil'));
    });
  } finally {
    bd.close();
  }
}

function avisarCambio() {
  window.dispatchEvent(new Event(EVENTO_COLA));
}

export async function encolar(envio: Envio): Promise<void> {
  const pendiente = { ...envio, id: crypto.randomUUID(), creado: new Date().toISOString() } as Pendiente;
  await operar('readwrite', (a) => a.put(pendiente));
  avisarCambio();
}

export async function listarPendientes(): Promise<Pendiente[]> {
  const todos = await operar('readonly', (a) => a.getAll() as IDBRequest<Pendiente[]>);
  return todos.sort((x, y) => x.creado.localeCompare(y.creado));
}

export async function quitarPendiente(id: string): Promise<void> {
  await operar('readwrite', (a) => a.delete(id));
  avisarCambio();
}

export async function marcarError(pendiente: Pendiente, mensaje: string): Promise<void> {
  await operar('readwrite', (a) => a.put({ ...pendiente, ultimoError: mensaje }));
  avisarCambio();
}

/** Un fallo por falta de red (se reintenta más tarde) frente a un error real de datos (se muestra
 * y se queda en la cola hasta que se descarte a mano). Supabase no tiene un tipo común: PostgREST
 * devuelve "TypeError: Failed to fetch" como mensaje, Storage un StorageUnknownError. */
export function esErrorDeRed(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (isAuthRetryableFetchError(err)) return true;
  const mensaje = mensajeError(err);
  const nombre = err instanceof Error ? err.name : '';
  return nombre === 'StorageUnknownError' || /failed to fetch|networkerror|network request failed|load failed/i.test(mensaje);
}

export function mensajeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err && 'message' in err) return String(err.message);
  return 'Error desconocido';
}
