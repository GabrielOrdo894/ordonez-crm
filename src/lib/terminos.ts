type PlazoResumen = { concepto: string; porcentaje: number };

type VariablesTerminos = {
  fechaEmision?: string | null;
  fechaValidez?: string | null;
  diasValidez?: number | null;
};

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

export function renderizarTC(
  texto: string,
  planPago: PlazoResumen[] | undefined,
  idioma: 'es' | 'fr',
  variables: VariablesTerminos = {},
): string {
  const diasValidez = variables.diasValidez == null ? '' : String(variables.diasValidez);
  let resultado = texto
    .replace(/\{PLAN_PAGO\}/g, describirPlanPago(planPago, idioma))
    .replace(/\{FECHA_EMISION\}/g, variables.fechaEmision ?? '')
    .replace(/\{FECHA_VALIDEZ\}/g, variables.fechaValidez ?? '')
    .replace(/\{DIAS_VALIDEZ\}/g, diasValidez);

  // Las plantillas históricas incluían un plazo fijo de 30 días. El plazo del documento es
  // la fuente de verdad, por lo que se actualiza la redacción estándar al generar cada PDF.
  if (diasValidez) {
    resultado =
      idioma === 'fr'
        ? resultado.replace(
            /(devis\s+(?:reste\s+)?valable\s+)\d+(\s+jours(?:\s+calendaires)?\s+à\s+compter\s+de\s+(?:sa\s+)?date\s+d['’]émission)/giu,
            `$1${diasValidez}$2`,
          )
        : resultado.replace(
            /(presupuesto\s+v[aá]lido\s+)\d+(\s+d[ií]as(?:\s+naturales)?\s+desde\s+la\s+fecha\s+de\s+emisi[oó]n)/giu,
            `$1${diasValidez}$2`,
          );
  }

  return resultado;
}
