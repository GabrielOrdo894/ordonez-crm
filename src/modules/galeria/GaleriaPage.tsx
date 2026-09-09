import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { ImageOff, Star } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { mensajeError } from '../../lib/mensajeError';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { GaleriaDetalleModal } from './GaleriaDetalleModal';
import { cargarObrasDisponibles, abrirOCrearFichaGaleria } from './obras';
import type { GaleriaProyecto } from './types';

type FormManual = { titulo: string; tipo_obra: string; zona: string; fecha_obra: string; descripcion: string };

function formManualVacio(): FormManual {
  return { titulo: '', tipo_obra: '', zona: '', fecha_obra: '', descripcion: '' };
}

export default function GaleriaPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [filtroTipo, setFiltroTipo] = useState('Todos');
  const [filtroZona, setFiltroZona] = useState('Todas');
  const [soloDestacados, setSoloDestacados] = useState(false);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [obraSeleccionada, setObraSeleccionada] = useState('');
  const [proyectoAbierto, setProyectoAbierto] = useState<string | null>(null);
  const [creandoManual, setCreandoManual] = useState(false);
  const [formManual, setFormManual] = useState<FormManual>(formManualVacio());

  useEffect(() => {
    const st = location.state as { abrirGaleriaId?: string } | null;
    if (st?.abrirGaleriaId) setProyectoAbierto(st.abrirGaleriaId);
  }, [location.state]);

  const { data: proyectos, isLoading } = useQuery({
    queryKey: ['galeria'],
    queryFn: async () => {
      const { data, error } = await supabase.from('galeria').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as GaleriaProyecto[];
    },
  });

  // Obras reales (1 obra = 1 presupuesto Aceptado, o la factura/acompte que la respalde) — ya no
  // se crean proyectos de galería con texto libre, se eligen de aquí (CLAUDE.md §10, 2026-09-09).
  const { data: obras } = useQuery({
    queryKey: ['galeria', 'obras-disponibles'],
    queryFn: cargarObrasDisponibles,
  });

  const abrirObraMutation = useMutation({
    mutationFn: abrirOCrearFichaGaleria,
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['galeria'] });
      setObraSeleccionada('');
      setProyectoAbierto(id);
    },
    onError: (error) => toast.error(mensajeError(error, 'No se pudo abrir la obra')),
  });

  // Fallback manual (2026-09-09, petición de Gabriel): si la obra real no aparece en el
  // desplegable de arriba (caso raro no cubierto por presupuesto/factura, ej. fotos de referencia
  // de un proveedor), se puede crear la ficha a mano — sin presupuesto_id/factura_id, igual que
  // antes de este cambio, pero como excepción explícita en vez del único camino de creación.
  const crearManualMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('galeria')
        .insert({
          visita_id: null,
          proyecto_id: null,
          presupuesto_id: null,
          factura_id: null,
          titulo: formManual.titulo || null,
          tipo_obra: formManual.tipo_obra || null,
          zona: formManual.zona || null,
          fecha_obra: formManual.fecha_obra || null,
          descripcion: formManual.descripcion || null,
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
      setCreandoManual(false);
      setFormManual(formManualVacio());
      setProyectoAbierto(id);
    },
    onError: (error) => toast.error(mensajeError(error, 'No se pudo crear la ficha')),
  });

  const tiposDisponibles = useMemo(() => {
    const set = new Set((proyectos ?? []).map((p) => p.tipo_obra).filter((t): t is string => !!t));
    return ['Todos', ...Array.from(set).sort()];
  }, [proyectos]);

  const zonasDisponibles = useMemo(() => {
    const set = new Set((proyectos ?? []).map((p) => p.zona).filter((z): z is string => !!z));
    return ['Todas', ...Array.from(set).sort()];
  }, [proyectos]);

  const filtrados = useMemo(() => {
    return (proyectos ?? []).filter((p) => {
      if (filtroTipo !== 'Todos' && p.tipo_obra !== filtroTipo) return false;
      if (filtroZona !== 'Todas' && p.zona !== filtroZona) return false;
      if (soloDestacados && !p.destacado) return false;
      if (desde && (!p.fecha_obra || p.fecha_obra < desde)) return false;
      if (hasta && (!p.fecha_obra || p.fecha_obra > hasta)) return false;
      return true;
    });
  }, [proyectos, filtroTipo, filtroZona, soloDestacados, desde, hasta]);

  const opcionesObras = useMemo(
    () => [
      { value: '', label: (obras ?? []).length === 0 ? 'Sin obras disponibles todavía' : 'Selecciona una obra…' },
      ...(obras ?? []).map((o) => ({
        value: o.clave,
        label: `${o.clienteNombre} — ${o.numero}${o.zona ? ` · ${o.zona}` : ''}${o.fecha ? ` · ${o.fecha}` : ''}${
          o.galeriaId ? ' (ya tiene fotos)' : ''
        }`,
      })),
    ],
    [obras],
  );

  return (
    <div>
      <div className="flex items-end gap-2 mb-3 flex-wrap">
        <Select
          label="Añadir fotos/vídeos a una obra"
          options={opcionesObras}
          value={obraSeleccionada}
          onChange={(e) => setObraSeleccionada(e.target.value)}
          className="w-72"
        />
        <Button
          onClick={() => {
            const obra = (obras ?? []).find((o) => o.clave === obraSeleccionada);
            if (obra) abrirObraMutation.mutate(obra);
          }}
          disabled={!obraSeleccionada || abrirObraMutation.isPending}
          className="px-4 py-2 text-sm"
        >
          {abrirObraMutation.isPending ? 'Abriendo...' : 'Abrir'}
        </Button>
        <span className="text-sm text-gray-500 ml-auto">{filtrados.length} proyectos</span>
      </div>
      <p className="text-xs text-gray-400 -mt-2 mb-4">
        Solo aparecen obras verificadas: con presupuesto Aceptado, factura o anticipo.{' '}
        <button onClick={() => setCreandoManual(true)} className="text-brand hover:underline">
          ¿No encuentras la obra? Crear ficha manualmente
        </button>
      </p>

      <div className="flex items-end gap-2 mb-4 flex-wrap">
        <Select
          label="Tipo de obra"
          options={tiposDisponibles.map((t) => ({ value: t, label: t }))}
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="w-44"
        />
        <Select
          label="Zona"
          options={zonasDisponibles.map((z) => ({ value: z, label: z }))}
          value={filtroZona}
          onChange={(e) => setFiltroZona(e.target.value)}
          className="w-44"
        />
        <Input label="Fecha desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" />
        <Input label="Fecha hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" />
        <label className="flex items-center gap-1.5 text-sm text-gray-600 pb-1.5">
          <input type="checkbox" checked={soloDestacados} onChange={(e) => setSoloDestacados(e.target.checked)} />
          Solo destacados
        </label>
      </div>

      {isLoading && <div className="h-64 bg-surface border border-gray-200 rounded-sm animate-pulse" />}

      {!isLoading && filtrados.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <p className="text-sm text-gray-400">No hay proyectos en la galería</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {filtrados.map((p) => {
          const portada = [...p.fotos].sort((a, b) => a.orden - b.orden)[0];
          return (
            <button
              key={p.id}
              onClick={() => setProyectoAbierto(p.id)}
              className="text-left bg-surface border border-gray-200 rounded-sm overflow-hidden hover:border-brand"
            >
              <div className="h-40 bg-gray-50 flex items-center justify-center overflow-hidden">
                {portada ? (
                  portada.tipo_archivo === 'video' ? (
                    <video src={portada.url} className="w-full h-full object-cover" muted />
                  ) : (
                    <img src={portada.url} alt={p.titulo ?? ''} className="w-full h-full object-cover" />
                  )
                ) : (
                  <ImageOff size={28} className="text-gray-300" />
                )}
              </div>
              <div className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{p.titulo || 'Sin título'}</p>
                  {p.destacado && <Star size={14} className="text-amber-500 shrink-0" />}
                </div>
                <p className="text-xs text-gray-500">
                  {p.tipo_obra || '—'} · {p.zona || '—'}
                </p>
                <p className="text-xs text-gray-400">{p.fecha_obra || 'Sin fecha'}</p>
              </div>
            </button>
          );
        })}
      </div>

      <GaleriaDetalleModal proyectoId={proyectoAbierto} onClose={() => setProyectoAbierto(null)} onEliminado={() => setProyectoAbierto(null)} />

      <Modal
        open={creandoManual}
        onClose={() => setCreandoManual(false)}
        title="Crear ficha manualmente"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreandoManual(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => crearManualMutation.mutate()}
              disabled={crearManualMutation.isPending || !formManual.titulo.trim()}
            >
              {crearManualMutation.isPending ? 'Creando...' : 'Crear'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-xs text-gray-400">
            Solo para casos que la lista de obras no cubre (ej. fotos de referencia de un proveedor) — no queda
            vinculada a ningún presupuesto ni factura.
          </p>
          <Input
            label="Título"
            required
            value={formManual.titulo}
            onChange={(e) => setFormManual((f) => ({ ...f, titulo: e.target.value }))}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Tipo de obra"
              value={formManual.tipo_obra}
              onChange={(e) => setFormManual((f) => ({ ...f, tipo_obra: e.target.value }))}
            />
            <Input label="Zona" value={formManual.zona} onChange={(e) => setFormManual((f) => ({ ...f, zona: e.target.value }))} />
          </div>
          <Input
            label="Fecha"
            type="date"
            value={formManual.fecha_obra}
            onChange={(e) => setFormManual((f) => ({ ...f, fecha_obra: e.target.value }))}
          />
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Descripción</label>
            <textarea
              value={formManual.descripcion}
              onChange={(e) => setFormManual((f) => ({ ...f, descripcion: e.target.value }))}
              className="w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm min-h-[70px] focus:border-brand focus:outline-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
