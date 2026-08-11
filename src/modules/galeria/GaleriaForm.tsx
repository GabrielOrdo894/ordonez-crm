import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import type { GaleriaProyecto, NuevaGaleriaProyecto } from './types';

type FormState = {
  titulo: string;
  tipo_obra: string;
  zona: string;
  fecha_obra: string;
  descripcion: string;
  destacado: boolean;
  publicado: boolean;
};

function vacio(): FormState {
  return { titulo: '', tipo_obra: '', zona: '', fecha_obra: '', descripcion: '', destacado: false, publicado: false };
}

type GaleriaFormProps = {
  open: boolean;
  onClose: () => void;
  proyecto?: GaleriaProyecto | null;
  visitaPrefill?: { visita_id: string; titulo: string; tipo_obra: string; zona: string } | null;
  onCreado?: (id: string) => void;
  variante?: 'modal' | 'inline';
};

export function GaleriaForm({ open, onClose, proyecto, visitaPrefill, onCreado, variante = 'modal' }: GaleriaFormProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(vacio());

  useEffect(() => {
    if (!open) return;
    if (proyecto) {
      setForm({
        titulo: proyecto.titulo ?? '',
        tipo_obra: proyecto.tipo_obra ?? '',
        zona: proyecto.zona ?? '',
        fecha_obra: proyecto.fecha_obra ?? '',
        descripcion: proyecto.descripcion ?? '',
        destacado: proyecto.destacado,
        publicado: proyecto.publicado,
      });
    } else if (visitaPrefill) {
      setForm({ ...vacio(), titulo: visitaPrefill.titulo, tipo_obra: visitaPrefill.tipo_obra, zona: visitaPrefill.zona });
    } else {
      setForm(vacio());
    }
  }, [open, proyecto, visitaPrefill]);

  const guardarMutation = useMutation({
    mutationFn: async () => {
      const datos: Partial<NuevaGaleriaProyecto> = {
        titulo: form.titulo || null,
        tipo_obra: form.tipo_obra || null,
        zona: form.zona || null,
        fecha_obra: form.fecha_obra || null,
        descripcion: form.descripcion || null,
        destacado: form.destacado,
        publicado: form.publicado,
      };

      if (proyecto) {
        const { error } = await supabase.from('galeria').update(datos).eq('id', proyecto.id);
        if (error) throw error;
        return proyecto.id;
      }

      const { data, error } = await supabase
        .from('galeria')
        .insert({ ...datos, visita_id: visitaPrefill?.visita_id ?? null, proyecto_id: null, fotos: [] })
        .select()
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['galeria'] });
      toast.success(proyecto ? 'Proyecto actualizado' : 'Proyecto añadido a la galería');
      onClose();
      onCreado?.(id);
    },
    onError: (error) => toast.error(error.message),
  });

  if (variante === 'inline' && !open) return null;

  const campos = (
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
  );

  if (variante === 'inline') {
    return (
      <div className="max-w-2xl mx-auto animate-[scale-in_180ms_ease-out]">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-5">
          <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeft size={15} />
            Volver a galería
          </button>
          <Button onClick={() => guardarMutation.mutate()} disabled={guardarMutation.isPending || !form.titulo.trim()}>
            {guardarMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">{proyecto ? 'Editar proyecto' : 'Añadir proyecto a la galería'}</h1>
        <p className="text-sm text-gray-500 mb-6">Completa los datos del proyecto para mostrarlo en la galería.</p>
        <section className="bg-surface border border-gray-200 rounded-sm p-5">{campos}</section>

        <div className="flex items-center justify-between gap-2 flex-wrap mt-5">
          <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeft size={15} />
            Volver a galería
          </button>
          <Button onClick={() => guardarMutation.mutate()} disabled={guardarMutation.isPending || !form.titulo.trim()}>
            {guardarMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={proyecto ? 'Editar proyecto' : 'Añadir proyecto a la galería'}
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
      {campos}
    </Modal>
  );
}
