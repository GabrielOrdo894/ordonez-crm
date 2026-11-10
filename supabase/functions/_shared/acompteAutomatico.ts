// Acompte automático al aceptarse un presupuesto (2026-11-10, petición de Gabriel: «los acomptes se
// tienen que generar al instante que se firma el presupuesto», también en la aceptación manual).
// Lógica pura, sin Deno ni Supabase: la usa la Edge Function `acompte-automatico` y la comprueban los
// tests contra las funciones del frontend (calcularLinea, construirAsientosFacturaEmision) para que
// la factura automática salga idéntica a la que se crea a mano con «Crear anticipo».

export type PlazoPago = { concepto?: string | null; porcentaje?: number | null; importe?: number | null };

export type LineaAcompte = {
  designacion: string;
  referencia: string;
  descripcion: string;
  unidad: string;
  tipo_servicio: string;
  cantidad: number;
  precio_unit: number;
  total_sin_iva: number;
  total_con_iva: number;
  es_incluido: boolean;
};

export type PresupuestoParaAcompte = {
  id: string;
  numero: string | null;
  titulo: string | null;
  tipo: string | null;
  avenant_de_id: string | null;
  eliminado_en: string | null;
  estado: string | null;
  visita_id: string | null;
  cliente_nombre: string | null;
  cliente_dir: string | null;
  cliente_tel: string | null;
  cliente_email: string | null;
  idioma: string | null;
  pais: string | null;
  tipo_iva: string | null;
  plan_pago: PlazoPago[] | null;
};

// Misma tabla que TIPOS_IVA (src/modules/finanzas/iva.ts); el test comprueba que no divergen.
const PORCENTAJE_IVA: Record<string, number> = { IVA_21: 21, IVA_10: 10, TVA_10: 10, TVA_20: 20, EXENTO: 0 };
export function porcentajeIva(tipo: string | null): number {
  return (tipo && PORCENTAJE_IVA[tipo]) ?? 0;
}

// Plazo de vencimiento por defecto de FacturaForm (7 días).
export const DIAS_VENCIMIENTO = 7;

// Motivo por el que NO se crea el acompte, o null si procede. `facturasExistentes`: facturas vivas
// del presupuesto (cualquier tipo) — si ya hay alguna, alguien facturó a mano y no se toca nada.
export function motivoSinAcompte(p: PresupuestoParaAcompte, facturasExistentes: number): string | null {
  if (p.estado !== 'Aceptado') return 'el presupuesto no está Aceptado';
  if (p.eliminado_en) return 'el presupuesto está en la papelera';
  if (p.tipo === 'orientativo') return 'es un presupuesto orientativo';
  if (p.avenant_de_id) return 'es un avenant (se factura con el original)';
  if (p.pais !== 'Francia' && p.pais !== 'España') return 'el presupuesto no tiene país';
  const plan = p.plan_pago ?? [];
  if (plan.length < 2) return 'el plan de pago no tiene un acompte (un solo pago = factura final)';
  if (!((plan[0].importe ?? 0) > 0)) return 'el primer plazo del plan de pago no tiene importe';
  if (facturasExistentes > 0) return 'el presupuesto ya tiene facturas';
  return null;
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Fecha de hoy en Francia (YYYY-MM-DD), no UTC: de madrugada daría el día anterior.
export function hoyParis(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(ahora);
}

// Misma línea que CrearAcompteModal.tsx en modo «Porcentaje del plan de pago», plazo 0.
export function construirLineaAcompte(p: PresupuestoParaAcompte): LineaAcompte {
  const plazo = (p.plan_pago ?? [])[0];
  const esFr = p.idioma === 'Français';
  const pct = porcentajeIva(p.tipo_iva);
  const importeTtc = plazo.importe ?? 0;
  const porcentaje = plazo.porcentaje ?? 0;
  const precioSinIva = pct > 0 ? importeTtc / (1 + pct / 100) : importeTtc;
  const precio_unit = redondear(precioSinIva);
  return {
    designacion: `Acompte — ${plazo.concepto ?? ''}`,
    referencia: 'AC-01',
    descripcion: esFr
      ? `Cet acompte correspond à ${porcentaje}% du devis ${p.numero ?? ''}.`
      : `Este anticipo corresponde al ${porcentaje}% del presupuesto ${p.numero ?? ''}.`,
    unidad: 'forfait',
    tipo_servicio: esFr ? 'Prestations de services BIC' : 'Prestación de servicios',
    cantidad: 1,
    precio_unit,
    total_sin_iva: redondear(precio_unit),
    total_con_iva: redondear(precio_unit * (1 + pct / 100)),
    es_incluido: false,
  };
}

// Fila de `facturas` (sin numero: lo asigna el trigger asignar_numero_factura).
export function construirFacturaAcompte(p: PresupuestoParaAcompte, fecha: string) {
  return {
    tipo: 'acompte',
    presupuesto_id: p.id,
    visita_id: p.visita_id,
    titulo: p.titulo,
    cliente_nombre: p.cliente_nombre,
    cliente_dir: p.cliente_dir,
    cliente_tel: p.cliente_tel,
    cliente_email: p.cliente_email,
    idioma: p.idioma,
    pais: p.pais,
    tipo_iva: p.tipo_iva,
    lineas: [construirLineaAcompte(p)],
    fecha_factura: fecha,
    fecha_vence: sumarDias(fecha, DIAS_VENCIMIENTO),
    metodo_pago: 'Transferencia',
    estado_cobro: 'Pendiente',
    estructura_anterior: false,
  };
}

export type AsientoAcompte = {
  fecha: string;
  cuenta: string;
  debe: number;
  haber: number;
  concepto: string;
  documento_tipo: 'factura';
  documento_id: string;
  tipo_evento: 'creacion';
};

// Emisión de un acompte de Francia — mismos apuntes que construirAsientosFacturaEmision
// (src/lib/asientosContables.ts) para tipo 'acompte': 411 al debe (TTC) / 4191 al haber (HT) /
// 44574 al haber (TVA en espera hasta el cobro). España no lleva libro en el CRM.
export function construirAsientosAcompte(f: {
  id: string;
  numero: string | null;
  cliente_nombre: string | null;
  fecha_factura: string;
  lineas: LineaAcompte[];
}): AsientoAcompte[] {
  const totalSinIva = f.lineas.reduce((s, l) => s + (l.es_incluido ? 0 : l.total_sin_iva), 0);
  const totalConIva = f.lineas.reduce((s, l) => s + (l.es_incluido ? 0 : l.total_con_iva), 0);
  const iva = redondear(totalConIva - totalSinIva);
  const base = {
    fecha: f.fecha_factura,
    concepto: [f.numero, f.cliente_nombre].filter(Boolean).join(' — ') || 'Factura',
    documento_tipo: 'factura' as const,
    documento_id: f.id,
    tipo_evento: 'creacion' as const,
  };
  const asientos: AsientoAcompte[] = [];
  if (totalConIva !== 0) asientos.push({ ...base, cuenta: '411', debe: totalConIva, haber: 0 });
  if (totalSinIva !== 0) asientos.push({ ...base, cuenta: '4191', debe: 0, haber: totalSinIva });
  if (iva !== 0) asientos.push({ ...base, cuenta: '44574', debe: 0, haber: iva });
  return asientos;
}
