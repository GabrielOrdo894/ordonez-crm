export type { Linea } from '../lineas';
export { UNIDADES, getTiposServicio, lineaVacia, calcularLinea, calcularTotales, validarLineas } from '../lineas';
export { TIPOS_IVA, porcentajeIva, paisDesdeTipoIva } from '../iva';

import { lineaVacia, calcularLinea, REFERENCIA_ACOMPTE_ANTERIOR } from '../lineas';
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
  // Rediseño del sistema de reseñas (2026-09-13): resena_canal registra por dónde se mandó
  // (whatsapp/email/ambos); resena_token es el identificador del enlace de redirección propio
  // (Edge Function resena-redirect) que registra resena_clic_en antes de reenviar a Google — Google
  // no permite saber quién dejó qué reseña, así que el clic es la única señal real de conversión
  // compatible con sus políticas. resena_cortesia_enviada_en cierra el aviso de cortesía a los 6
  // meses de verdad (antes dependía solo del historial local del navegador de cada usuario).
  resena_canal: string | null;
  resena_token: string | null;
  resena_enviado_en: string | null;
  resena_clic_en: string | null;
  resena_cortesia_enviada_en: string | null;
  // Reseña automática (Edge Function resena-automatica, 2026-09-24): 'programada' se enviará en la
  // siguiente ejecución del cron (≥ 24 h después, margen para cancelarla desde la factura),
  // 'enviada', 'cancelada', o 'revisar' (no se programó por rectificativa/notas recientes — la
  // campana pide decidirlo a mano). NULL = todavía no evaluada.
  resena_auto_estado: 'programada' | 'enviada' | 'cancelada' | 'revisar' | null;
  resena_auto_programada_en: string | null;
  // Cobro de una estructura empresarial anterior a la EURL actual (2026-08-22) — se registra en
  // el CRM solo para que lineaDeduccionAcomptes calcule bien la factura definitiva, pero no es
  // ingreso real de la EURL: no genera apuntes en asientos_contables ni cuenta en el Asistente de
  // IVA, el Resultado ni los dashboards.
  estructura_anterior: boolean;
  // Solo rectificativas (2026-10-01): parte de su TVA que corrige TVA ya exigible (cobrada) de la
  // factura original — va a 44571 y a la línea 21 de la CA3. El resto anula TVA que seguía en
  // espera (44574) y nunca se declaró. Se fija al emitirla (fraccionTvaExigibleRectificativa).
  fraccion_tva_exigible?: number | null;
  eliminado_en?: string | null;
  eliminado_por?: string | null;
};

export type NuevaFactura = Omit<Factura, 'id' | 'created_at'>;

// 'Aplicada'/'Reembolsada' solo para rectificativas (2026-10-01): una nota de crédito no se cobra —
// queda 'Aplicada' y pasa a 'Reembolsada' cuando se registra la devolución del dinero al cliente.
// Antes salían 'Pendiente' para siempre y contaban como pendientes de cobro.
export const ESTADOS_COBRO = ['Pendiente', 'Cobrada', 'Cobrada parcialmente', 'Vencida', 'Aplicada', 'Reembolsada'] as const;
export type EstadoCobro = (typeof ESTADOS_COBRO)[number];
export const METODOS_PAGO = ['Transferencia', 'Efectivo', 'Tarjeta', 'Cheque', 'Domiciliación'];

// Un pago real registrado contra una factura (2026-09-08) — reemplaza a monto_pagado/fecha_pago
// como fuente de verdad de CUÁNDO entró cada importe: esos dos campos de Factura solo guardaban el
// último valor tecleado, sobrescrito en cada "Registrar pago", así que una factura cobrada en dos
// veces (p. ej. 50% en marzo y 50% en abril) perdía la fecha real del primer cobro — imposible de
// declarar bien una TVA que se paga al cobro, no a la emisión (confirmado por Gabriel). Factura
// sigue teniendo monto_pagado/fecha_pago/estado_cobro, pero ahora son CAMPOS DERIVADOS (suma y
// último de los pagos) que se recalculan cada vez que esta tabla cambia — se mantienen por
// compatibilidad con todo lo que ya lee/ordena/filtra por ellos (KPIs, exports, bilan...), no como
// fuente de verdad.
export type PagoFactura = {
  id: string;
  factura_id: string;
  fecha: string;
  monto: number;
  creado_por: string | null;
  created_at: string;
  // Anulación lógica (2026-10-01): un pago contabilizado no se borra — sus asientos lo referencian
  // por pago_id. Todas las lecturas filtran anulado_en is null.
  anulado_en?: string | null;
  anulado_por?: string | null;
};

export function totalConIvaFactura(f: Pick<Factura, 'lineas'>): number {
  return f.lineas.reduce((s, l) => s + (l.es_incluido ? 0 : l.total_con_iva), 0);
}

