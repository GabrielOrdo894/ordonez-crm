import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, ClipboardCheck, Gavel } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { useToast } from '../../hooks/useToast';
import { conAvisoDescarga } from '../../lib/conAvisoDescarga';
import { mensajeError } from '../../lib/mensajeError';
import { generarPdfDecisionAprobacionCuentas } from '../../lib/generarPdfRemuneracion';
import { generarPdfLiasseFiscale } from '../../lib/generarPdfLiasseFiscale';
import { registrarDecision } from '../../lib/registroDecisiones';
import { useComptaFrancia } from './useComptaFrancia';
import { useEcheances } from './useEcheances';
import { useEjercicioFiscal } from './useEjercicioFiscal';
import { useFiscalConfig } from './useFiscalConfig';
import { calcularBilanPasivo } from './calculos';
import { fmt, fmtFecha } from './format';
import { Faq } from './Faq';
import { ResumenTitular } from './ResumenTitular';

const ANIO_ACTUAL = new Date().getFullYear();
const ANIOS = [ANIO_ACTUAL - 1, ANIO_ACTUAL];

function Paso({
  numero,
  titulo,
  hecho,
  children,
}: {
  numero: number;
  titulo: string;
  hecho: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-gray-200 rounded-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        {hecho ? <CheckCircle2 size={16} className="text-brand shrink-0" /> : <Circle size={16} className="text-gray-300 shrink-0" />}
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Paso {numero}</span>
        <p className={`text-sm font-semibold ${hecho ? 'text-gray-500' : 'text-gray-900'}`}>{titulo}</p>
      </div>
      {children}
    </div>
  );
}

