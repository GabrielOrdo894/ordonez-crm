import { Archive, ArchiveRestore, Mail, MailOpen, Paperclip, Star, Trash2 } from 'lucide-react';
import { AccionesFila } from '../../components/ui/AccionesFila';
import { adjuntosDe, esDestacado, noLeido, type MensajeEquipo } from './types';

function textoPlano(texto: string) {
  return texto.replace(/^[-*]\s+|^#\.\s+/gm, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/[*_](.+?)[*_]/g, '$1');
}

function horaCorta(iso: string) {
  return new Date(iso).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

type MensajeRowProps = {
  mensaje: MensajeEquipo;
  userId: string;
  nombrePorId: Map<string, string>;
  carpeta: 'bandeja' | 'archivo' | 'papelera' | 'otro';
  seleccionado: boolean;
  onToggleSeleccion: () => void;
  onAbrir: () => void;
  onMarcarLeido: (leido: boolean) => void;
  onArchivar: () => void;
  onDesarchivar: () => void;
  onEliminar: () => void;
  onRestaurar: () => void;
  onDestacar: (destacado: boolean) => void;
};

export function MensajeRow({
  mensaje: m,
  userId,
  nombrePorId,
  carpeta,
  seleccionado,
  onToggleSeleccion,
  onAbrir,
  onMarcarLeido,
  onArchivar,
  onDesarchivar,
  onEliminar,
  onRestaurar,
  onDestacar,
}: MensajeRowProps) {
  const esMio = m.autor_id === userId;
  const sinLeer = noLeido(m, userId);
  const destacado = esDestacado(m, userId);

  const etiquetaPara =
    m.destinatario_ids && m.destinatario_ids.length > 0
      ? m.destinatario_ids.map((id) => (id === userId ? 'ti' : (nombrePorId.get(id) ?? 'alguien'))).join(', ')
      : 'todo el equipo';

  const remitente = esMio ? `Tú → ${etiquetaPara}` : m.autor_nombre;
  const tieneAdjuntos = adjuntosDe(m).length > 0;

  return (
    <div
      onClick={onAbrir}
      className={`group flex items-start gap-2.5 px-3 py-2.5 border-b border-gray-100 cursor-pointer hover:bg-brand-light/40 ${
        sinLeer ? 'bg-surface' : 'bg-gray-50/50'
      } ${seleccionado ? 'bg-brand-light/60' : ''}`}
    >
      <input
        type="checkbox"
        checked={seleccionado}
        onClick={(e) => e.stopPropagation()}
        onChange={onToggleSeleccion}
        className="shrink-0 mt-2.5"
      />
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-2 ${sinLeer ? 'bg-brand' : 'bg-transparent'}`} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm truncate ${sinLeer ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{remitente}</span>
          <span className="text-xs text-gray-400 shrink-0">{horaCorta(m.created_at)}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {m.asunto && (
            <span className={`text-xs shrink-0 max-w-[45%] truncate ${sinLeer ? 'font-semibold text-gray-800' : 'text-gray-500'}`}>
              {m.asunto}
            </span>
          )}
          <span className="text-xs text-gray-400 truncate min-w-0 flex-1">{textoPlano(m.texto)}</span>
          {tieneAdjuntos && <Paperclip size={12} className="text-gray-400 shrink-0" />}
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDestacar(!destacado);
        }}
        className="shrink-0 mt-0.5 text-gray-300 hover:text-amber-500"
        title={destacado ? 'Quitar de destacados' : 'Marcar como destacado'}
      >
        <Star size={15} className={destacado ? 'fill-amber-400 text-amber-400' : ''} />
      </button>

      <div className="shrink-0">
        <AccionesFila
          rapidas={[
            {
              icon: sinLeer ? MailOpen : Mail,
              label: sinLeer ? 'Marcar como leído' : 'Marcar como no leído',
              onClick: () => onMarcarLeido(sinLeer),
            },
            carpeta === 'archivo'
              ? { icon: ArchiveRestore, label: 'Sacar del archivo', onClick: onDesarchivar }
              : { icon: Archive, label: 'Archivar', onClick: onArchivar, tono: 'neutro' as const },
            carpeta === 'papelera'
              ? { icon: ArchiveRestore, label: 'Restaurar', onClick: onRestaurar }
              : { icon: Trash2, label: 'Eliminar', onClick: onEliminar, tono: 'peligro' as const },
          ]}
          menu={[
            { label: sinLeer ? 'Marcar como leído' : 'Marcar como no leído', onClick: () => onMarcarLeido(sinLeer) },
            carpeta === 'archivo'
              ? { label: 'Sacar del archivo', onClick: onDesarchivar }
              : { label: 'Archivar', onClick: onArchivar },
            carpeta === 'papelera'
              ? { label: 'Restaurar', onClick: onRestaurar }
              : { label: 'Eliminar', onClick: onEliminar, destructivo: true },
          ]}
        />
      </div>
    </div>
  );
}
