import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { mensajeError } from '../../lib/mensajeError';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

type FormManual = { titulo: string; tipo_obra: string; zona: string; fecha_obra: string; descripcion: string };

function formManualVacio(): FormManual {
  return { titulo: '', tipo_obra: '', zona: '', fecha_obra: '', descripcion: '' };
}

// Fallback manual (2026-09-09, petición de Gabriel): si la obra real no aparece en el desplegable
// de /galeria (caso raro no cubierto por presupuesto/factura, ej. fotos de referencia de un
// proveedor), se puede crear la ficha a mano — sin presupuesto_id/factura_id.
export default function GaleriaNuevaPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormManual>(formManualVacio());

  const crearManualMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('galeria')
        .insert({
          visita_id: null,
          proyecto_id: null,
          presupuesto_id: null,
          factura_id: null,
          titulo: form.titulo || null,
          tipo_obra: form.tipo_obra || null,
          zona: form.zona || null,
          fecha_obra: form.fecha_obra || null,
          descripcion: form.descripcion || null,
          fotos: [],
          destacado: false,
          publicado: false,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['galeria'] });
      toast.success('Ficha creada');
      navigate(`/galeria/${id}`);
    },
    onError: (error) => toast.error(mensajeError(error, 'No se pudo crear la ficha')),
  });

  return (
    <div className="max-w-2xl">
      <button onClick={() => navigate('/galeria')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4">
        <ArrowLeft size={15} />
        Volver a Galería
      </button>

      <h1 className="text-lg font-semibold text-gray-900 mb-1">Crear ficha manualmente</h1>
      <p className="text-sm text-gray-500 mb-5">
        Solo para casos que la lista de obras no cubre (ej. fotos de referencia de un proveedor) — no queda vinculada a
        ningún presupuesto ni factura.
      </p>

      <div className="bg-surface border border-gray-200 rounded-sm p-4 flex flex-col gap-3">
        <Input label="Título" required value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Tipo de obra" value={form.tipo_obra} onChange={(e) => setForm((f) => ({ ...f, tipo_obra: e.target.value }))} />
          <Input label="Zona" value={form.zona} onChange={(e) => setForm((f) => ({ ...f, zona: e.target.value }))} />
        </div>
        <Input
          label="Fecha"
          type="date"
          value={form.fecha_obra}
          onChange={(e) => setForm((f) => ({ ...f, fecha_obra: e.target.value }))}
        />
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Descripción</label>
          <textarea
            value={form.descripcion}
            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            className="w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm min-h-[80px] focus:border-brand focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button onClick={() => crearManualMutation.mutate()} disabled={crearManualMutation.isPending || !form.titulo.trim()}>
            {crearManualMutation.isPending ? 'Creando...' : 'Crear'}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/galeria')}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
