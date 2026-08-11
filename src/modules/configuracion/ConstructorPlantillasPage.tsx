import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Image as ImageIcon, FileImage } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { DocumentoPreview, CONFIG_PLANTILLA_DEFECTO, configPlantillaDesde } from '../finanzas/DocumentoPreview';
import type { ConfigPlantilla, TamanoTitulo, AlineacionEncabezado } from '../finanzas/DocumentoPreview';
import { ENTIDAD_EJEMPLO, LINEAS_EJEMPLO, TOTAL_SIN_IVA_EJEMPLO, TOTAL_CON_IVA_EJEMPLO } from '../finanzas/datosEjemploDocumento';
import { notificarCambioConfig } from '../../lib/notificaciones';
import { guardarConfigDatos } from '../../lib/empresaConfig';
import { useHidratarUnaVez } from '../../hooks/useHidratarUnaVez';

const TAMANOS_TITULO: { value: TamanoTitulo; label: string }[] = [
  { value: 'sm', label: 'Pequeño' },
  { value: 'md', label: 'Medio' },
  { value: 'lg', label: 'Grande' },
];

const ALINEACIONES_ENCABEZADO: { value: AlineacionEncabezado; label: string }[] = [
  { value: 'auto', label: 'Automática (actual)' },
  { value: 'izquierda', label: 'Izquierda' },
  { value: 'centro', label: 'Centro' },
  { value: 'derecha', label: 'Derecha' },
];

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface border border-gray-200 rounded-sm p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
        {titulo}
      </p>
      {children}
    </section>
  );
}

function Interruptor({ etiqueta, checked, onChange }: { etiqueta: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between py-1.5 text-sm text-gray-700 cursor-pointer">
      {etiqueta}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4" />
    </label>
  );
}

