import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { error: Error | null };

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('Error de render capturado:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="bg-surface border border-red-200 rounded-sm p-6 max-w-xl">
          <div className="flex items-center gap-2 text-red-700 mb-2">
            <AlertTriangle size={18} />
            <p className="text-sm font-semibold">Esta pantalla ha encontrado un error</p>
          </div>
          <p className="text-xs text-gray-500 mb-4 font-mono whitespace-pre-wrap break-words">
            {this.state.error.message}
          </p>
          <Button size="sm" onClick={() => this.setState({ error: null })}>
            Reintentar
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
