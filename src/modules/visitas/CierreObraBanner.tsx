import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Star, Pencil, Copy, Mail, Gift } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { cargarConfigCompleta } from '../../lib/pdfEmpresa';
import type { Factura } from '../finanzas/facturas/types';
import type { Visita } from './types';

type ConfigResenas = { activo: boolean; diasEspera: number; enlace: string };
type ConfigReferidos = { activo: boolean; descuentoReferente: number; descuentoReferido: number };

const FUNCIONES_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

function enlaceResenaDe(token: string) {
  return `${FUNCIONES_URL}/resena-redirect?t=${token}`;
}

function mensajeCierreObra(
  f: Factura,
  tipoObra: string,
  zona: string,
  token: string,
  referidos: ConfigReferidos,
): string {
  const nombre = (f.cliente_nombre ?? '').split(' ')[0] || f.cliente_nombre || '';
  const enlace = enlaceResenaDe(token);
  const fr = f.idioma === 'Français';

  const parrafoReferidos = referidos.activo
    ? fr
      ? `\n\nAu fait — si vous connaissez quelqu'un qui envisage des travaux de rénovation, nous serions ravis de l'aider. En remerciement, vous recevriez ${referidos.descuentoReferente}% de remise sur vos prochains travaux avec nous, et cette personne ${referidos.descuentoReferido}% sur les siens. Il suffit de nous dire qui vous a recommandés quand elle nous contactera.`
      : `\n\nPor cierto — si conoce a alguien que esté pensando en reformar, nos encantaría ayudarle. Como agradecimiento, usted recibiría un ${referidos.descuentoReferente}% de descuento en su próxima obra con nosotros, y esa persona un ${referidos.descuentoReferido}% en la suya. Solo tiene que decirnos quién le recomendó cuando nos contacte.`
    : '';

  if (fr) {
    return `Bonjour ${nombre},\n\nCe fut un plaisir de travailler sur votre ${tipoObra} à ${zona}.\nNous espérons que le résultat a dépassé vos attentes.\n\nSi vous êtes satisfait(e) de notre travail, nous vous serions très reconnaissants de nous laisser un avis sur Google. Cela ne prendra que 2 minutes :\n\n${enlace}${parrafoReferidos}\n\nMerci beaucoup de votre confiance.\nReformas Ordoñez`;
  }
  return `Estimado/a ${nombre},\n\nHa sido un placer trabajar en su ${tipoObra} en ${zona}.\nEsperamos que el resultado haya superado sus expectativas.\n\nSi está satisfecho/a con nuestro trabajo, le agradeceríamos mucho que nos dejara su opinión en Google. Solo le llevará 2 minutos:\n\n${enlace}${parrafoReferidos}\n\nMuchas gracias por confiar en nosotros.\nReformas Ordoñez`;
}

function mensajeCortesia(f: Factura): string {
  const nombre = (f.cliente_nombre ?? '').split(' ')[0] || f.cliente_nombre || '';
  if (f.idioma === 'Français') {
    return `Bonjour ${nombre},\n\nCela fait maintenant plusieurs mois depuis la fin de vos travaux — nous espérions prendre de vos nouvelles et savoir si tout se passe bien.\nSi vous ne l'avez pas encore fait et que vous êtes satisfait(e), un avis Google serait toujours le bienvenu.\n\nMerci encore de votre confiance.\nReformas Ordoñez`;
  }
  return `Estimado/a ${nombre},\n\nHan pasado ya varios meses desde que terminamos su obra — queríamos saber cómo va todo.\nSi todavía no lo ha hecho y está satisfecho/a, siempre agradecemos una reseña en Google.\n\nGracias de nuevo por confiar en nosotros.\nReformas Ordoñez`;
}

