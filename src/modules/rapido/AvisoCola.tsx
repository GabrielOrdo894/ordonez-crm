import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudOff, RefreshCw, X } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { useConfirmar } from '../../hooks/useConfirm';
import { EVENTO_COLA, listarPendientes, mensajeError, quitarPendiente, type Pendiente } from './colaOffline';
import { procesarCola } from './envios';

// Aviso fijo bajo la cabecera de /rapido: "Sin conexión" y cuántos envíos esperan en el móvil.
// Envía la cola sola al abrir la pantalla y al volver la cobertura (evento `online`); el botón
// "Enviar ahora" es por si el móvil no avisa del cambio de red. Solo vive aquí: si se pasa al CRM
// completo, lo pendiente espera a la próxima vez que se abra /rapido.

function describir(p: Pendiente): string {
  const hora = new Date(p.creado).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  if (p.tipo === 'km') return `Kilometraje${p.etiquetaVisita ? ` (${p.etiquetaVisita})` : ''} · ${hora}`;
  if (p.tipo === 'ticket') return `Foto de ticket${p.nota.trim() ? ` (${p.nota.trim()})` : ''} · ${hora}`;
  return `${p.fotos.length} foto(s) de obra (${p.obraNombre}) · ${hora}`;
}

export function AvisoCola() {
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const [enLinea, setEnLinea] = useState(() => navigator.onLine);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [abierto, setAbierto] = useState(false);

  const recargar = useCallback(async () => {
    try {
      setPendientes(await listarPendientes());
    } catch (err) {
      toast.error(`No se pudo leer lo pendiente de enviar: ${mensajeError(err)}`);
    }
  }, [toast]);

  const enviar = useCallback(async () => {
    if (!navigator.onLine) return;
    setEnviando(true);
    try {
      const resultado = await procesarCola();
      if (!resultado) return;
      if (resultado.enviados > 0) {
        queryClient.invalidateQueries({ queryKey: ['gastos'] });
        queryClient.invalidateQueries({ queryKey: ['galeria'] });
        toast.success(`${resultado.enviados} envío(s) guardado(s) sin conexión ya están en el CRM`);
      }
      if (resultado.conError > 0) toast.error(`${resultado.conError} envío(s) no se pudieron guardar — revísalos en el aviso de arriba`);
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setEnviando(false);
      await recargar();
    }
  }, [queryClient, recargar, toast]);

  useEffect(() => {
    void recargar().then(() => enviar());
    const alConectar = () => {
      setEnLinea(true);
      void enviar();
    };
    const alDesconectar = () => setEnLinea(false);
    const alCambiarCola = () => void recargar();
    window.addEventListener('online', alConectar);
    window.addEventListener('offline', alDesconectar);
    window.addEventListener(EVENTO_COLA, alCambiarCola);
    return () => {
      window.removeEventListener('online', alConectar);
      window.removeEventListener('offline', alDesconectar);
      window.removeEventListener(EVENTO_COLA, alCambiarCola);
    };
    // Solo al montar: recargar/enviar son estables salvo por toast/queryClient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const descartar = async (p: Pendiente) => {
    const ok = await confirmar({
      titulo: 'Descartar envío pendiente',
      mensaje: `"${describir(p)}" se borra del móvil y no llegará al CRM.`,
      textoConfirmar: 'Descartar',
    });
    if (!ok) return;
    try {
      await quitarPendiente(p.id);
    } catch (err) {
      toast.error(mensajeError(err));
    }
  };

  if (enLinea && pendientes.length === 0) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900">
      <div className="w-full max-w-md mx-auto px-4 py-2 flex items-center gap-2 text-xs">
        {!enLinea && <CloudOff size={14} className="shrink-0" />}
        <button type="button" onClick={() => setAbierto((v) => !v)} className="flex-1 text-left" disabled={pendientes.length === 0}>
          {!enLinea && <span className="font-semibold">Sin conexión</span>}
          {!enLinea && pendientes.length > 0 && ' · '}
          {pendientes.length > 0 && <span className="underline">{pendientes.length} pendiente(s) de enviar</span>}
          {!enLinea && pendientes.length === 0 && ' — lo que registres se guarda en el móvil'}
        </button>
        {enLinea && pendientes.length > 0 && (
          <button
            type="button"
            onClick={() => void enviar()}
            disabled={enviando}
            className="flex items-center gap-1 bg-white border border-amber-300 px-2 py-1 rounded-sm disabled:opacity-60"
          >
            <RefreshCw size={12} className={enviando ? 'animate-spin' : ''} />
            {enviando ? 'Enviando…' : 'Enviar ahora'}
          </button>
        )}
      </div>
      {abierto && pendientes.length > 0 && (
        <ul className="w-full max-w-md mx-auto px-4 pb-2 flex flex-col gap-1">
          {pendientes.map((p) => (
            <li key={p.id} className="bg-white border border-amber-200 rounded-sm px-3 py-2 text-xs flex items-start gap-2">
              <span className="flex-1 min-w-0">
                <span className="block text-gray-800">{describir(p)}</span>
                {p.ultimoError && <span className="block text-red-600 mt-0.5">{p.ultimoError}</span>}
              </span>
              <button type="button" onClick={() => void descartar(p)} className="text-gray-400 shrink-0" aria-label="Descartar">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
