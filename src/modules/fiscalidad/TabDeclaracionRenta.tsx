import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, Lock, AlertTriangle, ScrollText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { Button } from '../../components/ui/Button';
import { BotonExportar } from '../../components/ui/BotonExportar';
import { useFiscalConfig } from './useFiscalConfig';
import { useGerantConfig } from './useGerantConfig';
import { calcularTNS, calcularIRGerante } from './calculos';
import { fmt } from './format';
import { Fuente } from './Fuente';
import { Faq } from './Faq';
import { ResumenTitular } from './ResumenTitular';

// Primer ejercicio de la EURL (docs/fiscal/remuneracion-gerant-contexto.md) — no tiene sentido
// mostrar años anteriores, no hubo rémunération que declarar.
const PRIMER_ANIO = 2026;

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// Casillas de dividendos del 2042 — Mario no reparte dividendos actualmente (política vigente:
// toda la marge neta se convierte en rémunération, ver docs/fiscal/remuneracion-gerant-contexto.md),
// así que quedan en 0 €. Se dejan ya preparadas (investigación 2026-08-26) para no tener que tocar
// este asistente si algún ejercicio futuro sí se reparten (ver simulador "Salario vs Dividendos").
// 2OP (opción por barème progresivo en vez del PFU) no aplica con 0 € de dividendos, no se muestra.
const CASILLAS_DIVIDENDOS = [
  { linea: '2DC', label: 'Dividendos brutos repartidos', importe: 0 },
  { linea: '2CK', label: 'Acompte no liberatorio del 12,8% ya retenido por la société', importe: 0 },
];

type DeclaracionRenta = { anio: number; declarado: boolean; fecha_declaracion: string | null };
type EstadoAnio = 'en_curso' | 'disponible' | 'declarado';

// La déclaration de revenus se presenta el año CIVIL siguiente al de percepción, siempre — nunca
// según el ejercicio social contable (confirmado 2026-08-26, ver docs/fiscal). "en_curso" mientras
// el año de percepción no ha terminado (no hay nada que declarar todavía).
function calcularEstado(anio: number, anioActual: number, declaraciones: DeclaracionRenta[] | undefined): EstadoAnio {
  if (anio >= anioActual) return 'en_curso';
  return declaraciones?.find((d) => d.anio === anio)?.declarado ? 'declarado' : 'disponible';
}

