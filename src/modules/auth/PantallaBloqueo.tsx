import { useEffect, useRef, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { comprobarHuella } from '../../lib/bloqueoHuella';

// Candado del teléfono (ver bloqueoHuella.ts): se muestra antes que cualquier pantalla del CRM.
// Pide la huella sola al abrirse; si el navegador exige pulsar antes (Safari), queda el botón.
export default function PantallaBloqueo({ onDesbloqueado }: { onDesbloqueado: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [comprobando, setComprobando] = useState(false);
  const pedidaAlAbrir = useRef(false);

  const desbloquear = async () => {
    setError(null);
    setComprobando(true);
    try {
      await comprobarHuella();
      onDesbloqueado();
    } catch {
      setError('No se ha podido comprobar la huella. Inténtalo de nuevo o entra con la contraseña.');
    } finally {
      setComprobando(false);
    }
  };

  useEffect(() => {
    if (pedidaAlAbrir.current) return;
    pedidaAlAbrir.current = true;
    void desbloquear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entrarConContrasena = async () => {
    // scope 'local': solo borra la sesión de este móvil, sin llamar al servidor (funciona sin red).
    // Al quedarse sin sesión, App.tsx muestra el login y quita el bloqueo.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) setError(error.message);
  };

  return (
    <div className="min-h-screen bg-[#f4f4f2] flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-sm p-6 flex flex-col items-center text-center gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand mb-1">CRM Oficial</p>
          <h1 className="text-lg font-bold text-gray-900">Reformas Ordoñez</h1>
        </div>
        <button
          type="button"
          onClick={() => void desbloquear()}
          disabled={comprobando}
          className="w-full bg-brand text-white px-3 py-2.5 rounded-sm text-sm flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <Fingerprint size={18} />
          {comprobando ? 'Comprobando…' : 'Desbloquear con huella'}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="button" onClick={() => void entrarConContrasena()} className="text-xs text-gray-500 underline">
          Entrar con contraseña
        </button>
      </div>
    </div>
  );
}
