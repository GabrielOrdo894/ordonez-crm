import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { encontrarObraPorContacto } from '../galeria/obras';
import type { Visita } from './types';

// Estado del incentivo del programa de referidos para esta visita (2026-09-13) — solo aparece si
// se rellenó "¿Quién le recomendó?" al darla de alta (o luego desde la ficha de cliente). El
// incentivo al referente se aplica a mano en su próximo presupuesto (LineasEditor no puede saber
// cuál será), esta caja solo avisa de cuándo toca y deja marcarlo hecho para que el aviso de la
// campana de notificaciones no siga saliendo.
export function ReferidoIncentivoBox({ visita }: { visita: Visita }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: obra } = useQuery({
    queryKey: ['galeria', 'obra-por-contacto', visita.id],
    enabled: !!visita.referido_por,
    queryFn: () => encontrarObraPorContacto({ visitaId: visita.id, telefono: visita.telefono, email: visita.email }),
  });

  const marcarAplicadoMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('visitas')
        .update({ referido_incentivo_aplicado_en: new Date().toISOString() })
        .eq('id', visita.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visitas'] });
      toast.success('Incentivo marcado como aplicado');
    },
    onError: (error) => toast.error(error.message),
  });

  if (!visita.referido_por) return null;

  const convertido = !!obra;
  const aplicado = !!visita.referido_incentivo_aplicado_en;

  return (
    <div className="border-t border-gray-200 pt-3">
      <p className="text-gray-400 uppercase tracking-wide text-xs mb-1.5 flex items-center gap-1.5">
        <Gift size={12} />
        Programa de referidos
      </p>
      {aplicado ? (
        <p className="text-xs text-gray-600">
          Referido por <span className="font-medium text-gray-800">{visita.referido_por}</span> — incentivo ya aplicado.
        </p>
      ) : convertido ? (
        <div className="bg-brand-light border border-gray-200 rounded-sm px-3 py-2.5 flex items-center justify-between gap-3">
          <p className="text-xs text-brand">
            Referido por <span className="font-medium">{visita.referido_por}</span> — presupuesto ya aceptado. Aplícale su
            descuento la próxima vez que le hagas un presupuesto.
          </p>
          <Button size="sm" variant="secondary" onClick={() => marcarAplicadoMutation.mutate()} disabled={marcarAplicadoMutation.isPending}>
            Marcar aplicado
          </Button>
        </div>
      ) : (
        <p className="text-xs text-gray-500">
          Referido por <span className="text-gray-700">{visita.referido_por}</span> — todavía sin presupuesto aceptado.
        </p>
      )}
    </div>
  );
}
