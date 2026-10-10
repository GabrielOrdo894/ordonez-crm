import Lightbox from 'yet-another-react-lightbox';
import Captions from 'yet-another-react-lightbox/plugins/captions';
import Counter from 'yet-another-react-lightbox/plugins/counter';
import Video from 'yet-another-react-lightbox/plugins/video';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/captions.css';
import 'yet-another-react-lightbox/plugins/counter.css';
import type { ReactNode } from 'react';
import type { FotoGaleria } from './types';

// Visor a pantalla completa (galería v2, 2026-10-10) sobre yet-another-react-lightbox: flechas y
// Esc, deslizar y arrastrar hacia abajo para cerrar en el móvil, pinch-zoom con la foto grande,
// contador, pie con título/descripción, precarga de las vecinas y foco devuelto al cerrar.

function mimeVideo(nombre: string): string {
  const ext = nombre.toLowerCase().split('.').pop();
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'webm') return 'video/webm';
  return 'video/mp4';
}

type Props = {
  fotos: FotoGaleria[];
  indice: number | null;
  onCerrar: () => void;
  onCambio: (indice: number) => void;
  // Botones propios en la barra superior (editar, descargar…), se pintan antes del cerrar.
  botones?: ReactNode[];
};

export function VisorFotos({ fotos, indice, onCerrar, onCambio, botones = [] }: Props) {
  const slides = fotos.map((f) =>
    f.tipo_archivo === 'video'
      ? {
          type: 'video' as const,
          sources: [{ src: f.url, type: mimeVideo(f.nombre) }],
          poster: f.poster_url ?? undefined,
          width: f.ancho ?? undefined,
          height: f.alto ?? undefined,
          title: f.titulo ?? undefined,
          description: f.descripcion ?? undefined,
        }
      : {
          src: f.url,
          alt: f.titulo ?? f.nombre,
          width: f.ancho ?? undefined,
          height: f.alto ?? undefined,
          title: f.titulo ?? undefined,
          description: f.descripcion ?? undefined,
        },
  );
  return (
    <Lightbox
      open={indice !== null}
      close={onCerrar}
      index={indice ?? 0}
      slides={slides}
      on={{ view: ({ index }) => onCambio(index) }}
      plugins={[Zoom, Video, Captions, Counter]}
      carousel={{ preload: 2, finite: fotos.length <= 1 }}
      controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
      zoom={{ maxZoomPixelRatio: 3, scrollToZoom: true }}
      video={{ controls: true, playsInline: true, preload: 'metadata', autoPlay: false }}
      counter={{ container: { style: { top: 'unset', bottom: 0 } } }}
      toolbar={{ buttons: [...botones, 'close'] }}
      styles={{ container: { backgroundColor: 'rgba(0, 0, 0, 0.92)' } }}
    />
  );
}
