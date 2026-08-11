import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useAlertasFiscales } from '../fiscalidad/useAlertasFiscales';
import { estadoSeguimiento, type PresupuestoConRespuesta, type Solicitud } from '../solicitudes/types';
import type { Factura } from '../finanzas/facturas/types';
import type { Visita } from '../visitas/types';

const LIMITE_HISTORIAL = 50;

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

export type CategoriaNotificacion = 'fiscal' | 'factura' | 'visita' | 'mensaje' | 'presupuesto' | 'resena' | 'galeria' | 'solicitud';

export type Notificacion = {
  id: string;
  categoria: CategoriaNotificacion;
  titulo: string;
  resumen: string;
  buenasPracticas?: string[];
  to: string;
  state?: unknown;
  urgente?: boolean;
  leida: boolean;
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
      const { data, error } = await supabase
        .from('visitas')
        .select('*')
        .is('eliminado_en', null)
        .order('fecha_visita', { ascending: true });
      if (error) throw error;
      return data as Visita[];
    },
  });

  const esGabriel = user?.email === EMAIL_GABRIEL;

  const { data: presupuestos } = useQuery({
    queryKey: ['presupuestos', 'notificaciones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('id, visita_id, estado, numero, cliente_nombre, fecha_validez')
        .is('eliminado_en', null);
      if (error) throw error;
      return data as { id: string; visita_id: string | null; estado: string; numero: string | null; cliente_nombre: string | null; fecha_validez: string | null }[];
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
          'id, numero, cliente_nombre, cliente_email, idioma, ultima_respuesta_cliente_resumen, ultima_respuesta_cliente_fecha, ultima_respuesta_revisada, mensaje_seguimiento_generado, mensaje_seguimiento_enviado, mensaje_seguimiento_enviado_en',
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

  const eventosActuales = useMemo(() => {
    const lista: Omit<Notificacion, 'leida' | 'creadaEn'>[] = [];

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
    if (vencidas.length > 0) {
      lista.push({
        id: `facturas-vencidas-${vencidas.length}`,
        categoria: 'factura',
        titulo: `${vencidas.length} factura${vencidas.length > 1 ? 's' : ''} vencida${vencidas.length > 1 ? 's' : ''}`,
        resumen: vencidas
          .slice(0, 4)
          .map((f) => `${f.numero ?? 'S/N'} · ${f.cliente_nombre ?? ''}`)
          .join(' · '),
        to: '/finanzas/facturas',
        urgente: true,
      });
    }

    const pendientesConfirmar = (visitas ?? []).filter((v) => v.estado === 'Pendiente');
    if (pendientesConfirmar.length > 0) {
      lista.push({
        id: `visitas-pendientes-${pendientesConfirmar.length}`,
        categoria: 'visita',
        titulo: `${pendientesConfirmar.length} visita${pendientesConfirmar.length > 1 ? 's' : ''} pendiente${pendientesConfirmar.length > 1 ? 's' : ''} de confirmar`,
        resumen: pendientesConfirmar
          .slice(0, 4)
          .map((v) => `${v.nombre} ${v.apellidos} · ${v.fecha_visita ?? 'sin fecha'}`)
          .join(' · '),
        to: '/visitas',
      });
    }

    // Presupuesto pendiente de enviar — visita realizada sin presupuesto enviado (todos)
    const visitaIdsConPresupuestoEnviado = new Set(
      (presupuestos ?? []).filter((p) => p.estado !== 'Borrador' && p.visita_id).map((p) => p.visita_id as string),
    );
    const visitasSinPresupuesto = (visitas ?? []).filter(
      (v) => v.estado === 'Realizada' && !visitaIdsConPresupuestoEnviado.has(v.id),
    );
    for (const v of visitasSinPresupuesto) {
      lista.push({
        id: `presupuesto-pendiente-${v.id}`,
        categoria: 'presupuesto',
        titulo: `Envía el presupuesto a ${v.nombre} ${v.apellidos}`,
        resumen: `Visita realizada${v.fecha_visita ? ` el ${v.fecha_visita}` : ''} — todavía no se ha enviado presupuesto.`,
        to: '/finanzas/presupuestos',
      });
    }

    // Presupuestos por caducar / caducados — enviados (estado Pendiente) cuya fecha_validez
    // se acerca o ya ha pasado sin que el cliente haya decidido.
    const hoy = isoHaceDias(0);
    const limite7d = isoHaceDias(-7); // dentro de los próximos 7 días
    const presupuestosPendientes = (presupuestos ?? []).filter((p) => p.estado === 'Pendiente' && p.fecha_validez);

    const caducados = presupuestosPendientes.filter((p) => p.fecha_validez! < hoy);
    if (caducados.length > 0) {
      lista.push({
        id: `presupuestos-caducados-${caducados.map((p) => p.id).sort().join(',')}`,
        categoria: 'presupuesto',
        titulo: `${caducados.length} presupuesto${caducados.length > 1 ? 's' : ''} caducado${caducados.length > 1 ? 's' : ''} sin respuesta`,
        resumen: caducados
          .slice(0, 4)
          .map((p) => `${p.numero ?? 'S/N'} · ${p.cliente_nombre ?? ''} · válido hasta ${p.fecha_validez}`)
          .join(' · '),
        to: '/finanzas/presupuestos',
        urgente: true,
      });
    }

    const porCaducar = presupuestosPendientes.filter((p) => p.fecha_validez! >= hoy && p.fecha_validez! <= limite7d);
    if (porCaducar.length > 0) {
      lista.push({
        id: `presupuestos-por-caducar-${porCaducar.map((p) => p.id).sort().join(',')}`,
        categoria: 'presupuesto',
        titulo: `${porCaducar.length} presupuesto${porCaducar.length > 1 ? 's' : ''} a punto de caducar`,
        resumen: porCaducar
          .slice(0, 4)
          .map((p) => `${p.numero ?? 'S/N'} · ${p.cliente_nombre ?? ''} · válido hasta ${p.fecha_validez}`)
          .join(' · '),
        to: '/finanzas/presupuestos',
      });
    }

    // Avisos de reseña y caso de éxito — solo para Gabriel Ordoñez
    if (esGabriel) {
      const limite2d = isoHaceDias(2);
      const limite3d = isoHaceDias(3);
      const limite6m = isoHaceMeses(6);

      const cobradasConEmail = (facturas ?? []).filter((f) => f.estado_cobro === 'Cobrada' && f.cliente_email && f.fecha_pago);

      for (const f of cobradasConEmail) {
        if (!f.resena_enviada && f.fecha_pago! <= limite2d) {
          lista.push({
            id: `resena-2d-${f.id}`,
            categoria: 'resena',
            titulo: `Pide opinión a ${f.cliente_nombre ?? 'cliente'}`,
            resumen: `Factura ${f.numero ?? ''} pagada el ${f.fecha_pago} — envíale un mensaje pidiendo su opinión sobre la obra.`,
            to: '/',
          });
        }
        if (f.fecha_pago! <= limite6m) {
          lista.push({
            id: `resena-6m-${f.id}`,
            categoria: 'resena',
            titulo: `Mensaje de cortesía (6 meses) a ${f.cliente_nombre ?? 'cliente'}`,
            resumen: 'Han pasado 6 meses desde su obra. Envíale un mensaje de cortesía y, si no dejó reseña, anímale a escribirla.',
            to: '/',
          });
        }
      }

      const visitaIdsConGaleria = new Set((galeria ?? []).map((g) => g.visita_id).filter((id): id is string => !!id));
      for (const f of cobradasConEmail) {
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
    }

    const solicitudesNuevas = (solicitudes ?? []).filter((s) => s.estado === 'Nueva');
    if (solicitudesNuevas.length > 0) {
      // El id depende de QUÉ solicitudes están nuevas, no solo de cuántas — si solo se usara el
      // conteo, en cuanto ese número volviera a coincidir con uno ya visto/descartado antes (p.ej.
      // 1 solicitud atendida y luego 1 solicitud distinta nueva) el id "solicitudes-nuevas-1" ya
      // existía en el historial y la notificación nueva no se añadía (bug real: la campana no
      // saltaba con un mensaje nuevo de verdad).
      lista.push({
        id: `solicitudes-nuevas-${solicitudesNuevas.map((s) => s.id).sort().join(',')}`,
        categoria: 'solicitud',
        titulo: `${solicitudesNuevas.length} solicitud${solicitudesNuevas.length > 1 ? 'es' : ''} nueva${solicitudesNuevas.length > 1 ? 's' : ''} sin revisar`,
        resumen: solicitudesNuevas
          .slice(0, 4)
          .map((s) => s.nombre || s.email || 'Sin nombre')
          .join(' · '),
        to: '/solicitudes/entrantes',
      });
    }

    const seguimientosNuevos = (seguimientos ?? []).filter((p) => estadoSeguimiento(p) === 'Nueva');
    if (seguimientosNuevos.length > 0) {
      // Mismo motivo que en solicitudesNuevas de arriba — id basado en los presupuestos
      // concretos, no en el conteo.
      lista.push({
        id: `seguimientos-nuevos-${seguimientosNuevos.map((p) => p.id).sort().join(',')}`,
        categoria: 'solicitud',
        titulo: `${seguimientosNuevos.length} respuesta${seguimientosNuevos.length > 1 ? 's' : ''} de cliente a revisar`,
        resumen: seguimientosNuevos
          .slice(0, 4)
          .map((p) => `${p.numero ?? ''} · ${p.cliente_nombre ?? ''}`)
          .join(' · '),
        to: '/solicitudes/seguimiento',
      });
    }

    if ((mensajesNoLeidos ?? 0) > 0) {
      lista.push({
        id: 'mensajes',
        categoria: 'mensaje',
        titulo: `${mensajesNoLeidos} mensaje${mensajesNoLeidos! > 1 ? 's' : ''} nuevo${mensajesNoLeidos! > 1 ? 's' : ''} en Mensajería`,
        resumen: 'Tienes mensajes del equipo sin leer.',
        to: '/mensajeria',
      });
    }

    return lista;
  }, [alertas, facturas, visitas, mensajesNoLeidos, presupuestos, galeria, esGabriel, solicitudes, seguimientos]);

  // Vuelca los eventos activos en el historial persistido (localStorage), preservando
  // el estado leída/no-leída de lo que ya existía. Tope de 50 — se descartan los más antiguos.
  useEffect(() => {
    if (!user || !historialCargado.current) return;
    setHistorial((actual) => {
      const idsActuales = new Set(actual.map((n) => n.id));
      const nuevos = eventosActuales.filter((e) => !idsActuales.has(e.id));
      if (nuevos.length === 0) return actual;
      const ahora = new Date().toISOString();
      const combinado = [...nuevos.map((n) => ({ ...n, leida: false, creadaEn: ahora })), ...actual].slice(0, LIMITE_HISTORIAL);
      guardarHistorial(user.id, combinado);
      return combinado;
    });
  }, [eventosActuales, user]);

  const marcarLeida = (id: string, leida = true) => {
    if (!user) return;
    setHistorial((actual) => {
      const siguiente = actual.map((n) => (n.id === id ? { ...n, leida } : n));
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

  const noLeidas = useMemo(() => historial.filter((n) => !n.leida), [historial]);
  const leidas = useMemo(() => historial.filter((n) => n.leida), [historial]);
  const urgentes = noLeidas.filter((n) => n.urgente).length;

  return { noLeidas, leidas, urgentes, marcarLeida, eliminarNotificacion };
}
