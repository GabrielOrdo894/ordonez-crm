import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ErrorBoundary } from './ErrorBoundary';
import { BuscadorGlobal } from './BuscadorGlobal';
import { VisitaForm } from '../../modules/visitas/VisitaForm';
import { ClienteForm } from '../../modules/clientes/ClienteForm';
import { supabase } from '../../lib/supabase';
import type { Visita } from '../../modules/visitas/types';

export type VisitaModalContext = {
  abrirNuevaVisita: (fechaPrefill?: string) => void;
  abrirNuevoCliente: () => void;
  abrirEditarVisita: (visita: Visita) => void;
};

type ModalTipo = 'visita' | 'cliente' | null;

export function AppLayout() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [modalTipo, setModalTipo] = useState<ModalTipo>(null);
  const [visitaEditando, setVisitaEditando] = useState<Visita | null>(null);
  const [fechaPrefill, setFechaPrefill] = useState<string | undefined>();
  const [sidebarMobilAbierto, setSidebarMobilAbierto] = useState(false);
  const [busquedaAbierta, setBusquedaAbierta] = useState(false);
  const gmailAutoRevisado = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setBusquedaAbierta(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Comprobación de Gmail automática al entrar al CRM (una vez por sesión de la pestaña) —
  // silenciosa: si falla (p.ej. Google no conectado todavía) no interrumpe con un toast, solo
  // queda en consola. El botón manual de Solicitudes sigue siendo la vía si algo falla aquí.
  useEffect(() => {
    if (gmailAutoRevisado.current) return;
    gmailAutoRevisado.current = true;
    supabase.functions.invoke('revisar-gmail').then(({ data, error }) => {
      if (error) {
        console.error('Revisión automática de Gmail:', error.message);
        return;
      }
      if (data?.ok === false) {
        console.error('Revisión automática de Gmail:', data.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] });
      queryClient.invalidateQueries({ queryKey: ['presupuestos', 'respuestas-pendientes'] });
    });
  }, [queryClient]);

  // Si el usuario navega a otra sección mientras el formulario está abierto (p.ej. desde el
  // sidebar), cerramos el formulario para que se vea la página de destino en vez de quedarse
  // atascado mostrando el formulario anterior. También cerramos el menú lateral en móvil.
  useEffect(() => {
    setModalTipo(null);
    setSidebarMobilAbierto(false);
  }, [location.pathname]);

  const abrirNuevaVisita = (fecha?: string) => {
    setVisitaEditando(null);
    setFechaPrefill(fecha);
    setModalTipo('visita');
  };

  const abrirNuevoCliente = () => {
    setModalTipo('cliente');
  };

  const abrirEditarVisita = (visita: Visita) => {
    setVisitaEditando(visita);
    setFechaPrefill(undefined);
    setModalTipo('visita');
  };

  const context: VisitaModalContext = { abrirNuevaVisita, abrirNuevoCliente, abrirEditarVisita };

  return (
    <div className="flex min-h-screen">
      <Sidebar abiertoMobil={sidebarMobilAbierto} onCerrarMobil={() => setSidebarMobilAbierto(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onAbrirMenu={() => setSidebarMobilAbierto(true)} onAbrirBusqueda={() => setBusquedaAbierta(true)} />
        <main className="flex-1 p-3 sm:p-6">
          {modalTipo ? (
            <div className="animate-[slide-fade-left_220ms_ease-out]">
              <ErrorBoundary>
                {modalTipo === 'visita' ? (
                  <VisitaForm onClose={() => setModalTipo(null)} visita={visitaEditando} fechaPrefill={fechaPrefill} />
                ) : (
                  <ClienteForm onClose={() => setModalTipo(null)} />
                )}
              </ErrorBoundary>
            </div>
          ) : (
            <div key={location.pathname} className="animate-[slide-fade-left_220ms_ease-out]">
              <ErrorBoundary>
                <Outlet context={context} />
              </ErrorBoundary>
            </div>
          )}
        </main>
      </div>
      <BuscadorGlobal abierto={busquedaAbierta} onClose={() => setBusquedaAbierta(false)} />
    </div>
  );
}
