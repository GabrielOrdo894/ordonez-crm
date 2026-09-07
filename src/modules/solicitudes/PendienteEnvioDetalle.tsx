import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check, RotateCcw, ExternalLink, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { useConfirmar } from '../../hooks/useConfirm';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { fechaCorta } from '../../lib/fechas';
import type { Visita } from '../visitas/types';

type PresupuestoPendienteDetalle = {
  id: string;
  numero: string | null;
  tipo: string | null;
  estado: string;
  cliente_nombre: string | null;
  cliente_tel: string | null;
  cliente_email: string | null;
  idioma: string | null;
  visita_id: string | null;
  mensaje_pendiente_texto: string | null;
  mensaje_pendiente_enviado_en: string | null;
  nota_interna: string | null;
};

type PendienteEnvioDetalleProps = {
  id: string;
  onClose: () => void;
};

export function PendienteEnvioDetalle({ id, onClose }: PendienteEnvioDetalleProps) {
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: presupuesto, isLoading: cargandoPresupuesto } = useQuery({
    queryKey: ['presupuestos', 'pendiente-envio', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select(
          'id, numero, tipo, estado, cliente_nombre, cliente_tel, cliente_email, idioma, visita_id, mensaje_pendiente_texto, mensaje_pendiente_enviado_en, nota_interna',
        )
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as PresupuestoPendienteDetalle;
    },
  });

  const { data: visita } = useQuery({
    queryKey: ['visitas', presupuesto?.visita_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('visitas').select('*').eq('id', presupuesto!.visita_id!).single();
      if (error) throw error;
      return data as Visita;
    },
    enabled: !!presupuesto?.visita_id,
  });

  const [notaLocal, setNotaLocal] = useState('');
  useEffect(() => {
    setNotaLocal(presupuesto?.nota_interna ?? '');
  }, [presupuesto?.nota_interna]);

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['presupuestos', 'pendientes-envio'] });
    queryClient.invalidateQueries({ queryKey: ['presupuestos', 'pendiente-envio', id] });
  };

  const marcarEnviadoMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('presupuestos')
        .update({ mensaje_pendiente_enviado_en: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success('Marcado como enviado');
    },
    onError: (error) => toast.error(error.message),
  });

  const volverAPendienteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('presupuestos').update({ mensaje_pendiente_enviado_en: null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success('Vuelto a pendiente de enviar');
    },
    onError: (error) => toast.error(error.message),
  });

  const quitarMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('presupuestos')
        .update({ mensaje_pendiente_texto: null, mensaje_pendiente_enviado_en: null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success('Quitado de pendientes de enviar');
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const notaMutation = useMutation({
    mutationFn: async (valor: string) => {
      const { error } = await supabase.from('presupuestos').update({ nota_interna: valor || null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success('Nota interna guardada');
    },
    onError: (error) => toast.error(error.message),
  });

  const copiarMensaje = () => {
    if (!presupuesto?.mensaje_pendiente_texto) return;
    navigator.clipboard.writeText(presupuesto.mensaje_pendiente_texto);
    toast.success('Mensaje copiado');
  };

  if (cargandoPresupuesto || !presupuesto) return null;

  const enviado = !!presupuesto.mensaje_pendiente_enviado_en;

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4">
        <ArrowLeft size={15} />
        Volver a Pendientes de enviar
      </button>

      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Mensaje pendiente — {presupuesto.numero ?? 'S/N'}</h1>
          <p className="text-sm text-gray-500">{presupuesto.cliente_nombre || '(sin nombre)'}</p>
        </div>
        <Badge variant={enviado ? 'realizada' : 'pendiente'}>{enviado ? 'Enviado' : 'Pendiente'}</Badge>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4 mb-4 text-sm text-gray-700 space-y-1.5">
        <p>
          <span className="text-gray-400">Cliente:</span> {presupuesto.cliente_nombre || '—'}
        </p>
        <p>
          <span className="text-gray-400">Teléfono:</span> {presupuesto.cliente_tel || '—'} ·{' '}
          <span className="text-gray-400">Email:</span> {presupuesto.cliente_email || '—'}
        </p>
        <p>
          <span className="text-gray-400">Idioma:</span> {presupuesto.idioma || '—'}
        </p>
      </div>

      {visita && (
        <div className="bg-surface border border-gray-200 rounded-sm p-4 mb-4 text-sm text-gray-700 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1 flex items-center gap-1.5">
            <MapPin size={12} />
            Visita técnica
          </p>
          <p>
            <span className="text-gray-400">Fecha:</span> {fechaCorta(visita.fecha_visita)}
            {visita.hora_visita ? ` · ${visita.hora_visita.slice(0, 5)}` : ''} ·{' '}
            <span className="text-gray-400">Estado:</span> {visita.estado ?? '—'}
          </p>
          <p>
            <span className="text-gray-400">Dirección:</span>{' '}
            {[visita.direccion, visita.direccion_extra].filter(Boolean).join(' — ') || '—'}
          </p>
        </div>
      )}

      <div className="border border-gray-200 rounded-sm mb-4">
        <div className="bg-brand-light px-3 py-2 flex items-center justify-between">
          <p className="text-xs text-gray-500">Mensaje a enviar</p>
          <Button size="sm" variant="secondary" onClick={copiarMensaje}>
            <span className="flex items-center gap-1.5">
              <Copy size={12} />
              Copiar
            </span>
          </Button>
        </div>
        <div className="p-3">
          <p className="text-sm text-gray-900 whitespace-pre-wrap">{presupuesto.mensaje_pendiente_texto || '(sin mensaje)'}</p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-sm p-3 mb-4 text-xs text-amber-800">
        Recuerda adjuntar el presupuesto en PDF al enviar este mensaje — el CRM no lo adjunta por ti.
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4 mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Nota interna</p>
        <textarea
          value={notaLocal}
          onChange={(e) => setNotaLocal(e.target.value)}
          placeholder="Cosas a tener en cuenta al enviar este mensaje — nunca de cara al cliente."
          className="w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm min-h-[70px] focus:border-brand focus:outline-none"
        />
        {notaLocal !== (presupuesto.nota_interna ?? '') && (
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => notaMutation.mutate(notaLocal)} disabled={notaMutation.isPending}>
            Guardar nota
          </Button>
        )}
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-3.5 mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Relaciones</p>
        <button
          onClick={() => navigate('/finanzas/presupuestos', { state: { verDocId: presupuesto.id, verDocTipo: 'presupuesto' } })}
          className="flex items-center justify-between w-full text-left px-2.5 py-1.5 rounded-sm hover:bg-brand-light text-sm"
        >
          <span>
            Presupuesto {presupuesto.numero ?? 'S/N'} <span className="text-gray-400">· {presupuesto.estado}</span>
          </span>
          <ExternalLink size={13} className="text-gray-400" />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {enviado ? (
          <Button variant="secondary" onClick={() => volverAPendienteMutation.mutate()} disabled={volverAPendienteMutation.isPending}>
            <span className="flex items-center gap-1.5">
              <RotateCcw size={14} />
              Volver a pendiente
            </span>
          </Button>
        ) : (
          <Button onClick={() => marcarEnviadoMutation.mutate()} disabled={marcarEnviadoMutation.isPending}>
            <span className="flex items-center gap-1.5">
              <Check size={14} />
              Marcar como enviado
            </span>
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={async () => {
            if (await confirmar('¿Quitar este mensaje de pendientes de enviar? El presupuesto no se elimina.')) quitarMutation.mutate();
          }}
          disabled={quitarMutation.isPending}
        >
          Quitar de pendientes
        </Button>
      </div>
    </div>
  );
}
