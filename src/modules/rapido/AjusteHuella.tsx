import { useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { esTelefono } from '../../lib/sesionTelefono';
import { activarHuella, desactivarHuella, huellaActivada, huellaDisponible, huellaRechazada, rechazarHuella } from '../../lib/bloqueoHuella';

// Activar/quitar el desbloqueo con huella desde /rapido (ver bloqueoHuella.ts). La primera vez sale
// como aviso con "Activar"/"Ahora no"; después queda como una línea discreta al pie de la pantalla.
// Solo en el teléfono y si el móvil tiene huella/cara configurada.
export function AjusteHuella({ variante }: { variante: 'aviso' | 'pie' }) {
  const { user } = useAuth();
  const toast = useToast();
  const [disponible, setDisponible] = useState(false);
  const [activada, setActivada] = useState(huellaActivada);
  const [rechazada, setRechazada] = useState(huellaRechazada);
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    if (esTelefono()) void huellaDisponible().then(setDisponible);
  }, []);

  if (!disponible || !user) return null;

  const activar = async () => {
    setTrabajando(true);
    try {
      await activarHuella(user.id, user.email ?? 'CRM');
      setActivada(true);
      setRechazada(false);
      toast.success('Desbloqueo con huella activado');
    } catch (err) {
      toast.error(err instanceof Error && err.name !== 'NotAllowedError' ? err.message : 'No se ha activado la huella');
    } finally {
      setTrabajando(false);
    }
  };

  const ahoraNo = () => {
    rechazarHuella();
    setRechazada(true);
  };

  const quitar = () => {
    desactivarHuella();
    setActivada(false);
    toast.success('Desbloqueo con huella desactivado');
  };

  if (variante === 'aviso') {
    if (activada || rechazada) return null;
    return (
      <div className="bg-white border border-gray-200 rounded-sm p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-sm bg-brand-light text-brand flex items-center justify-center shrink-0">
            <Fingerprint size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">¿Activar desbloqueo con huella?</p>
            <p className="text-xs text-gray-500">Te la pedirá al abrir la app, en vez de la contraseña.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void activar()}
            disabled={trabajando}
            className="flex-1 bg-brand text-white px-3 py-1.5 rounded-sm text-sm disabled:opacity-60"
          >
            Activar
          </button>
          <button
            type="button"
            onClick={ahoraNo}
            className="flex-1 bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-sm text-sm"
          >
            Ahora no
          </button>
        </div>
      </div>
    );
  }

  // Pie: solo cuando ya se decidió (si no, lo cubre el aviso de arriba).
  if (!activada && !rechazada) return null;
  return (
    <p className="text-xs text-gray-500 flex items-center justify-center gap-1.5 mt-3">
      <Fingerprint size={14} />
      {activada ? (
        <>
          Desbloqueo con huella activado ·{' '}
          <button type="button" onClick={quitar} className="underline">
            Quitar
          </button>
        </>
      ) : (
        <button type="button" onClick={() => void activar()} disabled={trabajando} className="underline">
          Activar desbloqueo con huella
        </button>
      )}
    </p>
  );
}
