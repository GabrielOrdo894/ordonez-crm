import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { generarPdfPresupuestoBlob } from './generarPdfPresupuesto';
import type { Presupuesto } from '../modules/finanzas/presupuestos/types';

// La Edge Function devuelve el mensaje de error real en el cuerpo JSON de la respuesta, pero
// supabase-js solo expone un mensaje genérico en error.message — hay que leer error.context.
async function mensajeError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body?.error) return body.error;
    } catch {
      // el cuerpo no era JSON — se usa el mensaje genérico de abajo
    }
  }
  return error instanceof Error ? error.message : 'Error desconocido al conectar con Documenso';
}

const ANCHO_PAGINA_MM = 210;
const ALTO_PAGINA_MM = 297;

function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve((lector.result as string).split(',')[1] ?? '');
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(blob);
  });
}

export type EnvioDocumensoResultado = {
  signingUrl: string;
  envelopeId: string;
};

/**
 * Genera el PDF del presupuesto, lo sube a Documenso y devuelve el enlace de firma del cliente.
 * Por defecto es idempotente: si ya existe un envelope guardado para este presupuesto, lo
 * reutiliza en vez de crear uno nuevo (evita un segundo email de firma al cliente si se reintenta
 * tras un fallo). `regenerar: true` (botón "Generar nuevo enlace") fuerza crear uno de verdad.
 */
export async function enviarPresupuestoAFirmar(p: Presupuesto, opts: { regenerar?: boolean } = {}): Promise<EnvioDocumensoResultado> {
  if (!p.cliente_email) {
    throw new Error('El presupuesto necesita un email de cliente para enviarlo a firmar con Documenso');
  }

  const { blob: pdfBlob, cajaFirma } = await generarPdfPresupuestoBlob(p);
  if (!cajaFirma) {
    throw new Error('No se pudo determinar la posición de la firma en el PDF');
  }
  const pdfBase64 = await blobABase64(pdfBlob);

  const { data, error } = await supabase.functions.invoke('documenso-crear-envelope', {
    body: {
      presupuestoId: p.id,
      numero: p.numero,
      clienteNombre: p.cliente_nombre,
      clienteEmail: p.cliente_email,
      pdfBase64,
      campoFirma: {
        pagina: cajaFirma.pagina,
        positionX: (cajaFirma.x / ANCHO_PAGINA_MM) * 100,
        positionY: (cajaFirma.y / ALTO_PAGINA_MM) * 100,
        width: (cajaFirma.width / ANCHO_PAGINA_MM) * 100,
        height: (cajaFirma.height / ALTO_PAGINA_MM) * 100,
      },
      regenerar: opts.regenerar ?? false,
    },
  });

  if (error) throw new Error(await mensajeError(error));
  if (data?.error) throw new Error(data.error);

  return { signingUrl: data.signingUrl, envelopeId: data.envelopeId };
}
