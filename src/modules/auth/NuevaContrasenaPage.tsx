import { useState } from 'react';
import { supabase } from '../../lib/supabase';

type Props = { onListo: () => void };

export default function NuevaContrasenaPage({ onListo }: Props) {
  const [contrasena, setContrasena] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (contrasena.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (contrasena !== confirmacion) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: contrasena });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    onListo();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f4f4f2] p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand mb-2">CRM Oficial</p>
          <h1 className="text-2xl font-bold text-gray-900">Elige una contraseña nueva</h1>
          <p className="text-sm text-gray-500 mt-1">Reformas Ordoñez — gestión interna</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              Contraseña nueva
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              className="w-full border border-gray-200 rounded-sm px-2.5 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              Repite la contraseña
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              className="w-full border border-gray-200 rounded-sm px-2.5 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand text-white px-3 py-2 rounded-sm text-sm hover:bg-brand-dark disabled:opacity-60"
          >
            {loading ? 'Guardando...' : 'Guardar contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}
