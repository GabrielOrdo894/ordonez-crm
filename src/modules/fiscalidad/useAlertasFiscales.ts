import { useMemo } from 'react';
import { useFiscalConfig } from './useFiscalConfig';
import { useGerantConfig } from './useGerantConfig';
import { useResultadoEjercicio } from './useResultadoEjercicio';
import { useEcheances } from './useEcheances';
import { calcularIS, calcularTNS, limitesEjercicio, mesesTranscurridosEjercicio } from './calculos';

export type TipoAlertaFiscal = 'tramo_cerca' | 'tramo_superado' | 'tva_declarable' | 'tva_urgente' | 'echeance_urgente';

export type AlertaFiscal = {
  id: string;
  tipo: TipoAlertaFiscal;
  titulo: string;
  mensaje: string;
  buenasPracticas: string[];
};

function diasRestantes(fecha: string) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const limite = new Date(`${fecha}T00:00:00`);
  return Math.round((limite.getTime() - hoy.getTime()) / 86_400_000);
}

export function useAlertasFiscales() {
  const { config } = useFiscalConfig();
  const { gerantConfig } = useGerantConfig();
  const anio = new Date().getFullYear();
  const ejercicio = limitesEjercicio(anio);
  const { beneficioBruto, cargando: cargandoResultado } = useResultadoEjercicio(ejercicio.inicio, ejercicio.fin);
  const { echeances, cargando: cargandoEcheances } = useEcheances();

  const alertas = useMemo<AlertaFiscal[]>(() => {
    const lista: AlertaFiscal[] = [];

    // 1. Tramo 15% del IS: cerca o superado
    // Prorrateado por meses transcurridos, no por la duración total del ejercicio — ver
    // comentario en TabIS.tsx (bug real corregido 2026-08-11).
    const mesesTranscurridos = mesesTranscurridosEjercicio(ejercicio);
    const remuneracionAnual = gerantConfig?.remuneracion_anual ?? 0;
    const remuneracionPeriodo = remuneracionAnual * (mesesTranscurridos / 12);
    const cotisacionesPeriodo = calcularTNS(remuneracionAnual, config).total * (mesesTranscurridos / 12);
    const beneficioNeto = Math.max(0, beneficioBruto - remuneracionPeriodo - cotisacionesPeriodo);
    const is = calcularIS(beneficioNeto, ejercicio.meses, config);
    const pctPlafond = is.plafondReducido > 0 ? beneficioNeto / is.plafondReducido : 0;
    const umbralAviso = config('alerta_tramo_umbral', 0.85);

    if (pctPlafond >= 1) {
      lista.push({
        id: 'tramo_superado',
        tipo: 'tramo_superado',
        titulo: 'Ya has superado el tramo del 15% de IS',
        mensaje: `El beneficio neto estimado del ejercicio (${beneficioNeto.toFixed(2)} €) ya supera el plafond de ${is.plafondReducido.toFixed(2)} € — a partir de aquí, cada euro adicional de beneficio tributa al 25% en vez del 15%.`,
        buenasPracticas: [
          'Revisa con tu expert-comptable si hay gastos deducibles pendientes de registrar antes de cerrar el ejercicio (compras, subcontratas, formación, amortizaciones).',
          'Valora si conviene aumentar la rémunération del gérant este ejercicio: reduce el beneficio imposable, aunque generará más cotisations TNS — compáralo en la pestaña "Salario vs Dividendos".',
          'Ten en cuenta que el 25% solo se aplica al exceso sobre el plafond, no a todo el beneficio — no es necesario "frenar" la facturación.',
        ],
      });
    } else if (pctPlafond >= umbralAviso) {
      lista.push({
        id: 'tramo_cerca',
        tipo: 'tramo_cerca',
        titulo: 'Cerca de superar el tramo del 15% de IS',
        mensaje: `El beneficio neto estimado del ejercicio (${beneficioNeto.toFixed(2)} €) ya alcanza el ${(pctPlafond * 100).toFixed(0)}% del plafond de ${is.plafondReducido.toFixed(2)} € del tramo reducido. El siguiente euro de beneficio que se genere por encima del plafond tributará al 25% en vez del 15%.`,
        buenasPracticas: [
          'Anticipa gastos deducibles previstos para los próximos meses (material, herramientas, mantenimiento) si de todas formas los ibas a hacer pronto.',
          'Revisa con tu expert-comptable si conviene ajustar la rémunération del gérant antes de cerrar el ejercicio.',
          'No es necesario dejar de facturar — el tramo del 25% solo afecta al beneficio que exceda el plafond, el resto sigue al 15%.',
        ],
      });
    }

    // 2. TVA declarable / urgente, a partir de las échéances CA3 generadas
    const hoy = new Date();
    for (const e of echeances) {
      if (e.completada || e.tipo !== 'CA3') continue;
      const fechaLimite = new Date(`${e.fecha_limite}T00:00:00`);
      const primerDiaVentana = new Date(fechaLimite.getFullYear(), fechaLimite.getMonth(), 1);
      const dias = diasRestantes(e.fecha_limite);
      if (dias < 0) continue;

      if (dias < 7) {
        lista.push({
          id: `tva_urgente_${e.id}`,
          tipo: 'tva_urgente',
          titulo: `TVA sin declarar — quedan ${dias === 0 ? 'horas' : `${dias} día(s)`}`,
          mensaje: `"${e.titulo}" vence el ${fechaLimite.toLocaleDateString('es', { day: '2-digit', month: 'short' })} y todavía no está marcada como declarada. Presentarla fuera de plazo genera un recargo del 10% sobre el importe a pagar.`,
          buenasPracticas: [
            'Declárala hoy mismo en impots.gouv.fr con los datos de la pestaña "TVA" de Fiscalidad.',
            'En cuanto la presentes, marca la casilla en el "Calendario fiscal" para que deje de aparecer como pendiente.',
            'Si el crédito o el importe no cuadra con lo esperado, revisa que todas las facturas y gastos del mes estén registrados antes de declarar.',
          ],
        });
      } else if (hoy >= primerDiaVentana) {
        lista.push({
          id: `tva_declarable_${e.id}`,
          tipo: 'tva_declarable',
          titulo: 'Ya puedes declarar la TVA del mes cerrado',
          mensaje: `"${e.titulo}" ya se puede declarar (el mes correspondiente ha cerrado) — tienes de plazo hasta el ${fechaLimite.toLocaleDateString('es', { day: '2-digit', month: 'short' })}.`,
          buenasPracticas: [
            'Declarar en cuanto se pueda evita acumular varios meses y reduce el riesgo de olvidos.',
            'Revisa la pestaña "TVA" de Fiscalidad: las líneas se calculan automáticamente a partir de tus Facturas y Gastos del mes.',
            'Márcala como declarada en el "Calendario fiscal" en cuanto la presentes en impots.gouv.fr.',
          ],
        });
      }
    }

    // 3. Otras échéances urgentes (no CA3): acomptes/solde IS, CFE, liasse, dépôt comptes
    for (const e of echeances) {
      if (e.completada || e.tipo === 'CA3') continue;
      const dias = diasRestantes(e.fecha_limite);
      if (dias < 0 || dias >= 14) continue;
      lista.push({
        id: `echeance_urgente_${e.id}`,
        tipo: 'echeance_urgente',
        titulo: `${e.titulo} — quedan ${dias === 0 ? 'horas' : `${dias} día(s)`}`,
        mensaje: `Vence el ${new Date(`${e.fecha_limite}T00:00:00`).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}${e.organismo ? ` (${e.organismo})` : ''}.${e.notas ? ` ${e.notas}` : ''}`,
        buenasPracticas: [
          'Consulta la pestaña "Calendario fiscal" para ver el detalle y el enlace oficial de presentación si está disponible.',
          'Si necesitas ayuda de tu expert-comptable, contáctalo con margen — algunos trámites (liasse fiscale, depósito de cuentas) llevan preparación previa.',
          'Márcala como hecha en cuanto se complete para que deje de contar como pendiente.',
        ],
      });
    }

    return lista;
  }, [config, gerantConfig, beneficioBruto, echeances, ejercicio]);

  return { alertas, cargando: cargandoResultado || cargandoEcheances };
}
