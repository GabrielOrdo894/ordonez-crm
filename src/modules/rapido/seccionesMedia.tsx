import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { optimizarImagen } from '../../lib/optimizarImagen';
import type { NuevoGasto } from '../finanzas/gastos/types';
import { abrirOCrearFichaGaleria, cargarObrasDisponibles, type ObraGaleria } from '../galeria/obras';
import { TIPOS_FOTO, type FotoGaleria, type TipoFoto } from '../galeria/types';

// Secciones de la pantalla de acciones rápidas que suben ficheros desde la cámara del móvil
// (2026-09-25): foto de ticket → gasto pendiente, y fotos de obra → galería. Separadas de
// RapidoPage.tsx solo por tamaño; comparten su misma filosofía (reutilizar el flujo del CRM, sin
// lógica nueva de negocio).

function hoyLocalIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---- Foto de ticket → gasto pendiente de completar --------------------------------------------

const TAMANO_MAX_TICKET = 10 * 1024 * 1024; // mismo límite que GastoForm.tsx

export function SeccionTicket() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [nota, setNota] = useState('');
  const hoy = hoyLocalIso();

  // Mismo bucket privado y misma convención de path que GastoForm.tsx (gastos/<uuid>.<ext>); la
  // imagen se recomprime antes de subir (optimizarImagen) porque una foto de móvil sin optimizar
  // ronda los 4-8 MB. El gasto se crea 'pendiente' sin importe ni cuenta — se completa desde
  // Gastos en el ordenador, y hasta que se confirma no genera asiento contable (igual que el
  // kilometraje automático).
  const subirMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!file.type.startsWith('image/')) throw new Error('Solo se admiten imágenes');
      if (file.size > TAMANO_MAX_TICKET) throw new Error('La foto pesa demasiado (máximo 10 MB)');
      const optimizada = await optimizarImagen(file);
      const extension = optimizada.name.split('.').pop() ?? 'jpg';
      const path = `gastos/${crypto.randomUUID()}.${extension}`;
      const { error: errorSubida } = await supabase.storage.from('justificantes').upload(path, optimizada, { contentType: optimizada.type });
      if (errorSubida) throw errorSubida;

      const nuevo: NuevoGasto = {
        fecha: hoy,
        descripcion: `Ticket pendiente de completar${nota.trim() ? ` — ${nota.trim()}` : ''} (foto desde el móvil)`,
        categoria: null,
        proveedor: null,
        proveedor_id: null,
        importe_base: 0,
        tipo_iva: null,
        importe_iva: 0,
        pais: null,
        cuenta_contable: null,
        visita_id: null,
        adjunto_url: path,
        adjunto_nombre: optimizada.name,
        adjunto_tipo: optimizada.type,
        num_factura_proveedor: null,
        inmovilizado_id: null,
        km: null,
        vehiculo_cv: null,
        estado_gasto: 'pendiente',
      };
      const { error } = await supabase.from('gastos').insert(nuevo);
      if (error) {
        // El gasto no se creó: no dejar el fichero huérfano en el bucket (best-effort).
        const { error: errorBorrado } = await supabase.storage.from('justificantes').remove([path]);
        if (errorBorrado) console.warn('No se pudo borrar el justificante huérfano:', errorBorrado.message);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gastos'] });
      toast.success('Ticket guardado — completa importe y proveedor desde Gastos');
      setNota('');
      if (inputRef.current) inputRef.current.value = '';
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo guardar el ticket'),
  });

  return (
    <div className="bg-white border border-gray-200 rounded-sm p-4 flex flex-col gap-3">
      <p className="text-sm text-gray-700">
        Haz una foto al ticket y queda guardado en Gastos como pendiente de revisar, con el justificante ya adjunto. El importe, el proveedor y
        la cuenta los completas después desde el ordenador.
      </p>
      <label className="block">
        <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Nota (opcional)</span>
        <input
          type="text"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Ej. Leroy Merlin, material obra Zaldia"
          className="w-full border border-gray-200 rounded-sm px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      </label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) subirMutation.mutate(file);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={subirMutation.isPending}
        className="bg-brand text-white px-3 py-2.5 rounded-sm text-sm flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <Camera size={16} />
        {subirMutation.isPending ? 'Guardando…' : 'Hacer foto al ticket'}
      </button>
    </div>
  );
}

// ---- Fotos de obra → galería -------------------------------------------------------------------

const TAMANO_MAX_FOTO_OBRA = 10 * 1024 * 1024; // mismo límite que GaleriaMediaPage.tsx
const MAX_FOTOS_PROYECTO = 20;

