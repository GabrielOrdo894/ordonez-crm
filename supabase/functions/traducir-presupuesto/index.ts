// Edge Function: traducir-presupuesto
//
// Genera una traducción interna de un presupuesto (Español <-> Français), guardada en la
// columna `traduccion`. Solo traduce el texto libre que el propio Gabriel redactó a mano
// (designación/descripción de cada línea, nota del documento, conceptos del plan de pago) —
// nunca precios, cantidades, referencias ni los Términos y Condiciones: esos se generan con el
// idioma real ya existente en Configuración al construir el PDF traducido
// (`generarPdfPresupuestoTraducido` en src/lib/generarPdfPresupuesto.ts), nunca traducidos con IA.
// Uso exclusivamente interno (revisión propia / especialista / archivo), nunca se envía al
// cliente tal cual — el PDF resultante lleva un aviso de "traducción interna" en cada página.
//
// Body esperado: { "id": "<uuid del presupuesto>" }
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://ordonezrenov.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Duplicado a propósito en cada función (ver generar-mensaje-ia/index.ts): el despliegue vía MCP
// no resuelve imports relativos entre funciones.
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

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Duplicado de src/modules/finanzas/lineas.ts (mismo motivo que esLlamadaAutorizada: el despliegue
// vía MCP no resuelve imports relativos a src/). Traducción por diccionario, no por IA — es una
// lista fija de 5 valores, no hace falta gastar la llamada a Anthropic en esto (bug real corregido
// 2026-08-14: tipo_servicio nunca se traducía, se quedaba en el idioma original).
const TIPOS_SERVICIO_FR = ['Travaux', 'Prestations de services BIC', 'Fournitures', "Main d'œuvre", '—'];
const TIPOS_SERVICIO_ES = ['Obra', 'Prestación de servicios', 'Suministro de materiales', 'Mano de obra', '—'];
function traducirTipoServicio(tipoServicio: string, idiomaDestino: 'es' | 'fr'): string {
  const origen = idiomaDestino === 'fr' ? TIPOS_SERVICIO_ES : TIPOS_SERVICIO_FR;
  const destino = idiomaDestino === 'fr' ? TIPOS_SERVICIO_FR : TIPOS_SERVICIO_ES;
  const idx = origen.indexOf(tipoServicio);
  return idx !== -1 ? destino[idx] : tipoServicio;
}

type AnthropicContentBlock = { type: string; name?: string; input?: Record<string, unknown> };
type AnthropicResponse = {
  error?: { message?: string };
  content?: AnthropicContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

const MODELO = 'claude-sonnet-5'; // traducción de terminología técnica/legal — se prioriza precisión sobre coste, es una llamada puntual (bajo volumen)

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!esLlamadaAutorizada(req)) return jsonResponse({ error: 'No autorizado' }, 401);

  try {
    const { id } = await req.json();
    if (!id) return jsonResponse({ error: 'Falta "id" en el body' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: p, error } = await supabase.from('presupuestos').select('*').eq('id', id).maybeSingle();
    if (error || !p) return jsonResponse({ error: 'Presupuesto no encontrado' }, 404);

    const idiomaOrigen = p.idioma === 'Français' ? 'fr' : 'es';
    const idiomaDestino = idiomaOrigen === 'fr' ? 'es' : 'fr';
    const idiomaDestinoCompleto = idiomaDestino === 'fr' ? 'Français' : 'Español';

    const lineas = (p.lineas ?? []) as { designacion: string; descripcion: string | null }[];
    const planPago = (p.plan_pago ?? []) as { concepto: string }[];

    const payload = {
      lineas: lineas.map((l) => ({ designacion: l.designacion, descripcion: l.descripcion })),
      nota: p.nota ?? null,
      plan_pago_conceptos: planPago.map((pl) => pl.concepto),
    };

    const systemPrompt = `Eres un traductor técnico especializado en reformas y construcción, trabajando para Reformas Ordoñez (empresa de reformas en la frontera franco-española). Traduces del ${idiomaOrigen === 'fr' ? 'francés' : 'español'} al ${idiomaDestino === 'fr' ? 'francés' : 'español'}.

Esto es SOLO una traducción interna (para que el propio equipo o un especialista puedan leer el documento en el otro idioma) — nunca se envía al cliente tal cual, así que no hace falta pulir el tono comercial, pero sí debe ser una traducción natural, como la escribiría un nativo del idioma de destino con vocabulario real de construcción/reformas — nunca calcada palabra por palabra del original.

Reglas estrictas:
- Traduce ÚNICAMENTE el texto. Nunca inventes, quites ni cambies información técnica (medidas, materiales, referencias de producto, nombres propios, direcciones).
- Los números de línea, cantidades, precios y referencias NO se tocan — ni siquiera los menciones, ya se conservan aparte.
- Si un campo es null o cadena vacía, devuélvelo igual (null/"").
- El array "lineas" de tu respuesta debe tener EXACTAMENTE el mismo número de elementos, en el mismo orden, que el array de entrada. Igual con "plan_pago_conceptos".

Responde SIEMPRE llamando a la herramienta entregar_traduccion.`;

    const userPrompt = `Contenido a traducir:\n${JSON.stringify(payload, null, 2)}`;

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return jsonResponse({ error: 'Falta el secreto ANTHROPIC_API_KEY en la Edge Function' }, 500);

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        tools: [
          {
            name: 'entregar_traduccion',
            description: 'Entrega el contenido traducido',
            strict: true,
            input_schema: {
              type: 'object',
              properties: {
                lineas: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      designacion: { type: 'string' },
                      descripcion: { type: ['string', 'null'] },
                    },
                    required: ['designacion', 'descripcion'],
                    additionalProperties: false,
                  },
                },
                nota: { type: ['string', 'null'] },
                plan_pago_conceptos: { type: 'array', items: { type: 'string' } },
              },
              required: ['lineas', 'nota', 'plan_pago_conceptos'],
              additionalProperties: false,
            },
          },
        ],
        tool_choice: { type: 'tool', name: 'entregar_traduccion' },
      }),
    });

    const anthropicData = (await anthropicRes.json()) as AnthropicResponse;
    if (!anthropicRes.ok) {
      return jsonResponse({ error: `Error de la API de Anthropic: ${anthropicData.error?.message ?? anthropicRes.status}` }, 502);
    }

    const toolUse = (anthropicData.content ?? []).find((b) => b.type === 'tool_use' && b.name === 'entregar_traduccion');
    if (!toolUse) return jsonResponse({ error: 'La IA no devolvió una traducción estructurada' }, 502);

    const resultado = toolUse.input as {
      lineas: { designacion: string; descripcion: string | null }[];
      nota: string | null;
      plan_pago_conceptos: string[];
    };

    if (resultado.lineas.length !== lineas.length) {
      return jsonResponse({ error: 'La traducción no devolvió el mismo número de líneas que el presupuesto' }, 502);
    }

    // Fusiona el texto traducido sobre las líneas/plan de pago originales — precios, cantidades,
    // referencias y demás campos numéricos/técnicos se conservan exactamente igual.
    const lineasTraducidas = lineas.map((l, i) => {
      const original = p.lineas[i] as Record<string, unknown>;
      return {
        ...original,
        designacion: resultado.lineas[i].designacion,
        descripcion: resultado.lineas[i].descripcion,
        tipo_servicio:
          typeof original.tipo_servicio === 'string' ? traducirTipoServicio(original.tipo_servicio, idiomaDestino) : original.tipo_servicio,
      };
    });
    const planPagoTraducido = planPago.map((pl, i) => ({
      ...(p.plan_pago[i] as Record<string, unknown>),
      concepto: resultado.plan_pago_conceptos[i] ?? pl.concepto,
    }));

    const traduccion = {
      idioma: idiomaDestinoCompleto,
      lineas: lineasTraducidas,
      nota: resultado.nota,
      plan_pago: planPagoTraducido,
      generado_en: new Date().toISOString(),
    };

    const { error: errorUpdate } = await supabase.from('presupuestos').update({ traduccion }).eq('id', id);
    if (errorUpdate) return jsonResponse({ error: errorUpdate.message }, 500);

    const inputTokens: number = anthropicData.usage?.input_tokens ?? 0;
    const outputTokens: number = anthropicData.usage?.output_tokens ?? 0;
    // Precio de lanzamiento de Sonnet 5 vigente hasta el 31/08/2026 (ver generar-mensaje-ia/index.ts).
    const introVigente = new Date() < new Date('2026-09-01T00:00:00Z');
    const precio = introVigente ? { input: 2, output: 10 } : { input: 3, output: 15 };
    const costoUsd = (inputTokens / 1_000_000) * precio.input + (outputTokens / 1_000_000) * precio.output;

    await supabase.from('llamadas_ia').insert({
      tipo: 'traduccion_presupuesto',
      referencia_id: id,
      modelo: MODELO,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      costo_usd: costoUsd,
    });

    return jsonResponse({ ok: true, traduccion, costoUsd });
  } catch (err) {
    return jsonResponse({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
