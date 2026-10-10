import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Globe, Images, Play, Search, Star } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { mensajeError } from '../../lib/mensajeError';
import { fechaCorta } from '../../lib/fechas';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { cargarObrasDisponibles, abrirOCrearFichaGaleria } from './obras';
import { etiquetaTipoObra, miniaturaDe, portadaDe, TIPOS_FOTO, TIPOS_OBRA, type GaleriaProyecto } from './types';

// Lista de obras de la Galería (v2, 2026-10-10): buscador por cliente/título, chips de tipo de obra
// con contador, zona, destacadas y "en la web"; tarjetas con portada ligera (miniatura), cliente,
// recuento por categoría y fecha formateada. Las obras destacadas van primero.

type Orden = 'recientes' | 'fecha-obra' | 'titulo';

export default function GaleriaPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroZona, setFiltroZona] = useState('');
  const [soloDestacados, setSoloDestacados] = useState(false);
  const [soloWeb, setSoloWeb] = useState(false);
  const [orden, setOrden] = useState<Orden>('recientes');
  const [obraSeleccionada, setObraSeleccionada] = useState('');

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
  // También da el nombre del cliente de cada ficha (la tabla galeria no lo guarda).
  const { data: obras } = useQuery({ queryKey: ['galeria', 'obras-disponibles'], queryFn: cargarObrasDisponibles });
  const clientePorFicha = useMemo(() => new Map((obras ?? []).filter((o) => o.galeriaId).map((o) => [o.galeriaId as string, o])), [obras]);

  const abrirObraMutation = useMutation({
    mutationFn: abrirOCrearFichaGaleria,
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['galeria'] });
      setObraSeleccionada('');
      navigate(`/galeria/${id}`);
    },
    onError: (error) => toast.error(mensajeError(error, 'No se pudo abrir la obra')),
  });

  const lista = useMemo(() => proyectos ?? [], [proyectos]);
  const contadorTipo = (clave: string) => lista.filter((p) => (p.tipo_obra_clave ?? '') === clave).length;
  const zonasDisponibles = useMemo(() => Array.from(new Set(lista.map((p) => p.zona).filter((z): z is string => !!z))).sort(), [lista]);

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const res = lista.filter((p) => {
      if (filtroTipo && (p.tipo_obra_clave ?? '') !== filtroTipo) return false;
      if (filtroZona && p.zona !== filtroZona) return false;
      if (soloDestacados && !p.destacado) return false;
      if (soloWeb && !p.publicado) return false;
      if (texto) {
        const cliente = clientePorFicha.get(p.id);
        const pajar = [p.titulo, p.descripcion, p.zona, cliente?.clienteNombre, cliente?.numero].filter(Boolean).join(' ').toLowerCase();
        if (!pajar.includes(texto)) return false;
      }
      return true;
    });
    const clave = (p: GaleriaProyecto) => (orden === 'fecha-obra' ? p.fecha_obra ?? '' : orden === 'titulo' ? (p.titulo ?? '').toLowerCase() : p.created_at);
    return res.sort((a, b) => {
      if (a.destacado !== b.destacado) return a.destacado ? -1 : 1;
      const c = clave(a).localeCompare(clave(b));
      return orden === 'titulo' ? c : -c;
    });
  }, [lista, filtroTipo, filtroZona, soloDestacados, soloWeb, busqueda, orden, clientePorFicha]);

  const opcionesObras = useMemo(
    () => [
      { value: '', label: (obras ?? []).length === 0 ? 'Sin obras disponibles todavía' : 'Selecciona una obra…' },
      ...(obras ?? []).map((o) => ({
        value: o.clave,
        label: `${o.clienteNombre} — ${o.numero}${o.zona ? ` · ${o.zona}` : ''}${o.fecha ? ` · ${o.fecha}` : ''}${o.galeriaId ? ' (ya tiene fotos)' : ''}`,
      })),
    ],
    [obras],
  );

  const chip = (activo: boolean, onClick: () => void, contenido: React.ReactNode, titulo?: string) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      title={titulo}
      className={`px-2.5 py-1 rounded-sm text-xs border flex items-center gap-1 ${activo ? 'bg-brand text-white border-brand' : 'bg-white text-gray-700 border-gray-200 hover:border-brand'}`}
    >
      {contenido}
    </button>
  );

  return (
    <div>
      <div className="flex items-end gap-2 mb-1 flex-wrap">
        <Select label="Añadir fotos/vídeos a una obra" options={opcionesObras} value={obraSeleccionada} onChange={(e) => setObraSeleccionada(e.target.value)} className="w-80" />
        <Button
          onClick={() => {
            const obra = (obras ?? []).find((o) => o.clave === obraSeleccionada);
            if (obra) abrirObraMutation.mutate(obra);
          }}
          disabled={!obraSeleccionada || abrirObraMutation.isPending}
          className="px-4 py-2 text-sm"
        >
          {abrirObraMutation.isPending ? 'Abriendo…' : 'Abrir'}
        </Button>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Solo aparecen obras verificadas: con presupuesto aceptado, factura o anticipo. Desde el móvil, las fotos se suben en Acciones rápidas.{' '}
        <button onClick={() => navigate('/galeria/nueva')} className="text-brand hover:underline">
          ¿No encuentras la obra? Crear ficha manualmente
        </button>
      </p>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente, título o nº"
            aria-label="Buscar obras"
            className="border border-gray-200 rounded-sm pl-8 pr-2.5 py-1.5 text-sm w-64 focus:border-brand focus:outline-none"
          />
        </div>
        <Select options={[{ value: '', label: 'Todas las zonas' }, ...zonasDisponibles.map((z) => ({ value: z, label: z }))]} value={filtroZona} onChange={(e) => setFiltroZona(e.target.value)} className="w-44" />
        <Select
          options={[
            { value: 'recientes', label: 'Añadidas recientemente' },
            { value: 'fecha-obra', label: 'Fecha de la obra' },
            { value: 'titulo', label: 'Título (A–Z)' },
          ]}
          value={orden}
          onChange={(e) => setOrden(e.target.value as Orden)}
          className="w-52"
        />
        <span className="text-sm text-gray-500 ml-auto">
          {filtrados.length} {filtrados.length === 1 ? 'obra' : 'obras'}
        </span>
      </div>

      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {chip(filtroTipo === '', () => setFiltroTipo(''), <>Todos los tipos</>)}
        {TIPOS_OBRA.filter((t) => contadorTipo(t.value) > 0).map((t) =>
          chip(filtroTipo === t.value, () => setFiltroTipo(filtroTipo === t.value ? '' : t.value), (
            <>
              {t.label} <span className={filtroTipo === t.value ? 'text-white/80' : 'text-gray-400'}>{contadorTipo(t.value)}</span>
            </>
          )),
        )}
        {contadorTipo('') > 0 &&
          chip(filtroTipo === 'sin', () => setFiltroTipo(filtroTipo === 'sin' ? '' : 'sin'), (
            <>
              Sin clasificar <span className={filtroTipo === 'sin' ? 'text-white/80' : 'text-gray-400'}>{contadorTipo('')}</span>
            </>
          ), 'Obras sin tipo asignado: ábrelas y pulsa Modificar para clasificarlas')}
        <span className="w-px h-5 bg-gray-200 mx-1" aria-hidden />
        {chip(soloDestacados, () => setSoloDestacados((v) => !v), (
          <>
            <Star size={12} /> Destacadas
          </>
        ))}
        {chip(soloWeb, () => setSoloWeb((v) => !v), (
          <>
            <Globe size={12} /> En la web
          </>
        ))}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-60 bg-surface border border-gray-200 rounded-sm animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && filtrados.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
          <Images size={28} className="text-gray-300" />
          <p className="text-sm text-gray-500">{lista.length === 0 ? 'La galería está vacía.' : 'Ninguna obra coincide con estos filtros.'}</p>
          <p className="text-xs text-gray-400 max-w-md">
            {lista.length === 0
              ? 'Elige una obra arriba y pulsa Abrir para crear su ficha y empezar a subir fotos. Desde el móvil, en Acciones rápidas → Fotos de obra.'
              : 'Prueba a quitar algún filtro o a cambiar el texto de búsqueda.'}
          </p>
          {lista.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setBusqueda('');
                setFiltroTipo('');
                setFiltroZona('');
                setSoloDestacados(false);
                setSoloWeb(false);
              }}
              className="text-xs text-brand hover:underline"
            >
              Quitar filtros
            </button>
          )}
        </div>
      )}

      <ul role="list" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtrados.map((p, i) => {
          const portada = portadaDe(p);
          const cliente = clientePorFicha.get(p.id);
          const porTipo = TIPOS_FOTO.map((t) => ({ ...t, n: p.fotos.filter((f) => f.tipo === t.value).length })).filter((t) => t.n > 0);
          const videos = p.fotos.filter((f) => f.tipo_archivo === 'video').length;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => navigate(`/galeria/${p.id}`)}
                className="text-left w-full bg-surface border border-gray-200 rounded-sm overflow-hidden hover:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <div className="aspect-[4/3] bg-gray-100 relative">
                  {portada ? (
                    <img
                      src={miniaturaDe(portada)}
                      alt={p.titulo ?? ''}
                      width={portada.ancho ?? undefined}
                      height={portada.alto ?? undefined}
                      loading={i < 4 ? 'eager' : 'lazy'}
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <Images size={28} />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex gap-1">
                    {p.destacado && (
                      <span className="bg-white/90 text-amber-500 rounded-full p-1" title="Destacada">
                        <Star size={12} fill="currentColor" />
                      </span>
                    )}
                    {p.publicado && (
                      <span className="bg-white/90 text-brand rounded-full p-1" title="Visible en la web">
                        <Globe size={12} />
                      </span>
                    )}
                  </div>
                  {p.fotos.length > 0 && (
                    <span className="absolute bottom-2 left-2 bg-black/60 text-white text-[11px] px-1.5 py-0.5 rounded-sm flex items-center gap-1">
                      {p.fotos.length} {videos > 0 && <Play size={10} />}
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold text-gray-900 truncate">{p.titulo || 'Sin título'}</p>
                  <p className="text-xs text-gray-600 truncate">{cliente ? `${cliente.clienteNombre} · ${cliente.numero}` : 'Ficha manual'}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {[etiquetaTipoObra(p.tipo_obra_clave), p.zona, p.fecha_obra ? fechaCorta(p.fecha_obra) : null].filter(Boolean).join(' · ') || 'Sin clasificar'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{porTipo.length > 0 ? porTipo.map((t) => `${t.n} ${t.label.toLowerCase()}`).join(' · ') : 'Sin fotos todavía'}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
