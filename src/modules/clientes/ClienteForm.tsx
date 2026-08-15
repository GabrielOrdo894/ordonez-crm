import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, Star, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { notaSistema } from '../../lib/notaSistema';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { MapsAutocomplete } from '../google/MapsAutocomplete';
import type { NuevaVisita, Visita } from '../visitas/types';

const ZONAS_ES = ['Irún', 'Hondarribia', 'Donostia/San Sebastián', 'Rentería', 'Bera de Bidasoa', 'Otro ES'];
const ZONAS_FR = ['Hendaye', 'Urrugne', 'Saint-Jean-de-Luz', 'Bayonne', 'Autre FR'];

type FormState = {
  nombre: string;
  apellidos: string;
  telefono: string;
  email: string;
  idioma: string;
  direccion: string;
  direccion_extra: string;
  lat: number | null;
  lng: number | null;
  pais: string;
  zona: string;
  esEmpresa: boolean;
  empresaNombre: string;
  empresaCif: string;
};

const EMPTY: FormState = {
  nombre: '', apellidos: '', telefono: '', email: '', idioma: 'Español',
  direccion: '', direccion_extra: '', lat: null, lng: null, pais: 'España', zona: 'Irún',
  esEmpresa: false, empresaNombre: '', empresaCif: '',
};

function zonaDefault(pais: string) {
  return pais === 'España' ? 'Irún' : pais === 'Francia' ? 'Hendaye' : '';
}

type ClienteFormProps = { onClose: () => void; onCreado?: (cliente: Visita) => void };