export function SeccionFotosObra() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [obraClave, setObraClave] = useState('');
  const [tipoFoto, setTipoFoto] = useState<TipoFoto>('durante');

  // Mismas obras que el desplegable de /galeria (1 obra = 1 presupuesto aceptado o factura), más
  // recientes primero. Sin texto libre: si la obra no existe en el CRM, no se puede subir aquí.
  const { data: obras, isLoading, isError, error } = useQuery({ queryKey: ['galeria', 'obras-disponibles'], queryFn: cargarObrasDisponibles });
  const obra = (obras ?? []).find((o) => o.clave === obraClave) ?? null;

  // Mismo flujo que GaleriaMediaPage.tsx: ficha creada al vuelo si la obra no la tiene todavía
  // (abrirOCrearFichaGaleria, sin duplicados), imagen optimizada, bucket público `galeria`, y las
  // fotos nuevas se añaden al final de su categoría respetando el máximo de 20 por proyecto.
  const subirMutation = useMutation({
    mutationFn: async ({ obra, files }: { obra: ObraGaleria; files: File[] }) => {
      const galeriaId = await abrirOCrearFichaGaleria(obra);
      const { data: proyecto, error: errorProyecto } = await supabase.from('galeria').select('fotos').eq('id', galeriaId).single();
      if (errorProyecto) throw errorProyecto;
      const actuales = ((proyecto?.fotos ?? []) as FotoGaleria[]).slice();
      if (actuales.length + files.length > MAX_FOTOS_PROYECTO) {
        throw new Error(`Máximo ${MAX_FOTOS_PROYECTO} fotos por obra (ya hay ${actuales.length})`);
      }
      const deCategoria = actuales.filter((f) => f.tipo === tipoFoto);
      let orden = deCategoria.length > 0 ? Math.max(...deCategoria.map((f) => f.orden)) + 1 : 0;
      const nuevas: FotoGaleria[] = [];
      for (const original of files) {
        if (!original.type.startsWith('image/')) throw new Error(`"${original.name}": solo se admiten imágenes`);
        if (original.size > TAMANO_MAX_FOTO_OBRA) throw new Error(`"${original.name}" pesa demasiado (máximo 10 MB)`);
        const file = await optimizarImagen(original);
        const path = `${galeriaId}/${crypto.randomUUID()}_${file.name}`;
        const { error: errorSubida } = await supabase.storage.from('galeria').upload(path, file, { contentType: file.type });
        if (errorSubida) throw errorSubida;
        const { data } = supabase.storage.from('galeria').getPublicUrl(path);
        nuevas.push({ url: data.publicUrl, nombre: file.name, tipo: tipoFoto, orden, tipo_archivo: 'foto', titulo: null, descripcion: null });
        orden += 1;
      }
      const { error } = await supabase.from('galeria').update({ fotos: [...actuales, ...nuevas] }).eq('id', galeriaId);
      if (error) throw error;
      return { galeriaId, subidas: nuevas.length };
    },
    onSuccess: ({ subidas }) => {
      queryClient.invalidateQueries({ queryKey: ['galeria'] });
      toast.success(`${subidas} foto(s) subida(s) a la galería`);
      if (inputRef.current) inputRef.current.value = '';
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudieron subir las fotos'),
  });

  if (isLoading) return <p className="text-sm text-gray-500">Cargando obras…</p>;
  if (isError) return <p className="text-sm text-red-600">{error instanceof Error ? error.message : 'No se pudieron cargar las obras'}</p>;

  return (
    <div className="bg-white border border-gray-200 rounded-sm p-4 flex flex-col gap-3">
      <label className="block">
        <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Obra</span>
        <select
          value={obraClave}
          onChange={(e) => setObraClave(e.target.value)}
          className="w-full border border-gray-200 rounded-sm px-3 py-2 text-sm bg-white focus:border-brand focus:outline-none"
        >
          <option value="">Elige la obra…</option>
          {(obras ?? []).map((o) => (
            <option key={o.clave} value={o.clave}>
              {o.clienteNombre} · {o.numero}
              {o.zona ? ` · ${o.zona}` : ''}
            </option>
          ))}
        </select>
      </label>
      <div>
        <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Momento</span>
        <div className="grid grid-cols-4 gap-1.5">
          {TIPOS_FOTO.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTipoFoto(t.value)}
              className={`px-2 py-1.5 rounded-sm text-xs border ${
                tipoFoto === t.value ? 'bg-brand text-white border-brand' : 'bg-white text-gray-700 border-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (obra && files.length > 0) subirMutation.mutate({ obra, files });
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={!obra || subirMutation.isPending}
        className="bg-brand text-white px-3 py-2.5 rounded-sm text-sm flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <Camera size={16} />
        {subirMutation.isPending ? 'Subiendo…' : 'Hacer fotos'}
      </button>
      {obra?.galeriaId && (
        <Link to={`/galeria/${obra.galeriaId}`} className="text-xs text-gray-500 underline text-center">
          Ver la galería de esta obra
        </Link>
      )}
    </div>
  );
}
