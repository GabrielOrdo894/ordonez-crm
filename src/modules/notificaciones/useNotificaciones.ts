import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useAlertasFiscales } from '../fiscalidad/useAlertasFiscales';
import { estadoSeguimiento, type PresupuestoConRespuesta, type Solicitud } from '../solicitudes/types';
import { normalizarTelefono } from '../clientes/types';
import { cargarConfigCompleta } from '../../lib/pdfEmpresa';
import type { Factura } from '../finanzas/facturas/types';
import type { Visita } from '../visitas/types';

const LIMITE_HISTORIAL = 50;

// Visitas Realizadas sin ningún presupuesto enviado (un Borrador no cuenta como enviado). Función
// pura compartida por la campana y por el KPI "Presupuestos sin enviar" de la Home (InicioPage.tsx)
// para que ambos den siempre el mismo número — mismo criterio que alerta-diaria/index.ts.
export function filtrarVisitasSinPresupuesto<V extends Pick<Visita, 'id' | 'estado' | 'email' | 'telefono'>>(
  visitas: V[] | undefined,
  presupuestos: { visita_id: string | null; estado: string }[] | undefined,
  solicitudes: Pick<Solicitud, 'estado' | 'email' | 'telefono'>[] | undefined,
): V[] {
  const visitaIdsConPresupuestoEnviado = new Set(
    (presupuestos ?? []).filter((p) => p.estado !== 'Borrador' && p.visita_id).map((p) => p.visita_id as string),
  );
  // 'Eliminada' excluida a propósito (bug real, 2026-09-21, caso Mickaël Maystre): es un
  // borrado definitivo (sustituye al DELETE real), no una decisión de negocio de no
  // presupuestar — incluirla aquí ocultaba visitas reales que sí necesitan presupuesto solo
  // porque coincidían por contacto con una solicitud duplicada/errónea ya eliminada. Mismo
  // criterio aplicado a la vez en AvisosPanel.tsx y alerta-diaria/index.ts.
  const emailsDescartados = new Set(
    (solicitudes ?? [])
      .filter((s) => s.estado === 'No concretada' || s.estado === 'Rechazada')
      .map((s) => s.email?.trim().toLowerCase())
      .filter((e): e is string => !!e),
  );
  const telefonosDescartados = new Set(
    (solicitudes ?? [])
      .filter((s) => s.estado === 'No concretada' || s.estado === 'Rechazada')
      .map((s) => (s.telefono ? normalizarTelefono(s.telefono) : ''))
      .filter((t) => t.length > 0),
  );
  return (visitas ?? []).filter((v) => {
    if (v.estado !== 'Realizada' || visitaIdsConPresupuestoEnviado.has(v.id)) return false;
    if (v.email && emailsDescartados.has(v.email.trim().toLowerCase())) return false;
    if (v.telefono && telefonosDescartados.has(normalizarTelefono(v.telefono))) return false;
    return true;
  });
}

// Los avisos de reseña/caso de éxito son tareas del dueño del negocio — no se
// reparten a los 3 usuarios del CRM. Sin convención previa de "usuario dueño"
// en el proyecto, se identifica por email de sesión.
const EMAIL_GABRIEL = 'reformasordonezeus@gmail.com';

function isoHaceDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

function isoHaceMeses(meses: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return d.toISOString().slice(0, 10);
}

function claveHistorial(userId: string) {
  return `notificaciones_historial_${userId}`;
}

function leerHistorial(userId: string | undefined): Notificacion[] {
  if (!userId) return [];
  try {
    const crudo = localStorage.getItem(claveHistorial(userId));
    return crudo ? (JSON.parse(crudo) as Notificacion[]) : [];
  } catch {
    return [];
  }
}

function guardarHistorial(userId: string, historial: Notificacion[]) {
  localStorage.setItem(claveHistorial(userId), JSON.stringify(historial));
}

export type CategoriaNotificacion = 'fiscal' | 'factura' | 'visita' | 'mensaje' | 'presupuesto' | 'resena' | 'galeria' | 'solicitud' | 'gasto' | 'referido';

