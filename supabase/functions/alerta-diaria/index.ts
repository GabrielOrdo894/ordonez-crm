// Edge Function: alerta-diaria
//
// Cron diario (ver migración `alerta-diaria-urgentes` en pg_cron) que revisa 4 categorías
// urgentes del CRM y, SOLO si hay algo pendiente de verdad, manda un resumen por email a
// reformasordonezeus@gmail.com — porque las notificaciones normales solo viven dentro de la
// app (campanita) y si nadie abre el CRM unos días pasan desapercibidas.
//
// Categorías (mismo cálculo que src/modules/notificaciones/useNotificaciones.ts, para que el
// email diga lo mismo que la campana in-app):
//   1. Facturas vencidas (estado_cobro = 'Vencida')
//   2. Presupuestos caducados sin respuesta (Pendiente, fecha_validez < hoy)
//   3. Presupuestos a punto de caducar (Pendiente, fecha_validez en los próximos 7 días)
//   4. Solicitudes nuevas sin revisar (estado = 'Nueva' y nunca se contestaron, mensaje_enviado_en null)
//   5. Gastos de kilometraje pendientes de revisar (estado_gasto = 'pendiente')
//   6. Respuestas de cliente a presupuestos sin revisar (seguimiento en estado 'Nueva', ver
//      estadoSeguimiento en src/modules/solicitudes/types.ts) — categorías 5 y 6 añadidas
//      2026-08-18, antes se quedaban fuera de este email pese a estar ya en la campana in-app.
//   7. Respuestas de cliente a solicitudes sin revisar (estado = 'Nueva' pero mensaje_enviado_en
//      no-null — ya se había contestado y el cliente respondió otra vez en el mismo hilo; antes
//      salía mezclado con la categoría 4 como "solicitud nueva", corregido 2026-08-19).
//
// Idempotente por día (`alerta_diaria_estado`, fila única con `ultima_fecha_enviada`) — si se
// dispara más de una vez el mismo día (reintento, prueba manual) no se duplica el email
// (bug real corregido 2026-08-18).
//
// Reutiliza el patrón de envío Gmail de supabase/functions/notificar-visita/index.ts.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

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

