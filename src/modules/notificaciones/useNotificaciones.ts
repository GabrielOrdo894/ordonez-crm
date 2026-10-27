import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { contarMensajesNoLeidos, ultimoMensajeNoLeido } from '../mensajeria/types';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useAlertasFiscales } from '../fiscalidad/useAlertasFiscales';
import { estadoSeguimiento, tieneRespuestaSinRevisar, SELECT_RESPUESTAS_PRESUPUESTO, SELECT_SOLICITUDES, type PresupuestoConRespuesta, type Solicitud } from '../solicitudes/types';
import { normalizarTelefono } from '../clientes/types';
import { cargarConfigCompleta } from '../../lib/pdfEmpresa';
import type { Factura } from '../finanzas/facturas/types';
import type { Visita } from '../visitas/types';
import { isoLocal } from '../../lib/fechas';
import { claveClienteFactura } from '../finanzas/facturas/resenasCliente';

const LIMITE_HISTORIAL = 50;

// Visitas Realizadas sin ningún presupuesto enviado (un Borrador no cuenta como enviado). Función
// pura compartida por la campana y por el KPI "Presupuestos sin enviar" de la Home (InicioPage.tsx)
// para que ambos den siempre el mismo número — mismo criterio que alerta-diaria/index.ts.
export function filtrarVisitasSinPresupuesto<V extends Pick<Visita, 'id' | 'estado' | 'email' | 'telefono'>>(
  visitas: V[] | undefined,
  presupuestos: { visita_id: string | null; estado: string }[] | undefined,
  solicitudes: Pick<Solicitud, 'estado' | 'email' | 'telefono' | 'visita_id'>[] | undefined,
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
  // Solicitud cerrada enlazada directamente a la visita (p. ej. cerrada desde Avisos aunque su
  // contacto no coincida con el de la visita).
  const visitaIdsDescartadas = new Set(
    (solicitudes ?? [])
      .filter((s) => (s.estado === 'No concretada' || s.estado === 'Rechazada') && s.visita_id)
      .map((s) => s.visita_id as string),
  );
  return (visitas ?? []).filter((v) => {
    if (v.estado !== 'Realizada' || visitaIdsConPresupuestoEnviado.has(v.id)) return false;
    if (visitaIdsDescartadas.has(v.id)) return false;
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
  return isoLocal(d);
}

function isoHaceMeses(meses: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return isoLocal(d);
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
  // Eliminada a mano mientras su condición sigue viva: se oculta y no vuelve a aparecer (antes,
  // borrarla la quitaba del historial y el siguiente recálculo la volvía a crear como pendiente).
  descartada?: boolean;
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

  // Estado de la última pasada de revisar-gmail (la anota la propia Edge Function) y de las
  // integraciones de Google que automatizaciones-crm comprueba cada 30 min (2026-10-27). queryKey
  // distinta de la ['google_config'] de Configuración a propósito: el select es otro.
  const { data: estadoGmail } = useQuery({
    queryKey: ['google_config', 'estado-integraciones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('google_config')
        .select(
          'gmail_ultima_revision_en, gmail_ultimo_error, gmail_ultimo_error_en, calendar_caido_desde, calendar_ultimo_error, gmail_token_caido_desde, gmail_token_ultimo_error, maps_caido_desde, maps_ultimo_error',
        )
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      return data as {
        gmail_ultima_revision_en: string | null;
        gmail_ultimo_error: string | null;
        gmail_ultimo_error_en: string | null;
        calendar_caido_desde: string | null;
        calendar_ultimo_error: string | null;
        gmail_token_caido_desde: string | null;
        gmail_token_ultimo_error: string | null;
        maps_caido_desde: string | null;
        maps_ultimo_error: string | null;
      } | null;
    },
    refetchInterval: 10 * 60 * 1000,
  });

  // Estado del servidor de firmas (Documenso autoalojado), anotado por automatizaciones-crm cada
  // 30 min. queryKey propia: el resto de lecturas de empresa_config usan otro select.
  const { data: estadoFirma } = useQuery({
    queryKey: ['empresa_config', 'estado-firma'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresa_config')
        .select('firma_caida_desde, firma_ultimo_error')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      return data as { firma_caida_desde: string | null; firma_ultimo_error: string | null } | null;
    },
    refetchInterval: 10 * 60 * 1000,
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
      // Mismo select que Sidebar/Inicio/Solicitudes (comparten queryKey): con '*' a secas se perdía el
      // presupuesto vinculado en la tabla de Solicitudes si esta consulta ganaba la caché.
      const { data, error } = await supabase.from('solicitudes').select(SELECT_SOLICITUDES).order('created_at', { ascending: false });
      if (error) throw error;
      return data as Solicitud[];
    },
  });

  const { data: seguimientos } = useQuery({
    queryKey: ['presupuestos', 'respuestas-pendientes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select(SELECT_RESPUESTAS_PRESUPUESTO)
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
      return contarMensajesNoLeidos(user.id);
    },
    enabled: !!user,
    refetchInterval: 10000,
  });
  const { data: ultimoNoLeido } = useQuery({
    queryKey: ['mensajes_equipo', 'ultimo-no-leido', user?.id],
    queryFn: () => (user ? ultimoMensajeNoLeido(user.id) : null),
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

    // Aviso de visita que no llegó (2026-10-19): automatizaciones-crm marca aviso_no_llegado_en si el
    // aviso interno no aparece en Gmail 15 min después de enviarse — el cliente probablemente
    // tampoco recibió su confirmación. Se completa solo al reenviar desde la ficha y verificarse.
    const avisosNoLlegados = (visitas ?? []).filter(
      (v) => v.estado === 'Pendiente' && v.aviso_no_llegado_en && !v.aviso_verificado_en && (!v.fecha_visita || v.fecha_visita >= hoyVisitas),
    );
    for (const v of avisosNoLlegados) {
      lista.push({
        id: `visita-aviso-no-llegado-${v.id}`,
        categoria: 'visita',
        titulo: `El aviso de la visita de ${v.nombre} ${v.apellidos ?? ''} todavía no ha llegado`.replace(/\s+/g, ' '),
        resumen: v.aviso_cliente_email
          ? `Probablemente ${v.aviso_cliente_email} tampoco recibió su confirmación. Reenvíala desde la ficha.`
          : 'El email no llegó al equipo. Reenvía la confirmación desde la ficha.',
        to: `/visitas/${v.id}`,
        urgente: true,
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
        to: '/contabilidad/gastos',
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

      // Un aviso por CLIENTE, no por factura (2026-10-20): una obra con varias facturas finales
      // repetía el aviso una vez por factura (ver resenasCliente.ts). Si a un cliente ya se le pidió
      // la reseña o se le mandó la cortesía por cualquiera de sus facturas, no se vuelve a avisar.
      const clavesResenaPedida = new Set((facturas ?? []).filter((f) => f.resena_enviado_en).map(claveClienteFactura));
      const clavesCortesiaHecha = new Set((facturas ?? []).filter((f) => f.resena_cortesia_enviada_en).map(claveClienteFactura));
      const clavesConAvisoResena = new Set<string>();
      const clavesConAvisoCortesia = new Set<string>();

      for (const f of [...cobradasConContacto].sort((a, b) => (b.fecha_pago ?? '').localeCompare(a.fecha_pago ?? ''))) {
        const clave = claveClienteFactura(f);
        const resenaYaResuelta = clavesResenaPedida.has(clave) || clavesConAvisoResena.has(clave);
        // Reseña automática (resena-automatica, 2026-09-24): mientras está 'programada' o en
        // 'revisar' sustituye al aviso genérico de "Prepara el mensaje" — en el primer caso el
        // envío ya está en marcha y lo único que cabe es cancelarlo desde la factura; en el
        // segundo hay que decidirlo a mano porque el cron encontró una rectificativa o notas recientes.
        if (!resenaYaResuelta && f.resena_auto_estado === 'programada' && !f.resena_enviado_en) {
          clavesConAvisoResena.add(clave);
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
        if (!resenaYaResuelta && f.resena_auto_estado === 'revisar' && !f.resena_enviado_en) {
          clavesConAvisoResena.add(clave);
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
        if (!resenaYaResuelta && !f.resena_enviado_en && f.fecha_pago! <= limiteCierre) {
          clavesConAvisoResena.add(clave);
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
        if (
          !f.resena_cortesia_enviada_en &&
          f.fecha_pago! <= limite6m &&
          !clavesCortesiaHecha.has(clave) &&
          !clavesConAvisoCortesia.has(clave)
        ) {
          clavesConAvisoCortesia.add(clave);
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
      const visitasConAvisoCaso = new Set<string>();
      for (const f of cobradasConContacto) {
        if (f.visita_id && f.fecha_pago! <= limite3d && !visitaIdsConGaleria.has(f.visita_id) && !visitasConAvisoCaso.has(f.visita_id)) {
          visitasConAvisoCaso.add(f.visita_id);
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

    // Respuestas de clientes: no se avisa si la visita ya está cerrada (Realizada/Cancelada) — a
    // partir de ahí la conversación ya no interesa aquí (Gabriel, 2026-09-30).
    const estadoVisitaPorId = new Map((visitas ?? []).map((v) => [v.id, v.estado]));
    const visitaCerrada = (visitaId: string | null) => {
      const estado = visitaId ? estadoVisitaPorId.get(visitaId) : null;
      return estado === 'Realizada' || estado === 'Cancelada';
    };

    const solicitudesConRespuesta = (solicitudes ?? []).filter(
      (s) => tieneRespuestaSinRevisar(s) && !visitaCerrada(s.visita_id),
    );
    for (const s of solicitudesConRespuesta) {
      lista.push({
        id: `solicitud-respuesta-${s.id}`,
        categoria: 'solicitud',
        titulo: `Respuesta de cliente a solicitud a revisar: ${s.nombre || s.email || 'Sin nombre'}`,
        resumen: s.tipo_reforma || 'Tipo de reforma sin especificar',
        to: '/solicitudes/entrantes',
      });
    }

    // Un presupuesto ya Aceptado/Rechazado cuenta igual como cerrado (hay orientativos sin visita
    // propia: la visita cuelga del presupuesto definitivo).
    const seguimientosNuevos = (seguimientos ?? []).filter(
      (p) =>
        estadoSeguimiento(p) === 'Nueva' &&
        !visitaCerrada(p.visita_id) &&
        p.estado !== 'Aceptado' &&
        p.estado !== 'Rechazado',
    );
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

    // Id con la fecha del último mensaje sin leer: al leerlos todos el aviso se completa solo, y un
    // mensaje nuevo genera otro id y vuelve a avisar. Antes el id era el conteo: bajar de 3 a 2
    // avisaba de "mensajes nuevos" y volver a un número ya visto no avisaba (auditoría 2026-10-01).
    if ((mensajesNoLeidos ?? 0) > 0) {
      lista.push({
        id: `mensajes-${ultimoNoLeido ?? mensajesNoLeidos}`,
        categoria: 'mensaje',
        titulo: `${mensajesNoLeidos} mensaje${mensajesNoLeidos! > 1 ? 's' : ''} nuevo${mensajesNoLeidos! > 1 ? 's' : ''} en Mensajería`,
        resumen: 'Tienes mensajes del equipo sin leer.',
        to: '/mensajeria',
      });
    }

    // Revisión de Gmail rota: sin ella no entra ninguna solicitud web ni se detectan respuestas.
    // Del 9 al 12 de octubre de 2026 el token de Google estuvo revocado y nadie lo vio porque el
    // cron solo registra que lanzó la petición. Id ligado a la fecha del error: en cuanto una
    // pasada vuelve a funcionar, la Edge Function limpia el error y la notificación se completa sola.
    // Desde 2026-10-27 el token de Gmail también se comprueba cada 30 min (gmail_token_*), no solo en
    // la pasada diaria: un único aviso con la fecha más antigua de las dos.
    const errorGmail = estadoGmail?.gmail_ultimo_error || estadoGmail?.gmail_token_ultimo_error;
    if (errorGmail) {
      const fechas = [estadoGmail?.gmail_ultimo_error_en, estadoGmail?.gmail_token_caido_desde].filter((f): f is string => !!f).sort();
      const desde = (fechas[0] ?? '').slice(0, 10);
      lista.push({
        id: `gmail-error-${desde}`,
        categoria: 'solicitud',
        titulo: 'Gmail desconectado: el CRM no recibe solicitudes',
        resumen: `La conexión con Gmail falla desde el ${desde || 'hoy'}: ${errorGmail}`,
        buenasPracticas: [
          'Entra en Configuración y vuelve a conectar Gmail con la cuenta reformasordonezeus.',
          'Después pulsa «Comprobar Gmail»: la búsqueda cubre los últimos 7 días, así que lo que haya llegado mientras tanto entra entonces.',
        ],
        to: '/configuracion',
        urgente: true,
      });
    } else if (estadoGmail?.gmail_ultima_revision_en) {
      // Sin error anotado pero sin ninguna pasada en 36 h: el cron no está llegando a la función
      // (p. ej. 401 por el secreto del service role) — también hay que mirarlo.
      const horasSinRevisar = (Date.now() - new Date(estadoGmail.gmail_ultima_revision_en).getTime()) / 3_600_000;
      if (horasSinRevisar > 36) {
        lista.push({
          id: `gmail-sin-revision-${estadoGmail.gmail_ultima_revision_en.slice(0, 10)}`,
          categoria: 'solicitud',
          titulo: 'Gmail sin revisar desde hace más de un día',
          resumen: `Última revisión correcta: ${estadoGmail.gmail_ultima_revision_en.slice(0, 16).replace('T', ' ')}. Pulsa «Comprobar Gmail» en Solicitudes y, si falla, revisa la conexión en Configuración.`,
          to: '/solicitudes',
          urgente: true,
        });
      }
    }

    // Google Calendar y Google Maps, comprobados cada 30 min por automatizaciones-crm (2026-10-27):
    // antes solo se descubrían al agendar una visita o al calcular una ruta. Id ligado a la fecha de
    // la caída: al volver a funcionar, la función limpia *_caido_desde y el aviso se completa solo.
    if (estadoGmail?.calendar_caido_desde) {
      const desde = estadoGmail.calendar_caido_desde.slice(0, 10);
      lista.push({
        id: `calendar-caido-${desde}`,
        categoria: 'visita',
        titulo: 'Google Calendar desconectado: las visitas no se agendan en el calendario',
        resumen: `La conexión falla desde el ${desde}: ${estadoGmail.calendar_ultimo_error ?? 'sin detalle'}`,
        buenasPracticas: [
          'Entra en Configuración → Google Calendar y Gmail y pulsa «Reconectar» en Calendar con la cuenta reformasordonezeus.',
          'Las visitas creadas o reprogramadas mientras tanto no tienen evento: ábrelas y guárdalas otra vez para crearlo.',
        ],
        to: '/configuracion',
        urgente: true,
      });
    }
    if (estadoGmail?.maps_caido_desde) {
      const desde = estadoGmail.maps_caido_desde.slice(0, 10);
      lista.push({
        id: `maps-caido-${desde}`,
        categoria: 'visita',
        titulo: 'Google Maps no responde: direcciones y kilometraje sin ruta real',
        resumen: `Google rechaza la clave desde el ${desde}: ${estadoGmail.maps_ultimo_error ?? 'sin detalle'}`,
        buenasPracticas: [
          'Revisa en console.cloud.google.com (proyecto ordonez-crm) la facturación y las restricciones de la clave de Maps.',
          'Mientras tanto el kilometraje se calcula en línea recta y se marca «estimado, revisar» en Gastos.',
        ],
        to: '/configuracion',
        urgente: true,
      });
    }

    // Servidor de firmas caído: no se pueden generar enlaces de firma de presupuestos. Id ligado a la
    // fecha de la caída: cuando vuelve a responder, automatizaciones-crm limpia firma_caida_desde.
    if (estadoFirma?.firma_caida_desde) {
      const desde = estadoFirma.firma_caida_desde.slice(0, 16).replace('T', ' ');
      lista.push({
        id: `firma-caida-${estadoFirma.firma_caida_desde.slice(0, 10)}`,
        categoria: 'presupuesto',
        titulo: 'Servidor de firmas caído: no se pueden generar enlaces de firma',
        resumen: `firma.ordonezrenov.com no responde desde el ${desde} (${estadoFirma.firma_ultimo_error ?? 'sin respuesta'}). Reinicia el servidor de Documenso.`,
        to: '/finanzas/presupuestos',
        urgente: true,
      });
    }

    return lista;
  }, [
    estadoFirma,
    estadoGmail,
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
    ultimoNoLeido,
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
      const actualizado = actual
        // Una descartada cuya condición ya no se cumple sobra del todo.
        .filter((n) => {
          if (n.descartada && !idsVivos.has(n.id)) {
            huboAutocompletado = true;
            return false;
          }
          return true;
        })
        .map((n) => {
          if (!n.hecha && !idsVivos.has(n.id)) {
            huboAutocompletado = true;
            return { ...n, hecha: true };
          }
          return n;
        });

      if (nuevos.length === 0 && !huboAutocompletado) return actual;
      const ahora = new Date().toISOString();
      const todos = [...nuevos.map((n) => ({ ...n, hecha: false, creadaEn: ahora })), ...actualizado];
      // El tope solo recorta avisos ya resueltos: si se recortaba uno cuya condición seguía viva
      // (p. ej. marcado como hecho a mano), en el siguiente recálculo reaparecía como pendiente
      // nuevo (auditoría 2026-10-01).
      const vivos = todos.filter((n) => idsVivos.has(n.id));
      const resueltos = new Set(todos.filter((n) => !idsVivos.has(n.id)).slice(0, Math.max(0, LIMITE_HISTORIAL - vivos.length)));
      const combinado = todos.filter((n) => idsVivos.has(n.id) || resueltos.has(n));
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
    const vivo = eventosActuales.some((e) => e.id === id);
    setHistorial((actual) => {
      const siguiente = vivo
        ? actual.map((n) => (n.id === id ? { ...n, hecha: true, descartada: true } : n))
        : actual.filter((n) => n.id !== id);
      guardarHistorial(user.id, siguiente);
      return siguiente;
    });
  };

  const pendientes = useMemo(() => historial.filter((n) => !n.hecha && !n.descartada), [historial]);
  const hechas = useMemo(() => historial.filter((n) => n.hecha && !n.descartada), [historial]);
  const urgentes = pendientes.filter((n) => n.urgente).length;

  return { pendientes, hechas, urgentes, marcarHecha, eliminarNotificacion, visitasSinPresupuesto };
}
