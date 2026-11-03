import type { PlazoPago } from './types';

// Aviso de cobros del plan de pago (2026-11-03, decisión de Gabriel). Cada plazo puede tener una
// fecha prevista opcional. Un plazo está facturado cuando existe su factura: los plazos se cubren por
// orden con los acomptes del presupuesto (el 1.º acompte es el 1.er plazo...) y el último con la
// factura final (tipo normal). Toca facturar el primer plazo pendiente si es el inicial (se cobra al
// aceptar) o si su fecha prevista ya llegó. Un plazo sin fecha queda «pendiente de facturar» en el
// presupuesto, sin aviso.

export type FacturaDePlazo = {
  tipo: string;
  numero?: string | null;
  fecha_factura?: string | null;
};

export type EstadoPlazo = {
  indice: number;
  plazo: PlazoPago;
  factura: FacturaDePlazo | null;
  esUltimo: boolean;
  /** true si no está facturado y su fecha prevista es hoy o ya pasó. */
  vencido: boolean;
};

export function estadoPlazos(
  plan: PlazoPago[],
  facturas: FacturaDePlazo[],
  hoy: string,
): EstadoPlazo[] {
  const acomptes = facturas
    .filter((f) => f.tipo === 'acompte')
    .sort(
      (a, b) =>
        (a.fecha_factura ?? '').localeCompare(b.fecha_factura ?? '') ||
        (a.numero ?? '').localeCompare(b.numero ?? ''),
    );
  const final = facturas.find((f) => f.tipo === 'normal') ?? null;
  return plan.map((plazo, indice) => {
    const esUltimo = indice === plan.length - 1;
    const factura = acomptes[indice] ?? (esUltimo ? final : null);
    return {
      indice,
      plazo,
      factura,
      esUltimo,
      vencido: !factura && !!plazo.fecha_prevista && plazo.fecha_prevista <= hoy,
    };
  });
}

/** Plazo que toca facturar ahora, o null. Nada si la obra ya tiene su factura final. */
export function plazoQueTocaFacturar(
  plan: PlazoPago[],
  facturas: FacturaDePlazo[],
  hoy: string,
): (EstadoPlazo & { motivo: 'inicio' | 'fecha' }) | null {
  if (plan.length === 0 || facturas.some((f) => f.tipo === 'normal')) return null;
  const primero = estadoPlazos(plan, facturas, hoy).find((e) => !e.factura);
  if (!primero) return null;
  if (primero.indice === 0 && !primero.plazo.fecha_prevista)
    return { ...primero, motivo: 'inicio' };
  if (primero.vencido) return { ...primero, motivo: 'fecha' };
  return null;
}
