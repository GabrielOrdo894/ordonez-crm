import { useEffect, useState } from 'react';
import { isAuthRetryableFetchError, type Session, type User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { esTelefono } from '../lib/sesionTelefono';
import { useToast } from './useToast';

export type Rol = 'admin' | 'gestion' | 'contable';

// App móvil abierta sin cobertura (2026-09-28): el token de acceso dura 1 h y Supabase no puede
// renovarlo sin red, así que getSession() devuelve null y salía el login aunque la sesión siguiera
// guardada — y sin red no se puede iniciar sesión. En ese caso (y solo si la sesión es de hoy, para
// no saltarse el cierre a medianoche de App.tsx; en el teléfono no hay cierre a medianoche, así que
// vale siempre) se usa la sesión guardada para poder abrir /rapido y dejar envíos en la cola; las
// llamadas a Supabase fallan igual hasta que vuelve la red.
function sesionGuardadaSinConexion(): Session | null {
  try {
    const hoy = new Date();
    const hoyIso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    if (!esTelefono() && localStorage.getItem('crm_sesion_fecha') !== hoyIso) return null;
    const ref = new URL(import.meta.env.VITE_SUPABASE_URL as string).hostname.split('.')[0];
    const guardada = localStorage.getItem(`sb-${ref}-auth-token`);
    const sesion = guardada ? (JSON.parse(guardada) as Session) : null;
    return sesion?.access_token && sesion.user ? sesion : null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const toast = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Supabase, al abrir el enlace de recuperación de contraseña del email, establece una sesión
  // válida directamente — sin este flag, App.tsx la trataría como un login normal y mandaría al
  // usuario a la pantalla principal en vez de dejarle elegir la contraseña nueva.
  const [recuperandoContrasena, setRecuperandoContrasena] = useState(false);

  useEffect(() => {
    const cargar = () =>
      supabase.auth.getSession().then(({ data, error }) => {
        const sinConexion = error && isAuthRetryableFetchError(error) ? sesionGuardadaSinConexion() : null;
        if (error && !sinConexion) toast.error(error.message);
        setSession(data.session ?? sinConexion);
        setLoading(false);
      });
    void cargar();
    // Abierta sin cobertura con la sesión guardada (ver sesionGuardadaSinConexion): al volver la red
    // se renueva el token y se sustituye la copia por la sesión real.
    const alConectar = () => void cargar();
    window.addEventListener('online', alConectar);

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecuperandoContrasena(true);
      // La sesión inicial ya la resuelve cargar(); este evento llega con null cuando no hay red
      // y pisaría la sesión guardada.
      if (event === 'INITIAL_SESSION') return;
      setSession(newSession);
    });

    return () => {
      listener.subscription.unsubscribe();
      window.removeEventListener('online', alConectar);
    };
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