export type Notificacion = {
  id: string;
  categoria: CategoriaNotificacion;
  titulo: string;
  resumen: string;
  buenasPracticas?: string[];
  to: string;
  state?: unknown;
  urgente?: boolean;
  // "Pendiente"/"Hecha" (antes "no leída"/"leída", 2026-08-20) — cada notificación tiene un id
  // estable por registro concreto (factura, visita, solicitud...), no por el grupo de todos los
  // que cumplen la condición en ese momento. Eso es lo que permite completarla sola: en cuanto ese
  // id deja de aparecer en `eventosActuales` (la acción que la generó ya se hizo — se respondió,
  // se envió el presupuesto, se cobró la factura...) el efecto de más abajo la marca `hecha`
  // automáticamente. También se puede marcar/desmarcar a mano en cualquier momento.
  hecha: boolean;
  creadaEn: string;
};

export function useNotificaciones() {
  const { user } = useAuth();
  const { alertas } = useAlertasFiscales();

  const [historial, setHistorial] = useState<Notificacion[]>([]);
  const historialCargado = useRef(false);
  useEffect(() => {
    if (historialCargado.current || !user) return;
    historialCargado.current = true;
    setHistorial(leerHistorial(user.id));
  }, [user]);

  const { data: facturas } = useQuery({
    queryKey: ['facturas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('facturas').select('*').is('eliminado_en', null);
      if (error) throw error;
      return data as Factura[];
    },
  });

  const { data: visitas } = useQuery({
    queryKey: ['visitas'],
    queryFn: async () => {
      // Sin .order() a propósito: esta queryKey ['visitas'] la comparten ~20 pantallas con
      // distinto orden (VisitasPage usa created_at desc, esta usaba fecha_visita asc) — Tanstack
      // Query cachea por key, no por queryFn, así que el orden real dependía de quién poblara la
      // caché primero, no de este .order() (bug real corregido 2026-08-18). El orden por
      // fecha_visita que necesita el resumen de abajo se aplica en JS, no en SQL.
      const { data, error } = await supabase.from('visitas').select('*').is('eliminado_en', null);
      if (error) throw error;
      return data as Visita[];
    },
  });

  const esGabriel = user?.email === EMAIL_GABRIEL;

  const { data: config } = useQuery({
    queryKey: ['empresa_config', 'completa'],
    queryFn: cargarConfigCompleta,
  });
  const diasEsperaResena = ((config?.datos as { resenas?: { diasEspera?: number } } | undefined)?.resenas?.diasEspera) ?? 3;

  const { data: presupuestos } = useQuery({
    queryKey: ['presupuestos', 'notificaciones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('id, visita_id, estado, numero, cliente_nombre, fecha_validez, created_at')
        .is('eliminado_en', null);
      if (error) throw error;
      return data as { id: string; visita_id: string | null; estado: string; numero: string | null; cliente_nombre: string | null; fecha_validez: string | null; created_at: string }[];
    },
  });

  const { data: galeria } = useQuery({
    queryKey: ['galeria', 'notificaciones'],
    enabled: esGabriel,
    queryFn: async () => {
      const { data, error } = await supabase.from('galeria').select('visita_id');
      if (error) throw error;
      return data as { visita_id: string | null }[];
    },
  });

  const { data: gastosKilometricoPendientes } = useQuery({
    queryKey: ['gastos', 'kilometrico-pendiente'],
    queryFn: async () => {
      const { data, error } = await supabase.from('gastos').select('id, descripcion').eq('estado_gasto', 'pendiente');
      if (error) throw error;
      return data as { id: string; descripcion: string | null }[];
    },
  });

  const { data: solicitudes } = useQuery({
    queryKey: ['solicitudes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('solicitudes').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Solicitud[];
    },
  });

  const { data: seguimientos } = useQuery({
    queryKey: ['presupuestos', 'respuestas-pendientes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select(
          'id, numero, cliente_nombre, cliente_email, idioma, ultima_respuesta_cliente_resumen, ultima_respuesta_cliente_fecha, ultima_respuesta_revisada, mensaje_seguimiento_generado, mensaje_seguimiento_enviado, mensaje_seguimiento_enviado_en, seguimiento_concluido, estado',
        )
        .is('eliminado_en', null)
        .not('ultima_respuesta_cliente_fecha', 'is', null)
        .order('ultima_respuesta_cliente_fecha', { ascending: false });
      if (error) throw error;
      return data as PresupuestoConRespuesta[];
    },
  });

  const { data: mensajesNoLeidos } = useQuery({
    queryKey: ['mensajes_equipo', 'no-leidos', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from('mensajes_equipo')
        .select('*', { count: 'exact', head: true })
        .or(`destinatario_ids.is.null,destinatario_ids.cs.{${user.id}}`)
        .neq('autor_id', user.id)
        .not('leido_por', 'cs', `{${user.id}}`)
        .not('eliminado_por', 'cs', `{${user.id}}`);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
    refetchInterval: 10000,
  });

  // Extraído de eventosActuales para poder exponer la lista completa de visitas (no solo el
  // resumen del aviso) — la usa el botón de descarga de PDF de la campana, que necesita
  // dirección/tipo/descripción y no solo el texto ya recortado de la notificación.
  const visitasSinPresupuesto = useMemo(
    () => filtrarVisitasSinPresupuesto(visitas, presupuestos, solicitudes),
    [visitas, presupuestos, solicitudes],
  );

  const eventosActuales = useMemo(() => {
    const lista: Omit<Notificacion, 'hecha' | 'creadaEn'>[] = [];

    for (const a of alertas) {
      const tabFiscal =
        a.tipo === 'tva_urgente' || a.tipo === 'tva_declarable'
          ? 'tva'
          : a.tipo === 'tramo_cerca' || a.tipo === 'tramo_superado'
            ? 'is'
            : a.tipo === 'echeance_urgente'
              ? 'calendario'
              : 'dashboard';
      lista.push({
        id: `fiscal-${a.id}`,
        categoria: 'fiscal',
        titulo: a.titulo,
        resumen: a.mensaje,
        buenasPracticas: a.buenasPracticas,
        to: `/fiscalidad/${tabFiscal}`,
        urgente: a.tipo === 'tva_urgente' || a.tipo === 'tramo_superado' || a.tipo === 'echeance_urgente',
      });
    }

    const vencidas = (facturas ?? []).filter((f) => f.estado_cobro === 'Vencida');
    for (const f of vencidas) {
      lista.push({
        id: `factura-vencida-${f.id}`,
        categoria: 'factura',
        titulo: `Factura vencida: ${f.numero ?? 'S/N'}`,
        resumen: `${f.cliente_nombre ?? 'Cliente sin nombre'} — pendiente de cobro.`,
        to: '/finanzas/facturas',
        urgente: true,
      });
    }

    // Ya no dice "de confirmar" — una visita registrada ya está confirmada, esto es solo "todavía
    // no se ha realizado". Antes avisaba de CUALQUIER visita Pendiente, incluidas las programadas
    // para dentro de varios días — eso no es nada accionable, es simplemente que aún no ha llegado
    // el día (hallazgo real de Gabriel, 2026-08-20). Ahora solo entran las que de verdad necesitan
    // atención: sin fecha asignada todavía, o con fecha ya pasada y que el auto-completado de
    // AppLayout.tsx (pasa a Realizada 1h después de su hora) no ha podido procesar.
    const hoyVisitas = isoHaceDias(0);
    const pendientesRealizar = (visitas ?? [])
      .filter((v) => v.estado === 'Pendiente' && (!v.fecha_visita || v.fecha_visita <= hoyVisitas))
      .sort((a, b) => (a.fecha_visita ?? '').localeCompare(b.fecha_visita ?? ''));
    for (const v of pendientesRealizar) {
      lista.push({
        id: `visita-pendiente-${v.id}`,
        categoria: 'visita',
        titulo: `Visita pendiente: ${v.nombre} ${v.apellidos}`,
        resumen: v.fecha_visita
          ? `Programada el ${v.fecha_visita} — márcala como Realizada o Cancelada.`
          : 'Sin fecha asignada todavía.',
        to: '/visitas',
      });
    }

    // Aviso previo de visitas de mañana — a diferencia del aviso de arriba (que solo salta el
    // mismo día o después, para marcar el resultado real), este es un simple recordatorio para
    // prepararse antes de que llegue el día (petición de Gabriel 2026-09-02: hasta ahora el único
    // aviso de una visita agendada era el email al equipo que manda notificar-visita al crearla,
    // sin ningún recordatorio cercano a la fecha). Solo se ve mientras el CRM está abierto en el
    // navegador — no es una notificación push del sistema.
    const mananaVisitas = isoHaceDias(-1);
    const visitasManana = (visitas ?? [])
      .filter((v) => v.estado === 'Pendiente' && v.fecha_visita === mananaVisitas)
      .sort((a, b) => (a.hora_visita ?? '').localeCompare(b.hora_visita ?? ''));
    for (const v of visitasManana) {
      lista.push({
        id: `visita-manana-${v.id}`,
        categoria: 'visita',
        titulo: `Visita mañana: ${v.nombre} ${v.apellidos}`,
        resumen: `${v.hora_visita?.slice(0, 5) ?? 'Sin hora'} — ${v.direccion ?? 'Sin dirección'}`,
        to: '/visitas',
      });
    }

    const kilometricoPendiente = gastosKilometricoPendientes ?? [];
    for (const g of kilometricoPendiente) {
      lista.push({
        id: `gasto-km-pendiente-${g.id}`,
        categoria: 'gasto',
        titulo: 'Gasto de kilometraje pendiente de revisar',
        resumen: g.descripcion || 'Generado al completar una visita — regístralo como pagado o recházalo si no corresponde.',
        to: '/finanzas/gastos',
      });
    }

    // Presupuesto pendiente de enviar — visita realizada sin presupuesto enviado (todos).
    // Una visita cuya solicitud de origen se marcó Descartada (Gabriel decidió no presupuestar esa
    // obra) no debe seguir avisando indefinidamente — mismo criterio de cruce por contacto que
    // funnelTracking.ts/pipelineSync.ts (hallazgo real 2026-09-07, caso Raphael Szuba). Cálculo en
    // `visitasSinPresupuesto` de más arriba, compartido con el botón de descarga de PDF.
    for (const v of visitasSinPresupuesto) {
      lista.push({
        id: `presupuesto-pendiente-${v.id}`,
        categoria: 'presupuesto',
        titulo: `Envía el presupuesto a ${v.nombre} ${v.apellidos}`,
        resumen: `Visita realizada${v.fecha_visita ? ` el ${v.fecha_visita}` : ''} — todavía no se ha enviado presupuesto.`,
        to: '/finanzas/presupuestos',
      });
    }

    // Presupuesto en Borrador sin enviar — el borrador se creó (a mano o vía agente) pero nadie lo
    // marcó todavía como enviado (Pendiente). Umbral: 2 días de margen normal, urgente a partir de
    // 5 días (Gabriel, 2026-08-30) — antes esto no se detectaba en ningún sitio y un borrador podía
    // quedarse olvidado indefinidamente (hallazgo real: 3 orientativos en Borrador, uno de 11 días
    // sin enviar). Aplica a cualquier tipo (orientativo o normal), tenga o no visita vinculada.
    const limite2dBorrador = isoHaceDias(2);
    const limite5dBorrador = isoHaceDias(5);
    const borradoresSinEnviar = (presupuestos ?? []).filter(
      (p) => p.estado === 'Borrador' && p.created_at.slice(0, 10) <= limite2dBorrador,
    );
    for (const p of borradoresSinEnviar) {
      const fechaCreacion = p.created_at.slice(0, 10);
      lista.push({
        id: `presupuesto-borrador-${p.id}`,
        categoria: 'presupuesto',
        titulo: `Presupuesto sin enviar: ${p.numero ?? 'S/N'}`,
        resumen: `${p.cliente_nombre ?? 'Cliente sin nombre'} — en Borrador desde ${fechaCreacion}, márcalo como enviado en cuanto se lo mandes.`,
        to: '/finanzas/presupuestos',
        urgente: fechaCreacion <= limite5dBorrador,
      });
    }

    // Presupuestos por caducar / caducados — enviados (estado Pendiente) cuya fecha_validez
    // se acerca o ya ha pasado sin que el cliente haya decidido.
    const hoy = isoHaceDias(0);
    const limite7d = isoHaceDias(-7); // dentro de los próximos 7 días
    const presupuestosPendientes = (presupuestos ?? []).filter((p) => p.estado === 'Pendiente' && p.fecha_validez);

    const caducados = presupuestosPendientes.filter((p) => p.fecha_validez! < hoy);
    for (const p of caducados) {
      lista.push({
        id: `presupuesto-caducado-${p.id}`,
        categoria: 'presupuesto',
        titulo: `Presupuesto caducado sin respuesta: ${p.numero ?? 'S/N'}`,
        resumen: `${p.cliente_nombre ?? 'Cliente sin nombre'} · válido hasta ${p.fecha_validez}`,
        to: '/finanzas/presupuestos',
        urgente: true,
      });
    }

    const porCaducar = presupuestosPendientes.filter((p) => p.fecha_validez! >= hoy && p.fecha_validez! <= limite7d);
    for (const p of porCaducar) {
      lista.push({
        id: `presupuesto-por-caducar-${p.id}`,
        categoria: 'presupuesto',
        titulo: `Presupuesto a punto de caducar: ${p.numero ?? 'S/N'}`,
        resumen: `${p.cliente_nombre ?? 'Cliente sin nombre'} · válido hasta ${p.fecha_validez}`,
        to: '/finanzas/presupuestos',
      });
    }

    // Avisos de reseña y caso de éxito — solo para Gabriel Ordoñez
    if (esGabriel) {
      const limiteCierre = isoHaceDias(diasEsperaResena);
      const limite3d = isoHaceDias(3);
      const limite6m = isoHaceMeses(6);

      // Solo facturas normales (nunca acompte ni rectificativa) — un acompte cobrado no significa
      // que la obra esté terminada, y no tiene sentido pedir reseña/caso de éxito hasta que se
      // cobre la factura final (hallazgo real de Gabriel, 2026-08-20). Contacto por email O
      // teléfono (antes exigía email — el mensaje de cierre de obra ahora también sale por
      // WhatsApp, ver CierreObraBanner).
      const cobradasConContacto = (facturas ?? []).filter(
        (f) => f.tipo === 'normal' && f.estado_cobro === 'Cobrada' && (f.cliente_email || f.cliente_tel) && f.fecha_pago,
      );

      for (const f of cobradasConContacto) {
        // Reseña automática (resena-automatica, 2026-09-24): mientras está 'programada' o en
        // 'revisar' sustituye al aviso genérico de "Prepara el mensaje" — en el primer caso el
        // envío ya está en marcha y lo único que cabe es cancelarlo desde la factura; en el
        // segundo hay que decidirlo a mano porque el cron encontró una rectificativa o notas recientes.
        if (f.resena_auto_estado === 'programada' && !f.resena_enviado_en) {
          const envio = f.resena_auto_programada_en ? new Date(f.resena_auto_programada_en) : new Date();
          envio.setDate(envio.getDate() + 1);
          lista.push({
            id: `resena-auto-${f.id}`,
            categoria: 'resena',
            titulo: `Reseña automática programada para ${f.cliente_nombre ?? 'cliente'}`,
            resumen: `Se enviará el ${envio.toLocaleDateString('es', { day: '2-digit', month: 'short' })} a las 9:00 al email del cliente (factura ${f.numero ?? ''}). Si no procede, cancélala desde la factura.`,
            to: '/finanzas/facturas',
            state: { verDocId: f.id, verDocTipo: 'factura' },
          });
          continue;
        }
        if (f.resena_auto_estado === 'revisar' && !f.resena_enviado_en) {
          lista.push({
            id: `resena-auto-revisar-${f.id}`,
            categoria: 'resena',
            titulo: `Reseña automática no programada para ${f.cliente_nombre ?? 'cliente'}`,
            resumen: `Hay una rectificativa o notas recientes en la obra de la factura ${f.numero ?? ''}. Revísalo y, si procede, envía el mensaje de cierre a mano desde Inicio.`,
            to: '/finanzas/facturas',
            state: { verDocId: f.id, verDocTipo: 'factura' },
            urgente: true,
          });
          continue;
        }
        if (!f.resena_enviado_en && f.fecha_pago! <= limiteCierre) {
          lista.push({
            id: `cierre-obra-${f.id}`,
            categoria: 'resena',
            titulo: `Prepara el mensaje de cierre para ${f.cliente_nombre ?? 'cliente'}`,
            resumen: `Factura ${f.numero ?? ''} pagada el ${f.fecha_pago} — pídele su opinión y, si aplica, invítale al programa de referidos.`,
            to: '/',
          });
        }
        // resena_cortesia_enviada_en (2026-09-13) cierra este aviso de verdad al marcarlo desde el
        // banner de Inicio — antes dependía solo del historial local del navegador de cada usuario,
        // así que podía "resucitar" si Gabriel entraba desde otro dispositivo o borraba datos.
        if (!f.resena_cortesia_enviada_en && f.fecha_pago! <= limite6m) {
          lista.push({
            id: `resena-cortesia-${f.id}`,
            categoria: 'resena',
            titulo: `Mensaje de cortesía (6 meses) a ${f.cliente_nombre ?? 'cliente'}`,
            resumen: 'Han pasado 6 meses desde su obra. Envíale un mensaje de cortesía y, si no dejó reseña, anímale a escribirla.',
            to: '/',
          });
        }
      }

      const visitaIdsConGaleria = new Set((galeria ?? []).map((g) => g.visita_id).filter((id): id is string => !!id));
      for (const f of cobradasConContacto) {
        if (f.visita_id && f.fecha_pago! <= limite3d && !visitaIdsConGaleria.has(f.visita_id)) {
          lista.push({
            id: `caso-exito-${f.id}`,
            categoria: 'galeria',
            titulo: `Sube el caso de éxito de ${f.cliente_nombre ?? 'este cliente'}`,
            resumen: `Obra pagada el ${f.fecha_pago} — añade fotos y descripción a la Galería para publicarlo en la web.`,
            to: '/galeria',
          });
        }
      }

      // Programa de referidos (2026-09-13): visita con referido_por relleno cuyo presupuesto llegó
      // a Aceptado — hora de aplicar el descuento al cliente que refirió, en su próxima obra. Se
      // marca resuelto desde ReferidoIncentivoBox (VisitaDetalleContenido.tsx), nunca solo.
      const visitaIdsConPresupuestoAceptado = new Set(
        (presupuestos ?? []).filter((p) => p.estado === 'Aceptado' && p.visita_id).map((p) => p.visita_id as string),
      );
      const referidosConvertidos = (visitas ?? []).filter(
        (v) => v.referido_por && !v.referido_incentivo_aplicado_en && visitaIdsConPresupuestoAceptado.has(v.id),
      );
      for (const v of referidosConvertidos) {
        lista.push({
          id: `referido-convertido-${v.id}`,
          categoria: 'referido',
          titulo: `Aplica el incentivo a ${v.referido_por}`,
          resumen: `${v.nombre} ${v.apellidos} (referido por ${v.referido_por}) aceptó presupuesto — dale su descuento la próxima vez que le hagas uno.`,
          to: '/visitas',
        });
      }
    }

    // estado='Nueva' cubre dos casos distintos: una solicitud que nunca se contestó
    // (`mensaje_enviado_en` null, de verdad "nueva") y una que ya se había marcado "Enviada" y
    // `revisar-gmail` volvió a poner en "Nueva" porque el cliente respondió en el mismo hilo
    // (`mensaje_enviado_en` no-null) — esa segunda es una respuesta pendiente, no un lead nuevo,
    // y antes salía con el mismo título "solicitud nueva" que la primera (bug real, 2026-08-19).
    const solicitudesNuevas = (solicitudes ?? []).filter((s) => s.estado === 'Nueva' && !s.mensaje_enviado_en);
    for (const s of solicitudesNuevas) {
      lista.push({
        id: `solicitud-nueva-${s.id}`,
        categoria: 'solicitud',
        titulo: `Solicitud nueva sin revisar: ${s.nombre || s.email || 'Sin nombre'}`,
        resumen: s.tipo_reforma || 'Tipo de reforma sin especificar',
        to: '/solicitudes/entrantes',
      });
    }

    const solicitudesConRespuesta = (solicitudes ?? []).filter((s) => s.estado === 'Nueva' && s.mensaje_enviado_en);
    for (const s of solicitudesConRespuesta) {
      lista.push({
        id: `solicitud-respuesta-${s.id}`,
        categoria: 'solicitud',
        titulo: `Respuesta de cliente a solicitud a revisar: ${s.nombre || s.email || 'Sin nombre'}`,
        resumen: s.tipo_reforma || 'Tipo de reforma sin especificar',
        to: '/solicitudes/entrantes',
      });
    }

    const seguimientosNuevos = (seguimientos ?? []).filter((p) => estadoSeguimiento(p) === 'Nueva');
    for (const p of seguimientosNuevos) {
      lista.push({
        id: `seguimiento-nuevo-${p.id}`,
        categoria: 'solicitud',
        titulo: `Respuesta de cliente a revisar: ${p.numero ?? 'S/N'}`,
        resumen: p.cliente_nombre ?? 'Cliente sin nombre',
        // "Respuestas a presupuestos" se fusionó en "Solicitud de presupuesto" (2026-09-06) — ya
        // no es una pestaña propia, la respuesta se ve en la misma tabla que las solicitudes.
        to: '/solicitudes/entrantes',
      });
    }

    // Id con el conteo (no un id fijo "mensajes") para que, al leer todos los mensajes, esta
    // notificación se complete sola — y si luego llegan mensajes nuevos, el conteo cambia y
    // genera un id distinto, así que vuelve a avisar (antes el id fijo hacía que, tras la primera
    // vez marcada, nunca más volviera a saltar aunque hubiera mensajes nuevos de verdad).
    if ((mensajesNoLeidos ?? 0) > 0) {
      lista.push({
        id: `mensajes-${mensajesNoLeidos}`,
        categoria: 'mensaje',
        titulo: `${mensajesNoLeidos} mensaje${mensajesNoLeidos! > 1 ? 's' : ''} nuevo${mensajesNoLeidos! > 1 ? 's' : ''} en Mensajería`,
        resumen: 'Tienes mensajes del equipo sin leer.',
        to: '/mensajeria',
      });
    }

    return lista;
  }, [
    alertas,
    facturas,
    visitas,
    mensajesNoLeidos,
    presupuestos,
    galeria,
    esGabriel,
    solicitudes,
    seguimientos,
    gastosKilometricoPendientes,
    visitasSinPresupuesto,
    diasEsperaResena,
  ]);

  // Vuelca los eventos activos en el historial persistido (localStorage): añade los que son
  // nuevos, y AUTOCOMPLETA solos los que ya no aparecen en `eventosActuales` — es decir, cuya
  // condición ya no se cumple porque la acción real ya se hizo (se respondió, se envió el
  // presupuesto, se cobró la factura...). Antes esto no pasaba nunca: una notificación se quedaba
  // "sin leer" para siempre hasta que alguien la tocara a mano, aunque el problema que la generó
  // llevara resuelto días (hallazgo real de Gabriel, 2026-08-20). Una vez "Hecha" (sola o a mano)
  // no vuelve a "Pendiente" aunque su id siga vivo — así una marca manual no se deshace sola.
  // Tope de 50 — se descartan los más antiguos.
  useEffect(() => {
    if (!user || !historialCargado.current) return;
    setHistorial((actual) => {
      const idsVivos = new Set(eventosActuales.map((e) => e.id));
      const idsActuales = new Set(actual.map((n) => n.id));
      const nuevos = eventosActuales.filter((e) => !idsActuales.has(e.id));

      let huboAutocompletado = false;
      const actualizado = actual.map((n) => {
        if (!n.hecha && !idsVivos.has(n.id)) {
          huboAutocompletado = true;
          return { ...n, hecha: true };
        }
        return n;
      });

      if (nuevos.length === 0 && !huboAutocompletado) return actual;
      const ahora = new Date().toISOString();
      const combinado = [...nuevos.map((n) => ({ ...n, hecha: false, creadaEn: ahora })), ...actualizado].slice(0, LIMITE_HISTORIAL);
      guardarHistorial(user.id, combinado);
      return combinado;
    });
  }, [eventosActuales, user]);

  const marcarHecha = (id: string, hecha = true) => {
    if (!user) return;
    setHistorial((actual) => {
      const siguiente = actual.map((n) => (n.id === id ? { ...n, hecha } : n));
      guardarHistorial(user.id, siguiente);
      return siguiente;
    });
  };

  const eliminarNotificacion = (id: string) => {
    if (!user) return;
    setHistorial((actual) => {
      const siguiente = actual.filter((n) => n.id !== id);
      guardarHistorial(user.id, siguiente);
      return siguiente;
    });
  };

  const pendientes = useMemo(() => historial.filter((n) => !n.hecha), [historial]);
  const hechas = useMemo(() => historial.filter((n) => n.hecha), [historial]);
  const urgentes = pendientes.filter((n) => n.urgente).length;

  return { pendientes, hechas, urgentes, marcarHecha, eliminarNotificacion, visitasSinPresupuesto };
}
