import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, MapPin, Image as ImageIcon, Mail } from 'lucide-react';
import { Badge, estadoToVariant } from '../../components/ui/Badge';
import { RutaPreview } from '../google/RutaPreview';
import { encontrarObraPorContacto, abrirOCrearFichaGaleria } from '../galeria/obras';
import { useToast } from '../../hooks/useToast';
import { mensajeError } from '../../lib/mensajeError';
import { fechaVisitaLarga } from '../../lib/fechas';
import { VisitaChecklist } from './VisitaChecklist';
import { ReferidoIncentivoBox } from './ReferidoIncentivoBox';
import { parsearTextoEnriquecido } from '../../lib/textoEnriquecido';
import { supabase } from '../../lib/supabase';
import { formatearTelefonoVisual } from '../clientes/types';
import type { Visita } from './types';

export function urlGoogleMaps(v: Visita) {
  if (v.lat != null && v.lng != null) return `https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`;
  if (v.direccion) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.direccion)}`;
  return null;
}

export function VisitaDetalleContenido({ visita }: { visita: Visita }) {
  const urlMaps = urlGoogleMaps(visita);
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Ya no crea con texto libre — busca si esta visita corresponde a una obra verificada
  // (presupuesto Aceptado / factura / acompte) y abre o crea su ficha en Galería (2026-09-09).
  const irAGaleriaMutation = useMutation({
    mutationFn: async () => {
      const obra = await encontrarObraPorContacto({ visitaId: visita.id, telefono: visita.telefono, email: visita.email });
      if (!obra) return null;
      return abrirOCrearFichaGaleria(obra);
    },
    onSuccess: (id) => {
      if (!id) {
        toast.warning('Esta visita todavía no tiene presupuesto aceptado ni factura — la Galería solo admite obras verificadas');
        return;
      }
      navigate(`/galeria/${id}`);
    },
    onError: (error) => toast.error(mensajeError(error, 'No se pudo abrir la galería')),
  });

  // Reenvío manual del aviso de visita (2026-10-19), para cuando automatizaciones-crm detecta que no
  // llegó al Gmail del equipo (el SMTP lo aceptó sin entregarlo). Vuelve a mandar el aviso interno
  // y la confirmación al cliente, y reinicia la comprobación de entrega.
  const reenviarAvisoMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('notificar-visita', { body: { visitaId: visita.id } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? 'El envío no se completó');
      return data as { ok: true; clienteNotificado: boolean };
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['visitas'] });
      toast.success(r.clienteNotificado ? 'Confirmación reenviada al cliente y al equipo' : 'Aviso reenviado al equipo (el cliente no tiene email válido)');
    },
    onError: (error) => toast.error(mensajeError(error, 'No se pudo reenviar la confirmación')),
  });
  const puedeReenviarAviso = visita.estado === 'Pendiente' && !!visita.fecha_visita && !!visita.hora_visita;
  const estadoAviso = !visita.aviso_enviado_en
    ? null
    : visita.aviso_verificado_en
      ? { texto: 'Aviso de visita entregado', clase: 'text-gray-400' }
      : visita.aviso_no_llegado_en
        ? { texto: 'El aviso de visita no ha llegado — reenvía la confirmación', clase: 'text-red-600' }
        : { texto: 'Aviso de visita enviado, comprobando la entrega', clase: 'text-gray-400' };

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-sm bg-brand-light flex items-center justify-center shrink-0 text-brand">
            <Calendar size={17} />
          </span>
          <div className="min-w-0">
            <p className="text-base font-bold text-gray-900 capitalize">
              {fechaVisitaLarga(visita.fecha_visita, visita.hora_visita)}
            </p>
            {urlMaps && visita.direccion ? (
              <a
                href={urlMaps}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-1 text-sm text-brand hover:underline mt-0.5"
              >
                <MapPin size={13} className="shrink-0 mt-0.5" />
                <span>{visita.direccion}</span>
              </a>
            ) : (
              visita.direccion && <p className="text-sm text-gray-600 mt-0.5">{visita.direccion}</p>
            )}
            {visita.direccion_extra && <p className="text-xs text-gray-500 mt-0.5 ml-[21px]">{visita.direccion_extra}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant={estadoToVariant(visita.estado)}>{visita.estado}</Badge>
          <Badge variant="default">{visita.estado_pipeline}</Badge>
        </div>
      </div>

      {visita.direccion && <RutaPreview direccion={visita.direccion} lat={visita.lat} lng={visita.lng} />}

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-gray-400 uppercase tracking-wide">Teléfono</p>
          <p className="text-gray-800">{formatearTelefonoVisual(visita.telefono)}</p>
        </div>
        <div>
          <p className="text-gray-400 uppercase tracking-wide">Email</p>
          <p className="text-gray-800">{visita.email || '—'}</p>
        </div>
        <div>
          <p className="text-gray-400 uppercase tracking-wide">Idioma</p>
          <p className="text-gray-800">{visita.idioma || '—'}</p>
        </div>
        <div>
          <p className="text-gray-400 uppercase tracking-wide">Origen del contacto</p>
          <p className="text-gray-800">{visita.contacto || '—'}</p>
        </div>
        <div>
          <p className="text-gray-400 uppercase tracking-wide">Tipo de reforma</p>
          <p className="text-gray-800">{visita.tipo || '—'}</p>
        </div>
        <div>
          <p className="text-gray-400 uppercase tracking-wide">Empleado</p>
          <p className="text-gray-800">{visita.empleado || '—'}</p>
        </div>
        {visita.es_empresa && (
          <>
            <div>
              <p className="text-gray-400 uppercase tracking-wide">Empresa</p>
              <p className="text-gray-800">{visita.empresa_nombre || '—'}</p>
            </div>
            <div>
              <p className="text-gray-400 uppercase tracking-wide">CIF</p>
              <p className="text-gray-800">{visita.empresa_cif || '—'}</p>
            </div>
          </>
        )}
      </div>

      {visita.descripcion && (
        <div>
          <p className="text-gray-400 uppercase tracking-wide text-xs mb-1">Descripción</p>
          {parsearTextoEnriquecido(visita.descripcion).map((bloque, idx) => (
            <p key={idx} className={`text-gray-700 whitespace-pre-wrap ${bloque.negrita ? 'font-semibold' : ''} ${bloque.cursiva ? 'italic' : ''}`}>
              {bloque.texto}
            </p>
          ))}
        </div>
      )}

      {visita.notas && (
        <div>
          <p className="text-gray-400 uppercase tracking-wide text-xs mb-1">Notas</p>
          {parsearTextoEnriquecido(visita.notas).map((bloque, idx) => (
            <p key={idx} className={`text-gray-700 whitespace-pre-wrap ${bloque.negrita ? 'font-semibold' : ''} ${bloque.cursiva ? 'italic' : ''}`}>
              {bloque.texto}
            </p>
          ))}
        </div>
      )}

      <ReferidoIncentivoBox visita={visita} />

      <div className="border-t border-gray-200 pt-3">
        <VisitaChecklist visitaId={visita.id} checklist={visita.checklist} />
        <button
          onClick={() => irAGaleriaMutation.mutate()}
          disabled={irAGaleriaMutation.isPending}
          className="flex items-center gap-1.5 text-xs text-brand hover:underline mt-3 disabled:opacity-60"
        >
          <ImageIcon size={13} />
          {irAGaleriaMutation.isPending ? 'Abriendo...' : 'Foto/vídeo a galería'}
        </button>
        {puedeReenviarAviso && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
            <button
              onClick={() => reenviarAvisoMutation.mutate()}
              disabled={reenviarAvisoMutation.isPending}
              className="flex items-center gap-1.5 text-xs text-brand hover:underline disabled:opacity-60"
            >
              <Mail size={13} />
              {reenviarAvisoMutation.isPending ? 'Reenviando...' : 'Reenviar confirmación'}
            </button>
            {estadoAviso && <span className={`text-xs ${estadoAviso.clase}`}>{estadoAviso.texto}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
