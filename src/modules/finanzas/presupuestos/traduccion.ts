import type { FuenteTraduccion, Presupuesto } from './types';

type Traducible = Pick<Presupuesto, 'lineas' | 'nota' | 'plan_pago'>;

// Misma forma y orden de claves venga del presupuesto o de lo guardado en `traduccion.fuente`
// (jsonb no conserva el orden de las claves), para poder comparar con JSON.stringify.
function normalizarFuente(f: FuenteTraduccion): FuenteTraduccion {
  return {
    lineas: (f.lineas ?? []).map((l) => ({ designacion: l.designacion ?? '', descripcion: l.descripcion || null })),
    nota: f.nota || null,
    plan_pago: (f.plan_pago ?? []).map((concepto) => concepto ?? ''),
  };
}

/** Texto del presupuesto que se traduce (designación/descripción de cada línea, nota y conceptos
 * del plan de pago). Se guarda en `traduccion.fuente` al generar la traducción. */
export function fuenteTraduccion(p: Traducible): FuenteTraduccion {
  return normalizarFuente({
    lineas: (p.lineas ?? []).map((l) => ({ designacion: l.designacion, descripcion: l.descripcion })),
    nota: p.nota,
    plan_pago: (p.plan_pago ?? []).map((pl) => pl.concepto),
  });
}

export function mismoTextoTraducible(a: Traducible, b: Traducible): boolean {
  return JSON.stringify(fuenteTraduccion(a)) === JSON.stringify(fuenteTraduccion(b));
}

/** La traducción guardada ya no corresponde al presupuesto: cambió el número de líneas o de plazos,
 * algún importe, o el texto del que se tradujo. Las traducciones anteriores al 2026-10-05 no
 * guardan `fuente`: en esas solo se detectan los cambios de estructura e importes. */
export function traduccionDesactualizada(p: Traducible & Pick<Presupuesto, 'traduccion'>): boolean {
  const t = p.traduccion;
  if (!t) return false;
  const lineas = p.lineas ?? [];
  const planPago = p.plan_pago ?? [];
  // Hay traducciones antiguas guardadas con `plan_pago: null` (P-2026-0044).
  const tLineas = t.lineas ?? [];
  const tPlanPago = t.plan_pago ?? [];
  if (tLineas.length !== lineas.length || tPlanPago.length !== planPago.length) return true;
  const cambiaLinea = lineas.some((l, i) => {
    const tl = tLineas[i];
    return (
      (l.referencia ?? '') !== (tl.referencia ?? '') ||
      l.cantidad !== tl.cantidad ||
      l.precio_unit !== tl.precio_unit ||
      (l.precio_unit_max ?? null) !== (tl.precio_unit_max ?? null)
    );
  });
  if (cambiaLinea) return true;
  if (planPago.some((pl, i) => pl.importe !== tPlanPago[i].importe || pl.porcentaje !== tPlanPago[i].porcentaje)) {
    return true;
  }
  if (!t.fuente) return false;
  return JSON.stringify(fuenteTraduccion(p)) !== JSON.stringify(normalizarFuente(t.fuente));
}
