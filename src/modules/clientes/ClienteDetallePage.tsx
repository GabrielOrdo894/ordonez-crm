import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Mail, MapPin, Phone, Star } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { iniciales } from '../perfil/avatares';
import { fechaVisitaCorta } from '../../lib/fechas';
import { ClienteDetalleContenido } from './ClienteDetalleContenido';
import { agruparClientes } from './types';
import type { Visita } from '../visitas/types';

export default function ClienteDetallePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: visitas, isLoading } = useQuery({
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

  const clientes = useMemo(() => agruparClientes(visitas ?? []), [visitas]);
  const cliente = useMemo(() => clientes.find((c) => c.id === decodeURIComponent(id ?? '')) ?? null, [clientes, id]);

  if (isLoading) {
    return <div className="h-96 bg-surface border border-gray-200 rounded-sm animate-pulse" />;
  }

  if (!cliente) {
    return <p className="text-sm text-gray-400">Cliente no encontrado.</p>;
  }

  const ultimaVisita = cliente.visitas[0];
  const primeraVisita = cliente.visitas[cliente.visitas.length - 1];
  const fidelizado = cliente.visitas.length > 1;

  return (
    <div>
      <button
        onClick={() => navigate('/clientes')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4"
      >
        <ArrowLeft size={15} />
        Volver a clientes
      </button>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <div className="w-full lg:w-72 shrink-0 lg:sticky lg:top-4 flex flex-col gap-4">
          <div className="bg-surface border border-gray-200 rounded-sm p-5">
            <div className="flex flex-col items-center text-center pb-4 mb-4 border-b border-gray-200">
              <div className="w-16 h-16 rounded-full bg-brand-light text-brand text-xl font-bold flex items-center justify-center mb-3">
                {iniciales(`${cliente.nombre} ${cliente.apellidos}`)}
              </div>
              <p className="text-base font-semibold text-gray-900 break-words">
                {cliente.nombre} {cliente.apellidos}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap justify-center mt-2">
                <span className="text-xs font-medium bg-brand-light text-brand rounded-full px-2.5 py-1">
                  {cliente.pais ?? '—'}
                </span>
                {fidelizado && (
                  <span className="flex items-center gap-1 text-xs font-medium bg-amber-50 text-amber-700 rounded-full px-2.5 py-1">
                    <Star size={11} />
                    Fidelizado
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2.5 text-sm">
              <div className="flex items-start gap-2">
                <Phone size={14} className="text-gray-400 shrink-0 mt-0.5" />
                <span className="text-gray-700 break-words">{cliente.telefono}</span>
              </div>
              <div className="flex items-start gap-2">
                <Mail size={14} className="text-gray-400 shrink-0 mt-0.5" />
                <span className="text-gray-700 break-words">{cliente.email || '—'}</span>
              </div>
              <div className="flex items-start gap-2">
                <MapPin size={14} className="text-gray-400 shrink-0 mt-0.5" />
                <span className="text-gray-700 break-words">{cliente.zona ?? '—'}</span>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-gray-200 rounded-sm p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Datos rápidos</p>
            <div className="flex flex-col gap-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Visitas totales</span>
                <span className="font-semibold text-gray-900">{cliente.visitas.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Cliente desde</span>
                <span className="text-gray-900">{fechaVisitaCorta(primeraVisita.fecha_visita)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500 shrink-0">Etapa pipeline</span>
                <span className="text-gray-900 text-right truncate">{ultimaVisita.estado_pipeline ?? '—'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0 w-full bg-surface border border-gray-200 rounded-sm p-5">
          <ClienteDetalleContenido cliente={cliente} onPurgado={() => navigate('/clientes')} />
        </div>
      </div>
    </div>
  );
}
