import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  Check,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Trash2,
  X,
  Landmark,
  MessageSquare,
  Receipt,
  Wrench,
  FileText,
  Star,
  Image as ImageIcon,
  Inbox,
  type LucideIcon,
} from 'lucide-react';
import { useNotificaciones, type CategoriaNotificacion, type Notificacion } from './useNotificaciones';

const ICONOS: Record<CategoriaNotificacion, LucideIcon> = {
  fiscal: Landmark,
  factura: Receipt,
  visita: Wrench,
  mensaje: MessageSquare,
  presupuesto: FileText,
  resena: Star,
  galeria: ImageIcon,
  solicitud: Inbox,
};

const ETIQUETA_CATEGORIA: Record<CategoriaNotificacion, string> = {
  fiscal: 'Fiscalidad',
  factura: 'Facturas',
  visita: 'Visitas',
  mensaje: 'Mensajería',
  presupuesto: 'Presupuestos',
  resena: 'Reseñas',
  galeria: 'Galería',
  solicitud: 'Solicitudes',
};

function fechaCompleta(iso: string) {
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function NotificacionesBell() {
  const { noLeidas, leidas, urgentes, marcarLeida, eliminarNotificacion } = useNotificaciones();
  const [abierto, setAbierto] = useState(false);
  const [detalle, setDetalle] = useState<Notificacion | null>(null);

  const total = noLeidas.length;

  const cerrarPanel = () => {
    setAbierto(false);
    setDetalle(null);
  };

  function Fila({ n, leida }: { n: Notificacion; leida: boolean }) {
    const Icon = ICONOS[n.categoria];
    return (
      <div className="border-b border-gray-100 flex items-start">
        <button
          type="button"
          onClick={() => {
            setDetalle(n);
            if (!leida) marcarLeida(n.id);
          }}
          className="flex-1 min-w-0 flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50"
        >
          <span
            className={`w-8 h-8 rounded-sm flex items-center justify-center shrink-0 ${
              n.urgente ? 'bg-red-50 text-red-600' : 'bg-brand-light text-brand'
            }`}
          >
            <Icon size={15} />
          </span>
          <span className="flex-1 min-w-0">
            <span className={`block text-sm ${leida ? 'text-gray-600' : 'font-medium text-gray-900'}`}>{n.titulo}</span>
            <span className="block text-xs text-gray-500 truncate">{n.resumen}</span>
          </span>
          <ChevronRight size={14} className="shrink-0 text-gray-400 mt-1" />
        </button>
        {leida ? (
          <button
            type="button"
            onClick={() => eliminarNotificacion(n.id)}
            title="Eliminar notificación"
            className="shrink-0 w-7 h-7 mt-3 mr-3 rounded-full flex items-center justify-center text-gray-300 hover:text-red-600 hover:bg-red-50"
          >
            <Trash2 size={14} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => marcarLeida(n.id)}
            title="Marcar como leída"
            className="shrink-0 w-7 h-7 mt-3 mr-3 rounded-full flex items-center justify-center text-gray-300 hover:text-brand hover:bg-brand-light"
          >
            <Check size={14} />
          </button>
        )}
      </div>
    );
  }

  function VistaDetalle({ n }: { n: Notificacion }) {
    const Icon = ICONOS[n.categoria];
    const leida = leidas.some((l) => l.id === n.id);
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 shrink-0">
          <button onClick={() => setDetalle(null)} className="text-gray-400 hover:text-gray-700 shrink-0">
            <ChevronLeft size={18} />
          </button>
          <p className="text-sm font-semibold text-gray-900 truncate flex-1">Detalle de la notificación</p>
          <button onClick={cerrarPanel} className="text-gray-400 hover:text-gray-700 shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="flex items-start gap-3 mb-3">
            <span
              className={`w-11 h-11 rounded-sm flex items-center justify-center shrink-0 ${
                n.urgente ? 'bg-red-50 text-red-600' : 'bg-brand-light text-brand'
              }`}
            >
              <Icon size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{ETIQUETA_CATEGORIA[n.categoria]}</p>
              <p className="text-base font-semibold text-gray-900">{n.titulo}</p>
            </div>
          </div>

          {n.urgente && (
            <span className="inline-block text-xs font-medium bg-red-50 text-red-600 rounded-sm px-2 py-1 mb-3">Urgente</span>
          )}

          <p className="text-xs text-gray-400 mb-3">{fechaCompleta(n.creadaEn)}</p>

          <p className="text-sm text-gray-700 leading-relaxed mb-4">{n.resumen}</p>

          {n.buenasPracticas && n.buenasPracticas.length > 0 && (
            <div className="bg-gray-50 border border-gray-100 rounded-sm px-3 py-2.5 mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Buenas prácticas</p>
              <ul className="flex flex-col gap-1.5">
                {n.buenasPracticas.map((bp) => (
                  <li key={bp} className="text-sm text-gray-600 flex items-start gap-1.5">
                    <CheckCircle2 size={13} className="shrink-0 mt-0.5 text-brand" />
                    <span>{bp}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Link
            to={n.to}
            state={n.state}
            onClick={cerrarPanel}
            className="block text-center bg-brand text-white px-3 py-2 rounded-sm text-sm hover:bg-brand-dark"
          >
            Ir al detalle →
          </Link>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 shrink-0">
          {leida ? (
            <button
              type="button"
              onClick={() => marcarLeida(n.id, false)}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs text-gray-600 border border-gray-200 rounded-sm px-2.5 py-1.5 hover:border-brand hover:text-brand"
            >
              <Check size={13} />
              Marcar como no leída
            </button>
          ) : (
            <button
              type="button"
              onClick={() => marcarLeida(n.id)}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs text-gray-600 border border-gray-200 rounded-sm px-2.5 py-1.5 hover:border-brand hover:text-brand"
            >
              <Check size={13} />
              Marcar como leída
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              eliminarNotificacion(n.id);
              setDetalle(null);
            }}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs text-gray-600 border border-gray-200 rounded-sm px-2.5 py-1.5 hover:border-red-400 hover:text-red-600"
          >
            <Trash2 size={13} />
            Eliminar
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="relative w-9 h-9 flex items-center justify-center rounded-sm border border-gray-200 bg-surface text-gray-600 hover:border-brand hover:text-brand shrink-0"
        title="Notificaciones"
      >
        <Bell size={16} />
        {total > 0 && (
          <span
            className={`absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${
              urgentes > 0 ? 'bg-red-600' : 'bg-brand'
            }`}
          >
            {total}
          </span>
        )}
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50 animate-[fade-in_150ms_ease-out]" onClick={cerrarPanel} />
          <div className="fixed top-0 right-0 h-full w-full max-w-sm bg-surface z-50 shadow-lg flex flex-col animate-[drawer-in-right_220ms_ease-out]">
            {detalle ? (
              <VistaDetalle n={detalle} />
            ) : (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
                  <p className="text-sm font-semibold text-gray-900">Notificaciones</p>
                  <button onClick={cerrarPanel} className="text-gray-400 hover:text-gray-700">
                    <X size={18} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {noLeidas.length === 0 && leidas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
                      <CheckCircle2 size={22} className="text-brand" />
                      <p className="text-sm text-gray-500">Todo al día. Sin notificaciones pendientes.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                        No leídos {noLeidas.length > 0 && `(${noLeidas.length})`}
                      </p>
                      {noLeidas.length === 0 ? (
                        <p className="px-4 pb-3 text-xs text-gray-400">Sin notificaciones nuevas.</p>
                      ) : (
                        noLeidas.map((n) => <Fila key={n.id} n={n} leida={false} />)
                      )}

                      {leidas.length > 0 && (
                        <>
                          <p className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400 border-t border-gray-100">
                            Leídos ({leidas.length})
                          </p>
                          {leidas.map((n) => (
                            <Fila key={n.id} n={n} leida />
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
