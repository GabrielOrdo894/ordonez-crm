import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check, RotateCcw, ExternalLink, MapPin, AlertTriangle, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { useConfirmar } from '../../hooks/useConfirm';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EditorTexto } from '../../components/ui/EditorTexto';
import { fechaCorta } from '../../lib/fechas';
import { parsearTextoEnriquecido } from '../../lib/textoEnriquecido';
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
  const [editandoNota, setEditandoNota] = useState(false);

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

  // Dos queryKeys distintas que invalidar juntas (badge/KPI vs. tabla completa con historial) —
  // invalidateQueries solo empareja por prefijo exacto del array.
  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['presupuestos', 'pendientes-envio'] });
    queryClient.invalidateQueries({ queryKey: ['presupuestos', 'mensajes-envio'] });
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
      setEditandoNota(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const copiarMensaje = () => {
    if (!presupuesto?.mensaje_pendiente_texto) return;
    navigator.clipboard.writeText(presupuesto.mensaje_pendiente_texto);
    toast.success('Mensaje copiado');
  };

  const handleModificarNota = async () => {
    const continuar = await confirmar({
      titulo: 'Modificar nota interna',
      mensaje: 'Vas a modificar la nota interna de este presupuesto. El cambio se guarda de forma permanente. ¿Quieres continuar?',
      textoConfirmar: 'Modificar',
      textoCancelar: 'Cancelar',
      peligroso: false,
    });
    if (continuar) setEditandoNota(true);
  };

  if (cargandoPresupuesto || !presupuesto) return null;

  const enviado = !!presupuesto.mensaje_pendiente_enviado_en;

  const advertencias: string[] = [];
  if (!presupuesto.cliente_tel) advertencias.push('Falta el teléfono del cliente — imprescindible para enviar por WhatsApp/SMS.');
  if (!presupuesto.cliente_email) advertencias.push('Falta el email del cliente.');
  if (!presupuesto.visita_id) advertencias.push('Este presupuesto no está vinculado a ninguna visita técnica.');
  if (!presupuesto.mensaje_pendiente_texto) advertencias.push('No hay ningún mensaje redactado todavía.');

  return (
    <div>
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

      {advertencias.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-sm p-3 mb-4">
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-1">
            <AlertTriangle size={13} />
            Antes de enviarlo, ten en cuenta
          </p>
          <ul className="text-xs text-amber-800 list-disc pl-5 space-y-0.5">
            {advertencias.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <div className="border border-gray-200 rounded-sm">
            <div className="bg-brand-light px-3 py-2 flex items-center justify-between">
              <p className="text-xs text-gray-500">Mensaje a enviar</p>
              <Button size="sm" variant="secondary" onClick={copiarMensaje} disabled={!presupuesto.mensaje_pendiente_texto}>
                <span className="flex items-center gap-1.5">
                  <Copy size={12} />
                  Copiar
                </span>
              </Button>
            </div>
            <div className="p-3">
              <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">
                {presupuesto.mensaje_pendiente_texto || '(sin mensaje)'}
              </p>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-sm p-3 text-xs text-amber-800">
            Recuerda adjuntar el presupuesto en PDF al enviar este mensaje — el CRM no lo adjunta por ti.
          </div>

          <div className="bg-surface border border-gray-200 rounded-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Nota interna</p>
              {!editandoNota && (
                <button onClick={handleModificarNota} className="text-xs text-gray-500 hover:text-brand flex items-center gap-1">
                  <Pencil size={11} />
                  Modificar
                </button>
              )}
            </div>
            {editandoNota ? (
              <>
                <EditorTexto
                  value={notaLocal}
                  onChange={setNotaLocal}
                  placeholder="Cosas a tener en cuenta al enviar este mensaje — nunca de cara al cliente."
                  rows={4}
                />
                <div className="flex items-center gap-2 mt-2">
                  <Button size="sm" onClick={() => notaMutation.mutate(notaLocal)} disabled={notaMutation.isPending}>
                    Guardar
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setNotaLocal(presupuesto.nota_interna ?? '');
                      setEditandoNota(false);
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </>
            ) : presupuesto.nota_interna ? (
              <div className="text-sm text-gray-700">
                {parsearTextoEnriquecido(presupuesto.nota_interna).map((bloque, idx) => (
                  <p key={idx} className={`whitespace-pre-wrap ${bloque.negrita ? 'font-semibold' : ''} ${bloque.cursiva ? 'italic' : ''}`}>
                    {bloque.texto}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Sin nota interna.</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-surface border border-gray-200 rounded-sm p-4 text-sm text-gray-700 space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Datos de contacto</p>
            <p>
              <span className="text-gray-400">Cliente:</span> {presupuesto.cliente_nombre || '—'}
            </p>
            <p>
              <span className="text-gray-400">Teléfono:</span> {presupuesto.cliente_tel || '—'}
            </p>
            <p>
              <span className="text-gray-400">Email:</span> {presupuesto.cliente_email || '—'}
            </p>
            <p>
              <span className="text-gray-400">Idioma:</span> {presupuesto.idioma || '—'}
            </p>
          </div>

          {visita && (
            <div className="bg-surface border border-gray-200 rounded-sm p-4 text-sm text-gray-700 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1 flex items-center gap-1.5">
                <MapPin size={12} />
                Visita técnica
              </p>
              <p>
                <span className="text-gray-400">Fecha:</span> {fechaCorta(visita.fecha_visita)}
                {visita.hora_visita ? ` · ${visita.hora_visita.slice(0, 5)}` : ''}
              </p>
              <p>
                <span className="text-gray-400">Estado:</span> {visita.estado ?? '—'} ·{' '}
                <span className="text-gray-400">Zona:</span> {visita.zona ?? '—'}
              </p>
              <p>
                <span className="text-gray-400">Dirección:</span>{' '}
                {[visita.direccion, visita.direccion_extra].filter(Boolean).join(' — ') || '—'}
              </p>
            </div>
          )}

          <div className="bg-surface border border-gray-200 rounded-sm p-3.5">
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

          <div className="flex flex-col gap-2">
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
      </div>
    </div>
  );
}
