// Edge Function pública: resena-redirect
//
// Enlace de un solo clic que va dentro del mensaje de petición de reseña (WhatsApp/email). Antes
// de reenviar al cliente a la ficha real de Google, registra el clic en facturas.resena_clic_en —
// Google no permite saber qué cliente concreto dejó una reseña (ni deja incentivarla, ver política
// de "review gating"), así que el clic en este enlace es la única señal real de conversión que se
// puede medir sin violar sus políticas.
//
// GET /resena-redirect?t=<resena_token>
// Sin verify_jwt (público, lo abre el cliente desde su email/WhatsApp, sin sesión del CRM) — fail
// open siempre: si el token no existe o algo falla, igualmente se redirige a la ficha de Google en
// vez de dejar al cliente con un error, para no perder nunca la reseña por un fallo interno nuestro.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get('t');

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let enlaceGoogle: string | null = null;
  try {
    const { data: empresaRow } = await supabase.from('empresa_config').select('datos').eq('id', 1).maybeSingle();
    const datos = (empresaRow?.datos ?? {}) as { resenas?: { enlace?: string } };
    enlaceGoogle = datos.resenas?.enlace || null;

    if (token) {
      const { data: factura } = await supabase
        .from('facturas')
        .select('id, resena_clic_en')
        .eq('resena_token', token)
        .maybeSingle();
      if (factura && !factura.resena_clic_en) {
        await supabase.from('facturas').update({ resena_clic_en: new Date().toISOString() }).eq('id', factura.id);
      }
    }
  } catch (err) {
    console.error('resena-redirect: fallo registrando el clic, se redirige igualmente', String(err instanceof Error ? err.message : err));
  }

  if (!enlaceGoogle) {
    return new Response('No se ha configurado el enlace de reseñas de Google.', { status: 404, headers: corsHeaders });
  }

  return new Response(null, { status: 302, headers: { ...corsHeaders, Location: enlaceGoogle } });
});
