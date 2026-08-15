import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { useConfirmar } from '../../hooks/useConfirm';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Table } from '../../components/ui/Table';
import { AccionesFila, type AccionRapida } from '../../components/ui/AccionesFila';
import { cuentaLabel } from '../finanzas/gastos/categorias';
import { CUENTAS_FR } from '../finanzas/gastos/types';
import {
  amortizacionAcumulada,
  calcularDotacionAnual,
  generarDotacionEjercicio,
  valorNetoContable,
  type ActivoInmovilizado,
} from '../../lib/inmovilizado';

const CUENTAS_INMOVILIZADO = CUENTAS_FR.filter((c) => c.value.startsWith('20') || c.value.startsWith('21') || c.value === '231');

type FormState = {
  descripcion: string;
  cuenta_pcg: string;
  fecha_adquisicion: string;
  valor_adquisicion: number;
  duracion_anios: number;
};

function vacio(): FormState {
  return { descripcion: '', cuenta_pcg: CUENTAS_INMOVILIZADO[0]?.value ?? '2183', fecha_adquisicion: new Date().toISOString().slice(0, 10), valor_adquisicion: 0, duracion_anios: 5 };
}

function ActivoForm({ open, onClose, activo }: { open: boolean; onClose: () => void; activo?: ActivoInmovilizado | null }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(vacio());

  useEffect(() => {
    if (!open) return;
    if (activo) {
      setForm({
        descripcion: activo.descripcion,
        cuenta_pcg: activo.cuenta_pcg,
        fecha_adquisicion: activo.fecha_adquisicion,
        valor_adquisicion: activo.valor_adquisicion,
        duracion_anios: activo.duracion_anios,
      });
    } else {
      setForm(vacio());
    }
  }, [open, activo]);

  const guardarMutation = useMutation({
    mutationFn: async () => {
      const nuevo = {
        descripcion: form.descripcion || null,
        cuenta_pcg: form.cuenta_pcg,
        fecha_adquisicion: form.fecha_adquisicion,
        valor_adquisicion: form.valor_adquisicion,
        duracion_anios: form.duracion_anios,
      };
      if (activo) {
        const { error } = await supabase.from('inmovilizado').update(nuevo).eq('id', activo.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('inmovilizado').insert(nuevo);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inmovilizado'] });
      toast.success(activo ? 'Activo actualizado' : 'Activo dado de alta');
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={activo ? 'Editar activo' : 'Nuevo activo (inmovilizado)'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => guardarMutation.mutate()} disabled={guardarMutation.isPending || !form.descripcion.trim()}>
            {guardarMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="col-span-2">
          <Input label="Descripción" value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
        </div>
        <Select
          label="Cuenta PCG"
          options={CUENTAS_INMOVILIZADO.map((c) => ({ value: c.value, label: c.label }))}
          value={form.cuenta_pcg}
          onChange={(e) => setForm((f) => ({ ...f, cuenta_pcg: e.target.value }))}
        />
        <Input
          label="Fecha de adquisición"
          type="date"
          value={form.fecha_adquisicion}
          onChange={(e) => setForm((f) => ({ ...f, fecha_adquisicion: e.target.value }))}
        />
        <Input
          label="Valor de adquisición (€)"
          type="number"
          value={form.valor_adquisicion}
          onChange={(e) => setForm((f) => ({ ...f, valor_adquisicion: Number(e.target.value) }))}
        />
        <Input
          label="Duración de amortización (años)"
          type="number"
          value={form.duracion_anios}
          onChange={(e) => setForm((f) => ({ ...f, duracion_anios: Number(e.target.value) }))}
        />
      </div>
    </Modal>
  );
}

export function TabInmovilizado() {
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<ActivoInmovilizado | null>(null);
  const anioActual = new Date().getFullYear();

  const { data: activos, isLoading } = useQuery({
    queryKey: ['inmovilizado'],
    queryFn: async () => {
      const { data, error } = await supabase.from('inmovilizado').select('*').order('fecha_adquisicion', { ascending: true });
      if (error) throw error;
      return data as ActivoInmovilizado[];
    },
  });

  const generarMutation = useMutation({
    mutationFn: (activo: ActivoInmovilizado) => generarDotacionEjercicio(activo, anioActual),
    onSuccess: (resultado) => {
      queryClient.invalidateQueries({ queryKey: ['gastos'] });
      queryClient.invalidateQueries({ queryKey: ['asientos_contables'] });
      if (resultado === 'generada') toast.success(`Dotación del ${anioActual} generada`);
      if (resultado === 'ya_existia') toast.warning(`Ya había una dotación generada para el ${anioActual}`);
      if (resultado === 'sin_importe') toast.warning('No hay importe que amortizar este año (fuera de la vida útil)');
    },
    onError: (error) => toast.error(error.message),
  });

  const handleBaja = async (activo: ActivoInmovilizado) => {
    const confirmado = await confirmar({
      titulo: 'Dar de baja el activo',
      mensaje: `"${activo.descripcion}" dejará de amortizarse a partir de hoy. Esto no borra las dotaciones ya generadas.`,
      textoConfirmar: 'Dar de baja',
    });
    if (!confirmado) return;
    const { error } = await supabase.from('inmovilizado').update({ dado_de_baja_en: new Date().toISOString().slice(0, 10) }).eq('id', activo.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['inmovilizado'] });
    toast.success('Activo dado de baja');
  };

  const filas = useMemo(
    () =>
      (activos ?? []).map((a) => ({
        ...a,
        dotacionEsteAnio: calcularDotacionAnual(a, anioActual),
        acumulada: amortizacionAcumulada(a, anioActual),
        vnc: valorNetoContable(a, anioActual),
      })),
    [activos, anioActual],
  );

  const totales = useMemo(
    () => ({
      valorBruto: filas.reduce((s, f) => s + f.valor_adquisicion, 0),
      acumulada: filas.reduce((s, f) => s + f.acumulada, 0),
      vnc: filas.reduce((s, f) => s + f.vnc, 0),
    }),
    [filas],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <p className="text-xs text-gray-500 leading-relaxed max-w-2xl">
          Registro de inmovilizado (activos amortizables) — alimenta directamente los tableaux 2054/2055 de la liasse
          fiscale. La amortización es lineal, prorrateada por meses completos desde la fecha de adquisición. "Generar
          dotación" crea el gasto del año en cuenta 681 y su asiento en el libro diario, igual que si lo hicieras a
          mano en Gastos.
        </p>
        <Button onClick={() => { setEditando(null); setFormAbierto(true); }}>
          <Plus size={14} className="inline mr-1 -mt-0.5" />
          Nuevo activo
        </Button>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden">
        <Table
          loading={isLoading}
          data={filas}
          emptyMessage="Sin activos registrados todavía"
          onRowClick={(a) => { setEditando(a); setFormAbierto(true); }}
          columns={[
            { key: 'descripcion', label: 'Descripción' },
            { key: 'cuenta_pcg', label: 'Cuenta', render: (a) => cuentaLabel(a.cuenta_pcg) },
            { key: 'fecha_adquisicion', label: 'Adquisición' },
            { key: 'valor_adquisicion', label: 'Valor bruto', render: (a) => `${a.valor_adquisicion.toFixed(2)} €` },
            { key: 'acumulada', label: `Amort. acum. ${anioActual}`, render: (a) => `${a.acumulada.toFixed(2)} €` },
            { key: 'vnc', label: 'Valor neto contable', render: (a) => `${a.vnc.toFixed(2)} €` },
            { key: 'baja', label: 'Baja', render: (a) => a.dado_de_baja_en ?? '—' },
            {
              key: 'acciones',
              label: '',
              sortable: false,
              render: (a) => (
                <AccionesFila
                  rapidas={
                    [
                      {
                        icon: Sparkles,
                        label: `Generar dotación ${anioActual}`,
                        tono: 'brand',
                        onClick: () => generarMutation.mutate(a),
                      },
                      ...(a.dado_de_baja_en
                        ? []
                        : [{ icon: Trash2, label: 'Dar de baja', tono: 'peligro' as const, onClick: () => handleBaja(a) }]),
                    ] as AccionRapida[]
                  }
                  menu={[]}
                />
              ),
            },
          ]}
        />
      </div>

      {filas.length > 0 && (
        <div className="bg-brand-light rounded-sm px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Valor bruto total</p>
            <p className="text-sm text-gray-900">{totales.valorBruto.toFixed(2)} €</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Amortización acumulada</p>
            <p className="text-sm text-gray-900">{totales.acumulada.toFixed(2)} €</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-gray-500">Valor neto contable</p>
            <p className="text-base font-semibold text-brand">{totales.vnc.toFixed(2)} €</p>
          </div>
        </div>
      )}

      <ActivoForm open={formAbierto} onClose={() => setFormAbierto(false)} activo={editando} />
    </div>
  );
}
