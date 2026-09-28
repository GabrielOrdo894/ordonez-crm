import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { optimizarImagen } from '../../lib/optimizarImagen';
import { hoyLocalIso } from '../../lib/fechas';
import { cargarObrasDisponibles, type ObraGaleria } from '../galeria/obras';
import { TIPOS_FOTO, type TipoFoto } from '../galeria/types';
import { encolar, esErrorDeRed, mensajeError, type ArchivoPendiente } from './colaOffline';
import { useCopiaLocal, textoCopia } from './copiaLocal';
import { enviarFotosObra, enviarTicket } from './envios';

// Secciones de la pantalla de acciones rápidas que suben ficheros desde la cámara del móvil
// (2026-09-25): foto de ticket → gasto pendiente, y fotos de obra → galería. Separadas de
// RapidoPage.tsx solo por tamaño; comparten su misma filosofía (reutilizar el flujo del CRM, sin
// lógica nueva de negocio).

// ---- Foto de ticket → gasto pendiente de completar --------------------------------------------

const TAMANO_MAX_TICKET = 10 * 1024 * 1024; // mismo límite que GastoForm.tsx

export function SeccionTicket() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [nota, setNota] = useState('');
  const hoy = hoyLocalIso();

  // Sin cobertura (o si la subida falla por red) la foto ya optimizada se guarda en el móvil y se
  // envía sola al volver la conexión (colaOffline.ts) — mismo gasto que el envío directo.
  const subirMutation = useMutation({
    mutationFn: async (file: File): Promise<'enviado' | 'en-cola'> => {
      if (!file.type.startsWith('image/')) throw new Error('Solo se admiten imágenes');
      if (file.size > TAMANO_MAX_TICKET) throw new Error('La foto pesa demasiado (máximo 10 MB)');
      const optimizada = await optimizarImagen(file);
      const envio = { fecha: hoy, nota, foto: { archivo: optimizada, nombre: optimizada.name, mime: optimizada.type } };
      try {
        if (!navigator.onLine) throw new TypeError('Failed to fetch');
        await enviarTicket(envio);
        return 'enviado';
      } catch (err) {
        if (!esErrorDeRed(err)) throw err;
        await encolar({ tipo: 'ticket', ...envio });
        return 'en-cola';
      }
    },
    onSuccess: (resultado) => {
      if (resultado === 'enviado') {
        queryClient.invalidateQueries({ queryKey: ['gastos'] });
        toast.success('Ticket guardado — completa importe y proveedor desde Gastos');
      } else {
        toast.success('Sin conexión — ticket guardado en el móvil, se enviará solo al volver la cobertura');
      }
      setNota('');
      if (inputRef.current) inputRef.current.value = '';
    },
    onError: (err) => toast.error(mensajeError(err)),
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

export function SeccionFotosObra() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [obraClave, setObraClave] = useState('');
  const [tipoFoto, setTipoFoto] = useState<TipoFoto>('durante');

  // Mismas obras que el desplegable de /galeria (1 obra = 1 presupuesto aceptado o factura), más
  // recientes primero. Sin texto libre: si la obra no existe en el CRM, no se puede subir aquí. Sin
  // cobertura se usa la última lista guardada en el móvil.
  const { data: obrasRed, isError, error } = useQuery({ queryKey: ['galeria', 'obras-disponibles'], queryFn: cargarObrasDisponibles });
  const { datos: obras, copiaDe } = useCopiaLocal('rapido_obras', obrasRed);
  const obra = (obras ?? []).find((o) => o.clave === obraClave) ?? null;

  const subirMutation = useMutation({
    mutationFn: async ({ obra, files }: { obra: ObraGaleria; files: File[] }): Promise<{ subidas: number; enCola: boolean }> => {
      const fotos: ArchivoPendiente[] = [];
      for (const original of files) {
        if (!original.type.startsWith('image/')) throw new Error(`"${original.name}": solo se admiten imágenes`);
        if (original.size > TAMANO_MAX_FOTO_OBRA) throw new Error(`"${original.name}" pesa demasiado (máximo 10 MB)`);
        const file = await optimizarImagen(original);
        fotos.push({ archivo: file, nombre: file.name, mime: file.type });
      }
      try {
        if (!navigator.onLine) throw new TypeError('Failed to fetch');
        const { subidas } = await enviarFotosObra({ obra, tipoFoto, fotos });
        return { subidas, enCola: false };
      } catch (err) {
        // Ojo: si la red cae a mitad de subida, las fotos ya subidas se quedan en el bucket sin
        // enlazar y el lote entero se reenvía después (nunca se pierde ninguna foto).
        if (!esErrorDeRed(err)) throw err;
        await encolar({ tipo: 'fotos', obraClave: obra.clave, obraNombre: `${obra.clienteNombre} · ${obra.numero}`, tipoFoto, fotos });
        return { subidas: fotos.length, enCola: true };
      }
    },
    onSuccess: ({ subidas, enCola }) => {
      if (enCola) {
        toast.success(`Sin conexión — ${subidas} foto(s) guardada(s) en el móvil, se subirán solas al volver la cobertura`);
      } else {
        queryClient.invalidateQueries({ queryKey: ['galeria'] });
        toast.success(`${subidas} foto(s) subida(s) a la galería`);
      }
      if (inputRef.current) inputRef.current.value = '';
    },
    onError: (err) => toast.error(mensajeError(err)),
  });

  if (!obras) {
    if (isError) return <p className="text-sm text-red-600">{mensajeError(error)}</p>;
    return <p className="text-sm text-gray-500">{navigator.onLine ? 'Cargando obras…' : 'Sin conexión y sin lista de obras guardada en el móvil.'}</p>;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-sm p-4 flex flex-col gap-3">
      {copiaDe && <p className="text-xs text-amber-700">{textoCopia(copiaDe)}</p>}
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
