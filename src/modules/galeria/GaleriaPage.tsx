import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImageOff, Star } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { GaleriaForm } from './GaleriaForm';
import { GaleriaDetalleModal } from './GaleriaDetalleModal';
import type { GaleriaProyecto } from './types';

export default function GaleriaPage() {
  const [filtroTipo, setFiltroTipo] = useState('Todos');
  const [filtroZona, setFiltroZona] = useState('Todas');
  const [soloDestacados, setSoloDestacados] = useState(false);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [creando, setCreando] = useState(false);
  const [proyectoAbierto, setProyectoAbierto] = useState<string | null>(null);

  const { data: proyectos, isLoading } = useQuery({
    queryKey: ['galeria'],
    queryFn: async () => {
      const { data, error } = await supabase.from('galeria').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as GaleriaProyecto[];
    },
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

  if (creando) {
    return (
      <GaleriaForm
        open
        variante="inline"
        onClose={() => setCreando(false)}
        onCreado={(id) => {
          setCreando(false);
          setProyectoAbierto(id);
        }}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-sm text-gray-500 ml-auto mr-2">{filtrados.length} proyectos</span>
        <Button onClick={() => setCreando(true)} className="px-4 py-2 text-sm">
          + Añadir proyecto a galería
        </Button>
      </div>

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
          <Button onClick={() => setCreando(true)}>+ Añadir proyecto a galería</Button>
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
                  <img src={portada.url} alt={p.titulo ?? ''} className="w-full h-full object-cover" />
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
    </div>
  );
}