export function ClienteForm({ onClose, onCreado }: ClienteFormProps) {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const nombreUsuarioActual = (user?.user_metadata?.nombre as string) || user?.email || 'Sistema';
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [clienteRepetidor, setClienteRepetidor] = useState<{ nombre: string; totalObras: number } | null>(null);

  const handlePaisChange = (pais: string) => {
    setForm((f) => ({ ...f, pais, zona: zonaDefault(pais) }));
  };

  const verificarClienteRepetidor = async () => {
    const telefono = form.telefono.trim();
    const email = form.email.trim();
    if (!telefono && !email) {
      setClienteRepetidor(null);
      return;
    }

    let previas: { nombre: string; apellidos: string }[] = [];
    if (telefono) {
      const { data, error } = await supabase
        .from('visitas')
        .select('nombre, apellidos')
        .eq('telefono', telefono)
        .is('eliminado_en', null)
        .order('created_at', { ascending: true });
      if (error) {
        toast.error(error.message);
        return;
      }
      previas = data ?? [];
    }
    if (previas.length === 0 && email) {
      const { data, error } = await supabase
        .from('visitas')
        .select('nombre, apellidos')
        .eq('email', email)
        .is('eliminado_en', null)
        .order('created_at', { ascending: true });
      if (error) {
        toast.error(error.message);
        return;
      }
      previas = data ?? [];
    }

    setClienteRepetidor(previas.length > 0 ? { nombre: `${previas[0].nombre} ${previas[0].apellidos}`, totalObras: previas.length } : null);
  };

  const validar = (): boolean => {
    const nuevosErrores: Partial<Record<keyof FormState, string>> = {};
    if (!form.nombre) nuevosErrores.nombre = 'Obligatorio';
    if (!form.apellidos) nuevosErrores.apellidos = 'Obligatorio';
    if (!form.telefono) nuevosErrores.telefono = 'Obligatorio';
    if (!form.direccion) nuevosErrores.direccion = 'Obligatorio';
    if (form.esEmpresa && !form.empresaNombre) nuevosErrores.empresaNombre = 'Obligatorio';
    if (form.esEmpresa && !form.empresaCif) nuevosErrores.empresaCif = 'Obligatorio';
    setErrors(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  };

  const crearMutation = useMutation({
    mutationFn: async () => {
      const nueva: NuevaVisita = {
        nombre: form.nombre,
        apellidos: form.apellidos,
        telefono: form.telefono,
        email: form.email || null,
        idioma: form.idioma,
        contacto: null,
        direccion: form.direccion,
        direccion_extra: form.direccion_extra || null,
        lat: form.lat,
        lng: form.lng,
        pais: form.pais,
        zona: form.zona,
        tipo: null,
        descripcion: null,
        fecha_visita: null,
        hora_visita: null,
        empleado: null,
        estado: null,
        estado_pipeline: 'Contacto',
        pipeline_etapa_maxima: 'Contacto',
        notas: null,
        google_event_id: null,
        es_empresa: form.esEmpresa,
        empresa_nombre: form.esEmpresa ? form.empresaNombre : null,
        empresa_cif: form.esEmpresa ? form.empresaCif : null,
      };
      const { data, error } = await supabase.from('visitas').insert(nueva).select().single();
      if (error) throw error;
      return data as Visita;
    },
    onSuccess: async (data) => {
      await notaSistema(data.id, `Cliente registrado por ${nombreUsuarioActual}`);
      queryClient.invalidateQueries({ queryKey: ['visitas'] });
      toast.success('Cliente registrado correctamente');
      if (onCreado) onCreado(data);
      else onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleGuardar = () => {
    if (!validar()) return;
    crearMutation.mutate();
  };

  return (
    <div className="max-w-2xl mx-auto animate-[scale-in_180ms_ease-out]">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-5">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={15} />
          Volver a clientes
        </button>
        <Button onClick={handleGuardar} disabled={crearMutation.isPending}>
          {crearMutation.isPending ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>

      <h1 className="text-xl font-bold text-gray-900 mb-1">Nuevo cliente</h1>
      <p className="text-sm text-gray-500 mb-6">Registra los datos de contacto del cliente.</p>

      <div className="flex flex-col gap-4">
        <section className="bg-surface border border-gray-200 rounded-sm p-4">
          <div className="flex items-center gap-2 border-b border-gray-200 pb-2.5 mb-4">
            <span className="w-6 h-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center shrink-0">
              1
            </span>
            <User size={14} className="text-brand" />
            <p className="text-sm font-semibold text-gray-900">Datos del cliente</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Nombre" required value={form.nombre} error={errors.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
            <Input label="Apellidos" required value={form.apellidos} error={errors.apellidos} onChange={(e) => setForm((f) => ({ ...f, apellidos: e.target.value }))} />
            <Input
              label="Teléfono"
              type="tel"
              required
              value={form.telefono}
              error={errors.telefono}
              onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
              onBlur={verificarClienteRepetidor}
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              onBlur={verificarClienteRepetidor}
            />
            {clienteRepetidor && (
              <div className="col-span-2 bg-brand-light border border-gray-200 rounded-sm px-3 py-2 flex items-center gap-2 text-xs text-brand">
                <Star size={14} className="shrink-0" />
                <span>
                  Cliente conocido — {clienteRepetidor.nombre} ya tiene {clienteRepetidor.totalObras} obra(s) registrada(s).
                </span>
              </div>
            )}
            <Select
              label="Idioma"
              options={[{ value: 'Español', label: 'Español' }, { value: 'Français', label: 'Français' }]}
              value={form.idioma}
              onChange={(e) => setForm((f) => ({ ...f, idioma: e.target.value }))}
            />
          </div>
        </section>

        <section className="bg-surface border border-gray-200 rounded-sm p-4">
          <div className="flex items-center gap-2 border-b border-gray-200 pb-2.5 mb-4">
            <span className="w-6 h-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center shrink-0">
              2
            </span>
            <p className="text-sm font-semibold text-gray-900">Dirección</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2">
              <MapsAutocomplete
                label="Dirección completa"
                value={form.direccion}
                error={errors.direccion}
                onChange={(direccion) => setForm((f) => ({ ...f, direccion }))}
                onSelect={(lugar) =>
                  setForm((f) => ({
                    ...f,
                    direccion: lugar.direccion,
                    lat: lugar.lat,
                    lng: lugar.lng,
                    pais: lugar.pais || f.pais,
                    zona: lugar.pais && lugar.pais !== f.pais ? zonaDefault(lugar.pais) : f.zona,
                  }))
                }
              />
            </div>
            <div className="col-span-2">
              <Input
                label="Piso / puerta / referencia (opcional)"
                hint="Ej.: 2º piso, puerta B — étage 4, porte gauche"
                value={form.direccion_extra}
                onChange={(e) => setForm((f) => ({ ...f, direccion_extra: e.target.value }))}
              />
            </div>
            <Select
              label="País"
              required
              options={[{ value: 'España', label: 'España' }, { value: 'Francia', label: 'Francia' }]}
              value={form.pais}
              onChange={(e) => handlePaisChange(e.target.value)}
            />
            <Select
              label="Zona"
              options={(form.pais === 'España' ? ZONAS_ES : ZONAS_FR).map((v) => ({ value: v, label: v }))}
              value={form.zona}
              onChange={(e) => setForm((f) => ({ ...f, zona: e.target.value }))}
            />
          </div>
        </section>

        <section className="bg-surface border border-gray-200 rounded-sm p-4">
          <div className="flex items-center gap-2 border-b border-gray-200 pb-2.5 mb-4">
            <span className="w-6 h-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center shrink-0">
              3
            </span>
            <Building2 size={14} className="text-brand" />
            <p className="text-sm font-semibold text-gray-900">Organización</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
            <input
              type="checkbox"
              checked={form.esEmpresa}
              onChange={(e) => setForm((f) => ({ ...f, esEmpresa: e.target.checked }))}
            />
            El cliente forma parte de una empresa u organización
          </label>
          {form.esEmpresa && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Razón social"
                required
                value={form.empresaNombre}
                error={errors.empresaNombre}
                onChange={(e) => setForm((f) => ({ ...f, empresaNombre: e.target.value }))}
              />
              <Input
                label="CIF / SIRET"
                required
                value={form.empresaCif}
                error={errors.empresaCif}
                onChange={(e) => setForm((f) => ({ ...f, empresaCif: e.target.value }))}
              />
            </div>
          )}
        </section>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap mt-5">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={15} />
          Volver a clientes
        </button>
        <Button onClick={handleGuardar} disabled={crearMutation.isPending}>
          {crearMutation.isPending ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>
    </div>
  );
}