export function CierreObraBanner() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<string | null>(null);
  const [mensajesEditados, setMensajesEditados] = useState<Record<string, string>>({});
  const [enviandoEmailId, setEnviandoEmailId] = useState<string | null>(null);

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

  const configReferidos: ConfigReferidos = useMemo(() => {
    const datos = (config?.datos ?? {}) as { referidos?: Partial<ConfigReferidos> };
    return {
      activo: datos.referidos?.activo ?? false,
      descuentoReferente: datos.referidos?.descuentoReferente ?? 5,
      descuentoReferido: datos.referidos?.descuentoReferido ?? 5,
    };
  }, [config]);

  const fechaLimiteCierre = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - configResenas.diasEspera);
    return d.toISOString().slice(0, 10);
  }, [configResenas.diasEspera]);

  const fechaLimiteCortesia = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().slice(0, 10);
  }, []);

  // Elegibles para el mensaje de cierre de obra (reseña + referidos): factura normal cobrada, con
  // email o teléfono, todavía sin ningún canal de envío marcado.
  const { data: pendientesCierre } = useQuery({
    queryKey: ['facturas', 'cierre-obra-pendiente', fechaLimiteCierre],
    enabled: configResenas.activo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facturas')
        .select('*')
        .is('eliminado_en', null)
        .eq('tipo', 'normal')
        .eq('estado_cobro', 'Cobrada')
        .is('resena_enviado_en', null)
        .not('fecha_pago', 'is', null)
        .lte('fecha_pago', fechaLimiteCierre)
        .or('cliente_email.not.is.null,cliente_tel.not.is.null');
      if (error) throw error;
      return data as Factura[];
    },
  });

  // Elegibles para el mensaje de cortesía a los 6 meses — ya se les pidió reseña (o no, da igual),
  // pero nunca se les mandó el mensaje de cortesía. Con flag propio (resena_cortesia_enviada_en) no
  // depende del historial local de cada navegador, a diferencia del sistema anterior.
  const { data: pendientesCortesia } = useQuery({
    queryKey: ['facturas', 'cortesia-pendiente', fechaLimiteCortesia],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facturas')
        .select('*')
        .is('eliminado_en', null)
        .eq('tipo', 'normal')
        .eq('estado_cobro', 'Cobrada')
        .is('resena_cortesia_enviada_en', null)
        .not('fecha_pago', 'is', null)
        .lte('fecha_pago', fechaLimiteCortesia)
        .or('cliente_email.not.is.null,cliente_tel.not.is.null');
      if (error) throw error;
      return data as Factura[];
    },
  });

  const visitaIds = useMemo(
    () => [...new Set([...(pendientesCierre ?? []), ...(pendientesCortesia ?? [])].map((f) => f.visita_id).filter((id): id is string => !!id))],
    [pendientesCierre, pendientesCortesia],
  );

  const { data: visitasRelacionadas } = useQuery({
    queryKey: ['visitas', 'para-cierre-obra', visitaIds],
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

  // Genera y persiste el token de las facturas elegibles que todavía no lo tienen — hace falta
  // guardarlo ANTES de mostrar el mensaje (el enlace de reseña lo lleva embebido), no solo al
  // marcar el envío, o el enlace que el cliente ve podría no coincidir con el que luego se busca
  // en resena-redirect.
  useEffect(() => {
    const sinToken = (pendientesCierre ?? []).filter((f) => !f.resena_token);
    if (sinToken.length === 0) return;
    (async () => {
      await Promise.all(
        sinToken.map((f) => supabase.from('facturas').update({ resena_token: crypto.randomUUID() }).eq('id', f.id)),
      );
      queryClient.invalidateQueries({ queryKey: ['facturas', 'cierre-obra-pendiente'] });
    })();
  }, [pendientesCierre, queryClient]);

  const invalidarTodo = () => {
    queryClient.invalidateQueries({ queryKey: ['facturas'] });
  };

  const mensajeCierreDe = (f: Factura) => {
    if (mensajesEditados[f.id] !== undefined) return mensajesEditados[f.id];
    if (!f.resena_token) return '';
    const v = f.visita_id ? visitaPorId.get(f.visita_id) : null;
    return mensajeCierreObra(f, v?.tipo ?? 'obra', v?.zona ?? '', f.resena_token, configReferidos);
  };

  const marcarWhatsappMutation = useMutation({
    mutationFn: async (facturas: Factura[]) => {
      for (const f of facturas) {
        const nuevoCanal = !f.resena_canal ? 'whatsapp' : f.resena_canal === 'email' ? 'ambos' : f.resena_canal;
        const { error } = await supabase
          .from('facturas')
          .update({ resena_canal: nuevoCanal, resena_enviado_en: f.resena_enviado_en ?? new Date().toISOString() })
          .eq('id', f.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidarTodo();
      toast.success('Marcado como enviado por WhatsApp');
    },
    onError: (error) => toast.error(error.message),
  });

  const enviarEmailMutation = useMutation({
    mutationFn: async (facturaId: string) => {
      const { error } = await supabase.functions.invoke('enviar-resena-email', { body: { facturaId } });
      // supabase-js solo expone un mensaje genérico en error.message — el mensaje real va en el
      // cuerpo JSON de la respuesta (mismo patrón que documenso.ts).
      if (error) {
        let mensaje = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const body = await error.context.json();
            if (body?.error) mensaje = body.error;
          } catch {
            // el cuerpo no era JSON — se usa el mensaje genérico
          }
        }
        throw new Error(mensaje);
      }
    },
    onMutate: (facturaId) => setEnviandoEmailId(facturaId),
    onSuccess: () => {
      invalidarTodo();
      toast.success('Email enviado');
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setEnviandoEmailId(null),
  });

  const marcarCortesiaMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('facturas').update({ resena_cortesia_enviada_en: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarTodo();
      toast.success('Mensaje de cortesía marcado como enviado');
    },
    onError: (error) => toast.error(error.message),
  });

  const copiarMensaje = (texto: string) => {
    navigator.clipboard.writeText(texto);
    toast.success('Mensaje copiado');
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setSeleccionadas(new Set());
    setMensajesEditados({});
    setEditando(null);
  };

  const abrirModal = () => {
    setSeleccionadas(new Set((pendientesCierre ?? []).filter((f) => f.resena_token).map((f) => f.id)));
    setModalAbierto(true);
  };

  const toggleSeleccion = (id: string) => {
    setSeleccionadas((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  };

  const handleCopiarWhatsapp = (f: Factura) => {
    copiarMensaje(mensajeCierreDe(f));
    marcarWhatsappMutation.mutate([f]);
  };

  const handleCopiarWhatsappSeleccion = () => {
    const facturas = (pendientesCierre ?? []).filter((f) => seleccionadas.has(f.id));
    facturas.forEach((f) => copiarMensaje(mensajeCierreDe(f)));
    marcarWhatsappMutation.mutate(facturas);
  };

  const hayCierre = configResenas.activo && (pendientesCierre?.length ?? 0) > 0;
  const hayCortesia = (pendientesCortesia?.length ?? 0) > 0;

  if (!hayCierre && !hayCortesia) return null;

  return (
    <>
      {hayCierre && (
        <div className="bg-brand-light border border-gray-200 rounded-sm px-4 py-3 mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-brand">
            <Star size={15} />
            <span>Tienes {pendientesCierre!.length} cliente(s) con obra pagada, listos para el mensaje de cierre (reseña + referidos).</span>
          </div>
          <Button size="sm" onClick={abrirModal}>
            Preparar mensajes
          </Button>
        </div>
      )}

      {hayCortesia && (
        <div className="bg-surface border border-gray-200 rounded-sm px-4 py-3 mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Mensaje de cortesía (6 meses)</p>
          <div className="flex flex-col gap-1.5">
            {pendientesCortesia!.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-gray-700">{f.cliente_nombre} — obra pagada el {f.fecha_pago}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button size="sm" variant="secondary" onClick={() => copiarMensaje(mensajeCortesia(f))}>
                    <span className="flex items-center gap-1"><Copy size={12} />Copiar</span>
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => marcarCortesiaMutation.mutate(f.id)} disabled={marcarCortesiaMutation.isPending}>
                    Marcar enviado
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal
        open={modalAbierto}
        onClose={cerrarModal}
        title="Mensaje de cierre de obra — reseña y referidos"
        footer={
          <>
            <Button variant="secondary" onClick={cerrarModal}>
              Cerrar
            </Button>
            <Button onClick={handleCopiarWhatsappSeleccion} disabled={seleccionadas.size === 0 || marcarWhatsappMutation.isPending}>
              <span className="flex items-center gap-1.5">
                <Copy size={13} />
                Copiar seleccionados (WhatsApp)
              </span>
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          {(pendientesCierre ?? []).map((f) => (
            <div key={f.id} className="border border-gray-200 rounded-sm px-3 py-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={seleccionadas.has(f.id)} onChange={() => toggleSeleccion(f.id)} />
                <div className="flex-1">
                  <p className="text-gray-900 font-medium">{f.cliente_nombre}</p>
                  <p className="text-xs text-gray-500">
                    Factura {f.numero} · pagada el {f.fecha_pago}
                    {f.resena_canal && ` · ya enviado por ${f.resena_canal}`}
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
                  value={mensajeCierreDe(f)}
                  onChange={(e) => setMensajesEditados((actual) => ({ ...actual, [f.id]: e.target.value }))}
                  rows={7}
                  className="w-full mt-2 border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
                />
              )}

              <div className="flex items-center gap-2 mt-2">
                <Button size="sm" variant="secondary" onClick={() => handleCopiarWhatsapp(f)}>
                  <span className="flex items-center gap-1"><Copy size={12} />Copiar (WhatsApp)</span>
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => enviarEmailMutation.mutate(f.id)}
                  disabled={!f.cliente_email || enviandoEmailId === f.id}
                >
                  <span className="flex items-center gap-1">
                    <Mail size={12} />
                    {enviandoEmailId === f.id ? 'Enviando...' : 'Enviar por email'}
                  </span>
                </Button>
                {configReferidos.activo && (
                  <span className="flex items-center gap-1 text-xs text-gray-400 ml-auto">
                    <Gift size={12} />
                    Incluye invitación a referidos
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