export function TabDeclaracionRenta() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const hoy = useMemo(() => new Date(), []);
  const anioActual = hoy.getFullYear();
  const [anio, setAnio] = useState(() => Math.max(PRIMER_ANIO, anioActual - 1));

  const anios = useMemo(() => {
    const lista: number[] = [];
    for (let a = PRIMER_ANIO; a <= anioActual; a++) lista.push(a);
    return lista.reverse();
  }, [anioActual]);

  const { config, fuente } = useFiscalConfig();
  const { gerantConfig } = useGerantConfig();

  const { data: declaraciones } = useQuery({
    queryKey: ['declaraciones_renta_gerant'],
    queryFn: async () => {
      const { data, error } = await supabase.from('declaraciones_renta_gerant').select('*');
      if (error) throw error;
      return data as DeclaracionRenta[];
    },
  });

  const declaracionActiva = declaraciones?.find((d) => d.anio === anio);
  const estadoActivo = calcularEstado(anio, anioActual, declaraciones);

  const marcarDeclaradaMutation = useMutation({
    mutationFn: async (declarado: boolean) => {
      const { error } = await supabase.from('declaraciones_renta_gerant').upsert({
        anio,
        declarado,
        fecha_declaracion: declarado ? new Date().toISOString().slice(0, 10) : null,
      });
      if (error) throw error;
    },
    onSuccess: (_data, declarado) => {
      queryClient.invalidateQueries({ queryKey: ['declaraciones_renta_gerant'] });
      toast.success(declarado ? 'Declaración marcada como presentada' : 'Declaración desmarcada');
    },
    onError: (error) => toast.error(error.message),
  });

  const mesLimite = config('declaracion_ir_mes', 5);
  const diaLimite = config('declaracion_ir_dia', 28);

  const remuneracion = gerantConfig?.remuneracion_anual ?? 0;
  const casado = gerantConfig?.casado ?? true;
  const hijosACargo = gerantConfig?.hijos_a_cargo ?? 0;
  const ingresosConyuge = gerantConfig?.ingresos_conyuge_anual ?? 0;

  const tns = calcularTNS(remuneracion, config);
  // Mismo motor de cálculo que "Salario vs Dividendos" (calcularIRGerante en calculos.ts) —
  // verificado 2026-08 contra el simulador oficial de la DGFiP, nunca reimplementado aquí.
  const resultado = calcularIRGerante(remuneracion, tns.total, ingresosConyuge, casado, hijosACargo, config);

  const casillas = useMemo(() => {
    const filas = [
      { linea: '1GB', label: 'Traitements et salaires — Mario (gérant, art. 62 CGI)', importe: resultado.remuneracionNeta },
    ];
    if (ingresosConyuge > 0) {
      filas.push({ linea: '1HB', label: 'Traitements et salaires — cónyuge', importe: ingresosConyuge });
    }
    filas.push({ linea: 'DSCA/DSEA', label: 'Cotisations sociales obligatoires del gérant (TNS)', importe: tns.total });
    return filas;
  }, [resultado, ingresosConyuge, tns]);

  const filasExportar = useMemo(
    () => [
      ...casillas.map((c) => ({ concepto: `${c.linea} — ${c.label}`, importe: c.importe })),
      ...CASILLAS_DIVIDENDOS.map((c) => ({ concepto: `${c.linea} — ${c.label}`, importe: c.importe })),
      { concepto: 'Abattement 10% aplicado (Mario)', importe: resultado.abattement },
      ...(ingresosConyuge > 0 ? [{ concepto: 'Abattement 10% aplicado (cónyuge)', importe: resultado.abattementConyuge }] : []),
      { concepto: 'Revenu net imposable du foyer', importe: resultado.revenuNetImposable },
      { concepto: `Quotient familial (${resultado.parts} parts)`, importe: resultado.parts },
      { concepto: 'Impôt brut (con plafonnement quotient familial)', importe: resultado.impotBruto },
      { concepto: 'Décote aplicada', importe: resultado.decote },
      { concepto: 'Impôt net à payer (foyer completo)', importe: resultado.impotFinal },
    ],
    [casillas, resultado, ingresosConyuge],
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-gray-500 leading-relaxed">
        Déclaration de revenus personal de Mario (formulario 2042, no la 2042-C-PRO — esa es para autónomos BIC/BNC y
        no aplica aquí): se presenta cada año civil sobre los ingresos del año anterior, con independencia del
        ejercicio social contable de la société. Usa la misma rémunération configurada en "Cotisations URSSAF" y el
        mismo motor de cálculo que "Salario vs Dividendos".
      </p>

      <ResumenTitular icono={ScrollText}>
        Para los ingresos de <strong className="text-brand">{anio}</strong>, Mario declara{' '}
        <strong className="text-brand">{fmt(resultado.remuneracionNeta)}</strong> en la casilla 1GB
        {ingresosConyuge > 0 && (
          <>
            {' '}
            y su cónyuge <strong className="text-brand">{fmt(ingresosConyuge)}</strong> en la 1HB
          </>
        )}
        , con un impôt net estimado de <strong className="text-brand">{fmt(resultado.impotFinal)}</strong> para todo el
        foyer fiscal.
      </ResumenTitular>

      <div className="bg-amber-50 border border-amber-300 rounded-sm px-3 py-3 flex items-start gap-2 text-xs text-amber-800">
        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold mb-1">Única cifra por confirmar antes de presentar la declaración real</p>
          <p>
            La casilla 1GB, según la doctrina oficial (BOFiP BOI-RSA-GER-20), es: bruto − cotisations obligatoires −
            CSG déductible (6,8%) <strong>+ CSG/CRDS no deducible (~2,9%)</strong> + avantages en nature. Este
            asistente muestra <strong>rémunération − cotisations TNS totales</strong> (mismo cálculo que "Salario vs
            Dividendos", que usa un taux global único del 45% en vez de desglosar cada cotisation por separado) — le
            falta sumar de vuelta ese ~2,9% de CSG/CRDS no deducible, así que la cifra real de 1GB será algo mayor que
            la mostrada aquí. Ajusta a mano ese pequeño margen (o pide la cifra exacta a tu expert-comptable) antes de
            declarar.
          </p>
        </div>
      </div>

      <div className="bg-brand-light border border-gray-200 rounded-sm px-3 py-3 text-xs text-gray-700">
        <p className="font-semibold text-gray-900 mb-1">Cómo se paga el solde, si sale a pagar (confirmado en impots.gouv.fr)</p>
        <p>
          Si el solde de l'IR supera 300 €, se cobra automáticamente en <strong>4 plazos iguales</strong> (25 de
          septiembre, 26 de octubre, 25 de noviembre y 28 de diciembre del año de la declaración). Si es 300 € o
          menos, se cobra en un único cargo el 25 de septiembre. Es el mecanismo estándar de cualquier particulier —
          no hay ningún trato distinto para un gérant majoritaire TNS en esta fase final (el "acompte contemporain"
          solo aplica durante el año, no al solde de regularización).
        </p>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-sm px-3 py-2 text-xs text-gray-600">
        El importe de la 1GB sale siempre de la contabilidad interna (décision de rémunération / Cotisations URSSAF
        de este CRM) — no existe ninguna "attestation fiscale" de urssaf.fr para un gérant majoritaire (esa solo
        existe para autoentrepreneurs, un régimen distinto). No hace falta buscar ningún documento externo para
        obtener esta cifra.
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {anios.map((a) => {
          const est = calcularEstado(a, anioActual, declaraciones);
          const activo = a === anio;
          const limiteAnio = new Date(a + 1, mesLimite - 1, diaLimite);
          return (
            <button
              key={a}
              onClick={() => setAnio(a)}
              className={`text-left border rounded-sm p-2.5 transition-colors ${
                activo ? 'border-brand bg-brand-light' : 'border-gray-200 bg-surface hover:border-gray-300'
              }`}
            >
              <p className="text-sm font-semibold text-gray-900">Ingresos {a}</p>
              {est === 'en_curso' && (
                <span className="flex items-center gap-1 text-[10px] text-amber-600 font-semibold uppercase mt-1">
                  <Clock size={11} />
                  En curso
                </span>
              )}
              {est === 'disponible' && (
                <span className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold uppercase mt-1">
                  <Lock size={11} />
                  Pendiente
                </span>
              )}
              {est === 'declarado' && (
                <span className="flex items-center gap-1 text-[10px] text-brand font-semibold uppercase mt-1">
                  <Check size={11} />
                  Declarada
                </span>
              )}
              <p className="text-[10px] text-gray-400 mt-1">
                Límite: {diaLimite} {MESES[limiteAnio.getMonth()].slice(0, 3)} {a + 1}
              </p>
            </button>
          );
        })}
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-5 space-y-5">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 flex-wrap gap-2">
          <div>
            <p className="text-sm font-bold text-gray-900">Déclaration de revenus — ingresos {anio}</p>
            {estadoActivo === 'en_curso' && (
              <p className="text-xs text-amber-600 mt-0.5">
                Año en curso — podrás declararlo en cuanto termine el año civil {anio}.
              </p>
            )}
            {estadoActivo === 'declarado' && declaracionActiva?.fecha_declaracion && (
              <p className="text-xs text-brand mt-0.5">Declarada el {declaracionActiva.fecha_declaracion}</p>
            )}
            {estadoActivo === 'disponible' && (
              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
                Límite {diaLimite} de {MESES[mesLimite - 1]} de {anio + 1} (departamento 64) <Fuente url={fuente('declaracion_ir_dia')} />
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <BotonExportar
              nombreArchivo={`declaration_revenus_gerant_${anio}.csv`}
              filas={filasExportar}
              columnas={[
                { key: 'concepto', label: 'Concepto' },
                { key: 'importe', label: 'Importe', valor: (f) => f.importe.toFixed(2) },
              ]}
            />
            {estadoActivo !== 'en_curso' && (
              <Button
                size="sm"
                variant={estadoActivo === 'declarado' ? 'secondary' : 'primary'}
                onClick={() => marcarDeclaradaMutation.mutate(estadoActivo !== 'declarado')}
                disabled={marcarDeclaradaMutation.isPending}
              >
                {estadoActivo === 'declarado' ? 'Desmarcar como declarada' : 'Marcar como declarada'}
              </Button>
            )}
          </div>
        </div>

        <div>
          <p className="text-sm font-bold text-gray-900 mb-3">Casillas del formulario 2042</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-xs text-gray-400">
                <th className="text-left py-1 font-medium w-24"></th>
                <th className="text-left py-1 font-medium"></th>
                <th className="text-right py-1 font-medium w-32">Importe</th>
              </tr>
            </thead>
            <tbody>
              {casillas.map((c) => (
                <tr key={c.linea} className="border-t border-gray-100">
                  <td className="py-1.5 text-brand font-semibold">{c.linea}</td>
                  <td className="py-1.5 text-gray-700">{c.label}</td>
                  <td className="py-1.5 text-right text-gray-900 font-medium">{fmt(c.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-gray-200 pt-5">
          <p className="text-sm font-bold text-gray-900 mb-1">Casillas de dividendos (2DC/2CK)</p>
          <p className="text-xs text-gray-400 mb-3">
            En 0 € — Mario no reparte dividendos actualmente (toda la marge neta se convierte en rémunération, ver
            "Salario vs Dividendos"). Quedan listas para cuando un ejercicio futuro sí reparta.
          </p>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {CASILLAS_DIVIDENDOS.map((c) => (
                <tr key={c.linea} className="border-t border-gray-100">
                  <td className="py-1.5 text-brand font-semibold w-24">{c.linea}</td>
                  <td className="py-1.5 text-gray-700">{c.label}</td>
                  <td className="py-1.5 text-right text-gray-900 font-medium w-32">{fmt(c.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-gray-200 pt-5">
          <p className="text-sm font-bold text-gray-900 mb-3">Cálculo del impôt (abattement automático de la Administración)</p>
          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr className="border-t border-gray-100">
                <td className="py-1.5 text-gray-700">Abattement 10% aplicado — Mario</td>
                <td className="py-1.5 text-right text-gray-900 font-medium">{fmt(resultado.abattement)}</td>
              </tr>
              {ingresosConyuge > 0 && (
                <tr className="border-t border-gray-100">
                  <td className="py-1.5 text-gray-700">Abattement 10% aplicado — cónyuge</td>
                  <td className="py-1.5 text-right text-gray-900 font-medium">{fmt(resultado.abattementConyuge)}</td>
                </tr>
              )}
              <tr className="border-t border-gray-100">
                <td className="py-1.5 text-gray-700">Revenu net imposable du foyer</td>
                <td className="py-1.5 text-right text-gray-900 font-medium">{fmt(resultado.revenuNetImposable)}</td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="py-1.5 text-gray-700">Quotient familial</td>
                <td className="py-1.5 text-right text-gray-900 font-medium">{resultado.parts} parts</td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="py-1.5 text-gray-700">Impôt brut (con plafonnement)</td>
                <td className="py-1.5 text-right text-gray-900 font-medium">{fmt(resultado.impotBruto)}</td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="py-1.5 text-gray-700">Décote aplicada</td>
                <td className="py-1.5 text-right text-gray-900 font-medium">{fmt(resultado.decote)}</td>
              </tr>
              <tr className="border-t border-gray-200">
                <td className="py-1.5 text-gray-900 font-bold">Impôt net à payer (foyer completo)</td>
                <td className="py-1.5 text-right text-brand font-bold">{fmt(resultado.impotFinal)}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-2">
            Rémunération configurada en Cotisations URSSAF: {fmt(remuneracion)}/año. Cambia esa cifra ahí si no
            coincide con lo realmente cobrado en {anio}.
          </p>
        </div>
      </div>

      <Faq
        items={[
          {
            q: '¿Por qué esto no es la misma pestaña que "Salario vs Dividendos"?',
            a: 'Esa pestaña es un simulador para decidir cuánto pagarte (sliders, escenarios comparativos) — esta es un asistente de seguimiento de la declaración ANUAL real ya decidida: casillas exactas del formulario 2042, calendario con la fecha límite oficial, y un botón para marcarla como presentada. Ambas usan el mismo motor de cálculo (calcularIRGerante), así que las cifras siempre coinciden.',
          },
          {
            q: '¿Por qué el año 2026 se declara en 2027?',
            a: 'La déclaration de revenus francesa sigue siempre el año civil de percepción (1 enero a 31 diciembre), nunca el ejercicio social contable de la société. Como Mario cobra rémunération dentro del año civil 2026, esos ingresos se declaran en la campaña de renta de 2027 — sin ninguna complicación de cruce de ejercicios, porque el ejercicio social de la EURL (jul-dic 2026) cae íntegro dentro de ese mismo año civil.',
          },
          {
            q: '¿Qué es el prélèvement à la source (PAS) aquí? ¿Se retiene solo?',
            a: 'No como a un asalariado normal. Como gérant majoritaire (TNS), Mario no tiene una retención automática en nómina — paga un "acompte contemporain" que la DGFiP calcula según su última declaración y cobra directamente de su cuenta personal, normalmente el día 15 de cada mes (o trimestral si lo elige). Este asistente no calcula ese acompte mensual, solo la declaración anual final.',
          },
          {
            q: '¿Qué son las casillas DSCA/DSEA?',
            a: 'Son las casillas donde se declaran las cotisations sociales obligatoires (DSCA) y facultatives (DSEA) que Mario ya pagó a la URSSAF durante el año — estos importes reducen la base declarada en algunos casos y sirven de justificante. El CRM solo rellena DSCA con el total de cotisations TNS calculado (calcularTNS), que ya ves también en "Cotisations URSSAF". Confirmado que son las casillas correctas para un gérant majoritaire (no hay ninguna más apropiada para este caso).',
          },
          {
            q: '¿Y si algún año Mario reparte dividendos?',
            a: 'Las casillas 2DC (dividendos brutos) y 2CK (acompte no liberatorio del 12,8% ya retenido por la société al repartir) ya están preparadas en la tabla de abajo, en 0 € mientras no se repartan. Si se opta por tributar los dividendos al barème progresivo en vez del PFU del 31,4% (rara vez conviene con estos importes, ver el FAQ del simulador "Salario vs Dividendos"), haría falta además marcar la casilla 2OP — no incluida aquí porque no aplica con 0 € de dividendos.',
          },
          {
            q: '¿Puedo confiar en los importes de este asistente al 100%?',
            a: 'Para el barème del IR, la décote, el quotient familial y el abattement 10% (509 €–14.555 €, revenus 2025), sí — verificados contra el simulador oficial de la DGFiP y contra fuentes oficiales (impots.gouv.fr, service-public.gouv.fr) citadas en fiscal_config. La única cifra con un margen conocido es la 1GB, por el matiz de la CSG no deducible explicado en el aviso ámbar de arriba — el resto (formulario correcto, calendario, mecanismo de pago del solde, que no hace falta ningún documento de urssaf.fr) quedó confirmado con fuentes oficiales.',
          },
        ]}
      />
    </div>
  );
}
