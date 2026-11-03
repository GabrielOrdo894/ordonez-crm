// Edge Function: recordatorio-pago-automatico
//
// Recordatorios de facturas vencidas (2026-11-03, decisión de Gabriel: programados y cancelables, tres
// pasos a +3, +10 y +20 días del vencimiento). Cron diario `recordatorio-pago-diario` (07:15 UTC). Dos
// pasos, siempre en este orden — igual que resena-automatica:
//   1. ENVÍA los recordatorios programados la víspera (≥ 20 h): antes de enviar comprueba que la
//      factura sigue viva, con importe pendiente, email y recordatorios activos; si no, lo cancela.
//   2. PROGRAMA el paso que toque a cada factura vencida con importe pendiente. El envío real queda
//      para la ejecución del día siguiente: esas 24 h son el margen para cancelarlo (la campana avisa).
// Sale por el SMTP de Hostinger, en el idioma de la factura, con los datos bancarios del país emisor.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer/mod.ts';
import { esLlamadaAutorizada } from '../_shared/autorizacion.ts';
import { codificarCabeceraMime, limpiarHtmlCorreo } from '../_shared/correo.ts';
import { construirRecordatorio, pasoAProgramar, totalLineas } from '../_shared/recordatorioPago.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://ordonezrenov.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const REMITENTE_BASE = 'reformasordonezeus@gmail.com';
const REMITENTE_ENVIO = Deno.env.get('SMTP_USER') ?? REMITENTE_BASE;
const HORAS_MARGEN = 20;
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ESTADOS_PENDIENTES = ['Pendiente', 'Vencida', 'Cobrada parcialmente'];

async function enviarSmtp(destinatario: string, asunto: string, cuerpoHtml: string): Promise<void> {
  const client = new SMTPClient({
    connection: {
      hostname: Deno.env.get('SMTP_HOST')!,
      port: Number(Deno.env.get('SMTP_PORT') ?? '465'),
      tls: true,
      auth: { username: Deno.env.get('SMTP_USER')!, password: Deno.env.get('SMTP_PASS')! },
    },
    // Asunto y remitente codificados en un preprocesador (ver notificar-visita: pasarlos ya
    // codificados a send() los vuelve a codificar y rompe la cabecera).
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
      to: [destinatario],
      subject: asunto,
      content: 'auto',
      html: limpiarHtmlCorreo(cuerpoHtml),
    });
  } finally {
    await client.close();
  }
}

type Factura = {
  id: string;
  numero: string | null;
  tipo: string;
  pais: string | null;
  idioma: string | null;
  cliente_nombre: string | null;
  cliente_email: string | null;
  fecha_vence: string | null;
  estado_cobro: string;
  eliminado_en: string | null;
  recordatorios_desactivados: boolean;
  lineas: { total_con_iva?: number; es_incluido?: boolean }[] | null;
};

const SELECT_FACTURA =
  'id, numero, tipo, pais, idioma, cliente_nombre, cliente_email, fecha_vence, estado_cobro, eliminado_en, recordatorios_desactivados, lineas';

type Entidad = {
  iban?: string;
  bic?: string;
  nombre_titular?: string;
  razon_social?: string;
  telefono?: string;
  email?: string;
};

async function pendienteDe(supabase: SupabaseClient, f: Factura): Promise<number> {
  const { data, error } = await supabase
    .from('pagos_factura')
    .select('monto')
    .eq('factura_id', f.id)
    .is('anulado_en', null);
  if (error) throw error;
  const pagado = (data ?? []).reduce((s, p) => s + Number(p.monto), 0);
  return Math.round((totalLineas(f.lineas) - pagado) * 100) / 100;
}

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round(
    (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000,
  );
}

