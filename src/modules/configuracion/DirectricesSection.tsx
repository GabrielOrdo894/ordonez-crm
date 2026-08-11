import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';

type CatalogoItem = { clave: string; titulo: string; contenido: string };

// Catálogo fijo — Gabriel solo activa/desactiva casillas, nunca escribe texto libre (así lo pidió,
// 2026-07-28). Para añadir un caso nuevo hay que ampliar esta lista en código, no desde el CRM.
// El texto de cada una es el que recibe la IA tal cual en `generar-mensaje-ia`. La fecha exacta
// desde la que se ofrecen visitas NO vive aquí — se controla en "Disponibilidad de visitas".
const CATALOGO: CatalogoItem[] = [
  {
    clave: 'cierre_agosto',
    titulo: 'Cerrado en agosto',
    contenido:
      'La empresa cierra por vacaciones del 1 al 31 de agosto (parada habitual del sector en Francia). No ofrecer visitas técnicas en ese periodo — si un cliente escribe en esas fechas, indícale que se retomará el contacto en septiembre.',
  },
  {
    clave: 'cierre_navidad',
    titulo: 'Cerrado en Navidad',
    contenido:
      'La empresa cierra del 24 de diciembre al 6 de enero. No ofrecer visitas técnicas en ese periodo — indícale al cliente que se retomará el contacto pasadas las fiestas.',
  },
  {
    clave: 'horario_reducido_verano',
    titulo: 'Horario reducido en verano',
    contenido:
      'En julio y agosto solo se ofrecen visitas por la mañana (hasta las 13:00) — no ofrecer el slot de las 18:00 en esos meses.',
  },
  {
    clave: 'festivo_semana_grande',
    titulo: 'Festivo local — Semana Grande de Donostia',
    contenido:
      'Durante la Semana Grande de Donostia/San Sebastián (mitad de agosto, fechas variables cada año) la actividad en la zona española se ralentiza — avisa al cliente de que la respuesta puede tardar algo más esos días.',
  },
  {
    clave: 'alta_demanda',
    titulo: 'Alta demanda — posible retraso en primera visita',
    contenido:
      'Hay más solicitudes de las habituales. Si hace falta ofrecer visita, avisa al cliente de que el primer hueco libre puede tardar algo más de lo normal, sin dar una fecha distinta a la ya calculada.',
  },
];

type DirectrizRow = { id: string; clave: string; activo: boolean };

export function DirectricesSection() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: filas, isLoading } = useQuery({
    queryKey: ['directrices', 'catalogo'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('directrices')
        .select('id, clave, activo')
        .in(
          'clave',
          CATALOGO.map((c) => c.clave),
        );
      if (error) throw error;
      return data as DirectrizRow[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ item, fila, activar }: { item: CatalogoItem; fila: DirectrizRow | undefined; activar: boolean }) => {
      if (fila) {
        const { error } = await supabase.from('directrices').update({ activo: activar }).eq('id', fila.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('directrices')
          .insert({ clave: item.clave, titulo: item.titulo, contenido: item.contenido, activo: activar, orden: 100 });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directrices', 'catalogo'] });
      queryClient.invalidateQueries({ queryKey: ['directrices'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) {
    return <div className="h-40 bg-surface border border-gray-200 rounded-sm animate-pulse" />;
  }

  return (
    <section className="bg-surface border border-gray-200 rounded-sm p-4">
      <div className="border-b border-gray-200 pb-2 mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Directrices para la IA</p>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Reglas adicionales que sigue la IA al redactar mensajes a clientes (solicitudes y respuestas a presupuestos) —
        marca las que apliquen ahora mismo. Se activan/desactivan al momento, sin botón de guardar.
      </p>

      <div className="flex flex-col gap-2">
        {CATALOGO.map((item) => {
          const fila = filas?.find((f) => f.clave === item.clave);
          const activo = fila?.activo ?? false;
          return (
            <label
              key={item.clave}
              className="flex items-start gap-2.5 border border-gray-200 rounded-sm p-3 cursor-pointer hover:border-brand"
            >
              <input
                type="checkbox"
                className="mt-0.5 shrink-0"
                checked={activo}
                disabled={toggleMutation.isPending}
                onChange={(e) => toggleMutation.mutate({ item, fila, activar: e.target.checked })}
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">{item.titulo}</span>
                <span className="block text-xs text-gray-500 mt-0.5">{item.contenido}</span>
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
