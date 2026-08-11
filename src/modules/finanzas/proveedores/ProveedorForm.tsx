import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../hooks/useToast';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import type { Proveedor, NuevoProveedor } from './types';

type FormState = {
  pais: string;
  razon_social: string;
  identificador: string;
  identificador_extra: string;
  direccion: string;
  telefono: string;
  email: string;
};

function vacio(): FormState {
  return {
    pais: 'España',
    razon_social: '',
    identificador: '',
    identificador_extra: '',
    direccion: '',
    telefono: '',
    email: '',
  };
}

type ProveedorFormProps = {
  open: boolean;
  onClose: () => void;
  proveedor?: Proveedor | null;
  onCreado?: (proveedor: Proveedor) => void;
  variante?: 'modal' | 'inline';
};

export function ProveedorForm({ open, onClose, proveedor, onCreado, variante = 'modal' }: ProveedorFormProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(vacio());

  useEffect(() => {
    if (!open) return;
    if (proveedor) {
      setForm({
        pais: proveedor.pais ?? 'España',
        razon_social: proveedor.razon_social ?? '',
        identificador: proveedor.identificador ?? '',
        identificador_extra: proveedor.identificador_extra ?? '',
        direccion: proveedor.direccion ?? '',
        telefono: proveedor.telefono ?? '',
        email: proveedor.email ?? '',
      });
    } else {
      setForm(vacio());
    }
  }, [open, proveedor]);

  const guardarMutation = useMutation({
    mutationFn: async () => {
      const nuevo: NuevoProveedor = {
        pais: form.pais,
        razon_social: form.razon_social || null,
        identificador: form.identificador || null,
        identificador_extra: form.identificador_extra || null,
        direccion: form.direccion || null,
        telefono: form.telefono || null,
        email: form.email || null,
      };

      if (proveedor) {
        const { error } = await supabase.from('proveedores').update(nuevo).eq('id', proveedor.id);
        if (error) throw error;
        return { ...proveedor, ...nuevo } as Proveedor;
      }
      const { data, error } = await supabase.from('proveedores').insert(nuevo).select().single();
      if (error) throw error;
      return data as Proveedor;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      toast.success(proveedor ? 'Proveedor actualizado' : 'Proveedor creado');
      onCreado?.(data);
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const esFrancia = form.pais === 'Francia';

  const campos = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Select
        label="País"
        options={[{ value: 'España', label: 'España' }, { value: 'Francia', label: 'Francia' }]}
        value={form.pais}
        onChange={(e) => setForm((f) => ({ ...f, pais: e.target.value }))}
      />
      <Input
        label="Razón social / Nombre"
        value={form.razon_social}
        onChange={(e) => setForm((f) => ({ ...f, razon_social: e.target.value }))}
      />
      <Input
        label={esFrancia ? 'SIRET' : 'CIF'}
        value={form.identificador}
        onChange={(e) => setForm((f) => ({ ...f, identificador: e.target.value }))}
      />
      {esFrancia && (
        <Input
          label="TVA"
          value={form.identificador_extra}
          onChange={(e) => setForm((f) => ({ ...f, identificador_extra: e.target.value }))}
        />
      )}
      <div className="col-span-2">
        <Input label="Dirección" value={form.direccion} onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))} />
      </div>
      <Input label="Teléfono" value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
      <Input label="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
    </div>
  );

  if (variante === 'inline') {
    return (
      <div>
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-3">
          <ArrowLeft size={15} />
          Volver al gasto
        </button>
        <p className="text-sm font-semibold text-gray-900 mb-3">{proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}</p>
        {campos}
        <div className="flex justify-end gap-2 flex-wrap mt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => guardarMutation.mutate()} disabled={guardarMutation.isPending}>
            {guardarMutation.isPending ? 'Guardando...' : 'Guardar proveedor'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => guardarMutation.mutate()} disabled={guardarMutation.isPending}>
            {guardarMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </>
      }
    >
      {campos}
    </Modal>
  );
}
