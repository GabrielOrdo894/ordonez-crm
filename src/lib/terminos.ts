import { supabase } from './supabase';
import { cargarConfigCompleta } from './pdfEmpresa';

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

  // Las plantillas históricas incluían un plazo fijo de 7 días. El plazo del documento es
  // la fuente de verdad, por lo que se actualiza la redacción estándar al generar cada PDF.
  // Corregido 2026-09-21: las regex anteriores nunca coincidían con el texto real de
  // empresa_config.tc_es/tc_fr (exigían "presupuesto válido" pegado, y en francés "devis"
  // justo antes de "valable" — el texto real dice "presupuesto es válido durante" / "reste
  // valable", con palabras de por medio) — la sustitución nunca se disparaba, en ningún
  // idioma, en ningún documento: el Artículo 2 legal decía "7 días" mientras la cabecera del
  // mismo PDF mostraba el plazo real (30/14/21...), una contradicción contractual presente en
  // prácticamente todos los presupuestos emitidos. Verificado contra el texto real en
  // producción, no solo contra el texto de ejemplo de este fichero.
  if (diasValidez) {
    resultado =
      idioma === 'fr'
        ? resultado.replace(
            /((?:reste\s+)?valable\s+)\d+(\s+jours(?:\s+calendaires)?\s+à\s+compter\s+de\s+(?:sa\s+)?date\s+d['’]émission)/giu,
            `$1${diasValidez}$2`,
          )
        : resultado.replace(
            /((?:presupuesto\s+es\s+)?v[aá]lido\s+durante\s+)\d+(\s+d[ií]as(?:\s+naturales)?\s+desde\s+(?:la|su)\s+fecha\s+de\s+emisi[oó]n)/giu,
            `$1${diasValidez}$2`,
          );
  }

  return resultado;
}

// Congela los T&C de un presupuesto en el momento de aceptarlo/enviarlo a firmar, guardando el
// texto CRUDO (con {PLAN_PAGO}/{DIAS_VALIDEZ} todavía sin sustituir, renderizarTC sigue
// aplicándose en cada PDF) en la propia fila. Corregido 2026-09-21: hasta ahora
// `generarPdfPresupuesto.ts` leía `p.terminos_condiciones || config.tc_es/tc_fr` — si el campo
// propio estaba vacío (el caso normal, confirmado: los 10 presupuestos Aceptados en producción
// tenían 0 con T&C propio), el PDF leía el texto EN VIVO de Configuración cada vez que se
// generaba/veía, incluso para un presupuesto ya firmado por Documenso hace meses — si Gabriel
// editaba la plantilla de T&C después, el documento re-descargado dejaba de coincidir con lo que
// el cliente realmente firmó. Llamar siempre antes de: enviar a firmar (documenso.ts) y al
// marcar un presupuesto como Aceptado a mano (PresupuestosPage.tsx). Es un no-op si el
// presupuesto ya tiene T&C propio (no pisa nunca un valor ya congelado).
export async function congelarTerminosCondiciones(p: {
  id: string;
  terminos_condiciones: string | null;
  tipo?: string | null;
  idioma: string;
}): Promise<void> {
  if (p.terminos_condiciones) return;
  const config = await cargarConfigCompleta();
  const esOrientativo = p.tipo === 'orientativo';
  // p.idioma guarda "Français"/"Español" en BD (no "fr"/"es") — mismo criterio de conversión
  // que generarPdfPresupuesto.ts (`idioma === 'Français' ? 'fr' : 'es'`).
  const esFrances = p.idioma === 'Français';
  const tcCrudo =
    (esOrientativo
      ? esFrances
        ? config?.tc_fr_orientativo || config?.tc_fr
        : config?.tc_es_orientativo || config?.tc_es
      : esFrances
        ? config?.tc_fr
        : config?.tc_es) || null;
  if (!tcCrudo) return;
  const { error } = await supabase.from('presupuestos').update({ terminos_condiciones: tcCrudo }).eq('id', p.id);
  if (error) throw error;
}

// Variante para sitios que solo tienen el id a mano (p. ej. al generar una factura desde un
// presupuesto, donde no se ha cargado la fila completa) — hace una lectura mínima primero.
export async function congelarTerminosCondicionesPorId(presupuestoId: string): Promise<void> {
  const { data, error } = await supabase
    .from('presupuestos')
    .select('id, terminos_condiciones, tipo, idioma')
    .eq('id', presupuestoId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return;
  await congelarTerminosCondiciones(data);
}
