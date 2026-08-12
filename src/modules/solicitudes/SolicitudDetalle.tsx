import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Sparkles, Copy, Check, X, Link2, Gauge } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { registrarEventoFunnel } from '../../lib/funnelTracking';
import { useToast } from '../../hooks/useToast';
import { useConfirmar } from '../../hooks/useConfirm';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import {
  FUENTE_LABEL,
  MODELOS_IA,
  estadoSeguimiento,
  parseMensaje,
  type PresupuestoConRespuesta,
  type Solicitud,
} from './types';

type SolicitudDetalleProps = {
  tipo: 'solicitud' | 'seguimiento';
  id: string;
  onClose: () => void;
};

type VarianteBadge = 'pendiente' | 'confirmada' | 'realizada' | 'cancelada' | 'vencida' | 'default';

const VARIANTE_ESTADO: Record<string, VarianteBadge> = {
  Nueva: 'pendiente',
  Borrador: 'confirmada',
  Enviada: 'realizada',
  Descartada: 'cancelada',
};

function fecha(f: string | null) {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

type PresupuestoResumen = { id: string; numero: string | null; cliente_nombre: string | null };

export function SolicitudDetalle({ tipo, id, onClose }: SolicitudDetalleProps) {
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const [modelo, setModelo] = useState(MODELOS_IA[0].value);

  const { data: solicitud, isLoading: cargandoSolicitud } = useQuery({
    queryKey: ['solicitudes', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('solicitudes').select('*').eq('id', id).single();
      if (error) throw error;
      return data as Solicitud;
    },
    enabled: tipo === 'solicitud',
  });

  const { data: presupuesto, isLoading: cargandoPresupuesto } = useQuery({
    queryKey: ['presupuestos', 'seguimiento', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select(
          'id, numero, cliente_nombre, cliente_email, idioma, ultima_respuesta_cliente_resumen, ultima_respuesta_cliente_fecha, ultima_respuesta_revisada, mensaje_seguimiento_generado, mensaje_seguimiento_enviado, mensaje_seguimiento_enviado_en, conversacion',
        )
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as PresupuestoConRespuesta;
    },
    enabled: tipo === 'seguimiento',
  });

  const { data: empresaConfig } = useQuery({
    queryKey: ['empresa_config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('empresa_config').select('ia_presupuesto_mensual_usd').eq('id', 1).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: usoIaMes } = useQuery({
    queryKey: ['uso-ia'],
    queryFn: async () => {
      const primerDiaMes = new Date();
      primerDiaMes.setDate(1);
      primerDiaMes.setHours(0, 0, 0, 0);
      const { data, error } = await supabase.from('llamadas_ia').select('costo_usd').gte('created_at', primerDiaMes.toISOString());
      if (error) throw error;
      return (data ?? []).reduce((s, r) => s + Number(r.costo_usd), 0);
    },
  });

  const presupuestoMensual = (empresaConfig?.ia_presupuesto_mensual_usd as number | undefined) ?? 10;
  const porcentajeUso = presupuestoMensual > 0 ? Math.round(((usoIaMes ?? 0) / presupuestoMensual) * 100) : 0;

  const { data: presupuestosDisponibles } = useQuery({
    queryKey: ['presupuestos', 'resumen-para-vincular'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('id, numero, cliente_nombre')
        .is('eliminado_en', null)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as PresupuestoResumen[];
    },
    enabled: tipo === 'solicitud',
  });

  const invalidarListas = () => {
    queryClient.invalidateQueries({ queryKey: ['solicitudes'] });
    queryClient.invalidateQueries({ queryKey: ['presupuestos', 'respuestas-pendientes'] });
    queryClient.invalidateQueries({ queryKey: ['presupuestos', 'seguimiento', id] });
    queryClient.invalidateQueries({ queryKey: ['uso-ia'] });
  };

  const generarMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generar-mensaje-ia', { body: { tipo, id, modelo } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => invalidarListas(),
    onError: (error) => toast.error(error.message),
  });

  const marcarEnviadoMutation = useMutation({
    mutationFn: async () => {
      if (tipo === 'solicitud') {
        const { error } = await supabase
          .from('solicitudes')
          .update({ estado: 'Enviada', mensaje_enviado_en: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;
        await registrarEventoFunnel('solicitud_respondida', { solicitudId: id, fuente: solicitud?.fuente });
      } else {
        const { error } = await supabase
          .from('presupuestos')
          .update({ mensaje_seguimiento_enviado: true, mensaje_seguimiento_enviado_en: new Date().toISOString(), ultima_respuesta_revisada: true })
          .eq('id', id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidarListas();
      toast.success(tipo === 'solicitud' ? 'Marcado como aceptado y enviado' : 'Respuesta marcada como revisada');
    },
    onError: (error) => toast.error(error.message),
  });

  const descartarMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('solicitudes').update({ estado: 'Descartada' }).eq('id', id);
      if (error) throw error;
      await registrarEventoFunnel('solicitud_descartada', { solicitudId: id, fuente: solicitud?.fuente });
    },
    onSuccess: () => {
      invalidarListas();
      toast.success('Solicitud descartada');
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const vincularMutation = useMutation({
    mutationFn: async (presupuestoId: string | null) => {
      const { error } = await supabase.from('solicitudes').update({ presupuesto_vinculado_id: presupuestoId }).eq('id', id);
      if (error) throw error;
      if (presupuestoId && !solicitud?.presupuesto_vinculado_id) {
        await registrarEventoFunnel('solicitud_vinculada_presupuesto', {
          solicitudId: id,
          presupuestoId,
          fuente: solicitud?.fuente,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes', id] });
      toast.success('Vínculo actualizado');
    },
    onError: (error) => toast.error(error.message),
  });

  const copiar = (texto: string, etiqueta: string) => {
    navigator.clipboard.writeText(texto);
    toast.success(`${etiqueta} copiado`);
  };

  if (cargandoSolicitud || cargandoPresupuesto) return null;

  const estado = tipo === 'solicitud' ? solicitud?.estado : presupuesto ? estadoSeguimiento(presupuesto) : undefined;
  const mensajeRaw = tipo === 'solicitud' ? solicitud?.mensaje_generado ?? null : presupuesto?.mensaje_seguimiento_generado ?? null;
  const mensaje = parseMensaje(mensajeRaw);
  const enviado = tipo === 'solicitud' ? solicitud?.estado === 'Enviada' : !!presupuesto?.mensaje_seguimiento_enviado;
  const descartada = tipo === 'solicitud' && solicitud?.estado === 'Descartada';

  return (
    <div>
      <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4">
        <ArrowLeft size={15} />
        Volver a la lista
      </button>

      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            {tipo === 'solicitud' ? 'Solicitud entrante' : `Respuesta a ${presupuesto?.numero}`}
          </h1>
          <p className="text-sm text-gray-500">
            {tipo === 'solicitud' ? solicitud?.nombre || solicitud?.email || '(sin nombre)' : presupuesto?.cliente_nombre}
          </p>
        </div>
        {estado && <Badge variant={VARIANTE_ESTADO[estado] ?? 'default'}>{estado}</Badge>}
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4 mb-4 text-sm text-gray-700 space-y-1.5">
        {tipo === 'solicitud' && solicitud && (
          <>
            <p>
              <span className="text-gray-400">Fuente:</span> {FUENTE_LABEL[solicitud.fuente] ?? solicitud.fuente} ·{' '}
              <span className="text-gray-400">Recibida:</span> {fecha(solicitud.created_at)}
            </p>
            <p>
              <span className="text-gray-400">Nombre:</span> {solicitud.nombre || '(no indicado)'}
            </p>
            <p>
              <span className="text-gray-400">Email:</span> {solicitud.email || '—'} ·{' '}
              <span className="text-gray-400">Teléfono:</span> {solicitud.telefono || '—'}
            </p>
            <p>
              <span className="text-gray-400">Tipo de reforma:</span> {solicitud.tipo_reforma || '—'}
            </p>
            <p className="whitespace-pre-wrap pt-1 border-t border-gray-100 mt-2">
              {solicitud.comentario_cliente || '(sin comentario)'}
            </p>
          </>
        )}
        {tipo === 'solicitud' && solicitud?.ultima_respuesta_cliente_resumen && (
          <div className="border-t border-gray-100 mt-2 pt-2">
            <p className="text-xs text-brand font-semibold uppercase tracking-wide mb-1">
              Respuesta del cliente · {fecha(solicitud.ultima_respuesta_cliente_fecha)}
            </p>
            <p className="whitespace-pre-wrap">{solicitud.ultima_respuesta_cliente_resumen}</p>
          </div>
        )}
        {tipo === 'seguimiento' && presupuesto && (
          <>
            <p>
              <span className="text-gray-400">Cliente:</span> {presupuesto.cliente_nombre || '—'} ({presupuesto.cliente_email || '—'})
            </p>
            <p>
              <span className="text-gray-400">Respondió:</span> {fecha(presupuesto.ultima_respuesta_cliente_fecha)}
            </p>
            {presupuesto.conversacion && presupuesto.conversacion.length > 0 ? (
              <div className="border-t border-gray-100 mt-3 pt-3 flex flex-col gap-2.5">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                  Conversación completa ({presupuesto.conversacion.length} mensaje{presupuesto.conversacion.length > 1 ? 's' : ''})
                </p>
                {presupuesto.conversacion.map((m, i) => {
                  const esCliente = m.de === (presupuesto.cliente_email ?? '').toLowerCase();
                  return (
                    <div key={i} className={`flex ${esCliente ? 'justify-start' : 'justify-end'}`}>
                      <div
                        className={`max-w-[85%] rounded-sm px-3 py-2 text-sm ${
                          esCliente ? 'bg-brand-light' : 'bg-gray-100'
                        }`}
                      >
                        <p className="text-[11px] font-semibold text-gray-500 mb-1">
                          {esCliente ? presupuesto.cliente_nombre || m.de : 'Nosotros'}
                          <span className="font-normal text-gray-400"> · {fecha(m.fecha)}</span>
                        </p>
                        <p className="whitespace-pre-wrap leading-relaxed text-gray-800">{m.texto}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="whitespace-pre-wrap pt-1 border-t border-gray-100 mt-2">
                {presupuesto.ultima_respuesta_cliente_resumen || '—'}
              </p>
            )}
          </>
        )}
      </div>

      {tipo === 'solicitud' && solicitud && (
        <div className="bg-surface border border-gray-200 rounded-sm p-4 mb-4 flex items-center gap-2 flex-wrap">
          <Link2 size={14} className="text-gray-400 shrink-0" />
          <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold shrink-0">Vincular a presupuesto</span>
          <div className="w-72">
            <Select
              options={[{ value: '', label: 'Sin vincular' }, ...(presupuestosDisponibles ?? []).map((p) => ({
                value: p.id,
                label: `${p.numero ?? '(sin número)'} — ${p.cliente_nombre ?? ''}`,
              }))]}
              value={solicitud.presupuesto_vinculado_id ?? ''}
              // Deshabilitado mientras está pendiente — si no, cambiar de presupuesto vinculado dos
              // veces seguidas antes de que la primera mutación complete lee presupuesto_vinculado_id
              // desactualizado (aún null) en ambas y puede registrar el evento de funnel dos veces,
              // apuntando al presupuesto ya sobrescrito (hallazgo real, revisión 2026-08-12).
              disabled={vincularMutation.isPending}
              onChange={(e) => vincularMutation.mutate(e.target.value || null)}
            />
          </div>
          <span className="text-xs text-gray-400">Para poder analizar más adelante qué solicitudes se convierten en negocio real.</span>
        </div>
      )}

      {descartada ? (
        <div className="bg-gray-50 border border-gray-200 rounded-sm p-4 text-sm text-gray-500">
          Esta solicitud está descartada. No se generará ningún mensaje.
        </div>
      ) : (
        <>
          {!mensaje && (
            <div className="bg-surface border border-gray-200 rounded-sm p-4 mb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="w-56">
                  <Select label="Modelo de IA" options={MODELOS_IA} value={modelo} onChange={(e) => setModelo(e.target.value)} />
                </div>
                <Button onClick={() => generarMutation.mutate()} disabled={generarMutation.isPending} className="mt-4">
                  <span className="flex items-center gap-1.5">
                    <Sparkles size={14} />
                    {generarMutation.isPending ? 'Generando…' : 'Generar mensaje de respuesta'}
                  </span>
                </Button>
              </div>
              <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-100">
                <Gauge size={12} className={porcentajeUso >= 90 ? 'text-red-600' : porcentajeUso >= 60 ? 'text-amber-600' : 'text-gray-400'} />
                Uso de IA este mes: ${(usoIaMes ?? 0).toFixed(2)} de ${presupuestoMensual.toFixed(2)} ({porcentajeUso}%)
              </p>
            </div>
          )}

          {mensaje && (
            <div className="border border-gray-200 rounded-sm mb-4">
              <div className="bg-brand-light px-3 py-2 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">Asunto</p>
                  <p className="text-sm font-medium text-gray-900 truncate">{mensaje.asunto}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => copiar(mensaje.asunto, 'Asunto')}>
                  <Copy size={12} />
                </Button>
              </div>
              <div className="p-3">
                <p className="text-sm text-gray-900 whitespace-pre-wrap">{mensaje.cuerpo}</p>
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => copiar(mensaje.cuerpo, 'Mensaje')}>
                  <span className="flex items-center gap-1.5">
                    <Copy size={12} />
                    Copiar mensaje
                  </span>
                </Button>
              </div>
              {!!mensaje.avisos?.length && (
                <div className="border-t border-gray-200 px-3 py-2 bg-amber-50">
                  <p className="text-xs font-medium text-amber-800 mb-1">Avisos</p>
                  <ul className="text-xs text-amber-800 list-disc pl-4 space-y-0.5">
                    {mensaje.avisos.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {mensaje && !enviado && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-56">
                <Select options={MODELOS_IA} value={modelo} onChange={(e) => setModelo(e.target.value)} />
              </div>
              <Button variant="secondary" onClick={() => generarMutation.mutate()} disabled={generarMutation.isPending}>
                <span className="flex items-center gap-1.5">
                  <Sparkles size={14} />
                  {generarMutation.isPending ? 'Generando…' : 'Volver a generar'}
                </span>
              </Button>
              <Button onClick={() => marcarEnviadoMutation.mutate()} disabled={marcarEnviadoMutation.isPending}>
                <span className="flex items-center gap-1.5">
                  <Check size={14} />
                  {/* Para seguimiento este botón solo marca la respuesta como revisada — no cambia
                      presupuestos.estado a Aceptado (eso solo pasa desde las acciones masivas de
                      SolicitudesPage). Etiqueta distinta para no dar a entender que ya se aceptó
                      el presupuesto (hallazgo real, revisión 2026-08-12). */}
                  {tipo === 'solicitud' ? 'Aceptado y enviado' : 'Marcar respuesta como revisada'}
                </span>
              </Button>
              {tipo === 'solicitud' && (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    if (await confirmar('¿Descartar esta solicitud? No se le hará seguimiento.')) descartarMutation.mutate();
                  }}
                  disabled={descartarMutation.isPending}
                >
                  <span className="flex items-center gap-1.5">
                    <X size={14} />
                    Cancelar / descartar
                  </span>
                </Button>
              )}
            </div>
          )}

          {mensaje && enviado && (
            <p className="text-sm text-brand flex items-center gap-1.5">
              <Check size={15} />
              Marcado como enviado{tipo === 'solicitud' ? ` el ${fecha(solicitud?.mensaje_enviado_en ?? null)}` : ''}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
