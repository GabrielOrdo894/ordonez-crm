import { useEffect, useState } from 'react';
import { Select } from '../../components/ui/Select';
import type { FotoGaleria } from './types';

// Comparador antes/después (galería v2, 2026-10-10): un `input type=range` sobre dos fotos apiladas
// con clip-path — accesible por teclado y sin librería. Como en obra las dos fotos rara vez tienen
// el mismo encuadre, se puede elegir el par a mano y verlas también lado a lado.

type Props = { fotos: FotoGaleria[] };

function opcion(f: FotoGaleria, i: number) {
  return { value: f.url, label: f.titulo || `${i + 1}. ${f.nombre}` };
}

export function ComparadorAntesDespues({ fotos }: Props) {
  const antes = fotos.filter((f) => f.tipo === 'antes' && f.tipo_archivo === 'foto').sort((a, b) => a.orden - b.orden);
  const despues = fotos.filter((f) => f.tipo === 'despues' && f.tipo_archivo === 'foto').sort((a, b) => a.orden - b.orden);
  const [antesUrl, setAntesUrl] = useState(antes[0]?.url ?? '');
  const [despuesUrl, setDespuesUrl] = useState(despues[0]?.url ?? '');
  const [modo, setModo] = useState<'slider' | 'lado'>('slider');
  const [pos, setPos] = useState(50);

  useEffect(() => {
    if (!antes.some((f) => f.url === antesUrl)) setAntesUrl(antes[0]?.url ?? '');
    if (!despues.some((f) => f.url === despuesUrl)) setDespuesUrl(despues[0]?.url ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fotos]);

  if (antes.length === 0 || despues.length === 0) return null;
  const a = antes.find((f) => f.url === antesUrl) ?? antes[0];
  const d = despues.find((f) => f.url === despuesUrl) ?? despues[0];

  return (
    <div className="bg-surface border border-gray-200 rounded-sm p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Antes y después</p>
        <div className="flex gap-1">
          {(['slider', 'lado'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              aria-pressed={modo === m}
              className={`px-2.5 py-1 rounded-sm text-xs border ${modo === m ? 'bg-brand text-white border-brand' : 'bg-white text-gray-700 border-gray-200'}`}
            >
              {m === 'slider' ? 'Cortina' : 'Lado a lado'}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        <Select label="Foto de antes" options={antes.map(opcion)} value={a.url} onChange={(e) => setAntesUrl(e.target.value)} />
        <Select label="Foto de después" options={despues.map(opcion)} value={d.url} onChange={(e) => setDespuesUrl(e.target.value)} />
      </div>

      {modo === 'slider' ? (
        <div className="relative aspect-[4/3] rounded-sm overflow-hidden bg-gray-100 select-none">
          <img src={a.url} alt={a.titulo || 'Antes'} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
          <img
            src={d.url}
            alt={d.titulo || 'Después'}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
            draggable={false}
          />
          <div className="absolute inset-y-0 w-0.5 bg-white shadow pointer-events-none" style={{ left: `${pos}%` }} aria-hidden />
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white shadow flex items-center justify-center text-gray-600 text-xs pointer-events-none"
            style={{ left: `${pos}%` }}
            aria-hidden
          >
            ⇔
          </div>
          <span className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-sm pointer-events-none">Antes</span>
          <span className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-sm pointer-events-none">Después</span>
          <input
            type="range"
            min={0}
            max={100}
            value={pos}
            onChange={(e) => setPos(Number(e.target.value))}
            aria-label="Mover la cortina entre antes y después"
            className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
            style={{ touchAction: 'pan-y' }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {[
            [a, 'Antes'],
            [d, 'Después'],
          ].map(([f, etiqueta]) => {
            const foto = f as FotoGaleria;
            return (
              <figure key={foto.url} className="relative aspect-[4/3] rounded-sm overflow-hidden bg-gray-100">
                <img src={foto.url} alt={foto.titulo || String(etiqueta)} className="w-full h-full object-cover" />
                <figcaption className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-sm">{String(etiqueta)}</figcaption>
              </figure>
            );
          })}
        </div>
      )}
    </div>
  );
}
