import { QueryCache, QueryClient } from '@tanstack/react-query';

// Evento que AvisoErroresConsulta (main.tsx) convierte en un toast: el QueryClient vive fuera de
// React y no puede usar useToast directamente.
export const EVENTO_ERROR_CONSULTA = 'crm:error-consulta';

export const queryClient = new QueryClient({
  // Una lectura que falla se avisa siempre (auditoría 2026-10-01: de 186 consultas solo ~19 miraban
  // `error`, y una tabla que no cargaba salía vacía sin ningún aviso, en contra del §1 de CLAUDE.md).
  // Una consulta puede excluirse con meta: { silenciosa: true } si ya muestra su propio error.
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.silenciosa) return;
      window.dispatchEvent(new CustomEvent(EVENTO_ERROR_CONSULTA, { detail: (error as Error).message }));
    },
  }),
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
    // networkMode 'always': sin cobertura, Tanstack Query pausaba las mutaciones (modo 'online' por
    // defecto) y el mutationFn no llegaba a ejecutarse — en /rapido el kilometraje, el ticket y las
    // fotos se quedaban en "Guardando…" sin llegar nunca a la cola offline (auditoría 2026-10-01).
    // Ahora se ejecutan y, sin red, fallan enseguida o caen en la cola de /rapido.
    mutations: { retry: 0, networkMode: 'always' },
  },
});
