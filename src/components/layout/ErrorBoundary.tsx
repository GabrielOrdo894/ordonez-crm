import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { error: Error | null };

const CLAVE_RECARGA = 'crm_recarga_chunk_stale';

// Cada despliegue nuevo renombra los archivos JS de cada sección (code splitting, hash en el
// nombre) — si el navegador tenía cacheado el index.html de antes del despliegue, sigue apuntando
// a un archivo que ya no existe en el servidor y la carga dinámica de esa sección falla. Un
// "Reintentar" que solo resetea el estado de React no arregla esto (el index.html cacheado sigue
// siendo el viejo) — hace falta recargar la página de verdad para que pida el index.html real.
function esChunkDesactualizado(mensaje: string): boolean {
  return /fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i.test(mensaje);
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('Error de render capturado:', error, info.componentStack);
    if (!esChunkDesactualizado(error.message)) return;
    // Recarga automática una sola vez cada 10s (evita bucle infinito si el problema fuera otro,
    // no una versión desactualizada) — la mayoría de usuarios ni llegan a ver la pantalla de error.
    const ultimaRecarga = Number(sessionStorage.getItem(CLAVE_RECARGA) ?? 0);
    if (Date.now() - ultimaRecarga > 10_000) {
      sessionStorage.setItem(CLAVE_RECARGA, String(Date.now()));
      window.location.reload();
    }
  }

  render() {
    if (this.state.error) {
      const esChunk = esChunkDesactualizado(this.state.error.message);
      return (
        <div className="bg-surface border border-red-200 rounded-sm p-6 max-w-xl">
          <div className="flex items-center gap-2 text-red-700 mb-2">
            <AlertTriangle size={18} />
            <p className="text-sm font-semibold">
              {esChunk ? 'Hay una versión nueva del CRM' : 'Esta pantalla ha encontrado un error'}
            </p>
          </div>
          <p className="text-xs text-gray-500 mb-4 font-mono whitespace-pre-wrap break-words">
            {esChunk
              ? 'Se ha publicado una actualización mientras tenías esta página abierta. Recarga para cargar la versión más reciente.'
              : this.state.error.message}
          </p>
          <Button size="sm" onClick={() => (esChunk ? window.location.reload() : this.setState({ error: null }))}>
            {esChunk ? 'Recargar página' : 'Reintentar'}
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
