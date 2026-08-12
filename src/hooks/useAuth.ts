import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useToast } from './useToast';

export type Rol = 'admin' | 'gestion' | 'contable';

export function useAuth() {
  const toast = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Supabase, al abrir el enlace de recuperación de contraseña del email, establece una sesión
  // válida directamente — sin este flag, App.tsx la trataría como un login normal y mandaría al
  // usuario a la pantalla principal en vez de dejarle elegir la contraseña nueva.
  const [recuperandoContrasena, setRecuperandoContrasena] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) toast.error(error.message);
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecuperandoContrasena(true);
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const user: User | null = session?.user ?? null;
  const rol: Rol = (user?.user_metadata?.rol as Rol) ?? 'gestion';

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const contrasenaActualizada = () => setRecuperandoContrasena(false);

  return { session, user, rol, loading, signOut, recuperandoContrasena, contrasenaActualizada };
}
