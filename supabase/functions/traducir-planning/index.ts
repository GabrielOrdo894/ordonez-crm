// Edge Function: traducir-planning
//
// Genera una traducción interna de un planning de obra (Español <-> Français), guardada en la
// columna `traduccion` de `proyectos`. Solo traduce el texto libre que Gabriel redactó a mano
// (nombre de la obra, y nombre/descripción/sección de cada fase) — nunca fechas, duraciones ni
// el estado de completada, que se conservan idénticos del original. El idioma de origen se
// determina por el presupuesto vinculado (mismo criterio que usa el CRM para generar el PDF del
// planning en su idioma correcto), no por la columna `proyectos.idioma` (sin usar, datos legacy).
// Uso exclusivamente interno — el PDF resultante lleva un aviso de "traducción interna" en cada
// página (`generarPdfPlanningTraducido` en src/lib/generarPdfPlanningTraducido.ts).
//
// Body esperado: { "id": "<uuid del proyecto>" }
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

type AnthropicContentBlock = { type: string; name?: string; input?: Record<string, unknown> };
type AnthropicResponse = {
  error?: { message?: string };
  content?: AnthropicContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

const MODELO = 'claude-sonnet-5'; // traducción de terminología técnica de obra — se prioriza precisión sobre coste, llamada puntual (bajo volumen)

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!esLlamadaAutorizada(req)) return jsonResponse({ error: 'No autorizado' }, 401);

  try {
    const { id } = await req.json();
    if (!id) return jsonResponse({ error: 'Falta "id" en el body' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: proyecto, error } = await supabase.from('proyectos').select('*').eq('id', id).maybeSingle();
    if (error || !proyecto) return jsonResponse({ error: 'Planning de obra no encontrado' }, 404);

    let idiomaPresupuesto: string | null = null;
    if (proyecto.presupuesto_id) {
      const { data: presupuesto } = await supabase.from('presupuestos').select('idioma').eq('id', proyecto.presupuesto_id).maybeSingle();
      idiomaPresupuesto = presupuesto?.idioma ?? null;
    }
    const idiomaOrigen = idiomaPresupuesto === 'Français' ? 'fr' : 'es';
    const idiomaDestino = idiomaOrigen === 'fr' ? 'es' : 'fr';
    const idiomaDestinoCompleto = idiomaDestino === 'fr' ? 'Français' : 'Español';

    type Fase = { nombre: string; descripcion: string | null; seccion?: string | null; fecha_inicio: string | null; fecha_fin: string | null; completada: boolean };
    const fases = (proyecto.fases ?? []) as Fase[];

    const payload = {
      nombre_obra: proyecto.nombre_obra ?? '',
      fases: fases.map((f) => ({ nombre: f.nombre, descripcion: f.descripcion, seccion: f.seccion ?? null })),
    };

    const systemPrompt = `Eres un traductor técnico especializado en reformas y construcción, trabajando para Reformas Ordoñez (empresa de reformas en la frontera franco-española). Traduces del ${idiomaOrigen === 'fr' ? 'francés' : 'español'} al ${idiomaDestino === 'fr' ? 'francés' : 'español'}.

Esto es SOLO una traducción interna del planning de obra (para que el propio equipo pueda leerlo en el otro idioma) — nunca se envía al cliente tal cual, así que no hace falta pulir el tono comercial, pero sí debe ser una traducción natural, como la escribiría un nativo del idioma de destino con vocabulario real de construcción/reformas — nunca calcada palabra por palabra del original.

Reglas estrictas:
- Traduce ÚNICAMENTE el texto. Nunca inventes, quites ni cambies información técnica (medidas, materiales, referencias, nombres propios, direcciones).
- Fechas, duraciones y el estado de cada fase NO se tocan — ni siquiera los menciones, ya se conservan aparte.
- Si un campo es null o cadena vacía, devuélvelo igual (null/"").
- El array "fases" de tu respuesta debe tener EXACTAMENTE el mismo número de elementos, en el mismo orden, que el array de entrada.

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
                nombre_obra: { type: 'string' },
                fases: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      nombre: { type: 'string' },
                      descripcion: { type: ['string', 'null'] },
                      seccion: { type: ['string', 'null'] },
                    },
                    required: ['nombre', 'descripcion', 'seccion'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['nombre_obra', 'fases'],
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
      nombre_obra: string;
      fases: { nombre: string; descripcion: string | null; seccion: string | null }[];
    };

    if (resultado.fases.length !== fases.length) {
      return jsonResponse({ error: 'La traducción no devolvió el mismo número de fases que el planning' }, 502);
    }

    // Fusiona el texto traducido sobre las fases originales — fechas, duración y estado de
    // completada se conservan exactamente igual que en el planning real.
    const fasesTraducidas = fases.map((f, i) => ({
      ...f,
      nombre: resultado.fases[i].nombre,
      descripcion: resultado.fases[i].descripcion,
      seccion: resultado.fases[i].seccion,
    }));

    const traduccion = {
      idioma: idiomaDestinoCompleto,
      nombre_obra: resultado.nombre_obra,
      fases: fasesTraducidas,
      generado_en: new Date().toISOString(),
    };

    const { error: errorUpdate } = await supabase.from('proyectos').update({ traduccion }).eq('id', id);
    if (errorUpdate) return jsonResponse({ error: errorUpdate.message }, 500);

    const inputTokens: number = anthropicData.usage?.input_tokens ?? 0;
    const outputTokens: number = anthropicData.usage?.output_tokens ?? 0;
    // Precio de lanzamiento de Sonnet 5 vigente hasta el 31/08/2026 (ver generar-mensaje-ia/index.ts).
    const introVigente = new Date() < new Date('2026-09-01T00:00:00Z');
    const precio = introVigente ? { input: 2, output: 10 } : { input: 3, output: 15 };
    const costoUsd = (inputTokens / 1_000_000) * precio.input + (outputTokens / 1_000_000) * precio.output;

    await supabase.from('llamadas_ia').insert({
      tipo: 'traduccion_planning',
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
