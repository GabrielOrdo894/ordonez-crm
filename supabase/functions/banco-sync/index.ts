// Edge Function: banco-sync
//
// Sincronización automática de la cuenta bancaria de la EURL con Enable Banking (agregador PSD2,
// modo restringido gratuito para conectar solo las cuentas propias — ver Configuración →
// Sincronización bancaria). Acciones (body.accion):
//   - estado:        si los secretos ENABLEBANKING_APP_ID / ENABLEBANKING_PRIVATE_KEY están puestos.
//   - bancos:        lista de bancos (ASPSP) del país para elegir el de la cuenta.
//   - iniciar:       abre la autorización en el banco (devuelve la URL a la que redirigir).
//   - crear-sesion:  canjea el `code` de vuelta del banco por una sesión y guarda la(s) cuenta(s).
//   - sincronizar:   descarga los movimientos nuevos de cada conexión activa (también lo llama el
//                    cron `banco-sync-diario` a las 05:30 UTC).
//   - desconectar:   cierra la sesión en Enable Banking y marca la conexión como desconectada.
//
// Al sincronizar, cada PAGO (débito) nuevo se registra como gasto "pendiente de revisar" (mismo
// flujo que el kilometraje automático: sin asiento contable hasta confirmarlo en Gastos), salvo
// que ya exista un único gasto con el mismo importe en fechas cercanas, en cuyo caso se enlaza a
// ese. Los COBROS (créditos) se concilian con facturas en el frontend (src/lib/conciliacionBancaria.ts),
// porque cobrar una factura genera asientos contables cuya lógica vive solo allí.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const API = 'https://api.enablebanking.com';
const DIAS_PRIMERA_SINCRONIZACION = 90;
const DIAS_SOLAPE = 7;
const MAX_VALIDEZ_SEGUNDOS = 180 * 24 * 3600;

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://ordonezrenov.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mismo patrón que el resto de funciones (duplicado a propósito: el despliegue vía MCP no resuelve
// imports relativos entre funciones).
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

// ── JWT firmado con la clave privada de la aplicación (RS256, kid = application id) ──────────────

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlJson(obj: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(obj)));
}

async function crearJwt(appId: string, pem: string): Promise<string> {
  const normalizado = pem.replace(/\\n/g, '\n');
  if (normalizado.includes('BEGIN RSA PRIVATE KEY')) {
    throw new Error(
      'La clave privada está en formato PKCS#1. Conviértela a PKCS#8 con: openssl pkcs8 -topk8 -nocrypt -in clave.pem -out clave-pkcs8.pem',
    );
  }
  const cuerpo = normalizado.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(cuerpo), (c) => c.charCodeAt(0));
  const clave = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const ahora = Math.floor(Date.now() / 1000);
  const datos = `${base64urlJson({ typ: 'JWT', alg: 'RS256', kid: appId })}.${base64urlJson({
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: ahora,
    exp: ahora + 3600,
  })}`;
  const firma = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    clave,
    new TextEncoder().encode(datos),
  );
  return `${datos}.${base64url(new Uint8Array(firma))}`;
}