export function TabCierreEjercicio() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [anio, setAnio] = useState(ANIO_ACTUAL);
  const [generandoAprobacion, setGenerandoAprobacion] = useState(false);
  const [generandoLiasse, setGenerandoLiasse] = useState(false);

  const { is, resultadoNeto, capitalSocial, reservaLegal } = useEjercicioFiscal(anio);
  const { compteResultat, bilanActivo, activos, cargando } = useComptaFrancia(anio);
  const { echeances, marcarCompletada } = useEcheances();
  const { guardar: guardarFiscal } = useFiscalConfig();

  const bilanPasivo = calcularBilanPasivo(resultadoNeto, reservaLegal, is, capitalSocial);

  const echeancesDelEjercicio = useMemo(
    () => echeances.filter((e) => e.titulo.includes(`ejercicio ${anio}`)),
    [echeances, anio],
  );
  const echeanceAsamblea = echeancesDelEjercicio.find((e) => e.tipo === 'ASAMBLEA');
  const echeanceLiasse = echeancesDelEjercicio.find((e) => e.tipo === 'LIASSE');
  const echeanceDeposito = echeancesDelEjercicio.find((e) => e.tipo === 'DEPOT_COMPTES');

  const { data: decisiones } = useQuery({
    queryKey: ['decisiones_societarias', 'aprobacion_cuentas', anio],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('decisiones_societarias')
        .select('id')
        .eq('tipo', 'aprobacion_cuentas')
        .eq('anio_ejercicio', anio);
      if (error) throw error;
      return data;
    },
  });
  const aprobacionGenerada = (decisiones?.length ?? 0) > 0;
  const pasoAprobacionHecho = aprobacionGenerada && !!echeanceAsamblea?.completada;
  const pasoLiasseHecho = !!echeanceLiasse?.completada;
  const pasoDepositoHecho = !!echeanceDeposito?.completada;

  const handleAprobacionCuentas = async () => {
    // Se captura antes de disparar nada: si ya se había aprobado este ejercicio, repetir el botón
    // (permitido, ver FAQ) no debe volver a sumar la dotación a reserva_legal_acumulada — la
    // sumaría dos veces y corrompería el cálculo real de los próximos ejercicios.
    const primeraAprobacion = !aprobacionGenerada;
    setGenerandoAprobacion(true);
    try {
      await conAvisoDescarga(() => generarPdfDecisionAprobacionCuentas(anio, { resultadoNeto, reservaLegal, capitalSocial }), toast);
      try {
        await registrarDecision({ tipo: 'aprobacion_cuentas', titulo: `Approbation des comptes — exercice ${anio}`, anio_ejercicio: anio });
        queryClient.invalidateQueries({ queryKey: ['decisiones_societarias'] });
      } catch (err) {
        toast.warning(`El documento se generó, pero no se pudo registrar en el "Registre des décisions": ${mensajeError(err)}`);
      }
      if (echeanceAsamblea && !echeanceAsamblea.completada) {
        marcarCompletada({ id: echeanceAsamblea.id, completada: true });
      }
      if (primeraAprobacion && reservaLegal.dotacion > 0) {
        guardarFiscal(
          [
            {
              clave: 'reserva_legal_acumulada',
              valor: bilanPasivo.reservas,
              descripcion: `Actualizado automáticamente al aprobar las cuentas del ejercicio ${anio}`,
            },
          ],
          {
            onSuccess: () => toast.success(`Reserva legal acumulada actualizada a ${fmt(bilanPasivo.reservas)} para el próximo ejercicio.`),
            onError: (err) => toast.error(`No se pudo actualizar la reserva legal acumulada: ${mensajeError(err)}`),
          },
        );
      }
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el documento'));
    } finally {
      setGenerandoAprobacion(false);
    }
  };

  const handleLiasse = async () => {
    setGenerandoLiasse(true);
    try {
      await conAvisoDescarga(
        () => generarPdfLiasseFiscale(anio, { compteResultat, bilanActivo, bilanPasivo, resultadoNeto, is, activos }),
        toast,
      );
      if (echeanceLiasse && !echeanceLiasse.completada) {
        marcarCompletada({ id: echeanceLiasse.id, completada: true });
      }
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el documento'));
    } finally {
      setGenerandoLiasse(false);
    }
  };

  const pasosCompletados = [pasoAprobacionHecho, pasoLiasseHecho, pasoDepositoHecho].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-4">
      <ResumenTitular icono={Gavel}>
        {pasosCompletados} de 3 pasos completados para cerrar el ejercicio {anio}
        {pasosCompletados === 3 ? ' — cierre terminado.' : '.'}
      </ResumenTitular>
      <p className="text-xs text-gray-500 leading-relaxed px-1">
        Encadena, en el orden real, los 3 trámites del cierre: aprobar las cuentas del ejercicio, preparar la liasse
        fiscale y depositar las cuentas en el Greffe — reutilizando los mismos cálculos y generadores de "Impôt sur
        les Sociétés" y "Liasse fiscale". Los pasos 1 y 2 generan un PDF y marcan su échéance como hecha
        automáticamente; el paso 3 es un trámite externo (Greffe), así que se marca a mano una vez completado.
      </p>

      <Select
        label="Ejercicio a cerrar"
        options={ANIOS.map((a) => ({ value: String(a), label: String(a) }))}
        value={String(anio)}
        onChange={(e) => setAnio(Number(e.target.value))}
        className="w-40"
      />

      {echeancesDelEjercicio.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center bg-surface border border-gray-200 rounded-sm">
          Sin calendario fiscal generado para el ejercicio {anio}. Genéralo primero desde la pestaña "Calendario".
        </p>
      ) : (
        <>
          <Paso numero={1} titulo="Aprobación de cuentas del socio único" hecho={pasoAprobacionHecho}>
            <p className="text-xs text-gray-500 leading-relaxed mb-3">
              Décision de l'associé unique aprobando el resultado neto estimado ({fmt(resultadoNeto)}) y la dotación a
              la réserve légale — paso previo obligatorio al dépôt des comptes. La primera vez que se aprueba un
              ejercicio, la dotación ({fmt(reservaLegal.dotacion)}) se suma automáticamente a la reserva legal
              acumulada para que el ejercicio siguiente ya parta del valor correcto.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={handleAprobacionCuentas} disabled={generandoAprobacion}>
                {generandoAprobacion ? 'Generando...' : `Décision d'approbation des comptes ${anio} (PDF)`}
              </Button>
              {echeanceAsamblea && (
                <span className="text-xs text-gray-500">Échéance: {fmtFecha(echeanceAsamblea.fecha_limite)}</span>
              )}
              {aprobacionGenerada && <span className="text-xs text-brand font-medium">Documento ya generado</span>}
            </div>
          </Paso>

          <Paso numero={2} titulo="Preparación de la liasse fiscale" hecho={pasoLiasseHecho}>
            <p className="text-xs text-gray-500 leading-relaxed mb-3">
              Compte de résultat y bilan simplificado del ejercicio {anio}, con el registro de inmovilizado — para
              entregar a un partenaire EDI o a tu expert-comptable.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={handleLiasse} disabled={generandoLiasse || cargando}>
                {generandoLiasse ? 'Generando...' : `Descargar resumen de liasse fiscale ${anio} (PDF)`}
              </Button>
              {echeanceLiasse && <span className="text-xs text-gray-500">Échéance: {fmtFecha(echeanceLiasse.fecha_limite)}</span>}
            </div>
          </Paso>

          <Paso numero={3} titulo="Dépôt des comptes annuels au Greffe" hecho={pasoDepositoHecho}>
            <p className="text-xs text-gray-500 leading-relaxed mb-3">
              Trámite externo (no lo hace el CRM): deposita el bilan, compte de résultat y annexe en el Registre du
              Commerce et des Sociétés a través del Greffe, dentro del mes siguiente a la aprobación de cuentas.
              Márcalo aquí una vez hecho.
            </p>
            {echeanceDeposito && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={echeanceDeposito.completada}
                  onChange={(ev) => marcarCompletada({ id: echeanceDeposito.id, completada: ev.target.checked })}
                />
                Depositado en el Greffe — vencimiento {fmtFecha(echeanceDeposito.fecha_limite)}
              </label>
            )}
          </Paso>

          {pasoAprobacionHecho && pasoLiasseHecho && pasoDepositoHecho && (
            <div className="bg-brand-light border border-gray-200 rounded-sm px-3 py-2 text-sm text-brand flex items-center gap-2">
              <ClipboardCheck size={15} /> Cierre del ejercicio {anio} completado.
            </div>
          )}
        </>
      )}

      <Faq
        items={[
          {
            q: '¿Por qué el paso 1 pide marcar dos cosas (documento + échéance) para darse por hecho?',
            a: 'Porque son dos garantías distintas: el PDF es la décision en sí (el documento legal), y la échéance marcada es el recordatorio de plazo en el Calendario fiscal. Al pulsar el botón, el asistente genera el PDF, lo registra en el "Registre des décisions" (visible en Documentos obligatorios) y marca la échéance automáticamente — no hace falta ir a otra pestaña a marcarla a mano.',
          },
          {
            q: '¿Puedo repetir un paso ya hecho?',
            a: 'Sí. Generar de nuevo la décision o la liasse no borra nada — vuelve a descargar el PDF con los datos actuales. Si quieres desmarcar una échéance porque se marcó por error, puedes hacerlo desde esta misma pestaña o desde "Calendario fiscal".',
          },
          {
            q: '¿Por qué el paso 3 (dépôt des comptes) no genera ningún documento?',
            a: 'Porque el depósito se hace directamente en el sitio del Greffe (o lo tramita tu expert-comptable), no es algo que el CRM pueda generar o enviar — solo ayuda a no perder de vista el plazo.',
          },
        ]}
      />
    </div>
  );
}
