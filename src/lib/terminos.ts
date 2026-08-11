type PlazoResumen = { concepto: string; porcentaje: number };

export type TamanoTC = 'normal' | 'grande' | 'muy_grande';

const FONT_SIZE_TC: Record<TamanoTC, number> = { normal: 9, grande: 11, muy_grande: 13 };

/** Tamaño de letra y alto de línea (mm) para el bloque de términos y condiciones del PDF. */
export function tamanoFuenteTC(tamano: string | null | undefined): { fontSize: number; lineHeight: number } {
  const fontSize = FONT_SIZE_TC[(tamano as TamanoTC) ?? 'normal'] ?? FONT_SIZE_TC.normal;
  return { fontSize, lineHeight: (fontSize * 5) / 9 };
}

function describirPlanPago(planPago: PlazoResumen[] | undefined, idioma: 'es' | 'fr'): string {
  if (!planPago || planPago.length === 0) {
    return idioma === 'fr' ? 'selon les conditions convenues' : 'según las condiciones acordadas';
  }
  const partes = planPago.map((p) => `${p.porcentaje}% ${p.concepto.toLowerCase()}`);
  return partes.join(idioma === 'fr' ? ', puis ' : ', ');
}

export function renderizarTC(texto: string, planPago: PlazoResumen[] | undefined, idioma: 'es' | 'fr'): string {
  return texto.replace(/\{PLAN_PAGO\}/g, describirPlanPago(planPago, idioma));
}
