import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

const VP = 260; // tamaño (px) del visor circular
const SALIDA = 480; // resolución (px) de la imagen final cuadrada

type Posicion = { x: number; y: number };

type AvatarCropperProps = {
  src: string;
  /** Si viene de una subida directa (p. ej. HEIC no previsualizable), permite usarlo tal cual. */
  archivoOriginal?: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
};

function centrar(displayW: number, displayH: number): Posicion {
  return { x: (VP - displayW) / 2, y: (VP - displayH) / 2 };
}

function clamp(pos: Posicion, displayW: number, displayH: number): Posicion {
  return {
    x: Math.min(0, Math.max(VP - displayW, pos.x)),
    y: Math.min(0, Math.max(VP - displayH, pos.y)),
  };
}

export function AvatarCropper({ src, archivoOriginal, onCancel, onConfirm }: AvatarCropperProps) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [zoomPct, setZoomPct] = useState(100);
  const [pos, setPos] = useState<Posicion>({ x: 0, y: 0 });
  const [procesando, setProcesando] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const arrastre = useRef<{ inicioPointer: Posicion; inicioPos: Posicion } | null>(null);

  useEffect(() => {
    const aviso = setTimeout(() => {
      setNatural((actual) => {
        if (!actual) setErrorCarga(true);
        return actual;
      });
    }, 8000);
    return () => clearTimeout(aviso);
  }, []);

  const baseScale = natural ? VP / Math.min(natural.w, natural.h) : 1;
  const escala = baseScale * (zoomPct / 100);
  const displayW = (natural?.w ?? VP) * escala;
  const displayH = (natural?.h ?? VP) * escala;

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = { inicioPointer: { x: e.clientX, y: e.clientY }, inicioPos: pos };
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!arrastre.current) return;
    const dx = e.clientX - arrastre.current.inicioPointer.x;
    const dy = e.clientY - arrastre.current.inicioPointer.y;
    const nuevo = {
      x: arrastre.current.inicioPos.x + dx,
      y: arrastre.current.inicioPos.y + dy,
    };
    setPos(clamp(nuevo, displayW, displayH));
  };

  const handlePointerUp = () => {
    arrastre.current = null;
  };

  const handleZoom = (valor: number) => {
    if (!natural) return;
    setZoomPct(valor);
    const nuevaEscala = baseScale * (valor / 100);
    setPos(centrar(natural.w * nuevaEscala, natural.h * nuevaEscala));
  };

  const handleAplicar = () => {
    const el = imgRef.current;
    if (!el) return;
    setProcesando(true);
    const canvas = document.createElement('canvas');
    canvas.width = SALIDA;
    canvas.height = SALIDA;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setProcesando(false);
      return;
    }
    const sx = -pos.x / escala;
    const sy = -pos.y / escala;
    const sSize = VP / escala;
    ctx.drawImage(el, sx, sy, sSize, sSize, 0, 0, SALIDA, SALIDA);
    canvas.toBlob(
      (blob) => {
        setProcesando(false);
        if (blob) onConfirm(blob);
      },
      'image/jpeg',
      0.92,
    );
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title="Ajusta tu foto de perfil"
      footer={
        errorCarga ? (
          <>
            <Button variant="secondary" onClick={onCancel}>
              Cancelar
            </Button>
            {archivoOriginal && <Button onClick={() => onConfirm(archivoOriginal)}>Usar sin recortar</Button>}
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onCancel}>
              Cancelar
            </Button>
            <Button onClick={handleAplicar} disabled={procesando || !natural}>
              {procesando ? 'Aplicando...' : 'Aplicar'}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col items-center gap-4">
        {errorCarga ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <AlertTriangle size={22} className="text-amber-600" />
            <p className="text-sm text-gray-700">
              No se ha podido previsualizar esta imagen (formato no compatible con el navegador, p. ej. HEIC).
            </p>
            <p className="text-xs text-gray-400">Puedes usarla tal cual sin recortar, o cancelar y elegir otra foto (JPG o PNG).</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500 text-center">Arrastra la imagen para centrarla y usa el control para acercar o alejar.</p>
            <div
              className="relative rounded-full overflow-hidden border border-gray-200 shadow-sm bg-gray-50 touch-none cursor-move select-none flex items-center justify-center"
              style={{ width: VP, height: VP }}
              onPointerDown={natural ? handlePointerDown : undefined}
              onPointerMove={natural ? handlePointerMove : undefined}
              onPointerUp={natural ? handlePointerUp : undefined}
            >
              {!natural && <p className="text-xs text-gray-400">Cargando previsualización...</p>}
              <img
                ref={imgRef}
                src={src}
                crossOrigin="anonymous"
                alt=""
                draggable={false}
                className={`absolute pointer-events-none ${natural ? '' : 'invisible'}`}
                style={{ width: displayW, height: displayH, left: pos.x, top: pos.y }}
                onLoad={(e) => {
                  const el = e.currentTarget;
                  setNatural({ w: el.naturalWidth, h: el.naturalHeight });
                }}
                onError={() => setErrorCarga(true)}
              />
              {natural && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute left-1/3 top-0 bottom-0 w-px bg-surface/70" />
                  <div className="absolute left-2/3 top-0 bottom-0 w-px bg-surface/70" />
                  <div className="absolute top-1/3 left-0 right-0 h-px bg-surface/70" />
                  <div className="absolute top-2/3 left-0 right-0 h-px bg-surface/70" />
                </div>
              )}
            </div>
            <div className="w-full max-w-xs">
              <input
                type="range"
                min={100}
                max={250}
                value={zoomPct}
                disabled={!natural}
                onChange={(e) => handleZoom(Number(e.target.value))}
                className="w-full accent-brand"
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