type FacturaVencida = { numero: string | null; cliente_nombre: string | null; fecha_vence: string | null };
type PresupuestoPendiente = { numero: string | null; cliente_nombre: string | null; fecha_validez: string };
type SolicitudNueva = { nombre: string | null; email: string | null; created_at: string | null; mensaje_enviado_en: string | null };
type GastoPendiente = { descripcion: string | null; fecha: string | null; importe_base: number | null };
type SeguimientoNuevo = {
  numero: string | null;
  cliente_nombre: string | null;
  ultima_respuesta_cliente_fecha: string | null;
  mensaje_seguimiento_generado: string | null;
  mensaje_seguimiento_enviado: boolean | null;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function obtenerAccessToken(supabase: SupabaseClient): Promise<string> {
  const { data: config, error } = await supabase
    .from('google_config')
    .select('refresh_token, refresh_token_gmail')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer google_config: ${error.message}`);
  const refreshToken = config?.refresh_token_gmail || config?.refresh_token;
  if (!refreshToken) throw new Error('Google no está conectado (falta refresh_token en google_config)');

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en los secretos');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `No se pudo renovar el token de Google (¿falta el scope gmail.send? conectar Gmail en Configuración): ${data.error_description ?? data.error}`,
    );
  }
  return data.access_token;
}

function base64UrlEncodeUtf8(texto: string): string {
  const utf8 = new TextEncoder().encode(texto);
  let binario = '';
  for (const byte of utf8) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function codificarAsunto(asunto: string): string {
  const utf8 = new TextEncoder().encode(asunto);
  let binario = '';
  for (const byte of utf8) binario += String.fromCharCode(byte);
  return `=?UTF-8?B?${btoa(binario)}?=`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isoHoy(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoEnDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
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
      <div style="color:#cdddd5;font-size:12px;margin-top:2px">Resumen diario de pendientes urgentes</div>
    </td></tr>
    <tr><td style="background:#ffffff;padding:24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb">
      ${secciones.join('')}
    </td></tr>
    <tr><td style="background:#f8fafc;border:1px solid #e5e7eb;border-top:1px solid #eef2f7;border-radius:0 0 10px 10px;padding:14px 24px;text-align:center">
      <div style="color:#9ca3af;font-size:11px">Notificación automática del CRM Reformas Ordoñez</div>
    </td></tr>
  </table>
</div>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!esLlamadaAutorizada(req)) return jsonResponse({ ok: false, error: 'No autorizado' }, 401);

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const hoy = isoHoy();
    const limite7d = isoEnDias(7);

    const { data: estadoPrevio, error: errorEstado } = await supabase
      .from('alerta_diaria_estado')
      .select('ultima_fecha_enviada')
      .eq('id', 1)
      .maybeSingle();
    if (errorEstado) return jsonResponse({ ok: false, error: `alerta_diaria_estado: ${errorEstado.message}` }, 500);
    if (estadoPrevio?.ultima_fecha_enviada === hoy) {
      return jsonResponse({ ok: true, enviado: false, motivo: 'ya se envió hoy' });
    }

    const [facturasRes, presupuestosRes, solicitudesRes, gastosRes, seguimientosRes] = await Promise.all([
      supabase.from('facturas').select('numero, cliente_nombre, fecha_vence').eq('estado_cobro', 'Vencida').is('eliminado_en', null),
      supabase
        .from('presupuestos')
        .select('numero, cliente_nombre, fecha_validez')
        .eq('estado', 'Pendiente')
        .not('fecha_validez', 'is', null)
        .is('eliminado_en', null),
      supabase.from('solicitudes').select('nombre, email, created_at, mensaje_enviado_en').eq('estado', 'Nueva'),
      supabase.from('gastos').select('descripcion, fecha, importe_base').eq('estado_gasto', 'pendiente'),
      supabase
        .from('presupuestos')
        .select('numero, cliente_nombre, ultima_respuesta_cliente_fecha, mensaje_seguimiento_generado, mensaje_seguimiento_enviado')
        .is('eliminado_en', null)
        .not('ultima_respuesta_cliente_fecha', 'is', null),
    ]);

    for (const [nombre, res] of Object.entries({
      facturas: facturasRes,
      presupuestos: presupuestosRes,
      solicitudes: solicitudesRes,
      gastos: gastosRes,
      seguimientos: seguimientosRes,
    })) {
      if ((res as { error: { message: string } | null }).error) {
        return jsonResponse({ ok: false, error: `${nombre}: ${(res as { error: { message: string } }).error.message}` }, 500);
      }
    }

    const facturasVencidas = (facturasRes.data ?? []) as FacturaVencida[];
    const presupuestosPendientes = (presupuestosRes.data ?? []) as PresupuestoPendiente[];
    const presupuestosCaducados = presupuestosPendientes.filter((p) => p.fecha_validez < hoy);
    const presupuestosPorCaducar = presupuestosPendientes.filter((p) => p.fecha_validez >= hoy && p.fecha_validez <= limite7d);
    // estado='Nueva' cubre dos casos: solicitud nunca contestada (`mensaje_enviado_en` null, de
    // verdad nueva) y solicitud ya contestada que `revisar-gmail` volvió a poner en "Nueva"
    // porque el cliente respondió en el mismo hilo (`mensaje_enviado_en` no-null) — esa segunda
    // es una respuesta pendiente, no un lead nuevo (mismo criterio que useNotificaciones.ts,
    // bug real corregido 2026-08-19: antes ambas salían como "solicitud nueva sin revisar").
    const todasLasSolicitudesNueva = (solicitudesRes.data ?? []) as SolicitudNueva[];
    const solicitudesNuevas = todasLasSolicitudesNueva.filter((s) => !s.mensaje_enviado_en);
    const solicitudesConRespuesta = todasLasSolicitudesNueva.filter((s) => s.mensaje_enviado_en);
    const gastosPendientes = (gastosRes.data ?? []) as GastoPendiente[];
    // Mismo criterio que estadoSeguimiento() en src/modules/solicitudes/types.ts: hay respuesta
    // del cliente y todavía no se generó ni envió ningún mensaje de seguimiento.
    const seguimientosNuevos = ((seguimientosRes.data ?? []) as SeguimientoNuevo[]).filter(
      (p) => !p.mensaje_seguimiento_enviado && !p.mensaje_seguimiento_generado,
    );

    const totalUrgentes =
      facturasVencidas.length +
      presupuestosCaducados.length +
      presupuestosPorCaducar.length +
      solicitudesNuevas.length +
      solicitudesConRespuesta.length +
      gastosPendientes.length +
      seguimientosNuevos.length;

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
        'Presupuestos a punto de caducar (7 días)',
        presupuestosPorCaducar.map((p) => ({
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
        'Respuestas de cliente sin revisar',
        seguimientosNuevos.map((p) => ({
          titulo: p.numero ?? 'Sin número',
          detalle: `${p.cliente_nombre ?? '—'} · respondió el ${p.ultima_respuesta_cliente_fecha ?? '—'}`,
        })),
      ),
    ];

    const cuerpo = construirHtml(secciones);
    const asunto = `${totalUrgentes} pendiente${totalUrgentes > 1 ? 's' : ''} urgente${totalUrgentes > 1 ? 's' : ''} en el CRM`;

    const token = await obtenerAccessToken(supabase);
    const mensajeMime = [
      `From: ${REMITENTE_BASE}`,
      `To: ${REMITENTE_BASE}`,
      `Subject: ${codificarAsunto(asunto)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset="UTF-8"',
      '',
      cuerpo,
    ].join('\r\n');

    const res = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: base64UrlEncodeUtf8(mensajeMime) }),
    });

    if (!res.ok) {
      const detalle = await res.text().catch(() => '');
      throw new Error(`Gmail no aceptó el envío (${res.status}): ${detalle}`);
    }

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
        presupuestosPorCaducar: presupuestosPorCaducar.length,
        solicitudesNuevas: solicitudesNuevas.length,
        solicitudesConRespuesta: solicitudesConRespuesta.length,
        gastosPendientes: gastosPendientes.length,
        seguimientosNuevos: seguimientosNuevos.length,
      },
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
