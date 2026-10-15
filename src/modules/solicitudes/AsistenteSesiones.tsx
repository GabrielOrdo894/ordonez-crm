import { useState } from 'react';
import { ChevronDown, ChevronRight, Monitor, Smartphone } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { describirEvento, type ResultadoSesion, type SesionAsistente } from './asistenteWeb';

// Últimas visitas con el asistente, cada una desplegable con su ruta paso a paso. Las que solo
// cargaron la página sin tocar nada se ocultan por defecto: son la mayoría y no aportan ruta.
const POR_PAGINA = 30;

const RESULTADO: Record<ResultadoSesion, { etiqueta: string; variante: 'realizada' | 'confirmada' | 'vencida' | 'default' }> = {
  enviado: { etiqueta: 'Envía la solicitud', variante: 'realizada' },
  whatsapp: { etiqueta: 'Se va a WhatsApp', variante: 'confirmada' },
  abandono: { etiqueta: 'Abandona', variante: 'vencida' },
  sin_abrir: { etiqueta: 'No abre', variante: 'default' },
};

function fechaHora(iso: string) {
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function segundosDesde(inicio: string, momento: string) {
  const s = Math.max(0, Math.round((new Date(momento).getTime() - new Date(inicio).getTime()) / 1000));
  return s < 60 ? `+${s} s` : `+${Math.floor(s / 60)} min ${s % 60} s`;
}

type Props = { sesiones: SesionAsistente[]; onAbrirSolicitud: (id: string) => void };

export function AsistenteSesiones({ sesiones, onAbrirSolicitud }: Props) {
  const [incluirSinInteraccion, setIncluirSinInteraccion] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const lista = incluirSinInteraccion ? sesiones : sesiones.filter((s) => s.resultado !== 'sin_abrir' || s.eventos.length > 1);

  return (
    <div>
      <label className="flex items-center gap-2 text-xs text-gray-600 mb-2">
        <input type="checkbox" checked={incluirSinInteraccion} onChange={(e) => setIncluirSinInteraccion(e.target.checked)} />
        Incluir visitas que solo cargaron la página
      </label>
      {lista.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">Ninguna visita ha interactuado con el asistente en este período</p>
      ) : (
        <div className="border border-gray-200 rounded-sm divide-y divide-gray-100">
          {lista.slice(0, mostrar).map((s) => {
            const desplegada = abierta === s.sesion;
            const r = RESULTADO[s.resultado];
            return (
              <div key={s.sesion}>
                <button
                  type="button"
                  onClick={() => setAbierta(desplegada ? null : s.sesion)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-brand-light"
                >
                  {desplegada ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                  <span className="w-36 shrink-0 text-gray-600">{fechaHora(s.inicio)}</span>
                  <span className="flex-1 min-w-0 truncate text-gray-900">{s.pagina}</span>
                  <span className="hidden sm:inline text-xs text-gray-400 uppercase">{s.idioma}</span>
                  {s.dispositivo === 'movil' ? (
                    <Smartphone size={14} className="text-gray-400" aria-label="Móvil" />
                  ) : (
                    <Monitor size={14} className="text-gray-400" aria-label="Ordenador" />
                  )}
                  <span className="hidden md:inline w-28 text-xs text-gray-500">
                    {s.pasoMax > 0 ? `Llega al paso ${s.pasoMax}` : '—'}
                  </span>
                  <Badge variant={r.variante}>{r.etiqueta}</Badge>
                </button>
                {desplegada && (
                  <div className="px-10 pb-3">
                    <ol className="space-y-1">
                      {s.eventos.map((e) => (
                        <li key={e.id} className="flex gap-3 text-sm">
                          <span className="w-24 shrink-0 text-xs text-gray-400 pt-0.5">{segundosDesde(s.inicio, e.created_at)}</span>
                          <span className="text-gray-700">{describirEvento(e)}</span>
                        </li>
                      ))}
                    </ol>
                    {s.solicitudId && (
                      <Button variant="secondary" className="mt-3" onClick={() => onAbrirSolicitud(s.solicitudId!)}>
                        Ver la solicitud
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {lista.length > mostrar && (
        <div className="mt-2 text-center">
          <Button variant="secondary" onClick={() => setMostrar((m) => m + POR_PAGINA)}>
            Ver {Math.min(POR_PAGINA, lista.length - mostrar)} más
          </Button>
        </div>
      )}
    </div>
  );
}
