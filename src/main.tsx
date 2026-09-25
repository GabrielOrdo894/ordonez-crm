import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { ToastProvider } from './hooks/useToast';
import { ConfirmProvider } from './hooks/useConfirm';
import { TemaProvider } from './hooks/useTema';
import './styles/globals.css';
import App from './App';

// Service worker de la app instalada en el móvil (ver public/sw.js) — solo en producción, para no
// cachear el index.html del servidor de desarrollo. Un fallo al registrarlo no afecta al CRM.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => {
      console.error('No se pudo registrar el service worker:', err instanceof Error ? err.message : err);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TemaProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </ToastProvider>
      </QueryClientProvider>
    </TemaProvider>
  </StrictMode>
);
