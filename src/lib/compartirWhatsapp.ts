import { supabase } from './supabase';
import { generarPdfPresupuesto, generarPdfPresupuestoBlob } from './generarPdfPresupuesto';
import { formatearPrecio } from '../modules/finanzas/lineas';
import type { Presupuesto } from '../modules/finanzas/presupuestos/types';

// «Enviar a Ricardo por WhatsApp» (petición de Gabriel, 2026-11-02): un envío totalmente automático
// exigiría la API oficial de WhatsApp Business (número dedicado, plantillas aprobadas, coste por
// conversación) o librerías no oficiales que arriesgan el número de la empresa. En su lugar, el
// CRM genera el PDF y lo pasa al menú de compartir del sistema (Web Share API, la misma técnica
// que la galería), donde se elige el chat de Ricardo. Si el navegador no admite compartir
// archivos, abre el chat de Ricardo con el texto ya escrito y descarga el PDF para adjuntarlo.
//
// El número de Ricardo es el teléfono de la empresa en España (`empresa_config.datos.es.telefono`),
// decisión de Gabriel — se lee de Configuración, nunca va en el código.

type ResultadoCompartir = 'compartido' | 'cancelado' | 'wa_me';

async function telefonoRicardo(): Promise<string> {
  const { data, error } = await supabase.from('empresa_config').select('datos').eq('id', 1).single();
  if (error) throw error;
  const datos = (data?.datos ?? {}) as { es?: { telefono?: string } };
  const digitos = (datos.es?.telefono ?? '').replace(/\D/g, '');
  if (!digitos) throw new Error('Falta el teléfono de la empresa en España en Configuración (es el WhatsApp de Ricardo)');
  return digitos;
}

// Texto en español (Ricardo solo lee español): lo justo para saber de qué presupuesto se trata,
// más la nota interna, que es donde el creador de presupuestos deja las dudas que él tiene que resolver.
export function textoWhatsappRicardo(p: Presupuesto): string {
  const total = p.lineas.reduce((s, l) => s + (Number(l.total_sin_iva) || 0), 0);
  const totalConIva = p.lineas.reduce((s, l) => s + (Number(l.total_con_iva) || 0), 0);
  const partes = [
    `Presupuesto ${p.numero ?? ''} — ${p.cliente_nombre ?? 'Sin nombre'}`.trim(),
    p.cliente_dir ? `Obra: ${p.cliente_dir}` : '',
    `Total: ${formatearPrecio(total)} sin IVA · ${formatearPrecio(totalConIva)} con IVA`,
    p.nota_interna ? `\nNotas: ${p.nota_interna}` : '',
  ];
  return partes.filter(Boolean).join('\n');
}

export async function compartirPresupuestoConRicardo(p: Presupuesto): Promise<ResultadoCompartir> {
  const texto = textoWhatsappRicardo(p);
  const nombreFichero = `${p.numero ?? 'presupuesto'}.pdf`;
  const puedeCompartirArchivos = typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
  if (puedeCompartirArchivos) {
    const { blob } = await generarPdfPresupuestoBlob(p);
    const archivo = new File([blob], nombreFichero, { type: 'application/pdf' });
    if (navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], text: texto, title: nombreFichero });
        return 'compartido';
      } catch (err) {
        // El usuario cerró el menú de compartir: no es un error.
        if (err instanceof DOMException && err.name === 'AbortError') return 'cancelado';
        throw err;
      }
    }
  }
  // Sin compartir archivos: PDF descargado + chat de Ricardo con el texto ya escrito.
  const telefono = await telefonoRicardo();
  await generarPdfPresupuesto(p);
  window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  return 'wa_me';
}
