import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import type { GaleriaProyecto } from './types';

type FormState = {
  titulo: string;
  tipo_obra: string;
  zona: string;
  fecha_obra: string;
  descripcion: string;
  destacado: boolean;
  publicado: boolean;
};

type GaleriaFormProps = {
  open: boolean;
  onClose: () => void;
  proyecto: GaleriaProyecto;
};

// Solo edita fichas ya creadas (título/tipo/zona/fecha/descripción autorrellenados desde la obra
// verificada al crearla) — desde 2026-09-09 la creación en sí ya no admite texto libre, se hace
// eligiendo la obra en GaleriaPage.tsx (ver abrirOCrearFichaGaleria en obras.ts).
export function GaleriaForm({ open, onClose, proyecto }: GaleriaFormProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>({
    titulo: proyecto.titulo ?? '',
    tipo_obra: proyecto.tipo_obra ?? '',
    zona: proyecto.zona ?? '',
    fecha_obra: proyecto.fecha_obra ?? '',
    descripcion: proyecto.descripcion ?? '',
    destacado: proyecto.destacado,
    publicado: proyecto.publicado,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      titulo: proyecto.titulo ?? '',
      tipo_obra: proyecto.tipo_obra ?? '',
      zona: proyecto.zona ?? '',
      fecha_obra: proyecto.fecha_obra ?? '',
      descripcion: proyecto.descripcion ?? '',
      destacado: proyecto.destacado,
      publicado: proyecto.publicado,
    });
  }, [open, proyecto]);

  const guardarMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('galeria')
        .update({
          titulo: form.titulo || null,
          tipo_obra: form.tipo_obra || null,
          zona: form.zona || null,
          fecha_obra: form.fecha_obra || null,
          descripcion: form.descripcion || null,
          destacado: form.destacado,
          publicado: form.publicado,
        })
        .eq('id', proyecto.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['galeria'] });
      toast.success('Proyecto actualizado');
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar datos del proyecto"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => guardarMutation.mutate()} disabled={guardarMutation.isPending || !form.titulo.trim()}>
            {guardarMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Título" required value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Tipo de obra" value={form.tipo_obra} onChange={(e) => setForm((f) => ({ ...f, tipo_obra: e.target.value }))} />
          <Input label="Zona" value={form.zona} onChange={(e) => setForm((f) => ({ ...f, zona: e.target.value }))} />
        </div>
        <Input label="Fecha de la obra" type="date" value={form.fecha_obra} onChange={(e) => setForm((f) => ({ ...f, fecha_obra: e.target.value }))} />
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Descripción</label>
          <textarea
            value={form.descripcion}
            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            className="w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm min-h-[70px] focus:border-brand focus:outline-none"
          />
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-sm text-gray-700">
            <input type="checkbox" checked={form.destacado} onChange={(e) => setForm((f) => ({ ...f, destacado: e.target.checked }))} />
            Destacado
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-700">
            <input type="checkbox" checked={form.publicado} onChange={(e) => setForm((f) => ({ ...f, publicado: e.target.checked }))} />
            Publicado
          </label>
        </div>
      </div>
    </Modal>
  );
}
