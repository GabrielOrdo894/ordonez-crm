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

type ConfirmState = ConfirmOptions & { resolver: (valor: boolean) => void };

type ConfirmContextValue = (opciones: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<ConfirmState | null>(null);
  const resolverRef = useRef<((valor: boolean) => void) | null>(null);

  const confirmar = useCallback<ConfirmContextValue>((opciones) => {
    const normalizado = typeof opciones === 'string' ? { mensaje: opciones } : opciones;
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setEstado({ ...normalizado, resolver: resolve });
    });
  }, []);

  const cerrar = (valor: boolean) => {
    resolverRef.current?.(valor);
    resolverRef.current = null;
    setEstado(null);
  };

  return (
    <ConfirmContext.Provider value={confirmar}>
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
              <div>
                {estado.titulo && <p className="text-sm font-semibold text-gray-900 mb-1">{estado.titulo}</p>}
                <p className="text-sm text-gray-600">{estado.mensaje}</p>
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
  return ctx;
}
