import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Search } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../hooks/useToast';
import { useConfirmar } from '../../../hooks/useConfirm';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import type { Proveedor, NuevoProveedor } from './types';
import { buscarEmpresasFrancia, type EmpresaFrancia } from './empresasFrancia';

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
  // 'pagina' es la vista completa usada desde ProveedoresPage (alta/edición) — Gabriel pidió
  // explícitamente que dejara de ser un pop-up (2026-08-22). 'inline' se mantiene igual, la usa
  // GastoForm para dar de alta un proveedor sin salir del formulario de gasto.
  variante?: 'pagina' | 'inline';
};

export function ProveedorForm({ open, onClose, proveedor, onCreado, variante = 'pagina' }: ProveedorFormProps) {
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(vacio());

  const [sugerencias, setSugerencias] = useState<EmpresaFrancia[]>([]);
  const [buscandoEmpresa, setBuscandoEmpresa] = useState(false);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

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
    setSugerencias([]);
    setMostrarSugerencias(false);
  }, [open, proveedor]);

  const esFrancia = form.pais === 'Francia';

  // Búsqueda en la API pública "Recherche d'entreprises" del gobierno francés — solo por nombre o
  // SIRET, solo con Francia seleccionado. Con debounce para no lanzar una petición por tecla, y
  // fallando en silencio: si la búsqueda falla (red, límite de peticiones...) el campo se sigue
  // pudiendo rellenar a mano exactamente igual que antes, nunca debe bloquear el alta.
  function buscarConDebounce(query: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!esFrancia || query.trim().length < 3) {
      setSugerencias([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setBuscandoEmpresa(true);
      try {
        const resultados = await buscarEmpresasFrancia(query);
        setSugerencias(resultados);
        setMostrarSugerencias(true);
      } catch {
        setSugerencias([]);
      } finally {
        setBuscandoEmpresa(false);
      }
    }, 400);
  }

  function elegirEmpresa(empresa: EmpresaFrancia) {
    setForm((f) => ({
      ...f,
      razon_social: empresa.nombre || f.razon_social,
      identificador: empresa.siret || f.identificador,
      direccion: empresa.direccion || f.direccion,
    }));
    setSugerencias([]);
    setMostrarSugerencias(false);
  }

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

  // Nada impedía crear el mismo proveedor dos veces sin darse cuenta (sin constraint en la tabla,
  // sin comprobación en el formulario) — dos altas del mismo proveedor fragmentan sus gastos en
  // dos proveedor_id distintos. Se avisa antes de guardar si ya existe uno con el mismo nombre,
  // pero se deja crear igualmente si el usuario confirma (puede ser un proveedor homónimo real).
  const handleGuardar = async () => {
    if (!proveedor && form.razon_social.trim()) {
      const { data: existentes, error } = await supabase
        .from('proveedores')
        .select('id')
        .ilike('razon_social', form.razon_social.trim());
      if (error) {
        toast.error(error.message);
        return;
      }
      if (existentes && existentes.length > 0) {
        const continuar = await confirmar(
          `Ya existe un proveedor llamado "${form.razon_social.trim()}". ¿Crear uno nuevo de todas formas?`,
        );
        if (!continuar) return;
      }
    }
    guardarMutation.mutate();
  };

  const campos = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Select
        label="País"
        options={[{ value: 'España', label: 'España' }, { value: 'Francia', label: 'Francia' }]}
        value={form.pais}
        onChange={(e) => setForm((f) => ({ ...f, pais: e.target.value }))}
      />
      <div className="relative">
        <Input
          label="Razón social / Nombre"
          value={form.razon_social}
          onChange={(e) => {
            const valor = e.target.value;
            setForm((f) => ({ ...f, razon_social: valor }));
            buscarConDebounce(valor);
          }}
          onFocus={() => sugerencias.length > 0 && setMostrarSugerencias(true)}
          onBlur={() => setTimeout(() => setMostrarSugerencias(false), 150)}
          hint={esFrancia ? 'Escribe el nombre o el SIRET para buscarla en el registro de empresas francesas' : undefined}
        />
        {esFrancia && mostrarSugerencias && (buscandoEmpresa || sugerencias.length > 0) && (
          <div className="absolute z-10 top-full left-0 right-0 mt-1 border border-gray-200 rounded-sm bg-surface shadow-sm overflow-hidden">
            {buscandoEmpresa && <p className="px-3 py-2 text-xs text-gray-400">Buscando...</p>}
            {!buscandoEmpresa &&
              sugerencias.map((empresa) => (
                <button
                  key={empresa.siret || empresa.siren}
                  type="button"
                  onMouseDown={() => elegirEmpresa(empresa)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm border-b border-gray-100 last:border-0 hover:bg-brand-light"
                >
                  <Search size={13} className="text-gray-400 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-gray-900 truncate">{empresa.nombre}</span>
                    <span className="block text-xs text-gray-400 truncate">
                      SIRET {empresa.siret || '—'} · {empresa.direccion || 'Sin dirección'}
                    </span>
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>
      <div className="relative">
        <Input
          label={esFrancia ? 'SIRET' : 'CIF'}
          value={form.identificador}
          onChange={(e) => {
            const valor = e.target.value;
            setForm((f) => ({ ...f, identificador: valor }));
            buscarConDebounce(valor);
          }}
          onFocus={() => sugerencias.length > 0 && setMostrarSugerencias(true)}
          onBlur={() => setTimeout(() => setMostrarSugerencias(false), 150)}
        />
      </div>
      {esFrancia && (
        <Input
          label="TVA"
          value={form.identificador_extra}
          onChange={(e) => setForm((f) => ({ ...f, identificador_extra: e.target.value }))}
          hint="La API de empresas francesas no da el número de TVA — se rellena a mano"
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
          <Button onClick={handleGuardar} disabled={guardarMutation.isPending}>
            {guardarMutation.isPending ? 'Guardando...' : 'Guardar proveedor'}
          </Button>
        </div>
      </div>
    );
  }

  if (!open) return null;

  return (
    <div className="max-w-3xl mx-auto animate-[scale-in_180ms_ease-out]">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-5">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={15} />
          Volver a proveedores
        </button>
        <Button onClick={handleGuardar} disabled={guardarMutation.isPending}>
          {guardarMutation.isPending ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>

      <h1 className="text-xl font-bold text-gray-900 mb-1">{proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}</h1>
      <p className="text-sm text-gray-500 mb-6">
        {esFrancia
          ? 'Busca por nombre o SIRET para autorrellenar los datos desde el registro de empresas francesas.'
          : 'Datos fiscales y de contacto del proveedor.'}
      </p>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">{campos}</div>

      <div className="flex items-center justify-between gap-2 flex-wrap mt-5">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={15} />
          Volver a proveedores
        </button>
        <Button onClick={handleGuardar} disabled={guardarMutation.isPending}>
          {guardarMutation.isPending ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>
    </div>
  );
}
