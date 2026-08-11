export type { Linea } from '../lineas';
export { UNIDADES, getTiposServicio, lineaVacia, calcularLinea, calcularTotales, validarLineas } from '../lineas';
export { TIPOS_IVA, porcentajeIva, paisDesdeTipoIva } from '../iva';

import { lineaVacia, calcularLinea } from '../lineas';
import { porcentajeIva } from '../iva';
import type { Linea } from '../lineas';

export type TipoFactura = 'normal' | 'acompte' | 'rectificativa';

export type Factura = {
  id: string;
  created_at: string;
  numero: string | null;
  titulo: string | null;
  tipo: TipoFactura;
  factura_original_id: string | null;
  presupuesto_id: string | null;
  visita_id: string | null;
  pais: string | null;
  cliente_nombre: string | null;
  cliente_dir: string | null;
  cliente_email: string | null;
  cliente_tel: string | null;
  idioma: string;
  fecha_factura: string | null;
  fecha_vence: string | null;
  tipo_iva: string | null;
  lineas: Linea[];
  metodo_pago: string | null;
  nota: string | null;
  estado_cobro: string;
  fecha_pago: string | null;
  monto_pagado: number | null;
  resena_enviada: boolean;
  resena_fecha_envio: string | null;
  eliminado_en?: string | null;
  eliminado_por?: string | null;
};

export type NuevaFactura = Omit<Factura, 'id' | 'created_at'>;

export const ESTADOS_COBRO = ['Pendiente', 'Cobrada', 'Cobrada parcialmente', 'Vencida'] as const;
export const METODOS_PAGO = ['Transferencia', 'Efectivo', 'Tarjeta', 'Cheque', 'Domiciliación'];

// Título del documento en el PDF/vista previa según el tipo de factura — compartido entre
// FacturaForm, FacturaPreview y generarPdfFactura para no repetir la misma cadena de ternarios.
export function tituloDocumentoFactura(tipo: TipoFactura, idiomaCorto: 'es' | 'fr'): string {
  if (tipo === 'acompte') return idiomaCorto === 'fr' ? "FACTURE D'ACOMPTE" : 'FACTURA DE ANTICIPO';
  if (tipo === 'rectificativa') return idiomaCorto === 'fr' ? 'FACTURE RECTIFICATIVE' : 'FACTURA RECTIFICATIVA';
  return idiomaCorto === 'fr' ? 'FACTURE' : 'FACTURA';
}

// Copia las líneas de la factura original con la cantidad en negativo, para una factura
// rectificativa (nota de crédito) que anula/corrige una factura ya emitida sin borrarla —
// la numeración correlativa de facturas no puede tener huecos (ver CLAUDE.md §10).
export function lineasRectificativa(original: Linea[], tipoIva: string | null): Linea[] {
  const pct = porcentajeIva(tipoIva);
  return original.map((l) => calcularLinea({ ...l, cantidad: -l.cantidad }, pct));
}

// Línea negativa que descuenta de la factura final lo que el cliente ya pagó en anticipo(s) —
// para que "Crear factura completa" no vuelva a cobrar el importe entero del presupuesto.
export function lineaDeduccionAcomptes(
  acomptes: { numero: string | null; lineas: Linea[] }[],
  tipoIva: string | null,
  idioma: string,
): Linea {
  const totalPrevioSinIva = acomptes.reduce(
    (s, f) => s + f.lineas.reduce((s2, l) => s2 + (l.es_incluido ? 0 : l.total_sin_iva), 0),
    0,
  );
  const numeros = acomptes.map((f) => f.numero).filter(Boolean).join(', ');
  const esFr = idioma === 'Français';
  return calcularLinea(
    {
      ...lineaVacia(),
      designacion: esFr ? 'Déduction acompte(s)' : 'Deducción de anticipo(s)',
      referencia: 'ACOMPTE',
      descripcion: numeros,
      unidad: 'forfait',
      tipo_servicio: esFr ? 'Prestations de services BIC' : 'Prestación de servicios',
      cantidad: 1,
      precio_unit: -Math.round(totalPrevioSinIva * 100) / 100,
    },
    porcentajeIva(tipoIva),
  );
}
