// Edge Function: alerta-diaria
//
// Cron diario (ver migración `alerta-diaria-urgentes` en pg_cron) que revisa varias categorías
// urgentes del CRM y, SOLO si hay algo pendiente de verdad, manda un resumen por email a
// reformasordonezeus@gmail.com — porque las notificaciones normales solo viven dentro de la
// app (campanita) y si nadie abre el CRM unos días pasan desapercibidas.
//
// Categorías (mismo cálculo que src/modules/notificaciones/useNotificaciones.ts, para que el
// email diga lo mismo que la campana in-app):
//   1. Facturas vencidas (estado_cobro = 'Vencida')
//   2. Presupuestos caducados sin respuesta (Pendiente, fecha_validez < hoy)
//   3. Solicitudes nuevas sin revisar (estado = 'Nueva' y nunca se contestaron, mensaje_enviado_en null)
//   4. Gastos de kilometraje pendientes de revisar (estado_gasto = 'pendiente')
//   5. Respuestas de cliente a solicitudes sin revisar (estado = 'Nueva' pero mensaje_enviado_en
//      no-null — ya se había contestado y el cliente respondió otra vez en el mismo hilo; antes
//      salía mezclado con la categoría 3 como "solicitud nueva", corregido 2026-08-19).
//   6. Visitas Realizadas sin ningún presupuesto enviado (ni borrador) — ya existía en la campana
//      in-app desde 2026-08-20 pero nunca se añadió aquí (2026-08-30).
//
// "Presupuestos a punto de caducar (7 días)" y "Presupuestos en Borrador sin enviar" salieron de
// este email a petición de Gabriel (2026-09-11, no le aportaban valor en el resumen diario) — se
// quedan solo en la campana in-app (useNotificaciones.ts), no se ha tocado nada de esa lógica.
//
// "Respuestas de cliente sin revisar" (presupuestos con ultima_respuesta_cliente_fecha sin
// seguimiento generado/enviado) se quitó del email a petición de Gabriel (2026-09-21, no tenía
// sentido como aviso aparte) — se queda solo en la campana in-app. Título del email renombrado a
// "Tareas pendientes" el mismo día.
//
// Idempotente por día (`alerta_diaria_estado`, fila única con `ultima_fecha_enviada`) — si se
// dispara más de una vez el mismo día (reintento, prueba manual) no se duplica el email
// (bug real corregido 2026-08-18).
//
// Reutiliza el patrón de envío Gmail de supabase/functions/notificar-visita/index.ts.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://ordonezrenov.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Supabase valida que el JWT esté bien firmado (verify_jwt: true) pero no distingue la clave anon
// (pública, va en el bundle del frontend) de una sesión real — comprobar el rol cierra ese hueco
// (revisión de seguridad 2026-08-11). Duplicado en cada función: el despliegue vía MCP no resuelve
// imports relativos entre funciones (a diferencia de `supabase functions deploy` por CLI).
function esLlamadaAutorizada(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const partes = token.split('.');
  if (partes.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'authenticated' || payload.role === 'service_role';
  } catch {
    return false;
  }
}

const REMITENTE_BASE = 'reformasordonezeus@gmail.com';
const REMITENTE_ENVIO = Deno.env.get('SMTP_USER') ?? REMITENTE_BASE;

type FacturaVencida = { numero: string | null; cliente_nombre: string | null; fecha_vence: string | null };
type PresupuestoPendiente = { numero: string | null; cliente_nombre: string | null; fecha_validez: string };
type SolicitudNueva = { nombre: string | null; email: string | null; created_at: string | null; mensaje_enviado_en: string | null };
type GastoPendiente = { descripcion: string | null; fecha: string | null; importe_base: number | null };
type VisitaRealizada = {
  id: string;
  nombre: string | null;
  apellidos: string | null;
  fecha_visita: string | null;
  email: string | null;
  telefono: string | null;
};
type SolicitudDescartada = { email: string | null; telefono: string | null };

// Duplicado de normalizarTelefono (src/modules/clientes/types.ts) — un Edge Function no puede
// importar código del frontend (mismo patrón que esLlamadaAutorizada de arriba).
function normalizarTelefono(tel: string): string {
  return tel.replace(/\D/g, '').slice(-9);
}
type PresupuestoVinculado = { visita_id: string | null; estado: string };
type SolicitudSinTipo = { id: string; telefono: string | null; email: string | null; visita_id: string | null; presupuesto_vinculado_id: string | null };
type VisitaContacto = { telefono: string | null; email: string | null };

