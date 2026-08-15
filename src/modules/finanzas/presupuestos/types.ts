export type { Linea } from '../lineas';
export { UNIDADES, getTiposServicio, lineaVacia, calcularLinea, calcularTotales, calcularTotalesRango, totalLineaMax, validarLineas } from '../lineas';
export { TIPOS_IVA, porcentajeIva, paisDesdeTipoIva } from '../iva';

import type { Linea } from '../lineas';

export type PlazoPago = {
  concepto: string;
  porcentaje: number;
  importe: number;
};

/** Traducción interna generada por IA (Edge Function `traducir-presupuesto`) — solo el texto
 * libre (líneas, nota, conceptos del plan de pago), nunca precios/cantidades/T&C. Uso interno,
 * nunca se envía al cliente tal cual (ver `generarPdfPresupuestoTraducido`). */
export type TraduccionPresupuesto = {
  idioma: string;
  lineas: Linea[];
  nota: string | null;
  plan_pago: PlazoPago[];
  generado_en: string;
};

export type Presupuesto = {
  id: string;
  created_at: string;
  numero: string | null;
  visita_id: string | null;
  pais: string | null;
  titulo: string | null;
  cliente_nombre: string | null;
  cliente_dir: string | null;
  cliente_dir_extra: string | null;
  cliente_email: string | null;
  cliente_tel: string | null;
  idioma: string;
  fecha_emision: string | null;
  fecha_validez: string | null;
  tipo_iva: string | null;
  tipo: TipoPresupuesto;
  formato: FormatoPresupuesto;
  portada_foto_url: string | null;
  presupuesto_origen_id: string | null;
  banco_titular: string | null;
  banco_nombre: string | null;
  banco_iban: string | null;
  banco_bic: string | null;
  lineas: Linea[];
  plan_pago: PlazoPago[];
  terminos_condiciones: string | null;
  condiciones_pago: Record<string, string> | null;
  nota: string | null;
  nota_interna?: string | null;
  estado: string;
  firmado: boolean;
  firma_nombre: string | null;
  firma_fecha: string | null;
  firma_base64: string | null;
  firma_metodo: 'manual' | 'documenso';
  documenso_envelope_id: string | null;
  documenso_signing_url: string | null;
  documenso_estado: string | null;
  eliminado_en?: string | null;
  eliminado_por?: string | null;
  traduccion?: TraduccionPresupuesto | null;
};

export type NuevoPresupuesto = Omit<Presupuesto, 'id' | 'created_at'>;

export const ESTADOS_PRESUPUESTO = ['Borrador', 'Pendiente', 'Aceptado', 'Rechazado'] as const;

export type TipoPresupuesto = 'normal' | 'orientativo';

export const TIPOS_PRESUPUESTO: { value: TipoPresupuesto; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'orientativo', label: 'Orientativo (precios en rango)' },
];

export type FormatoPresupuesto = 'completo' | 'rapido';

export const FORMATOS_PRESUPUESTO: { value: FormatoPresupuesto; label: string; descripcion: string }[] = [
  {
    value: 'completo',
    label: 'Formato completo',
    descripcion: 'Con portada — para obras grandes y clientes nuevos. Incluye portada, presupuesto y términos y condiciones.',
  },
  {
    value: 'rapido',
    label: 'Formato rápido',
    descripcion: 'Sin portada — recomendado para clientes habituales u obras pequeñas y rápidas (reparaciones, pintar humedades...).',
  },
];

