import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { Input } from '../../components/ui/Input';
import { EditorTexto } from '../../components/ui/EditorTexto';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Table } from '../../components/ui/Table';
import { UNIDADES, getTiposServicio, formatearUnidadTexto } from '../finanzas/lineas';
import type { LineaCatalogo } from '../finanzas/lineas';

type FormLinea = {
  designacion: string;
  referencia: string;
  descripcion: string;
  unidad: string;
  tipo_servicio: string;
  precio_unit: number;
  idioma: string;
};

function vacio(): FormLinea {
  return { designacion: '', referencia: '', descripcion: '', unidad: 'ud', tipo_servicio: '—', precio_unit: 0, idioma: 'es' };
}

const IDIOMAS = [
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
];

export function CatalogoLineasSection() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<LineaCatalogo | null>(null);
  const [form, setForm] = useState<FormLinea>(vacio());
  const [filtroIdioma, setFiltroIdioma] = useState<'todos' | 'es' | 'fr'>('todos');

  const { data: catalogo, isLoading } = useQuery({
    queryKey: ['lineas_catalogo'],
    queryFn: async () => {
      const { data, error } = await supabase.from('lineas_catalogo').select('*').order('designacion');
      if (error) throw error;
      return data as LineaCatalogo[];
    },
  });

  const catalogoFiltrado = (catalogo ?? []).filter((c) => filtroIdioma === 'todos' || c.idioma === filtroIdioma);

  const abrirNueva = () => {
    setEditando(null);
    setForm(vacio());
    setModalAbierto(true);
  };

  const abrirEdicion = (linea: LineaCatalogo) => {
    setEditando(linea);
    setForm({
      designacion: linea.designacion,
      referencia: linea.referencia ?? '',
      descripcion: linea.descripcion ?? '',
      unidad: linea.unidad ?? 'ud',
      tipo_servicio: linea.tipo_servicio ?? '—',
      precio_unit: linea.precio_unit ?? 0,
      idioma: linea.idioma ?? 'es',
    });
    setModalAbierto(true);
  };

  const guardarMutation = useMutation({
    mutationFn: async () => {
      const datos = {
        designacion: form.designacion,
        referencia: form.referencia || null,
        descripcion: form.descripcion || null,
        unidad: form.unidad,
        tipo_servicio: form.tipo_servicio,
        precio_unit: form.precio_unit,
        idioma: form.idioma,
      };
      if (editando) {
        const { error } = await supabase.from('lineas_catalogo').update(datos).eq('id', editando.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('lineas_catalogo').insert(datos);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lineas_catalogo'] });
      toast.success(editando ? 'Línea actualizada' : 'Línea creada');
      setModalAbierto(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const eliminarMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lineas_catalogo').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lineas_catalogo'] });
      toast.success('Línea eliminada');
      setModalAbierto(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div>
      <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Catálogo de líneas</p>
        <Button size="sm" onClick={abrirNueva}>
          <span className="flex items-center gap-1.5">
            <Plus size={14} />
            Nueva línea
          </span>
        </Button>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Líneas preestablecidas que aparecen como sugerencia al escribir en "Designación" dentro de un presupuesto o factura —
        solo se sugieren las del mismo idioma que el documento. Rellenan de golpe referencia, descripción, unidad, tipo de
        servicio y precio.
      </p>

      <div className="flex items-center gap-1 mb-3">
        {(['todos', 'es', 'fr'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setFiltroIdioma(v)}
            className={`px-2.5 py-1 rounded-sm text-xs border ${
              filtroIdioma === v ? 'bg-brand text-white border-brand' : 'bg-surface border-gray-200 text-gray-600 hover:border-brand'
            }`}
          >
            {v === 'todos' ? 'Todos' : v === 'es' ? 'Español' : 'Français'}
          </button>
        ))}
      </div>

      <Table<LineaCatalogo>
        loading={isLoading}
        emptyMessage="Sin líneas guardadas todavía"
        data={catalogoFiltrado}
        onRowClick={abrirEdicion}
        columns={[
          { key: 'designacion', label: 'Designación' },
          { key: 'referencia', label: 'Referencia', render: (r) => r.referencia || '—' },
          { key: 'idioma', label: 'Idioma', render: (r) => (r.idioma === 'fr' ? 'Français' : 'Español') },
          { key: 'tipo_servicio', label: 'Tipo de servicio', render: (r) => r.tipo_servicio || '—' },
          { key: 'unidad', label: 'Unidad', render: (r) => formatearUnidadTexto(r.unidad || 'ud') },
          {
            key: 'precio_unit',
            label: 'Precio',
            render: (r) => (r.precio_unit != null ? `${r.precio_unit.toFixed(2)} €` : '—'),
          },
        ]}
      />

      <Modal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title={editando ? 'Editar línea' : 'Nueva línea'}
        footer={
          <>
            {editando && (
              <Button variant="danger" onClick={() => eliminarMutation.mutate(editando.id)} disabled={eliminarMutation.isPending}>
                Eliminar
              </Button>
            )}
            <Button variant="secondary" onClick={() => setModalAbierto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => guardarMutation.mutate()}
              disabled={guardarMutation.isPending || !form.designacion.trim()}
            >
              {guardarMutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Input
                label="Designación"
                value={form.designacion}
                onChange={(e) => setForm((f) => ({ ...f, designacion: e.target.value }))}
              />
            </div>
            <Select
              label="Idioma"
              options={IDIOMAS}
              value={form.idioma}
              onChange={(e) => setForm((f) => ({ ...f, idioma: e.target.value, tipo_servicio: '—' }))}
            />
          </div>
          <Input
            label="Referencia"
            value={form.referencia}
            onChange={(e) => setForm((f) => ({ ...f, referencia: e.target.value }))}
          />
          <EditorTexto
            label="Descripción"
            rows={4}
            value={form.descripcion}
            onChange={(descripcion) => setForm((f) => ({ ...f, descripcion }))}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="Unidad"
              options={UNIDADES.map((u) => ({ value: u, label: formatearUnidadTexto(u) }))}
              value={form.unidad}
              onChange={(e) => setForm((f) => ({ ...f, unidad: e.target.value }))}
            />
            <Select
              label="Tipo de servicio"
              options={getTiposServicio(form.idioma === 'fr' ? 'fr' : 'es').map((s) => ({ value: s, label: s }))}
              value={form.tipo_servicio}
              onChange={(e) => setForm((f) => ({ ...f, tipo_servicio: e.target.value }))}
            />
            <Input
              label="Precio unit. (sin IVA)"
              type="number"
              value={form.precio_unit}
              onChange={(e) => setForm((f) => ({ ...f, precio_unit: Number(e.target.value) }))}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
