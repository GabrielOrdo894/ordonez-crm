import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { cargarConfigCompleta } from '../../lib/pdfEmpresa';
import type { Factura } from '../finanzas/facturas/types';
import type { Visita } from './types';

type ConfigResenas = { activo: boolean; diasEspera: number; enlace: string };

function asuntoEmail(idioma: string) {
  return idioma === 'Français'
    ? "Comment s'est passée votre rénovation ? Votre avis nous intéresse"
    : '¿Cómo fue su experiencia con Reformas Ordoñez? Nos gustaría conocer su opinión';
}

function cuerpoEmail(f: Factura, tipoObra: string, zona: string, enlace: string) {
  const nombre = (f.cliente_nombre ?? '').split(' ')[0] || f.cliente_nombre || '';
  if (f.idioma === 'Français') {
    return `Bonjour ${nombre},\n\nCe fut un plaisir de travailler sur votre ${tipoObra} à ${zona}.\nNous espérons que le résultat a dépassé vos attentes.\n\nSi vous êtes satisfait(e) de notre travail, nous vous serions très reconnaissants de nous laisser un avis sur Google. Cela ne prendra que 2 minutes :\n\n${enlace}\n\nMerci beaucoup de votre confiance.\nReformas Ordoñez`;
  }
  return `Estimado/a ${nombre},\n\nHa sido un placer trabajar en su ${tipoObra} en ${zona}.\nEsperamos que el resultado haya superado sus expectativas.\n\nSi está satisfecho/a con nuestro trabajo, le agradeceríamos mucho que nos dejara una reseña en Google. Solo le llevará 2 minutos:\n\n${enlace}\n\nMuchas gracias por confiar en nosotros.\nReformas Ordoñez`;
}

export function ResenaGoogleBanner() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Record<string, string>>({});

  const { data: config } = useQuery({
    queryKey: ['empresa_config', 'completa'],
    queryFn: cargarConfigCompleta,
  });

  const configResenas: ConfigResenas = useMemo(() => {
    const datos = (config?.datos ?? {}) as { resenas?: Partial<ConfigResenas> };
    return {
      activo: datos.resenas?.activo ?? false,
      diasEspera: datos.resenas?.diasEspera ?? 3,
      enlace: datos.resenas?.enlace ?? '',
    };
  }, [config]);

  const fechaLimite = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - configResenas.diasEspera);
    return d.toISOString().slice(0, 10);
  }, [configResenas.diasEspera]);

  const { data: pendientes } = useQuery({
    queryKey: ['facturas', 'resena-pendiente', fechaLimite],
    enabled: configResenas.activo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facturas')
        .select('*')
        .is('eliminado_en', null)
        .eq('estado_cobro', 'Cobrada')
        .eq('resena_enviada', false)
        .not('cliente_email', 'is', null)
        .not('fecha_pago', 'is', null)
        .lte('fecha_pago', fechaLimite);
      if (error) throw error;
      return data as Factura[];
    },
  });

  const visitaIds = useMemo(() => (pendientes ?? []).map((f) => f.visita_id).filter((id): id is string => !!id), [pendientes]);

  const { data: visitasRelacionadas } = useQuery({
    queryKey: ['visitas', 'para-resena', visitaIds],
    enabled: visitaIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('visitas').select('id, tipo, zona').in('id', visitaIds);
      if (error) throw error;
      return data as Pick<Visita, 'id' | 'tipo' | 'zona'>[];
    },
  });

  const visitaPorId = useMemo(() => {
    const map = new Map<string, Pick<Visita, 'id' | 'tipo' | 'zona'>>();
    for (const v of visitasRelacionadas ?? []) map.set(v.id, v);
    return map;
  }, [visitasRelacionadas]);

  const mensajePorDefecto = (f: Factura) => {
    const v = f.visita_id ? visitaPorId.get(f.visita_id) : null;
    return cuerpoEmail(f, v?.tipo ?? 'obra', v?.zona ?? '', configResenas.enlace);
  };

  const marcarEnviadaMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('facturas')
        .update({ resena_enviada: true, resena_fecha_envio: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturas'] });
      toast.success('Recordatorios marcados como enviados');
      setModalAbierto(false);
      setSeleccionadas(new Set());
      setMensajes({});
      setEditando(null);
    },
    onError: (error) => toast.error(error.message),
  });

  if (!configResenas.activo || !pendientes || pendientes.length === 0) return null;

  const toggleSeleccion = (id: string) => {
    setSeleccionadas((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  };

  const abrirModal = () => {
    setSeleccionadas(new Set(pendientes.map((f) => f.id)));
    setModalAbierto(true);
  };

  const mensajeDe = (f: Factura) => mensajes[f.id] ?? mensajePorDefecto(f);

  const handleEnviar = () => {
    const seleccionFacturas = pendientes.filter((f) => seleccionadas.has(f.id));
    seleccionFacturas.forEach((f, i) => {
      setTimeout(() => {
        const asunto = asuntoEmail(f.idioma);
        const cuerpo = mensajeDe(f);
        window.open(`mailto:${f.cliente_email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`, '_blank');
      }, i * 400);
    });
    marcarEnviadaMutation.mutate(seleccionFacturas.map((f) => f.id));
  };

  return (
    <>
      <div className="bg-brand-light border border-gray-200 rounded-sm px-4 py-3 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-brand">
          <Star size={15} />
          <span>Tienes {pendientes.length} cliente(s) con obra pagada, listos para solicitar reseña Google.</span>
        </div>
        <Button size="sm" onClick={abrirModal}>
          Enviar recordatorios
        </Button>
      </div>

      <Modal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title="Recordatorio de reseña Google"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEnviar} disabled={seleccionadas.size === 0 || marcarEnviadaMutation.isPending}>
              Enviar emails seleccionados
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          {pendientes.map((f) => (
            <div key={f.id} className="border border-gray-200 rounded-sm px-3 py-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={seleccionadas.has(f.id)} onChange={() => toggleSeleccion(f.id)} />
                <div className="flex-1">
                  <p className="text-gray-900 font-medium">{f.cliente_nombre}</p>
                  <p className="text-xs text-gray-500">
                    Factura {f.numero} · pagada el {f.fecha_pago}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditando((actual) => (actual === f.id ? null : f.id))}
                  className="text-gray-400 hover:text-brand"
                  title="Editar mensaje"
                >
                  <Pencil size={14} />
                </button>
              </label>

              {editando === f.id && (
                <textarea
                  value={mensajeDe(f)}
                  onChange={(e) => setMensajes((actual) => ({ ...actual, [f.id]: e.target.value }))}
                  rows={6}
                  className="w-full mt-2 border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
                />
              )}
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
