import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cambiarEstadoVisita } from './cambiarEstadoVisita';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useConfirmarConMotivo } from '../../hooks/useConfirm';
import { Button } from '../../components/ui/Button';
import { VisitaDetalleContenido } from './VisitaDetalleContenido';
import type { Visita } from './types';
import type { VisitaModalContext } from '../../components/layout/AppLayout';

export default function VisitaDetallePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { abrirEditarVisita } = useOutletContext<VisitaModalContext>();
  const toast = useToast();
  const confirmarConMotivo = useConfirmarConMotivo();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const nombreUsuarioActual = (user?.user_metadata?.nombre as string) || user?.email || 'Sistema';

  const { data: visita, isLoading } = useQuery({
    queryKey: ['visitas', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('visitas').select('*').eq('id', id).single();
      if (error) throw error;
      return data as Visita;
    },
  });

  const cancelarVisitaMutation = useMutation({
    mutationFn: async ({ v, motivo }: { v: Visita; motivo: string }) => {
      const avisos = await cambiarEstadoVisita(v, 'Cancelada', { motivo, usuario: nombreUsuarioActual });
      avisos.forEach((aviso) => toast.warning(aviso));
    },
    onSuccess: () => toast.success('Visita cancelada'),
    onError: (error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['visitas'] }),
  });

  if (isLoading) {
    return <div className="h-96 bg-surface border border-gray-200 rounded-sm animate-pulse" />;
  }

  if (!visita) {
    return <p className="text-sm text-gray-400">Visita no encontrada.</p>;
  }

  const puedeCancelar = visita.estado !== 'Cancelada';

  const acciones = (
    <div className="flex items-center gap-2">
      <Button variant="secondary" onClick={() => abrirEditarVisita(visita)}>
        Modificar
      </Button>
      <Button variant="secondary" onClick={() => navigate(`/visitas/${visita.id}/reprogramar`)}>
        Reprogramar
      </Button>
      {puedeCancelar && (
        <Button
          variant="danger"
          onClick={async () => {
            const motivo = await confirmarConMotivo({
              titulo: `¿Cancelar la visita de ${visita.nombre} ${visita.apellidos}?`,
              mensaje: 'Esta acción marcará la visita como cancelada.',
              motivoLabel: 'Motivo (opcional)',
              motivoPlaceholder: 'Cliente canceló, no contactable, reprogramación…',
              textoConfirmar: 'Cancelar visita',
            });
            if (motivo === null) return;
            cancelarVisitaMutation.mutate({ v: visita, motivo });
          }}
        >
          Cancelar visita
        </Button>
      )}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <button
          onClick={() => navigate('/calendario')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft size={15} />
          Volver al calendario
        </button>
        {acciones}
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-5">
        <h1 className="text-lg font-semibold text-gray-900 pb-3 mb-4 border-b border-gray-200">
          {visita.nombre} {visita.apellidos}
        </h1>
        <VisitaDetalleContenido visita={visita} />
      </div>

      <div className="flex justify-end mt-4">{acciones}</div>
    </div>
  );
}