class ErrorBanco extends Error {
  constructor(
    public status: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

type ClienteBanco = (
  ruta: string,
  opciones?: { method?: string; body?: unknown },
) => Promise<Record<string, unknown>>;

async function clienteBanco(): Promise<ClienteBanco> {
  const appId = Deno.env.get('ENABLEBANKING_APP_ID');
  const clave = Deno.env.get('ENABLEBANKING_PRIVATE_KEY');
  if (!appId || !clave) {
    throw new ErrorBanco(
      500,
      'Faltan los secretos ENABLEBANKING_APP_ID / ENABLEBANKING_PRIVATE_KEY en Supabase (Edge Functions → Secrets).',
    );
  }
  const jwt = await crearJwt(appId, clave);
  return async (ruta, opciones = {}) => {
    const res = await fetch(`${API}${ruta}`, {
      method: opciones.method ?? 'GET',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
    });
    const texto = await res.text();
    let datos: Record<string, unknown> = {};
    try {
      datos = texto ? JSON.parse(texto) : {};
    } catch {
      datos = { message: texto };
    }
    if (!res.ok) {
      const mensaje = (datos.message ?? datos.error ?? datos.detail ?? texto) as string;
      throw new ErrorBanco(
        res.status,
        `Enable Banking (${res.status}): ${typeof mensaje === 'string' ? mensaje : JSON.stringify(mensaje)}`,
      );
    }
    return datos;
  };
}

// ── Tipos mínimos de la respuesta de Enable Banking ─────────────────────────────────────────────

type Aspsp = {
  name: string;
  country: string;
  logo?: string;
  maximum_consent_validity?: number;
  psu_types?: string[];
};

type Transaccion = {
  entry_reference?: string | null;
  transaction_id?: string | null;
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator?: string;
  status?: string;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  remittance_information?: string[] | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
};

type Conexion = {
  id: string;
  session_id: string;
  account_uid: string;
  valido_hasta: string | null;
  ultima_sincronizacion: string | null;
};

type MovimientoInsertado = {
  id: string;
  fecha: string;
  importe: number;
  descripcion: string | null;
  contraparte: string | null;
};

function sumarDias(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

async function huella(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 20);
}

// ── Acciones ───────────────────────────────────────────────────────────────────────────────────

async function listarBancos(pais: string, psuType: string): Promise<Aspsp[]> {
  const banco = await clienteBanco();
  const datos = await banco(
    `/aspsps?country=${encodeURIComponent(pais)}&psu_type=${encodeURIComponent(psuType)}`,
  );
  return ((datos.aspsps as Aspsp[]) ?? []).map((a) => ({
    name: a.name,
    country: a.country,
    logo: a.logo,
    maximum_consent_validity: a.maximum_consent_validity,
  }));
}

async function iniciarAutorizacion(body: Record<string, unknown>): Promise<string> {
  const aspspNombre = String(body.aspsp_nombre ?? '');
  const pais = String(body.pais ?? 'FR');
  const psuType = body.psu_type === 'personal' ? 'personal' : 'business';
  const redirectUrl = String(body.redirect_url ?? '');
  const state = String(body.state ?? '');
  if (!aspspNombre) throw new ErrorBanco(400, 'Falta el banco');
  if (!redirectUrl.startsWith('https://ordonezrenov.com/'))
    throw new ErrorBanco(400, 'redirect_url no permitida');
  if (!state) throw new ErrorBanco(400, 'Falta state');

  const banco = await clienteBanco();
  const aspsps = await listarBancos(pais, psuType);
  const aspsp = aspsps.find((a) => a.name === aspspNombre);
  if (!aspsp)
    throw new ErrorBanco(
      400,
      `El banco "${aspspNombre}" no aparece en Enable Banking para ${pais}`,
    );
  const validez =
    Math.min(aspsp.maximum_consent_validity ?? MAX_VALIDEZ_SEGUNDOS, MAX_VALIDEZ_SEGUNDOS) - 3600;
  const validoHasta = new Date(Date.now() + validez * 1000).toISOString();

  const datos = await banco('/auth', {
    method: 'POST',
    body: {
      access: { valid_until: validoHasta },
      aspsp: { name: aspspNombre, country: pais },
      state,
      redirect_url: redirectUrl,
      psu_type: psuType,
      language: 'fr',
    },
  });
  return String(datos.url);
}

async function crearSesion(supabase: SupabaseClient, code: string) {
  if (!code) throw new ErrorBanco(400, 'Falta el código de autorización');
  const banco = await clienteBanco();
  const sesion = await banco('/sessions', { method: 'POST', body: { code } });
  const sessionId = String(sesion.session_id);
  const aspsp = (sesion.aspsp ?? {}) as { name?: string; country?: string };
  const validoHasta = ((sesion.access ?? {}) as { valid_until?: string }).valid_until ?? null;
  const cuentas = (sesion.accounts ?? []) as Array<
    string | { uid: string; account_id?: { iban?: string } }
  >;
  if (cuentas.length === 0) throw new ErrorBanco(400, 'El banco no ha autorizado ninguna cuenta');

  const filas = cuentas.map((c) => ({
    aspsp_nombre: aspsp.name ?? 'Banco',
    aspsp_pais: aspsp.country ?? 'FR',
    session_id: sessionId,
    account_uid: typeof c === 'string' ? c : c.uid,
    iban: typeof c === 'string' ? null : (c.account_id?.iban ?? null),
    valido_hasta: validoHasta,
    estado: 'activa',
  }));

  // Una reconexión (el consentimiento PSD2 caduca) sustituye a la conexión anterior de la misma
  // cuenta: la vieja queda como 'desconectada' para conservar el histórico de movimientos.
  const ibans = filas.map((f) => f.iban).filter((i): i is string => !!i);
  if (ibans.length > 0) {
    const { error } = await supabase
      .from('banco_conexiones')
      .update({ estado: 'desconectada' })
      .in('iban', ibans)
      .neq('estado', 'desconectada');
    if (error) throw new Error(`banco_conexiones (reconexión): ${error.message}`);
  }
  const { error } = await supabase.from('banco_conexiones').insert(filas);
  if (error) throw new Error(`banco_conexiones: ${error.message}`);
  return filas.length;
}

/** Pago bancario → gasto. Si ya hay exactamente un gasto con el mismo total en [-10, +3] días que
 * no esté enlazado a otro movimiento (p. ej. registrado a mano con su factura de proveedor), se
 * enlaza a ese. Si no hay ninguno, se crea uno pendiente de revisar. Si hay varios candidatos, el
 * movimiento se queda Pendiente para decidirlo a mano en Movimientos bancarios. */
async function procesarPago(
  supabase: SupabaseClient,
  m: MovimientoInsertado,
): Promise<'vinculado' | 'creado' | 'ambiguo'> {
  const total = Math.abs(m.importe);
  const { data: candidatos, error } = await supabase
    .from('gastos')
    .select('id, importe_base, importe_iva, cuenta_contable')
    .gte('fecha', sumarDias(m.fecha, -10))
    .lte('fecha', sumarDias(m.fecha, 3));
  if (error) throw new Error(`gastos: ${error.message}`);

  const mismoImporte = (candidatos ?? []).filter(
    (g) =>
      g.cuenta_contable !== '6251' &&
      Math.abs(Math.round(((g.importe_base ?? 0) + (g.importe_iva ?? 0)) * 100) / 100 - total) <
        0.01,
  );
  let libres = mismoImporte;
  if (mismoImporte.length > 0) {
    const { data: ocupados, error: errorOcupados } = await supabase
      .from('movimientos_banco')
      .select('gasto_id')
      .in(
        'gasto_id',
        mismoImporte.map((g) => g.id),
      );
    if (errorOcupados) throw new Error(`movimientos_banco: ${errorOcupados.message}`);
    const idsOcupados = new Set((ocupados ?? []).map((o) => o.gasto_id));
    libres = mismoImporte.filter((g) => !idsOcupados.has(g.id));
  }

  if (libres.length > 1) return 'ambiguo';

  let gastoId: string;
  let resultado: 'vinculado' | 'creado';
  if (libres.length === 1) {
    gastoId = libres[0].id;
    resultado = 'vinculado';
  } else {
    const etiqueta = m.contraparte || m.descripcion || 'Pago bancario';
    const { data: nuevo, error: errorGasto } = await supabase
      .from('gastos')
      .insert({
        fecha: m.fecha,
        descripcion: `${etiqueta} — pago bancario (revisar cuenta e IVA)`,
        categoria: null,
        proveedor: m.contraparte,
        proveedor_id: null,
        importe_base: total,
        tipo_iva: 'EXENTO',
        importe_iva: 0,
        pais: 'Francia',
        cuenta_contable: null,
        estado_gasto: 'pendiente',
      })
      .select('id')
      .single();
    if (errorGasto) throw new Error(`gastos (alta): ${errorGasto.message}`);
    gastoId = nuevo.id as string;
    resultado = 'creado';
  }

  const { error: errorMov } = await supabase
    .from('movimientos_banco')
    .update({ estado: 'Vinculado', gasto_id: gastoId })
    .eq('id', m.id);
  if (errorMov) throw new Error(`movimientos_banco (vincular gasto): ${errorMov.message}`);
  return resultado;
}

async function sincronizarConexion(supabase: SupabaseClient, banco: ClienteBanco, c: Conexion) {
  const desde = c.ultima_sincronizacion
    ? sumarDias(c.ultima_sincronizacion, -DIAS_SOLAPE)
    : sumarDias(new Date().toISOString(), -DIAS_PRIMERA_SINCRONIZACION);

  const transacciones: Transaccion[] = [];
  let continuationKey: string | null = null;
  for (let pagina = 0; pagina < 50; pagina++) {
    const params = new URLSearchParams({ date_from: desde });
    if (continuationKey) params.set('continuation_key', continuationKey);
    const datos = await banco(
      `/accounts/${encodeURIComponent(c.account_uid)}/transactions?${params}`,
    );
    transacciones.push(...((datos.transactions as Transaccion[]) ?? []));
    continuationKey = (datos.continuation_key as string | null) ?? null;
    if (!continuationKey) break;
  }

  // Solo movimientos contabilizados (BOOK): los pendientes (PDNG) pueden cambiar o desaparecer.
  const contabilizados = transacciones.filter((t) => !t.status || t.status === 'BOOK');
  const repeticiones = new Map<string, number>();
  const filas = [];
  for (const t of contabilizados) {
    const fecha = t.booking_date ?? t.value_date ?? t.transaction_date;
    if (!fecha) continue;
    const esCobro = t.credit_debit_indicator === 'CRDT';
    const importe =
      (Math.round(Math.abs(parseFloat(t.transaction_amount.amount)) * 100) / 100) *
      (esCobro ? 1 : -1);
    const contraparte = (esCobro ? t.debtor?.name : t.creditor?.name) ?? null;
    const descripcion =
      (t.remittance_information ?? []).join(' ').trim() || contraparte || 'Movimiento bancario';
    let referencia = t.entry_reference ?? t.transaction_id ?? null;
    if (!referencia) {
      // Sin referencia del banco: huella del contenido + nº de aparición dentro de la descarga, para
      // no fusionar dos pagos idénticos del mismo día.
      const base = await huella(`${fecha}|${importe}|${descripcion}`);
      const n = (repeticiones.get(base) ?? 0) + 1;
      repeticiones.set(base, n);
      referencia = `${base}-${n}`;
    }
    filas.push({
      fitid: `eb:${c.account_uid}:${referencia}`,
      fecha: fecha.slice(0, 10),
      importe,
      tipo: esCobro ? 'Credito' : 'Debito',
      descripcion,
      contraparte,
      origen: 'sincronizacion',
      conexion_id: c.id,
      archivo_origen: null,
    });
  }

  let insertados: MovimientoInsertado[] = [];
  if (filas.length > 0) {
    const { data, error } = await supabase
      .from('movimientos_banco')
      .upsert(filas, { onConflict: 'fitid', ignoreDuplicates: true })
      .select('id, fecha, importe, descripcion, contraparte');
    if (error) throw new Error(`movimientos_banco: ${error.message}`);
    insertados = (data ?? []) as MovimientoInsertado[];
  }

  const resumen = {
    nuevos: insertados.length,
    gastosCreados: 0,
    gastosVinculados: 0,
    pagosAmbiguos: 0,
  };
  for (const m of insertados.filter((x) => x.importe < 0)) {
    const r = await procesarPago(supabase, m);
    if (r === 'creado') resumen.gastosCreados++;
    else if (r === 'vinculado') resumen.gastosVinculados++;
    else resumen.pagosAmbiguos++;
  }
  return resumen;
}

async function sincronizarTodo(supabase: SupabaseClient) {
  const { data: conexiones, error } = await supabase
    .from('banco_conexiones')
    .select('id, session_id, account_uid, valido_hasta, ultima_sincronizacion')
    .eq('estado', 'activa');
  if (error) throw new Error(`banco_conexiones: ${error.message}`);
  const total = {
    conexiones: conexiones?.length ?? 0,
    nuevos: 0,
    gastosCreados: 0,
    gastosVinculados: 0,
    pagosAmbiguos: 0,
    errores: [] as string[],
  };
  if (!conexiones || conexiones.length === 0) return total;

  const banco = await clienteBanco();
  for (const c of conexiones as Conexion[]) {
    if (c.valido_hasta && new Date(c.valido_hasta).getTime() < Date.now()) {
      const { error: e } = await supabase
        .from('banco_conexiones')
        .update({
          estado: 'caducada',
          ultimo_error: 'El consentimiento del banco ha caducado — vuelve a conectar la cuenta.',
        })
        .eq('id', c.id);
      if (e) total.errores.push(e.message);
      continue;
    }
    try {
      const r = await sincronizarConexion(supabase, banco, c);
      total.nuevos += r.nuevos;
      total.gastosCreados += r.gastosCreados;
      total.gastosVinculados += r.gastosVinculados;
      total.pagosAmbiguos += r.pagosAmbiguos;
      const { error: e } = await supabase
        .from('banco_conexiones')
        .update({ ultima_sincronizacion: new Date().toISOString(), ultimo_error: null })
        .eq('id', c.id);
      if (e) total.errores.push(e.message);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      total.errores.push(mensaje);
      const caducada =
        err instanceof ErrorBanco &&
        (err.status === 401 || err.status === 403 || /expired|EXPIRED/.test(mensaje));
      const { error: e } = await supabase
        .from('banco_conexiones')
        .update({ ultimo_error: mensaje, ...(caducada ? { estado: 'caducada' } : {}) })
        .eq('id', c.id);
      if (e) total.errores.push(e.message);
    }
  }
  return total;
}

async function desconectar(supabase: SupabaseClient, conexionId: string) {
  const { data: c, error } = await supabase
    .from('banco_conexiones')
    .select('session_id')
    .eq('id', conexionId)
    .single();
  if (error) throw new Error(`banco_conexiones: ${error.message}`);
  try {
    const banco = await clienteBanco();
    await banco(`/sessions/${encodeURIComponent(c.session_id)}`, { method: 'DELETE' });
  } catch (err) {
    // Best-effort: si la sesión ya había caducado en el banco, igualmente se marca desconectada aquí.
    console.warn(
      'No se pudo cerrar la sesión en Enable Banking:',
      err instanceof Error ? err.message : err,
    );
  }
  const { error: e } = await supabase
    .from('banco_conexiones')
    .update({ estado: 'desconectada' })
    .eq('id', conexionId);
  if (e) throw new Error(`banco_conexiones: ${e.message}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!esLlamadaAutorizada(req)) return jsonResponse({ error: 'No autorizado' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const accion = String(body.accion ?? 'sincronizar');

  try {
    switch (accion) {
      case 'estado':
        return jsonResponse({
          ok: true,
          configurado:
            !!Deno.env.get('ENABLEBANKING_APP_ID') && !!Deno.env.get('ENABLEBANKING_PRIVATE_KEY'),
        });
      case 'bancos':
        return jsonResponse({
          ok: true,
          bancos: await listarBancos(
            String(body.pais ?? 'FR'),
            body.psu_type === 'personal' ? 'personal' : 'business',
          ),
        });
      case 'iniciar':
        return jsonResponse({ ok: true, url: await iniciarAutorizacion(body) });
      case 'crear-sesion': {
        const cuentas = await crearSesion(supabase, String(body.code ?? ''));
        const sincronizacion = await sincronizarTodo(supabase);
        return jsonResponse({ ok: true, cuentas, sincronizacion });
      }
      case 'sincronizar':
        return jsonResponse({ ok: true, ...(await sincronizarTodo(supabase)) });
      case 'desconectar':
        await desconectar(supabase, String(body.conexion_id ?? ''));
        return jsonResponse({ ok: true });
      default:
        return jsonResponse({ error: `Acción desconocida: ${accion}` }, 400);
    }
  } catch (err) {
    // Un 401/403 de Enable Banking no es un fallo de sesión del CRM: se devuelve como 502.
    const status =
      err instanceof ErrorBanco
        ? err.status === 400 || err.status === 500
          ? err.status
          : 502
        : 500;
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, status);
  }
});
