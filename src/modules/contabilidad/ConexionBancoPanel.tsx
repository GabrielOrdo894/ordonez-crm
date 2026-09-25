import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, RefreshCw, Unplug, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { useConfirmar } from '../../hooks/useConfirm';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { conciliarCobrosAutomaticos, invocarBancoSync } from '../../lib/conciliacionBancaria';
import type { ConexionBanco } from './types';

const CLAVE_STATE = 'banco-sync-state';

type ResumenSync = {
  nuevos: number;
  gastosCreados: number;
  gastosVinculados: number;
  pagosAmbiguos: number;
  errores: string[];
};

type Banco = { name: string; country: string; logo?: string };

function fechaHora(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Conexión automática con el banco vía Enable Banking (Edge Function banco-sync): conectar,
 * sincronizar a mano, desconectar, y recoger la vuelta del banco (?code=&state=) tras autorizar. */
export function ConexionBancoPanel() {
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [eligiendoBanco, setEligiendoBanco] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const vueltaProcesada = useRef(false);

  const { data: configuracion } = useQuery({
    queryKey: ['banco-sync', 'estado'],
    queryFn: () => invocarBancoSync<{ configurado: boolean }>({ accion: 'estado' }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: conexiones, isLoading } = useQuery({
    queryKey: ['banco_conexiones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('banco_conexiones')
        .select('*')
        .neq('estado', 'desconectada')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ConexionBanco[];
    },
  });

  const { data: bancos, isLoading: cargandoBancos } = useQuery({
    queryKey: ['banco-sync', 'bancos', 'FR'],
    enabled: eligiendoBanco,
    queryFn: async () =>
      (await invocarBancoSync<{ bancos: Banco[] }>({ accion: 'bancos', pais: 'FR' })).bancos,
    staleTime: 60 * 60 * 1000,
  });

  const bancosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (bancos ?? []).filter((b) => !q || b.name.toLowerCase().includes(q));
  }, [bancos, busqueda]);

  function avisarResultado(r: ResumenSync, conciliados: number) {
    const partes = [`${r.nuevos} movimientos nuevos`];
    if (r.gastosCreados > 0) partes.push(`${r.gastosCreados} gastos pendientes de revisar`);
    if (r.gastosVinculados > 0)
      partes.push(`${r.gastosVinculados} pagos enlazados a gastos existentes`);
    if (conciliados > 0) partes.push(`${conciliados} cobros conciliados con su factura`);
    toast.success(partes.join(' · '));
    if (r.pagosAmbiguos > 0) {
      toast.warning(`${r.pagosAmbiguos} pagos coinciden con varios gastos: vincúlalos a mano`);
    }
    for (const e of r.errores) toast.error(e);
  }

  function refrescar() {
    for (const clave of [
      'movimientos_banco',
      'banco_conexiones',
      'gastos',
      'facturas',
      'asientos_contables',
    ]) {
      queryClient.invalidateQueries({ queryKey: [clave] });
    }
  }

  async function conciliar(): Promise<number> {
    const { conciliados, avisos } = await conciliarCobrosAutomaticos();
    for (const a of avisos) toast.warning(a);
    return conciliados;
  }

  const sincronizarMutation = useMutation({
    mutationFn: async () => {
      const r = await invocarBancoSync<ResumenSync>({ accion: 'sincronizar' });
      return { r, conciliados: await conciliar() };
    },
    onSuccess: ({ r, conciliados }) => {
      refrescar();
      avisarResultado(r, conciliados);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const iniciarMutation = useMutation({
    mutationFn: async (aspspNombre: string) => {
      const state = crypto.randomUUID();
      try {
        sessionStorage.setItem(CLAVE_STATE, state);
      } catch {
        // sin sessionStorage no se puede verificar la vuelta; se intenta igualmente
      }
      const redirectUrl = `${window.location.origin}${import.meta.env.BASE_URL}contabilidad/banco`;
      const { url } = await invocarBancoSync<{ url: string }>({
        accion: 'iniciar',
        aspsp_nombre: aspspNombre,
        pais: 'FR',
        psu_type: 'business',
        redirect_url: redirectUrl,
        state,
      });
      window.location.href = url;
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const crearSesionMutation = useMutation({
    mutationFn: async (code: string) => {
      const r = await invocarBancoSync<{ cuentas: number; sincronizacion: ResumenSync }>({
        accion: 'crear-sesion',
        code,
      });
      return { ...r, conciliados: await conciliar() };
    },
    onSuccess: ({ cuentas, sincronizacion, conciliados }) => {
      refrescar();
      toast.success(
        `Cuenta bancaria conectada (${cuentas} ${cuentas === 1 ? 'cuenta' : 'cuentas'})`,
      );
      avisarResultado(sincronizacion, conciliados);
    },
    onError: (error: Error) => toast.error(`No se pudo completar la conexión: ${error.message}`),
  });

  const desconectarMutation = useMutation({
    mutationFn: (id: string) => invocarBancoSync({ accion: 'desconectar', conexion_id: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banco_conexiones'] });
      toast.success('Cuenta desconectada — los movimientos ya importados se conservan');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Vuelta desde el banco tras autorizar: ?code=...&state=... (o ?error=...).
  useEffect(() => {
    if (vueltaProcesada.current) return;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorBanco = searchParams.get('error');
    if (!code && !errorBanco) return;
    vueltaProcesada.current = true;
    setSearchParams({}, { replace: true });
    if (errorBanco) {
      toast.error(
        `El banco no autorizó la conexión: ${searchParams.get('error_description') ?? errorBanco}`,
      );
      return;
    }
    let esperado: string | null = null;
    try {
      esperado = sessionStorage.getItem(CLAVE_STATE);
      sessionStorage.removeItem(CLAVE_STATE);
    } catch {
      esperado = null;
    }
    if (esperado && esperado !== state) {
      toast.error('La respuesta del banco no corresponde a esta conexión. Vuelve a intentarlo.');
      return;
    }
    if (code) crearSesionMutation.mutate(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const activa = (conexiones ?? []).find((c) => c.estado === 'activa');
  const caducada = !activa ? (conexiones ?? []).find((c) => c.estado === 'caducada') : undefined;
  const ocupado =
    sincronizarMutation.isPending || crearSesionMutation.isPending || iniciarMutation.isPending;

  return (
    <div className="bg-surface border border-gray-200 rounded-sm p-4 mb-4">
      <div className="flex items-start gap-3 flex-wrap">
        <Landmark size={18} className="text-brand mt-0.5 shrink-0" />
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm font-semibold text-gray-900">
            Sincronización automática con el banco
          </p>
          {isLoading ? (
            <p className="text-xs text-gray-400 mt-0.5">Cargando...</p>
          ) : configuracion && !configuracion.configurado ? (
            <p className="text-xs text-gray-500 mt-0.5">
              Falta configurar Enable Banking: añade los secretos ENABLEBANKING_APP_ID y
              ENABLEBANKING_PRIVATE_KEY en Supabase (Edge Functions → Secrets). Mientras tanto sigue
              disponible la importación manual OFX.
            </p>
          ) : activa ? (
            <p className="text-xs text-gray-500 mt-0.5">
              <span className="inline-block w-2 h-2 rounded-full bg-brand mr-1.5 align-middle" />
              Conectada a {activa.aspsp_nombre}
              {activa.iban ? ` · IBAN …${activa.iban.replace(/\s/g, '').slice(-4)}` : ''} · última
              sincronización {fechaHora(activa.ultima_sincronizacion)} · autorización válida hasta{' '}
              {fechaHora(activa.valido_hasta)}
              {activa.ultimo_error && (
                <span className="block text-red-600 mt-0.5">{activa.ultimo_error}</span>
              )}
            </p>
          ) : caducada ? (
            <p className="text-xs text-red-600 mt-0.5">
              La autorización de {caducada.aspsp_nombre} ha caducado. Vuelve a conectar la cuenta
              para seguir recibiendo movimientos.
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-0.5">
              Sin conectar. Cada mañana se descargan los movimientos: los pagos se registran como
              gastos pendientes de revisar y los cobros se concilian con su factura cuando el
              importe coincide.
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {activa ? (
            <>
              <Button size="sm" onClick={() => sincronizarMutation.mutate()} disabled={ocupado}>
                <RefreshCw size={13} className="mr-1" />
                {sincronizarMutation.isPending ? 'Sincronizando...' : 'Sincronizar ahora'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={desconectarMutation.isPending}
                onClick={async () => {
                  if (
                    await confirmar({
                      titulo: 'Desconectar la cuenta bancaria',
                      mensaje:
                        'Dejarán de descargarse movimientos nuevos. Los ya importados, gastos y cobros registrados se conservan.',
                    })
                  ) {
                    desconectarMutation.mutate(activa.id);
                  }
                }}
              >
                <Unplug size={13} className="mr-1" />
                Desconectar
              </Button>
            </>
          ) : (
            configuracion?.configurado && (
              <Button size="sm" onClick={() => setEligiendoBanco(true)} disabled={ocupado}>
                {crearSesionMutation.isPending
                  ? 'Conectando...'
                  : caducada
                    ? 'Reconectar'
                    : 'Conectar cuenta'}
              </Button>
            )
          )}
        </div>
      </div>

      <Modal
        open={eligiendoBanco}
        onClose={() => setEligiendoBanco(false)}
        title="Elige tu banco"
        size="lg"
      >
        <p className="text-sm text-gray-500 mb-3">
          Se abrirá la web de tu banco para autorizar el acceso de solo lectura a la cuenta
          profesional. Al terminar vuelves aquí automáticamente.
        </p>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar banco (p. ej. Crédit Agricole)"
            className="w-full border border-gray-200 rounded-sm pl-8 pr-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
        </div>
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {cargandoBancos && (
            <p className="text-sm text-gray-400 py-4 text-center">Cargando bancos...</p>
          )}
          {!cargandoBancos && bancosFiltrados.length === 0 && (
            <p className="text-sm text-gray-400 py-4 text-center">Ningún banco coincide.</p>
          )}
          {bancosFiltrados.map((b) => (
            <button
              key={b.name}
              onClick={() => iniciarMutation.mutate(b.name)}
              disabled={iniciarMutation.isPending}
              className="w-full flex items-center gap-3 border border-gray-200 rounded-sm px-3 py-2 text-left hover:border-brand hover:bg-brand-light/40 disabled:opacity-50"
            >
              {b.logo && <img src={b.logo} alt="" className="w-6 h-6 object-contain" />}
              <span className="text-sm text-gray-900">{b.name}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-end mt-4">
          <Button variant="secondary" onClick={() => setEligiendoBanco(false)}>
            Cancelar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
