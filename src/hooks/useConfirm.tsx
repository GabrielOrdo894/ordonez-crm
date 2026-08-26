import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/Button';

type ConfirmOptions = {
  titulo?: string;
  mensaje: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  peligroso?: boolean;
};

// motivo: si está presente, el diálogo pide un texto libre además de sí/no (usado para "motivo de
// cancelación" — ver VisitasPage.tsx/VisitaDetallePage.tsx/InicioPage.tsx) — mismo diálogo que
// confirmar(), sin duplicar el componente (mejora real, auditoría de Visitas 2026-08-18).
type ConfirmConMotivoOptions = ConfirmOptions & { motivoLabel: string; motivoPlaceholder?: string; motivoRequerido?: boolean };

type EstadoDialogo =
  | (ConfirmOptions & { modo: 'simple'; resolverSimple: (valor: boolean) => void })
  | (ConfirmConMotivoOptions & { modo: 'motivo'; resolverMotivo: (valor: string | null) => void });

type ConfirmContextValue = {
  confirmar: (opciones: ConfirmOptions | string) => Promise<boolean>;
  confirmarConMotivo: (opciones: ConfirmConMotivoOptions) => Promise<string | null>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoDialogo | null>(null);
  const [motivoTexto, setMotivoTexto] = useState('');
  const resolverRef = useRef<((valor: boolean | string | null) => void) | null>(null);

  const confirmar = useCallback<ConfirmContextValue['confirmar']>((opciones) => {
    const normalizado = typeof opciones === 'string' ? { mensaje: opciones } : opciones;
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve as (valor: boolean | string | null) => void;
      setMotivoTexto('');
      setEstado({ ...normalizado, modo: 'simple', resolverSimple: resolve });
    });
  }, []);

  const confirmarConMotivo = useCallback<ConfirmContextValue['confirmarConMotivo']>((opciones) => {
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve as (valor: boolean | string | null) => void;
      setMotivoTexto('');
      setEstado({ ...opciones, modo: 'motivo', resolverMotivo: resolve });
    });
  }, []);

  const cerrar = (confirmado: boolean) => {
    if (!estado) return;
    if (estado.modo === 'motivo') {
      if (confirmado && estado.motivoRequerido && !motivoTexto.trim()) return;
      resolverRef.current?.(confirmado ? motivoTexto.trim() : null);
    } else {
      resolverRef.current?.(confirmado);
    }
    resolverRef.current = null;
    setEstado(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirmar, confirmarConMotivo }}>
      {children}
      {estado && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4 animate-[fade-in_150ms_ease-out]"
          onClick={() => cerrar(false)}
        >
          <div
            className={`bg-surface rounded max-w-sm w-full border-t-[3px] ${estado.peligroso ?? true ? 'border-red-500' : 'border-brand'} animate-[scale-in_150ms_ease-out]`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex gap-3">
              <AlertTriangle size={18} className={`shrink-0 mt-0.5 ${estado.peligroso ?? true ? 'text-red-500' : 'text-brand'}`} />
              <div className="flex-1 min-w-0">
                {estado.titulo && <p className="text-sm font-semibold text-gray-900 mb-1">{estado.titulo}</p>}
                <p className="text-sm text-gray-600">{estado.mensaje}</p>
                {estado.modo === 'motivo' && (
                  <div className="mt-3">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                      {estado.motivoLabel}
                    </label>
                    <input
                      autoFocus
                      value={motivoTexto}
                      onChange={(e) => setMotivoTexto(e.target.value)}
                      placeholder={estado.motivoPlaceholder}
                      className="w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => cerrar(false)}>
                {estado.textoCancelar ?? 'Cancelar'}
              </Button>
              <Button variant={estado.peligroso ?? true ? 'danger' : 'primary'} onClick={() => cerrar(true)}>
                {estado.textoConfirmar ?? 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirmar() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirmar debe usarse dentro de ConfirmProvider');
  return ctx.confirmar;
}

export function useConfirmarConMotivo() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirmarConMotivo debe usarse dentro de ConfirmProvider');
  return ctx.confirmarConMotivo;
}
