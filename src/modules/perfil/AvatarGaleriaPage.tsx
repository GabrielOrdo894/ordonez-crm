import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { AvatarCropper } from './AvatarCropper';
import { subirAvatarPersonal } from '../../lib/avatarPersonal';
import { mensajeError } from '../../lib/mensajeError';
import { AVATARES_ILUSTRADOS, PALETA_AVATARES, iniciales, avatarPredefinidoUrl } from './avatares';

export default function AvatarGaleriaPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [srcParaRecortar, setSrcParaRecortar] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const avatarActual = (user?.user_metadata?.avatar_url as string) ?? '';
  const nombreUsuario = (user?.user_metadata?.nombre as string) || user?.email || '';

  const handleConfirmar = async (blob: Blob) => {
    if (!user) return;
    setSrcParaRecortar(null);
    setGuardando(true);
    try {
      const url = await subirAvatarPersonal(user.id, blob);
      const { error } = await supabase.auth.updateUser({ data: { ...user.user_metadata, avatar_url: url } });
      if (error) throw error;
      toast.success('Foto de perfil actualizada');
      navigate('/perfil');
    } catch (error) {
      toast.error(mensajeError(error));
    } finally {
      setGuardando(false);
    }
  };

  const todosLosAvatares = [
    ...AVATARES_ILUSTRADOS,
    ...PALETA_AVATARES.map((c) => avatarPredefinidoUrl(iniciales(nombreUsuario || 'RO'), c)),
  ];

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => navigate('/perfil')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4"
      >
        <ArrowLeft size={15} />
        Volver a mi perfil
      </button>

      <div className="bg-surface border border-gray-200 rounded-sm p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-4">
          Elige una foto de perfil {guardando && '— guardando...'}
        </p>
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
          {todosLosAvatares.map((url, i) => {
            const seleccionado = avatarActual === url;
            return (
              <button
                key={`${url}-${i}`}
                type="button"
                disabled={guardando}
                onClick={() => setSrcParaRecortar(url)}
                className={`aspect-square rounded-full overflow-hidden ${
                  seleccionado ? 'ring-2 ring-offset-2 ring-brand' : ''
                }`}
                title="Usar este avatar"
              >
                <img src={url} alt="" className="w-full h-full object-cover" />
              </button>
            );
          })}
        </div>
      </div>

      {srcParaRecortar && (
        <AvatarCropper src={srcParaRecortar} onCancel={() => setSrcParaRecortar(null)} onConfirm={handleConfirmar} />
      )}
    </div>
  );
}
