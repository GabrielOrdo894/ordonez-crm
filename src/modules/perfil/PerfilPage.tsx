import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { AvatarCropper } from './AvatarCropper';
import { subirAvatarPersonal } from '../../lib/avatarPersonal';
import { mensajeError } from '../../lib/mensajeError';
import { AVATARES_ILUSTRADOS, PALETA_AVATARES, iniciales, avatarPredefinidoUrl } from './avatares';

const ROL_LABEL: Record<string, string> = {
  admin: 'Admin',
  gestion: 'Gestión',
  contable: 'Contable',
};

function fechaLarga(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function PerfilPage() {
  const { user, rol } = useAuth();
  const toast = useToast();

  const metadata = user?.user_metadata ?? {};
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const cargado = useRef(false);
  useEffect(() => {
    if (cargado.current || !user) return;
    cargado.current = true;
    setNombre((user.user_metadata?.nombre as string) ?? '');
    setTelefono((user.user_metadata?.telefono as string) ?? '');
    setAvatarUrl((user.user_metadata?.avatar_url as string) ?? '');
  }, [user]);

  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordConfirmar, setPasswordConfirmar] = useState('');
  const [archivoOriginal, setArchivoOriginal] = useState<File | null>(null);
  const [srcParaRecortar, setSrcParaRecortar] = useState<string | null>(null);

  const handleArchivoSeleccionado = (file: File) => {
    setArchivoOriginal(file);
    const lector = new FileReader();
    lector.onload = () => setSrcParaRecortar(lector.result as string);
    lector.readAsDataURL(file);
  };

  const handleAvatarConfirmado = async (blob: Blob) => {
    if (!user) return;
    setSrcParaRecortar(null);
    setArchivoOriginal(null);
    setSubiendo(true);
    try {
      const url = await subirAvatarPersonal(user.id, blob);
      setAvatarUrl(url);
    } catch (error) {
      toast.error(mensajeError(error));
    } finally {
      setSubiendo(false);
    }
  };

  const guardarMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.updateUser({
        data: { ...metadata, nombre, telefono, avatar_url: avatarUrl },
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success('Perfil actualizado'),
    onError: (error) => toast.error(error.message),
  });

  const cambiarPasswordMutation = useMutation({
    mutationFn: async () => {
      if (passwordNueva.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
      if (passwordNueva !== passwordConfirmar) throw new Error('Las contraseñas no coinciden');
      const { error } = await supabase.auth.updateUser({ password: passwordNueva });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Contraseña actualizada');
      setPasswordNueva('');
      setPasswordConfirmar('');
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      <section className="bg-surface border border-gray-200 rounded-sm p-4">
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Mi perfil</p>
          <Button size="sm" onClick={() => guardarMutation.mutate()} disabled={guardarMutation.isPending}>
            {guardarMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-brand-light flex items-center justify-center text-brand text-xl font-bold overflow-hidden shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                iniciales(nombre || user?.email || '')
              )}
            </div>
            <label className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline cursor-pointer">
              <Camera size={14} />
              {subiendo ? 'Subiendo...' : 'Cambiar foto'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={subiendo}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleArchivoSeleccionado(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">O elige un avatar</p>
              <Link to="/perfil/avatares" className="text-xs text-brand hover:underline">
                Ver todos →
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {AVATARES_ILUSTRADOS.map((url) => {
                const seleccionado = avatarUrl === url;
                return (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setSrcParaRecortar(url)}
                    className={`w-12 h-12 rounded-full overflow-hidden shrink-0 ${
                      seleccionado ? 'ring-2 ring-offset-2 ring-brand' : ''
                    }`}
                    title="Usar este avatar"
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </button>
                );
              })}
              {PALETA_AVATARES.map((color) => {
                const url = avatarPredefinidoUrl(iniciales(nombre || user?.email || ''), color);
                const seleccionado = avatarUrl === url;
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSrcParaRecortar(url)}
                    className={`w-12 h-12 rounded-full overflow-hidden shrink-0 ${
                      seleccionado ? 'ring-2 ring-offset-2 ring-brand' : ''
                    }`}
                    title="Usar este avatar"
                  >
                    <img src={url} alt="" className="w-full h-full" />
                  </button>
                );
              })}
            </div>
          </div>

          {srcParaRecortar && (
            <AvatarCropper
              src={srcParaRecortar}
              archivoOriginal={archivoOriginal ?? undefined}
              onCancel={() => {
                setSrcParaRecortar(null);
                setArchivoOriginal(null);
              }}
              onConfirm={handleAvatarConfirmado}
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <Input label="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </div>
        </div>
      </section>

      <section className="bg-surface border border-gray-200 rounded-sm p-4">
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Cambiar contraseña</p>
          <Button
            size="sm"
            onClick={() => cambiarPasswordMutation.mutate()}
            disabled={cambiarPasswordMutation.isPending || !passwordNueva}
          >
            {cambiarPasswordMutation.isPending ? 'Guardando...' : 'Actualizar'}
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Nueva contraseña"
            type="password"
            value={passwordNueva}
            onChange={(e) => setPasswordNueva(e.target.value)}
          />
          <Input
            label="Confirmar contraseña"
            type="password"
            value={passwordConfirmar}
            onChange={(e) => setPasswordConfirmar(e.target.value)}
          />
        </div>
      </section>

      <section className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-4">
          Información de la cuenta
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-gray-400 uppercase tracking-wide">Email</p>
            <p className="text-gray-800">{user?.email}</p>
          </div>
          <div>
            <p className="text-gray-400 uppercase tracking-wide">Rol</p>
            <p className="text-gray-800">{ROL_LABEL[rol] ?? rol}</p>
          </div>
          <div>
            <p className="text-gray-400 uppercase tracking-wide">Cuenta creada</p>
            <p className="text-gray-800">{fechaLarga(user?.created_at)}</p>
          </div>
          <div>
            <p className="text-gray-400 uppercase tracking-wide">Último acceso</p>
            <p className="text-gray-800">{fechaLarga(user?.last_sign_in_at)}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
