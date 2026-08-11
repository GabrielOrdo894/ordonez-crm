import { ArrowLeft, Archive, ArchiveRestore, Info, Mail, Paperclip, Reply, Star, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { parsearTextoEnriquecido } from '../../lib/textoEnriquecido';
import { adjuntosDe, esDestacado, esImagen, type MensajeEquipo } from './types';

function fechaLarga(iso: string) {
  return new Date(iso).toLocaleString('es', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

type MensajeDetalleFullProps = {
  mensaje: MensajeEquipo;
  hilo: MensajeEquipo[];
  userId: string;
  nombrePorId: Map<string, string>;
  carpeta: 'bandeja' | 'archivo' | 'papelera' | 'otro';
  onVolver: () => void;
  onMarcarNoLeido: () => void;
  onArchivar: () => void;
  onDesarchivar: () => void;
  onEliminar: () => void;
  onRestaurar: () => void;
  onDestacar: (destacado: boolean) => void;
  onResponder: () => void;
};

// Vista a pantalla completa, no modal — como al abrir un correo en Gmail. Cuando el mensaje forma
// parte de un hilo (respuestas encadenadas), se muestra todo el historial en orden cronológico,
// no solo el mensaje que se pulsó.
export function MensajeDetalleFull({
  mensaje: m,
  hilo,
  userId,
  nombrePorId,
  carpeta,
  onVolver,
  onMarcarNoLeido,
  onArchivar,
  onDesarchivar,
  onEliminar,
  onRestaurar,
  onDestacar,
  onResponder,
}: MensajeDetalleFullProps) {
  const esMio = m.autor_id === userId;
  const destacado = esDestacado(m, userId);
  const puedeResponder = !esMio && !m.automatico;
  const destinatarios =
    m.destinatario_ids && m.destinatario_ids.length > 0
      ? m.destinatario_ids.map((id) => (id === userId ? 'ti' : (nombrePorId.get(id) ?? 'alguien'))).join(', ')
      : 'todo el equipo';
  const raiz = hilo[0] ?? m;

  return (
    <div className="max-w-3xl mx-auto flex flex-col md:h-[calc(100vh-140px)]">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3 shrink-0">
        <button onClick={onVolver} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={15} />
          Volver
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          {puedeResponder && (
            <Button size="sm" onClick={onResponder}>
              <span className="flex items-center gap-1.5">
                <Reply size={13} />
                Responder
              </span>
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => onDestacar(!destacado)}>
            <span className="flex items-center gap-1.5">
              <Star size={13} className={destacado ? 'fill-amber-400 text-amber-500' : ''} />
              {destacado ? 'Quitar destacado' : 'Destacar'}
            </span>
          </Button>
          <Button size="sm" variant="secondary" onClick={onMarcarNoLeido}>
            <span className="flex items-center gap-1.5">
              <Mail size={13} />
              No leído
            </span>
          </Button>
          {carpeta === 'archivo' ? (
            <Button size="sm" variant="secondary" onClick={onDesarchivar}>
              <span className="flex items-center gap-1.5">
                <ArchiveRestore size={13} />
                Sacar del archivo
              </span>
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={onArchivar}>
              <span className="flex items-center gap-1.5">
                <Archive size={13} />
                Archivar
              </span>
            </Button>
          )}
          {carpeta === 'papelera' ? (
            <Button size="sm" variant="secondary" onClick={onRestaurar}>
              <span className="flex items-center gap-1.5">
                <ArchiveRestore size={13} />
                Restaurar
              </span>
            </Button>
          ) : (
            <Button size="sm" variant="danger" onClick={onEliminar}>
              <span className="flex items-center gap-1.5">
                <Trash2 size={13} />
                Eliminar
              </span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto bg-surface border border-gray-200 rounded-sm p-5">
        <p className="text-lg font-semibold text-gray-900 mb-1">{raiz.asunto || 'Sin asunto'}</p>
        <p className="text-xs text-gray-400 border-b border-gray-100 pb-3 mb-4">
          Para: {destinatarios}
          {hilo.length > 1 && ` · ${hilo.length} mensajes en este hilo`}
        </p>

        {m.automatico && (
          <p className="flex items-start gap-1.5 bg-gray-50 border border-gray-200 text-gray-500 text-xs rounded-sm px-2.5 py-1.5 mb-4">
            <Info size={13} className="shrink-0 mt-0.5" />
            Este es un mensaje automático de notificación de gestión — no se puede responder directamente.
          </p>
        )}

        <div className="flex flex-col gap-5">
          {hilo.map((msg, idx) => {
            const mensajeMio = msg.autor_id === userId;
            const adjuntos = adjuntosDe(msg);
            return (
              <div key={msg.id} className={idx > 0 ? 'border-t border-gray-100 pt-4' : ''}>
                <div className="flex items-center justify-between gap-2 text-sm mb-1.5">
                  <p className="font-semibold text-gray-900">{mensajeMio ? 'Tú' : msg.autor_nombre}</p>
                  <p className="text-xs text-gray-400 shrink-0">{fechaLarga(msg.created_at)}</p>
                </div>
                <div className="text-sm text-gray-800">
                  {parsearTextoEnriquecido(msg.texto).map((bloque, i) => (
                    <p key={i} className={`whitespace-pre-wrap ${bloque.negrita ? 'font-semibold' : ''} ${bloque.cursiva ? 'italic' : ''}`}>
                      {bloque.texto}
                    </p>
                  ))}
                </div>
                {adjuntos.length > 0 && (
                  <div className="flex flex-col gap-2 mt-2.5">
                    <div className="flex flex-wrap gap-3">
                      {adjuntos.map((a) => (
                        <a
                          key={a.url}
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-xs text-brand hover:underline w-fit"
                        >
                          <Paperclip size={13} />
                          {a.nombre}
                        </a>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {adjuntos
                        .filter((a) => esImagen(a.nombre))
                        .map((a) => (
                          <img key={a.url} src={a.url} alt="" className="max-h-72 rounded-sm" />
                        ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
