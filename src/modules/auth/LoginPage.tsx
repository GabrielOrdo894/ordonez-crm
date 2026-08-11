import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
  };

  return (
    <div className="min-h-screen flex bg-[#f4f4f2]">
      <div className="w-full md:w-[40%] flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand mb-2">CRM Oficial</p>
            <h1 className="text-2xl font-bold text-gray-900">Reformas Ordoñez</h1>
            <p className="text-sm text-gray-500 mt-1">Accede a la gestión interna de la empresa</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-sm px-2.5 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Contraseña
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-sm px-2.5 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand text-white px-3 py-2 rounded-sm text-sm hover:bg-brand-dark disabled:opacity-60"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>

      <div className="hidden md:block md:w-[60%] relative">
        <img
          src="https://ordonezrenov.com/wp-content/uploads/2026/07/login-fachada.webp"
          alt="Reforma de fachada por Reformas Ordoñez"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-dark/80 via-brand-dark/10 to-transparent" />
        <div className="absolute bottom-10 left-10 right-10 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70 mb-2">Reformas Ordoñez</p>
          <p className="text-2xl font-semibold leading-snug max-w-md">
            Transformamos espacios a ambos lados de la frontera.
          </p>
        </div>
      </div>
    </div>
  );
}