async function enviarProgramados(supabase: SupabaseClient) {
  const limite = new Date(Date.now() - HORAS_MARGEN * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('recordatorios_pago')
    .select(`id, paso, factura_id, facturas(${SELECT_FACTURA})`)
    .eq('estado', 'programado')
    .lte('programado_en', limite);
  if (error) throw error;

  const { data: empresa, error: errorEmpresa } = await supabase
    .from('empresa_config')
    .select('datos')
    .eq('id', 1)
    .maybeSingle();
  if (errorEmpresa) throw errorEmpresa;
  const datos = (empresa?.datos ?? {}) as { es?: Entidad; fr?: Entidad };

  let enviados = 0;
  let cancelados = 0;
  const errores: string[] = [];
  for (const r of (data ?? []) as unknown as {
    id: string;
    paso: number;
    factura_id: string;
    facturas: Factura | null;
  }[]) {
    const f = r.facturas;
    const cancelar = async (motivo: string) => {
      const { error: e } = await supabase
        .from('recordatorios_pago')
        .update({ estado: 'cancelado', motivo_cancelacion: motivo })
        .eq('id', r.id);
      if (e) throw e;
      cancelados++;
    };
    if (!f || f.eliminado_en) {
      await cancelar('factura eliminada');
      continue;
    }
    if (f.recordatorios_desactivados) {
      await cancelar('recordatorios desactivados en la factura');
      continue;
    }
    const email = (f.cliente_email ?? '').trim();
    if (!EMAIL_VALIDO.test(email)) {
      await cancelar('sin email válido');
      continue;
    }
    const pendiente = await pendienteDe(supabase, f);
    if (pendiente <= 0.005 || !ESTADOS_PENDIENTES.includes(f.estado_cobro)) {
      await cancelar('factura ya cobrada');
      continue;
    }
    const fr = f.idioma === 'Français';
    const entidad = (f.pais === 'Francia' ? datos.fr : datos.es) ?? {};
    const { asunto, html } = construirRecordatorio({
      paso: r.paso,
      fr,
      nombreCliente: f.cliente_nombre ?? '',
      numero: f.numero ?? '',
      pendiente,
      fechaVence: f.fecha_vence ?? hoyIso(),
      iban: entidad.iban ?? null,
      bic: entidad.bic ?? null,
      titular: entidad.nombre_titular || entidad.razon_social || null,
      telefono: entidad.telefono ?? null,
      emailContacto: entidad.email || REMITENTE_BASE,
    });
    try {
      await enviarSmtp(email, asunto, html);
    } catch (e) {
      errores.push(`${f.numero}: ${String(e instanceof Error ? e.message : e)}`);
      continue; // sigue programado: se reintenta mañana
    }
    const { error: e1 } = await supabase
      .from('recordatorios_pago')
      .update({
        estado: 'enviado',
        enviado_en: new Date().toISOString(),
        email,
        importe_pendiente: pendiente,
      })
      .eq('id', r.id);
    if (e1) throw e1;
    const { error: e2 } = await supabase
      .from('documento_eventos')
      .insert({
        documento_tipo: 'factura',
        documento_id: f.id,
        evento: `Recordatorio de pago ${r.paso}/3 enviado a ${email} (pendiente ${pendiente.toFixed(2)} €)`,
      });
    if (e2) console.error('recordatorio-pago: no se pudo anotar el evento', e2.message);
    enviados++;
  }
  return { enviados, cancelados, errores };
}

async function programarNuevos(supabase: SupabaseClient) {
  const hoy = hoyIso();
  const { data, error } = await supabase
    .from('facturas')
    .select(SELECT_FACTURA)
    .is('eliminado_en', null)
    .eq('estructura_anterior', false)
    .in('tipo', ['normal', 'acompte'])
    .in('estado_cobro', ESTADOS_PENDIENTES)
    .eq('recordatorios_desactivados', false)
    .not('cliente_email', 'is', null)
    .not('fecha_vence', 'is', null)
    .lt('fecha_vence', hoy);
  if (error) throw error;
  const facturas = (data ?? []) as Factura[];
  if (facturas.length === 0) return { programados: 0 };

  const { data: previos, error: errorPrevios } = await supabase
    .from('recordatorios_pago')
    .select('factura_id, paso, estado')
    .in(
      'factura_id',
      facturas.map((f) => f.id),
    );
  if (errorPrevios) throw errorPrevios;

  let programados = 0;
  for (const f of facturas) {
    if (!EMAIL_VALIDO.test((f.cliente_email ?? '').trim())) continue;
    const existentes = (previos ?? []).filter((p) => p.factura_id === f.id);
    const paso = pasoAProgramar(diasEntre(f.fecha_vence!, hoy), existentes);
    if (paso === 0) continue;
    const pendiente = await pendienteDe(supabase, f);
    if (pendiente <= 0.005) continue;
    const { error: e } = await supabase
      .from('recordatorios_pago')
      .insert({
        factura_id: f.id,
        paso,
        estado: 'programado',
        importe_pendiente: pendiente,
        email: f.cliente_email,
      });
    if (e && e.code !== '23505') throw e;
    if (!e) programados++;
  }
  return { programados };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!(await esLlamadaAutorizada(req))) return jsonResponse({ error: 'No autorizado' }, 401);
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const envio = await enviarProgramados(supabase);
    const programacion = await programarNuevos(supabase);
    return jsonResponse({ ok: true, ...envio, ...programacion });
  } catch (err) {
    return jsonResponse(
      { ok: false, error: String(err instanceof Error ? err.message : err) },
      500,
    );
  }
});