// Estado derivado de los pagos. Con fecha de vencimiento pasada, una factura sin cobrar del todo es
// 'Vencida' (antes ningún proceso la marcaba así y el aviso de impagos nunca saltaba — auditoría
// 2026-10-01; el cron marcar_facturas_vencidas hace lo mismo cada día en la base de datos).
export function estadoCobroDePagos(
  totalPagado: number,
  totalFactura: number,
  opciones: { tipo?: TipoFactura | null; fechaVence?: string | null; hoy?: string } = {},
): EstadoCobro {
  if (opciones.tipo === 'rectificativa') {
    return Math.abs(totalPagado) >= Math.abs(totalFactura) - 0.01 && Math.abs(totalPagado) > 0.01 ? 'Reembolsada' : 'Aplicada';
  }
  if (totalPagado >= totalFactura - 0.01 && totalPagado > 0.01) return 'Cobrada';
  if (opciones.fechaVence && opciones.hoy && opciones.fechaVence < opciones.hoy) return 'Vencida';
  return totalPagado <= 0.01 ? 'Pendiente' : 'Cobrada parcialmente';
}

// Parte de la TVA de una rectificativa que corrige TVA ya exigible: lo que la rectificativa anula
// por encima de lo que la factura original aún tenía pendiente de cobro. Una rectificativa de una
// factura no cobrada solo anula TVA en espera (nunca declarada, régimen de TVA sur encaissements):
// deducirla en la línea 21 de la CA3 declaraba TVA de menos (auditoría 2026-10-01).
export function fraccionTvaExigibleRectificativa(totalRectificativa: number, totalOriginal: number, cobradoOriginal: number): number {
  const anulado = Math.abs(totalRectificativa);
  if (anulado < 0.005) return 1;
  const pendienteOriginal = Math.max(0, Math.abs(totalOriginal) - cobradoOriginal);
  const exigible = Math.max(0, anulado - pendienteOriginal);
  return Math.round(Math.min(1, exigible / anulado) * 1000000) / 1000000;
}

// Título del documento en el PDF/vista previa según el tipo de factura — compartido entre
// FacturaForm, FacturaPreview y generarPdfFactura para no repetir la misma cadena de ternarios.
export function tituloDocumentoFactura(tipo: TipoFactura, idiomaCorto: 'es' | 'fr'): string {
  if (tipo === 'acompte') return idiomaCorto === 'fr' ? "FACTURE D'ACOMPTE" : 'FACTURA DE ANTICIPO';
  if (tipo === 'rectificativa') return idiomaCorto === 'fr' ? 'FACTURE RECTIFICATIVE' : 'FACTURA RECTIFICATIVA';
  return idiomaCorto === 'fr' ? 'FACTURE' : 'FACTURA';
}

// Estado que se imprime en la factura (PDF y vista previa). Antes toda factura no cobrada del todo
// salía como "Borrador/Brouillon", también las ya enviadas al cliente (auditoría 2026-10-01).
export function textoEstadoDocumentoFactura(estado: string, idiomaCorto: 'es' | 'fr'): string {
  const textos: Record<string, [string, string]> = {
    Cobrada: ['Pagada', 'Payée'],
    'Cobrada parcialmente': ['Pagada parcialmente', 'Partiellement payée'],
    Vencida: ['Vencida', 'Échue'],
    Aplicada: ['Aplicada', 'Appliquée'],
    Reembolsada: ['Reembolsada', 'Remboursée'],
  };
  const [es, fr] = textos[estado] ?? ['Pendiente de pago', 'En attente de paiement'];
  return idiomaCorto === 'fr' ? fr : es;
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

// Factura final con acomptes previos: una línea de deducción por emisor. Los de la EURL (ref.
// 'ACOMPTE') saldan el anticipo de 4191; los de la estructura anterior (ref. 'ACOMPTE_ANT') no
// pasaron nunca por 4191 de la EURL — esa parte de la obra la facturó otro emisor, así que reduce
// la venta (706) de la EURL. Antes los dos iban a 4191: con Bea Vangheluwe, 706 habría salido
// inflado en 14.279,63 € y 4191 deudor para siempre (auditoría 2026-10-01). Las rectificativas de
// un acompte entran con sus líneas negativas y restan lo ya anulado.
export function lineasDeduccionAcomptes(
  documentos: { numero: string | null; lineas: Linea[]; estructura_anterior?: boolean | null }[],
  tipoIva: string | null,
  idioma: string,
): Linea[] {
  const eurl = documentos.filter((d) => !d.estructura_anterior);
  const anteriores = documentos.filter((d) => d.estructura_anterior);
  const lineas: Linea[] = [];
  if (eurl.length > 0) lineas.push(lineaDeduccionAcomptes(eurl, tipoIva, idioma));
  if (anteriores.length > 0) lineas.push({ ...lineaDeduccionAcomptes(anteriores, tipoIva, idioma), referencia: REFERENCIA_ACOMPTE_ANTERIOR });
  return lineas.filter((l) => Math.abs(l.total_sin_iva) >= 0.005);
}

// Una factura de Francia de la EURL ya está contabilizada y numerada: la ley no permite hacerla
// desaparecer (numeración sin huecos, Code de commerce A123-12). Para anularla hace falta una
// factura rectificativa, no la papelera (auditoría contable 2026-09-29 — antes la papelera anulaba
// su contabilidad sin ninguna factura que lo justificara).
export function motivoNoPapeleraFactura(f: Pick<Factura, 'pais' | 'estructura_anterior' | 'numero'>): string | null {
  if (f.pais !== 'Francia' || f.estructura_anterior) return null;
  return `La factura ${f.numero ?? ''} ya está contabilizada: para anularla, crea una factura rectificativa desde su menú.`;
}
