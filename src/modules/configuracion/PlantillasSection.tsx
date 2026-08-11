import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Check, Sliders } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { DocumentoPreview, PLANTILLAS_DOCUMENTO, configPlantillaDesde } from '../finanzas/DocumentoPreview';
import type { PlantillaDocumento } from '../finanzas/DocumentoPreview';
import { ENTIDAD_EJEMPLO, LINEAS_EJEMPLO, TOTAL_SIN_IVA_EJEMPLO, TOTAL_CON_IVA_EJEMPLO } from '../finanzas/datosEjemploDocumento';
import { notificarCambioConfig } from '../../lib/notificaciones';
import { guardarConfigDatos } from '../../lib/empresaConfig';

type PlantillasSectionProps = {
  config: { datos?: { plantilla_documento?: unknown } } | null | undefined;
};

export function PlantillasSection({ config }: PlantillasSectionProps) {
  const toast = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [previsualizando, setPrevisualizando] = useState<PlantillaDocumento | null>(null);

  const configActual = configPlantillaDesde(config?.datos?.plantilla_documento);

  const guardarMutation = useMutation({
    mutationFn: async (estructura: PlantillaDocumento) => {
      await guardarConfigDatos((datosActuales) => {
        const configFresca = configPlantillaDesde((datosActuales as { plantilla_documento?: unknown }).plantilla_documento);
        return { plantilla_documento: { ...configFresca, estructura } };
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa_config'] });
      toast.success('Plantilla actualizada');
      notificarCambioConfig(user, 'cambió la estructura de plantilla de presupuestos y facturas.');
    },
    onError: (error) => toast.error(error.message),
  });

  const plantillaPrevia = PLANTILLAS_DOCUMENTO.find((p) => p.value === previsualizando);

  return (
    <section className="bg-surface border border-gray-200 rounded-sm p-4">
      <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Plantillas de presupuestos y facturas</p>
        <Button size="sm" variant="secondary" onClick={() => navigate('/configuracion/plantillas')}>
          <span className="flex items-center gap-1.5">
            <Sliders size={13} />
            Modificar plantillas
          </span>
        </Button>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Elige la estructura general de tus presupuestos y facturas (vista previa y PDF). Pulsa una tarjeta para ver un
        ejemplo, o entra al constructor de plantillas para personalizar el logo, los colores, el pie de página y la tabla.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PLANTILLAS_DOCUMENTO.map((p) => (
          <button
            key={p.value}
            onClick={() => setPrevisualizando(p.value)}
            className={`text-left border rounded-sm p-3.5 hover:border-brand transition-colors ${
              configActual.estructura === p.value ? 'border-brand bg-brand-light' : 'border-gray-200 bg-surface'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="font-semibold text-gray-900">{p.label}</p>
              {configActual.estructura === p.value && (
                <span className="flex items-center gap-1 text-[10px] text-brand font-semibold uppercase">
                  <Check size={12} />
                  En uso
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">{p.descripcion}</p>
          </button>
        ))}
      </div>

      <Modal
        open={!!previsualizando}
        onClose={() => setPrevisualizando(null)}
        title={`Vista previa — ${plantillaPrevia?.label ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPrevisualizando(null)}>
              Cerrar
            </Button>
            <Button
              onClick={() => previsualizando && guardarMutation.mutate(previsualizando)}
              disabled={guardarMutation.isPending || configActual.estructura === previsualizando}
            >
              {configActual.estructura === previsualizando
                ? 'Ya en uso'
                : guardarMutation.isPending
                  ? 'Guardando...'
                  : 'Usar esta plantilla'}
            </Button>
          </>
        }
      >
        {previsualizando && (
          <DocumentoPreview
            plantilla={previsualizando}
            colorPrimario={configActual.colorPrimario}
            colorSecundario={configActual.colorSecundario}
            mostrarLogo={configActual.mostrarLogo}
            tabla={configActual.tabla}
            columnasExtra={configActual.columnas}
            piePagina={configActual.piePagina}
            tituloDocumento="PRESUPUESTO"
            titulo="Reforma integral de baño"
            numero="P-2026-0042"
            entidad={ENTIDAD_EJEMPLO}
            pais="España"
            clienteNombre="Cliente de Ejemplo"
            clienteDir="Avenida Ficticia 5, Hondarribia"
            clienteContacto="+34 600 111 222 · cliente@ejemplo.com"
            labelCif="CIF"
            camposDocumento={[
              { label: 'Emisión', valor: '01 jul 26' },
              { label: 'Válido hasta', valor: '31 jul 26' },
              { label: 'IVA', valor: '21%' },
              { label: 'Estado', valor: 'Pendiente', claseColor: 'text-amber-600' },
            ]}
            columnasTabla={['Nº', 'Designación', 'Cant.', 'Precio unit. (s/IVA)', 'Total', 'Total con Impuestos']}
            lineas={LINEAS_EJEMPLO}
            totalSinIva={TOTAL_SIN_IVA_EJEMPLO}
            totalConIva={TOTAL_CON_IVA_EJEMPLO}
            porcentajeIva={21}
            labelBase="Base imponible"
            labelIva="IVA"
            planPago={[
              { concepto: 'Al inicio', porcentaje: 50, importe: TOTAL_CON_IVA_EJEMPLO / 2 },
              { concepto: 'Al finalizar', porcentaje: 50, importe: TOTAL_CON_IVA_EJEMPLO / 2 },
            ]}
            labelPlanPago="Plan de pago"
            labelFirma="Firma del cliente"
            labelPendienteFirma="Pendiente de firma"
            mensajeGracias="Gracias por confiar en Reformas Ordoñez"
          />
        )}
      </Modal>
    </section>
  );
}
