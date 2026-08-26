import { Suspense, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ErrorBoundary } from './ErrorBoundary';
import { BuscadorGlobal } from './BuscadorGlobal';
import { VisitaForm } from '../../modules/visitas/VisitaForm';
import { ClienteForm } from '../../modules/clientes/ClienteForm';
import { supabase } from '../../lib/supabase';
import { notaSistema } from '../../lib/notaSistema';
import { crearGastoKilometricoPendiente } from '../../lib/gastoKilometrico';
import type { PrefillVisita, Visita } from '../../modules/visitas/types';
import type { ClienteFormPrefill } from '../../modules/clientes/ClienteForm';

const UNA_HORA_MS = 60 * 60 * 1000;

export type VisitaModalContext = {
  abrirNuevaVisita: (prefill?: PrefillVisita) => void;
  abrirNuevoCliente: (prefill?: ClienteFormPrefill) => void;
  abrirEditarVisita: (visita: Visita) => void;
};

type ModalTipo = 'visita' | 'cliente' | null;

export function AppLayout() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [modalTipo, setModalTipo] = useState<ModalTipo>(null);
  const [visitaEditando, setVisitaEditando] = useState<Visita | null>(null);
  const [prefillVisita, setPrefillVisita] = useState<PrefillVisita | undefined>();
  const [prefillCliente, setPrefillCliente] = useState<ClienteFormPrefill | undefined>();
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

  // Auto-completar visitas pasadas de hora — antes vivía solo en InicioPage.tsx (y sin margen: se
  // marcaba "Realizada" en el segundo exacto en que pasaba la hora), así que si nadie tenía esa
  // pantalla concreta abierta las visitas se quedaban "Pendiente" indefinidamente y la campana
  // seguía avisando de visitas ya hechas hace días (hallazgo real 2026-08-17). Vive aquí porque
  // AppLayout monta en cualquier pantalla del CRM, igual que ya hace la revisión de Gmail de
  // arriba. Al completar, genera también el gasto de kilometraje pendiente de revisar.
  const { data: visitasParaAutocompletar } = useQuery({
    queryKey: ['visitas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visitas')
        .select('*')
        .is('eliminado_en', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Visita[];
    },
  });

  const autocompletarVisitasMutation = useMutation({
    mutationFn: async (visitasAMarcar: Visita[]) => {
      const { error } = await supabase
        .from('visitas')
        .update({ estado: 'Realizada' })
        .in(
          'id',
          visitasAMarcar.map((v) => v.id),
        );
      if (error) throw error;
      for (const v of visitasAMarcar) {
        await notaSistema(
          v.id,
          'Visita marcada automáticamente como realizada (pasó 1 hora desde la hora prevista)',
        );
        try {
          await crearGastoKilometricoPendiente(v);
        } catch (error) {
          console.error(`No se pudo generar el gasto de kilometraje de la visita ${v.id}:`, error);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visitas'] });
      queryClient.invalidateQueries({ queryKey: ['gastos'] });
    },
  });

  useEffect(() => {
    if (!visitasParaAutocompletar || autocompletarVisitasMutation.isPending) return;
    const ahora = Date.now();
    const pasadas = visitasParaAutocompletar.filter(
      (v) =>
        v.estado === 'Pendiente' &&
        v.fecha_visita &&
        new Date(`${v.fecha_visita}T${(v.hora_visita ?? '00:00').slice(0, 5)}:00`).getTime() +
          UNA_HORA_MS <
          ahora,
    );
    if (pasadas.length > 0) autocompletarVisitasMutation.mutate(pasadas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitasParaAutocompletar]);

  // Si el usuario navega a otra sección mientras el formulario está abierto (p.ej. desde el
  // sidebar), cerramos el formulario para que se vea la página de destino en vez de quedarse
  // atascado mostrando el formulario anterior. También cerramos el menú lateral en móvil.
  useEffect(() => {
    setModalTipo(null);
    setSidebarMobilAbierto(false);
  }, [location.pathname]);

  const abrirNuevaVisita = (prefill?: PrefillVisita) => {
    setVisitaEditando(null);
    setPrefillVisita(prefill);
    setModalTipo('visita');
  };

  const abrirNuevoCliente = (prefill?: ClienteFormPrefill) => {
    setPrefillCliente(prefill);
    setModalTipo('cliente');
  };

  const abrirEditarVisita = (visita: Visita) => {
    setVisitaEditando(visita);
    setPrefillVisita(undefined);
    setModalTipo('visita');
  };

  const context: VisitaModalContext = { abrirNuevaVisita, abrirNuevoCliente, abrirEditarVisita };

  return (
    <div className="flex min-h-screen">
      <Sidebar
        abiertoMobil={sidebarMobilAbierto}
        onCerrarMobil={() => setSidebarMobilAbierto(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          onAbrirMenu={() => setSidebarMobilAbierto(true)}
          onAbrirBusqueda={() => setBusquedaAbierta(true)}
        />
        <main className="flex-1 p-3 sm:p-6">
          {modalTipo ? (
            <div className="animate-[slide-fade-left_220ms_ease-out]">
              <ErrorBoundary>
                {modalTipo === 'visita' ? (
                  <VisitaForm
                    onClose={() => setModalTipo(null)}
                    visita={visitaEditando}
                    prefill={prefillVisita}
                  />
                ) : (
                  <ClienteForm onClose={() => setModalTipo(null)} prefill={prefillCliente} />
                )}
              </ErrorBoundary>
            </div>
          ) : (
            <div key={location.pathname} className="animate-[slide-fade-left_220ms_ease-out]">
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="h-96 bg-surface border border-gray-200 rounded-sm animate-pulse" />
                  }
                >
                  <Outlet context={context} />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}
        </main>
      </div>
      <BuscadorGlobal abierto={busquedaAbierta} onClose={() => setBusquedaAbierta(false)} />
    </div>
  );
}