// Duplicado de sincronizarTipoSolicitud (src/lib/sincronizarTipoSolicitud.ts) — un Edge Function
// no puede importar código del frontend (mismo patrón que normalizarTelefono de arriba). Rellena
// tipo_solicitud ('visita' | 'presupuesto_orientativo') para las solicitudes "sin determinar" que
// ya tienen una señal real, cada mañana, aunque nadie entre a /solicitudes ese día (petición de
// Gabriel 2026-09-09). Se ejecuta siempre, incluso si ya se envió el email de hoy.
async function sincronizarTipoSolicitud(supabase: SupabaseClient): Promise<void> {
  const { data: solicitudes, error } = await supabase
    .from('solicitudes')
    .select('id, telefono, email, visita_id, presupuesto_vinculado_id')
    .is('tipo_solicitud', null);
  if (error || !solicitudes || solicitudes.length === 0) return;

  const { data: visitas, error: errorVisitas } = await supabase
    .from('visitas')
    .select('telefono, email')
    .is('eliminado_en', null)
    .neq('estado', 'Cancelada');
  if (errorVisitas) return;

  const telefonosVisita = new Set(
    ((visitas ?? []) as VisitaContacto[]).map((v) => (v.telefono ? normalizarTelefono(v.telefono) : null)).filter((t): t is string => !!t),
  );
  const emailsVisita = new Set(
    ((visitas ?? []) as VisitaContacto[]).map((v) => (v.email ? v.email.toLowerCase() : null)).filter((e): e is string => !!e),
  );

  // Agrupadas por tipo resultante para como máximo 2 updates por lote, igual que la copia del
  // frontend (src/lib/sincronizarTipoSolicitud.ts, corregido el mismo día) — y comprobando el
  // error del update, que antes se ignoraba en silencio aquí (bug real, corregido 2026-09-10; la
  // copia del frontend sí hacía console.warn).
  const idsPorTipo: Record<'visita' | 'presupuesto_orientativo', string[]> = { visita: [], presupuesto_orientativo: [] };
  for (const s of solicitudes as SolicitudSinTipo[]) {
    const tel = s.telefono ? normalizarTelefono(s.telefono) : null;
    const email = s.email ? s.email.toLowerCase() : null;
    const tieneVisita = !!s.visita_id || (!!tel && telefonosVisita.has(tel)) || (!!email && emailsVisita.has(email));
    const tieneOrientativo = !!s.presupuesto_vinculado_id;
    const tipo = tieneVisita ? 'visita' : tieneOrientativo ? 'presupuesto_orientativo' : null;
    if (tipo) idsPorTipo[tipo].push(s.id);
  }

  for (const tipo of ['visita', 'presupuesto_orientativo'] as const) {
    if (idsPorTipo[tipo].length === 0) continue;
    const { error: errorUpdate } = await supabase.from('solicitudes').update({ tipo_solicitud: tipo }).in('id', idsPorTipo[tipo]);
    if (errorUpdate) console.error(`sincronizarTipoSolicitud: no se pudo actualizar el lote "${tipo}":`, errorUpdate.message);
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Envío por SMTP directo (cuenta info@ordonezrenov.com en Hostinger, solo envío) en vez de la API
// de Gmail (2026-09-19, petición de Gabriel). Credenciales en secretos de Supabase.
// Codificación RFC 2047 de cabeceras con caracteres no ASCII (asunto, nombre del remitente).
// denomailer lo hace mal por su cuenta: usa Q-encoding con espacios sin codificar y, si la palabra
// codificada pasa de 74 caracteres, mete un salto de línea en medio de la cabecera — el servidor
// da por terminadas las cabeceras ahí, From/To/Content-Type acaban dentro del cuerpo y Gmail manda
// el mensaje a spam (caso real: aviso "Visita agendada — Kepa Etxeburua García · ..." del
// 2026-09-21). Aquí se codifica en Base64 por trozos de ≤ 45 bytes (≤ 72 caracteres codificados,
// bajo el límite de 75 de la RFC) separados por espacio, y se inyecta vía un preprocesador de
// denomailer (ver enviarSmtp) porque pasarlo ya codificado a send() no sirve. Misma copia en las
// 6 funciones que envían por SMTP (una Edge Function no puede importar de otra).
function codificarCabeceraMime(texto: string): string {
  if (!/[^ -~]/.test(texto)) return texto; // nada fuera del ASCII imprimible: se deja tal cual
  const enc = new TextEncoder();
  const trozos: string[] = [];
  let actual = '';
  for (const ch of texto) {
    if (enc.encode(actual + ch).length > 45) {
      trozos.push(actual);
      actual = ch;
    } else {
      actual += ch;
    }
  }
  if (actual) trozos.push(actual);
  return trozos.map((t) => `=?UTF-8?B?${btoa(String.fromCharCode(...enc.encode(t)))}?=`).join(' ');
}

async function enviarSmtp(destinatarios: string[], asunto: string, cuerpoHtml: string): Promise<void> {
  const client = new SMTPClient({
    connection: {
      hostname: Deno.env.get('SMTP_HOST')!,
      port: Number(Deno.env.get('SMTP_PORT') ?? '465'),
      tls: true,
      auth: { username: Deno.env.get('SMTP_USER')!, password: Deno.env.get('SMTP_PASS')! },
    },
    // El asunto y el nombre del remitente se sobrescriben YA codificados en un preprocesador, que
    // denomailer aplica DESPUÉS de resolver la configuración: si se le pasan codificados directamente
    // en send(), la librería los vuelve a codificar (comprueba `startsWith('=?')`) y rompe la cabecera
    // igual que antes (comprobado con un envío real, 2026-09-21).
    client: {
      preprocessors: [
        (mail) => ({
          ...mail,
          subject: codificarCabeceraMime(asunto),
          from: { ...mail.from, name: codificarCabeceraMime('Reformas Ordoñez') },
        }),
      ],
    },
  });
  try {
    await client.send({
      from: `Reformas Ordoñez <${REMITENTE_ENVIO}>`,
      to: destinatarios,
      subject: asunto,
      content: 'auto',
      html: cuerpoHtml,
    });
  } finally {
    await client.close();
  }
}

function pieCorreoAutomatico(): string {
  return `<div style="color:#9ca3af;font-size:10px;margin-top:6px">Correo automático — no responder a esta dirección. Para cualquier consulta, escríbenos a ${REMITENTE_BASE}.</div>`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isoHoy(): string {
  return new Date().toISOString().slice(0, 10);
}

type Fila = { titulo: string; detalle: string };

function seccionHtml(titulo: string, filas: Fila[]): string {
  if (filas.length === 0) return '';
  const items = filas
    .slice(0, 5)
    .map(
      (f) => `<tr>
        <td style="padding:6px 0;border-bottom:1px solid #f1f5f9">
          <div style="color:#111827;font-size:13px">${esc(f.titulo)}</div>
          <div style="color:#6b7280;font-size:12px">${esc(f.detalle)}</div>
        </td>
      </tr>`,
    )
    .join('');
  const extra = filas.length > 5 ? `<div style="color:#9ca3af;font-size:11px;margin-top:4px">+ ${filas.length - 5} más</div>` : '';
  return `
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#9ca3af;font-weight:600;margin:18px 0 6px">${esc(titulo)} (${filas.length})</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
    ${extra}`;
}

function construirHtml(secciones: string[]): string {
  return `<div style="font-family:Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto" cellpadding="0" cellspacing="0">
    <tr><td style="background:#0f3d24;padding:20px 24px;border-radius:10px 10px 0 0">
      <div style="color:#ffffff;font-size:16px;font-weight:600">Reformas Ordoñez</div>
      <div style="color:#cdddd5;font-size:12px;margin-top:2px">Tareas pendientes</div>
    </td></tr>
    <tr><td style="background:#ffffff;padding:24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb">
      ${secciones.join('')}
    </td></tr>
    <tr><td style="background:#f8fafc;border:1px solid #e5e7eb;border-top:1px solid #eef2f7;border-radius:0 0 10px 10px;padding:14px 24px;text-align:center">
      <div style="color:#9ca3af;font-size:11px">Notificación automática del CRM Reformas Ordoñez</div>
      ${pieCorreoAutomatico()}
    </td></tr>
  </table>
</div>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!esLlamadaAutorizada(req)) return jsonResponse({ ok: false, error: 'No autorizado' }, 401);

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    await sincronizarTipoSolicitud(supabase);

    const hoy = isoHoy();

    const { data: estadoPrevio, error: errorEstado } = await supabase
      .from('alerta_diaria_estado')
      .select('ultima_fecha_enviada')
      .eq('id', 1)
      .maybeSingle();
    if (errorEstado) return jsonResponse({ ok: false, error: `alerta_diaria_estado: ${errorEstado.message}` }, 500);
    if (estadoPrevio?.ultima_fecha_enviada === hoy) {
      return jsonResponse({ ok: true, enviado: false, motivo: 'ya se envió hoy' });
    }

    const [facturasRes, presupuestosRes, solicitudesRes, gastosRes, visitasRealizadasRes, presupuestosVinculadosRes, solicitudesDescartadasRes] = await Promise.all([
      supabase.from('facturas').select('numero, cliente_nombre, fecha_vence').eq('estado_cobro', 'Vencida').is('eliminado_en', null),
      supabase
        .from('presupuestos')
        .select('numero, cliente_nombre, fecha_validez')
        .eq('estado', 'Pendiente')
        .not('fecha_validez', 'is', null)
        .is('eliminado_en', null),
      supabase.from('solicitudes').select('nombre, email, created_at, mensaje_enviado_en').eq('estado', 'Nueva'),
      supabase.from('gastos').select('descripcion, fecha, importe_base').eq('estado_gasto', 'pendiente'),
      supabase.from('visitas').select('id, nombre, apellidos, fecha_visita, email, telefono').eq('estado', 'Realizada').is('eliminado_en', null),
      supabase.from('presupuestos').select('visita_id, estado').is('eliminado_en', null).not('visita_id', 'is', null),
      // 'Eliminada' excluida a propósito (bug real, 2026-09-21, caso Mickaël Maystre): es un
      // borrado definitivo, no una decisión de no presupuestar — incluirla ocultaba visitas
      // reales del email diario solo por coincidir de contacto con una solicitud ya eliminada.
      supabase.from('solicitudes').select('email, telefono').in('estado', ['No concretada', 'Rechazada']),
    ]);

    for (const [nombre, res] of Object.entries({
      facturas: facturasRes,
      presupuestos: presupuestosRes,
      solicitudes: solicitudesRes,
      gastos: gastosRes,
      visitasRealizadas: visitasRealizadasRes,
      presupuestosVinculados: presupuestosVinculadosRes,
      solicitudesDescartadas: solicitudesDescartadasRes,
    })) {
      if ((res as { error: { message: string } | null }).error) {
        return jsonResponse({ ok: false, error: `${nombre}: ${(res as { error: { message: string } }).error.message}` }, 500);
      }
    }

    const facturasVencidas = (facturasRes.data ?? []) as FacturaVencida[];
    const presupuestosPendientes = (presupuestosRes.data ?? []) as PresupuestoPendiente[];
    const presupuestosCaducados = presupuestosPendientes.filter((p) => p.fecha_validez < hoy);
    // estado='Nueva' cubre dos casos: solicitud nunca contestada (`mensaje_enviado_en` null, de
    // verdad nueva) y solicitud ya contestada que `revisar-gmail` volvió a poner en "Nueva"
    // porque el cliente respondió en el mismo hilo (`mensaje_enviado_en` no-null) — esa segunda
    // es una respuesta pendiente, no un lead nuevo (mismo criterio que useNotificaciones.ts,
    // bug real corregido 2026-08-19: antes ambas salían como "solicitud nueva sin revisar").
    const todasLasSolicitudesNueva = (solicitudesRes.data ?? []) as SolicitudNueva[];
    const solicitudesNuevas = todasLasSolicitudesNueva.filter((s) => !s.mensaje_enviado_en);
    const solicitudesConRespuesta = todasLasSolicitudesNueva.filter((s) => s.mensaje_enviado_en);
    const gastosPendientes = (gastosRes.data ?? []) as GastoPendiente[];

    // Mismo criterio que "Presupuesto pendiente de enviar" en src/modules/notificaciones/useNotificaciones.ts:
    // visita Realizada sin ningún presupuesto no-Borrador vinculado (un borrador ya creado para esa
    // visita no cuenta como "enviado" — sigue pendiente de mandarse).
    const visitaIdsConPresupuestoEnviado = new Set(
      ((presupuestosVinculadosRes.data ?? []) as PresupuestoVinculado[])
        .filter((p) => p.estado !== 'Borrador' && p.visita_id)
        .map((p) => p.visita_id as string),
    );
    // Una visita cuya solicitud de origen se marcó Descartada no debe seguir avisando
    // indefinidamente (mismo criterio de cruce por contacto que funnelTracking.ts —
    // hallazgo real 2026-09-07, caso Raphael Szuba).
    const solicitudesDescartadas = (solicitudesDescartadasRes.data ?? []) as SolicitudDescartada[];
    const emailsDescartados = new Set(
      solicitudesDescartadas.map((s) => s.email?.trim().toLowerCase()).filter((e): e is string => !!e),
    );
    const telefonosDescartados = new Set(
      solicitudesDescartadas.map((s) => (s.telefono ? normalizarTelefono(s.telefono) : '')).filter((t) => t.length > 0),
    );
    const visitasSinPresupuesto = ((visitasRealizadasRes.data ?? []) as VisitaRealizada[]).filter((v) => {
      if (visitaIdsConPresupuestoEnviado.has(v.id)) return false;
      if (v.email && emailsDescartados.has(v.email.trim().toLowerCase())) return false;
      if (v.telefono && telefonosDescartados.has(normalizarTelefono(v.telefono))) return false;
      return true;
    });

    const totalUrgentes =
      facturasVencidas.length +
      presupuestosCaducados.length +
      solicitudesNuevas.length +
      solicitudesConRespuesta.length +
      gastosPendientes.length +
      visitasSinPresupuesto.length;

    if (totalUrgentes === 0) {
      return jsonResponse({ ok: true, enviado: false, motivo: 'nada urgente pendiente hoy' });
    }

    const secciones = [
      seccionHtml(
        'Facturas vencidas',
        facturasVencidas.map((f) => ({
          titulo: f.numero ?? 'Sin número',
          detalle: `${f.cliente_nombre ?? '—'} · vencía ${f.fecha_vence ?? '—'}`,
        })),
      ),
      seccionHtml(
        'Presupuestos caducados sin respuesta',
        presupuestosCaducados.map((p) => ({
          titulo: p.numero ?? 'Sin número',
          detalle: `${p.cliente_nombre ?? '—'} · válido hasta ${p.fecha_validez}`,
        })),
      ),
      seccionHtml(
        'Solicitudes nuevas sin revisar',
        solicitudesNuevas.map((s) => ({
          titulo: s.nombre || s.email || 'Sin nombre',
          detalle: s.created_at ? new Date(s.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' }) : '—',
        })),
      ),
      seccionHtml(
        'Respuestas de cliente a solicitudes sin revisar',
        solicitudesConRespuesta.map((s) => ({
          titulo: s.nombre || s.email || 'Sin nombre',
          detalle: s.created_at ? new Date(s.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' }) : '—',
        })),
      ),
      seccionHtml(
        'Gastos de kilometraje pendientes de revisar',
        gastosPendientes.map((g) => ({
          titulo: g.descripcion ?? 'Gasto de kilometraje',
          detalle: `${g.fecha ?? '—'} · ${(g.importe_base ?? 0).toFixed(2)} €`,
        })),
      ),
      seccionHtml(
        'Visitas realizadas sin presupuesto enviado',
        visitasSinPresupuesto.map((v) => ({
          titulo: `${v.nombre ?? ''} ${v.apellidos ?? ''}`.trim() || 'Sin nombre',
          detalle: v.fecha_visita ? `Visita del ${v.fecha_visita}` : 'Fecha de visita sin registrar',
        })),
      ),
    ];

    const cuerpo = construirHtml(secciones);
    const asunto = `${totalUrgentes} pendiente${totalUrgentes > 1 ? 's' : ''} urgente${totalUrgentes > 1 ? 's' : ''} en el CRM`;

    await enviarSmtp([REMITENTE_BASE], asunto, cuerpo);

    // Se marca DESPUÉS de un envío realmente correcto — si Gmail falla, la próxima invocación
    // (reintento o el cron del día siguiente si nadie reintenta antes) debe poder volver a intentarlo.
    const { error: errorMarcar } = await supabase
      .from('alerta_diaria_estado')
      .update({ ultima_fecha_enviada: hoy })
      .eq('id', 1);
    if (errorMarcar) console.error('No se pudo marcar alerta_diaria_estado tras el envío:', errorMarcar.message);

    return jsonResponse({
      ok: true,
      enviado: true,
      resumen: {
        facturasVencidas: facturasVencidas.length,
        presupuestosCaducados: presupuestosCaducados.length,
        solicitudesNuevas: solicitudesNuevas.length,
        solicitudesConRespuesta: solicitudesConRespuesta.length,
        gastosPendientes: gastosPendientes.length,
        visitasSinPresupuesto: visitasSinPresupuesto.length,
      },
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
