import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import type { TamanoTitulo } from '../finanzas/DocumentoPreview';
import { PlanningPreview } from '../planning/PlanningPreview';
import { CONFIG_PLANNING_DEFECTO, configPlanningDesde } from '../planning/configPlanning';
import type { ConfigPlantillaPlanning } from '../planning/configPlanning';
import { ENTIDAD_EJEMPLO } from '../finanzas/datosEjemploDocumento';
import { FASES_EJEMPLO, PROYECTO_EJEMPLO } from '../planning/datosEjemploPlanning';
import { notificarCambioConfig } from '../../lib/notificaciones';
import { guardarConfigDatos } from '../../lib/empresaConfig';
import { useHidratarUnaVez } from '../../hooks/useHidratarUnaVez';

const TAMANOS_TITULO: { value: TamanoTitulo; label: string }[] = [
  { value: 'sm', label: 'Pequeño' },
  { value: 'md', label: 'Medio' },
  { value: 'lg', label: 'Grande' },
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

export default function ConstructorPlanningPage() {
  const toast = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [config, setConfig] = useState<ConfigPlantillaPlanning>(CONFIG_PLANNING_DEFECTO);

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
    const datos = (empresaConfig.datos ?? {}) as { plantilla_planning?: unknown };
    setConfig(configPlanningDesde(datos.plantilla_planning));
  });

  const datosEmpresa = (empresaConfig?.datos ?? {}) as { logo_url?: string; logo_oficial_url?: string };
  const logoUrl = datosEmpresa.logo_oficial_url || datosEmpresa.logo_url || '';

  const guardarMutation = useMutation({
    mutationFn: async () => {
      await guardarConfigDatos({ plantilla_planning: config });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa_config'] });
      toast.success('Plantilla de planning guardada');
      notificarCambioConfig(user, 'actualizó el Constructor de planning.');
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
              <p className="text-xs text-gray-400">Cabecera, tabla y fases completadas del cronograma.</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={config.colorPendiente}
                onChange={(e) => setConfig((c) => ({ ...c, colorPendiente: e.target.value }))}
                className="w-12 h-9 border border-gray-200 rounded-sm cursor-pointer"
              />
              <input
                type="text"
                value={config.colorPendiente}
                onChange={(e) => setConfig((c) => ({ ...c, colorPendiente: e.target.value }))}
                className="w-32 border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
              />
              <p className="text-xs text-gray-400">Fases pendientes del cronograma.</p>
            </div>
          </Bloque>

          <Bloque titulo="Secciones">
            <Interruptor
              etiqueta="Portada completa (foto + filtro), como en los presupuestos"
              checked={config.mostrarPortada}
              onChange={(v) => setConfig((c) => ({ ...c, mostrarPortada: v }))}
            />
            {config.mostrarPortada && (
              <p className="text-xs text-gray-400 -mt-1 mb-1.5">
                La foto, el filtro y la frase se gestionan en Constructor de portadas — se comparten con los presupuestos.
              </p>
            )}
            <Interruptor
              etiqueta="Mostrar logo"
              checked={config.mostrarLogo}
              onChange={(v) => setConfig((c) => ({ ...c, mostrarLogo: v }))}
            />
            <Interruptor
              etiqueta="Mostrar tarjeta de presupuesto vinculado"
              checked={config.mostrarPresupuesto}
              onChange={(v) => setConfig((c) => ({ ...c, mostrarPresupuesto: v }))}
            />
            <Interruptor
              etiqueta="Mostrar cronograma (Gantt)"
              checked={config.mostrarGantt}
              onChange={(v) => setConfig((c) => ({ ...c, mostrarGantt: v }))}
            />
            <Interruptor
              etiqueta="Mostrar tabla detallada de fases"
              checked={config.mostrarTablaFases}
              onChange={(v) => setConfig((c) => ({ ...c, mostrarTablaFases: v }))}
            />
            <div className="mt-3 pt-3 border-t border-gray-100">
              <Select
                label="Tamaño del título"
                options={TAMANOS_TITULO}
                value={config.tamanoTitulo}
                onChange={(e) => setConfig((c) => ({ ...c, tamanoTitulo: e.target.value as TamanoTitulo }))}
              />
            </div>
          </Bloque>

          <Bloque titulo="Tabla de fases">
            <Interruptor
              etiqueta="Añadir líneas divisorias entre filas"
              checked={config.tabla.lineas}
              onChange={(v) => setConfig((c) => ({ ...c, tabla: { ...c.tabla, lineas: v } }))}
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
          </Bloque>

          <Bloque titulo="Pie de página">
            <textarea
              value={config.piePagina}
              onChange={(e) => setConfig((c) => ({ ...c, piePagina: e.target.value }))}
              placeholder="Texto que aparece al final del planning (opcional)"
              className="w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm min-h-[70px] focus:border-brand focus:outline-none"
            />
          </Bloque>
        </div>

        <div className="w-full lg:w-[420px] shrink-0 lg:sticky lg:top-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Vista previa en vivo</p>
          <PlanningPreview
            config={config}
            entidad={ENTIDAD_EJEMPLO}
            logoUrl={logoUrl || undefined}
            clienteNombre={PROYECTO_EJEMPLO.clienteNombre}
            clienteTelefono={PROYECTO_EJEMPLO.clienteTelefono}
            clienteDir={PROYECTO_EJEMPLO.clienteDir}
            nombreObra={PROYECTO_EJEMPLO.nombreObra}
            estado={PROYECTO_EJEMPLO.estado}
            fechaInicio={PROYECTO_EJEMPLO.fechaInicio}
            presupuestoNumero={PROYECTO_EJEMPLO.presupuestoNumero}
            presupuestoFecha={PROYECTO_EJEMPLO.presupuestoFecha}
            presupuestoTotal={PROYECTO_EJEMPLO.presupuestoTotal}
            fases={FASES_EJEMPLO}
          />
        </div>
      </div>
    </div>
  );
}
