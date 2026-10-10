import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, Play, Star } from 'lucide-react';
import { DropdownMenu, type AccionMenu } from '../../components/ui/DropdownMenu';
import { formatearDuracion, miniaturaDe, TIPOS_FOTO, type FotoGaleria } from './types';

// Rejilla de miniaturas de la ficha de obra (galería v2, 2026-10-10): tiles cuadrados, reordenación
// con dnd-kit (funciona con el dedo y con teclado, a diferencia del arrastre nativo que había),
// selección múltiple y menú por foto. Las miniaturas van en lazy salvo las primeras, con
// width/height para que la rejilla no salte mientras cargan.

type Props = {
  fotos: FotoGaleria[];
  seleccion: Set<string | number>;
  onToggleSeleccion: (url: string) => void;
  onAbrir: (indice: number) => void;
  // null cuando se ven todas las categorías a la vez: el orden es por categoría, no se arrastra.
  onReordenar: ((desdeUrl: string, hastaUrl: string) => void) | null;
  portadaUrl: string | null;
  accionesDe: (f: FotoGaleria) => AccionMenu[];
};

function etiquetaTipo(f: FotoGaleria): string {
  return TIPOS_FOTO.find((t) => t.value === f.tipo)?.label ?? f.tipo;
}

export function RejillaFotos({ fotos, seleccion, onToggleSeleccion, onAbrir, onReordenar, portadaUrl, accionesDe }: Props) {
  const sensors = useSensors(
    // delay: un toque corto abre la foto y el dedo puede hacer scroll; mantener pulsado arrastra.
    useSensor(PointerSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const urls = fotos.map((f) => f.url);
  const posicion = (url: string) => urls.indexOf(url) + 1;

  const handleDragEnd = (e: DragEndEvent) => {
    if (!onReordenar || !e.over || e.active.id === e.over.id) return;
    onReordenar(String(e.active.id), String(e.over.id));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable: 'Pulsa espacio para coger la foto, muévela con las flechas y vuelve a pulsar espacio para soltarla. Escape cancela.',
        },
        announcements: {
          onDragStart: ({ active }) => `Foto ${posicion(String(active.id))} de ${urls.length} cogida.`,
          onDragOver: ({ active, over }) => (over ? `Foto ${posicion(String(active.id))} sobre la posición ${posicion(String(over.id))}.` : ''),
          onDragEnd: ({ active, over }) =>
            over ? `Foto movida a la posición ${posicion(String(over.id))}.` : `Foto ${posicion(String(active.id))} soltada en su sitio.`,
          onDragCancel: () => 'Movimiento cancelado.',
        },
      }}
    >
      <SortableContext items={urls} strategy={rectSortingStrategy} disabled={!onReordenar}>
        <ul role="list" className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {fotos.map((f, i) => (
            <Tile
              key={f.url}
              foto={f}
              indice={i}
              prioridad={i < 6}
              seleccionada={seleccion.has(f.url)}
              haySeleccion={seleccion.size > 0}
              esPortada={portadaUrl === f.url}
              arrastrable={!!onReordenar}
              onToggleSeleccion={() => onToggleSeleccion(f.url)}
              onAbrir={() => onAbrir(i)}
              acciones={accionesDe(f)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

type TileProps = {
  foto: FotoGaleria;
  indice: number;
  prioridad: boolean;
  seleccionada: boolean;
  haySeleccion: boolean;
  esPortada: boolean;
  arrastrable: boolean;
  onToggleSeleccion: () => void;
  onAbrir: () => void;
  acciones: AccionMenu[];
};

function Tile({ foto, indice, prioridad, seleccionada, haySeleccion, esPortada, arrastrable, onToggleSeleccion, onAbrir, acciones }: TileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: foto.url, disabled: !arrastrable });
  const duracion = formatearDuracion(foto.duracion);
  const alt = foto.titulo || `${etiquetaTipo(foto)} — ${foto.nombre}`;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative group aspect-square rounded-sm overflow-hidden bg-gray-100 border-2 ${
        seleccionada ? 'border-brand' : 'border-transparent'
      } ${isDragging ? 'opacity-60 z-10' : ''}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={() => (haySeleccion ? onToggleSeleccion() : onAbrir())}
        className="w-full h-full block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        aria-label={`${haySeleccion ? 'Seleccionar' : 'Ver'} ${foto.tipo_archivo === 'video' ? 'vídeo' : 'foto'} ${indice + 1}: ${alt}`}
      >
        {foto.tipo_archivo === 'video' && !foto.poster_url ? (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <Play size={28} />
          </div>
        ) : (
          <img
            src={miniaturaDe(foto)}
            alt={alt}
            width={foto.ancho ?? undefined}
            height={foto.alto ?? undefined}
            loading={prioridad ? 'eager' : 'lazy'}
            decoding="async"
            draggable={false}
            className="w-full h-full object-cover"
          />
        )}
      </button>

      {foto.tipo_archivo === 'video' && (
        <span className="absolute bottom-1.5 left-1.5 bg-black/65 text-white text-[11px] px-1.5 py-0.5 rounded-sm flex items-center gap-1 pointer-events-none">
          <Play size={10} />
          {duracion ?? 'Vídeo'}
        </span>
      )}
      {esPortada && (
        <span className="absolute bottom-1.5 right-1.5 bg-white/90 text-amber-500 rounded-full p-1 pointer-events-none" title="Portada de la obra">
          <Star size={12} fill="currentColor" />
        </span>
      )}
      {foto.titulo && !foto.tipo_archivo.startsWith('video') && (
        <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent text-white text-[11px] px-1.5 pt-4 pb-1 truncate pointer-events-none">
          {foto.titulo}
        </span>
      )}

      <button
        type="button"
        onClick={onToggleSeleccion}
        aria-pressed={seleccionada}
        aria-label={seleccionada ? 'Quitar de la selección' : 'Seleccionar'}
        className={`absolute top-1.5 left-1.5 w-6 h-6 rounded-full border flex items-center justify-center transition-opacity ${
          seleccionada
            ? 'bg-brand border-brand text-white opacity-100'
            : 'bg-white/90 border-gray-300 text-transparent opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100'
        } ${haySeleccion ? 'opacity-100' : ''}`}
      >
        <Check size={13} />
      </button>
      <div className="absolute top-1 right-1 bg-white/90 rounded-sm opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
        <DropdownMenu acciones={acciones} />
      </div>
    </li>
  );
}