export default function ConstructorPlantillasPage() {
  const toast = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [config, setConfig] = useState<ConfigPlantilla>(CONFIG_PLANTILLA_DEFECTO);

  const { data: empresaConfig, isLoading } = useQuery({
    queryKey: ['empresa_config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('empresa_config').select('*').eq('id', 1).single();
      if (error) throw error;
      return data;
    },
  });

  // Solo se hidrata una vez — el polling de 'empresa_config' no debe pisar ediciones en curso.
  useHidratarUnaVez(empresaConfig, (empresaConfig) => {
    const datos = (empresaConfig.datos ?? {}) as { plantilla_documento?: unknown };
    setConfig(configPlantillaDesde(datos.plantilla_documento));
  });

  const datosEmpresa = (empresaConfig?.datos ?? {}) as { logo_url?: string; logo_oficial_url?: string };
  const logoOficialUrl = datosEmpresa.logo_oficial_url || datosEmpresa.logo_url || '';

  const guardarMutation = useMutation({
    mutationFn: async () => {
      await guardarConfigDatos({ plantilla_documento: config });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa_config'] });
      toast.success('Plantilla guardada');
      notificarCambioConfig(user, 'actualizó el Constructor de plantillas (presupuestos y facturas).');
    },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading) {
    return <div className="h-96 bg-surface border border-gray-200 rounded-sm animate-pulse" />;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <button
          onClick={() => navigate('/configuracion')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft size={15} />
          Volver a configuración
        </button>
        <Button onClick={() => guardarMutation.mutate()} disabled={guardarMutation.isPending}>
          {guardarMutation.isPending ? 'Guardando...' : 'Guardar plantilla'}
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <div className="flex-1 min-w-0 w-full flex flex-col gap-4">
          <Bloque titulo="Logo">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 border border-gray-200 rounded-sm flex items-center justify-center bg-gray-50 shrink-0 overflow-hidden">
                {logoOficialUrl ? (
                  <img src={logoOficialUrl} alt="Logo oficial" className="max-w-full max-h-full object-contain" />
                ) : (
                  <ImageIcon size={20} className="text-gray-300" />
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500">
                  Este es el logo oficial que aparece en la portada y en la cabecera de presupuestos, facturas y plannings.
                </p>
                <button
                  onClick={() => navigate('/configuracion/portada')}
                  className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
                >
                  <FileImage size={13} />
                  Cambiarlo en Constructor de portadas
                </button>
              </div>
            </div>
            <div className="mt-3 border-t border-gray-100 pt-3">
              <Interruptor
                etiqueta="Mostrar logo en presupuestos y facturas"
                checked={config.mostrarLogo}
                onChange={(v) => setConfig((c) => ({ ...c, mostrarLogo: v }))}
              />
            </div>
          </Bloque>

          <Bloque titulo="Colores">
            <div className="flex items-center gap-3 mb-3">
              <input
                type="color"
                value={config.colorPrimario}
                onChange={(e) => setConfig((c) => ({ ...c, colorPrimario: e.target.value }))}
                className="w-12 h-9 border border-gray-200 rounded-sm cursor-pointer"
              />
              <input
                type="text"
                value={config.colorPrimario}
                onChange={(e) => setConfig((c) => ({ ...c, colorPrimario: e.target.value }))}
                className="w-32 border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
              />
              <p className="text-xs text-gray-400">Color principal (cabecera, tabla, totales).</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={config.colorSecundario}
                onChange={(e) => setConfig((c) => ({ ...c, colorSecundario: e.target.value }))}
                className="w-12 h-9 border border-gray-200 rounded-sm cursor-pointer"
              />
              <input
                type="text"
                value={config.colorSecundario}
                onChange={(e) => setConfig((c) => ({ ...c, colorSecundario: e.target.value }))}
                className="w-32 border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
              />
              <p className="text-xs text-gray-400">Color de acento (franja, línea decorativa).</p>
            </div>
          </Bloque>

          <Bloque titulo="Diseño">
            <Interruptor
              etiqueta="Bloque Emisor a la izquierda (Cliente a la derecha)"
              checked={config.empresaClienteIzquierda}
              onChange={(v) => setConfig((c) => ({ ...c, empresaClienteIzquierda: v }))}
            />
            <Interruptor
              etiqueta="Plan de pago a la izquierda (Resumen y firma a la derecha)"
              checked={config.planPagoIzquierda}
              onChange={(v) => setConfig((c) => ({ ...c, planPagoIzquierda: v }))}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-100">
              <Select
                label="Tamaño del título del documento"
                options={TAMANOS_TITULO}
                value={config.tamanoTituloDocumento}
                onChange={(e) => setConfig((c) => ({ ...c, tamanoTituloDocumento: e.target.value as TamanoTitulo }))}
              />
              <Select
                label="Tamaño del título de la reforma"
                options={TAMANOS_TITULO}
                value={config.tamanoTituloReforma}
                onChange={(e) => setConfig((c) => ({ ...c, tamanoTituloReforma: e.target.value as TamanoTitulo }))}
              />
            </div>
          </Bloque>

          <Bloque titulo="Tabla">
            <Interruptor
              etiqueta="Añadir líneas divisorias entre filas"
              checked={config.tabla.lineas}
              onChange={(v) => setConfig((c) => ({ ...c, tabla: { ...c.tabla, lineas: v } }))}
            />
            <Interruptor
              etiqueta="Añadir líneas divisorias entre columnas"
              checked={config.tabla.lineasVerticales}
              onChange={(v) => setConfig((c) => ({ ...c, tabla: { ...c.tabla, lineasVerticales: v } }))}
            />
            <Interruptor
              etiqueta="Colores intercalados por filas"
              checked={config.tabla.filasIntercaladas}
              onChange={(v) => setConfig((c) => ({ ...c, tabla: { ...c.tabla, filasIntercaladas: v } }))}
            />
            <Interruptor
              etiqueta="Encabezado de tabla coloreado"
              checked={config.tabla.encabezadoColoreado}
              onChange={(v) => setConfig((c) => ({ ...c, tabla: { ...c.tabla, encabezadoColoreado: v } }))}
            />
            <div className="mt-3 pt-3 border-t border-gray-100">
              <Select
                label="Alineación de los encabezados"
                options={ALINEACIONES_ENCABEZADO}
                value={config.tabla.alineacionEncabezado}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, tabla: { ...c.tabla, alineacionEncabezado: e.target.value as AlineacionEncabezado } }))
                }
              />
              <p className="text-xs text-gray-400 mt-1">
                Aplica a los presupuestos normales y orientativos, y a las facturas. "Automática" deja el texto a la
                izquierda y los números a la derecha, como hasta ahora.
              </p>
            </div>
          </Bloque>

          <Bloque titulo="Columnas de la tabla">
            <p className="text-xs text-gray-400 mb-2">Nº, Designación, Cantidad, Precio y Totales siempre se muestran.</p>
            <Interruptor
              etiqueta="Referencia"
              checked={config.columnas.referencia}
              onChange={(v) => setConfig((c) => ({ ...c, columnas: { ...c.columnas, referencia: v } }))}
            />
            <Interruptor
              etiqueta="Descripción"
              checked={config.columnas.descripcion}
              onChange={(v) => setConfig((c) => ({ ...c, columnas: { ...c.columnas, descripcion: v } }))}
            />
            <Interruptor
              etiqueta="Unidad"
              checked={config.columnas.unidad}
              onChange={(v) => setConfig((c) => ({ ...c, columnas: { ...c.columnas, unidad: v } }))}
            />
          </Bloque>

          <Bloque titulo="Pie de página">
            <textarea
              value={config.piePagina}
              onChange={(e) => setConfig((c) => ({ ...c, piePagina: e.target.value }))}
              placeholder="Texto que aparece al final de cada presupuesto y factura (opcional)"
              className="w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm min-h-[70px] focus:border-brand focus:outline-none"
            />
          </Bloque>

          <Bloque titulo="Portada de presupuestos">
            <p className="text-xs text-gray-400 mb-2">
              La foto de fondo, el filtro blanco y la frase de la franja inferior se gestionan desde el Constructor de
              portadas, junto al logo oficial.
            </p>
            <button
              onClick={() => navigate('/configuracion/portada')}
              className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
            >
              <FileImage size={13} />
              Ir a Constructor de portadas
            </button>
          </Bloque>
        </div>

        <div className="w-full lg:w-[420px] shrink-0 lg:sticky lg:top-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Vista previa en vivo</p>
          <DocumentoPreview
            plantilla={config.estructura}
            colorPrimario={config.colorPrimario}
            colorSecundario={config.colorSecundario}
            mostrarLogo={config.mostrarLogo}
            empresaClienteIzquierda={config.empresaClienteIzquierda}
            columnasInvertidas={config.planPagoIzquierda}
            tamanoTituloDocumento={config.tamanoTituloDocumento}
            tamanoTituloReforma={config.tamanoTituloReforma}
            tabla={config.tabla}
            columnasExtra={config.columnas}
            piePagina={config.piePagina}
            tituloDocumento="PRESUPUESTO"
            titulo="Reforma integral de baño"
            numero="P-2026-0042"
            entidad={ENTIDAD_EJEMPLO}
            logoUrl={logoOficialUrl || undefined}
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
        </div>
      </div>
    </div>
  );
}
