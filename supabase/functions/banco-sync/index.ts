// Edge Function: banco-sync
//
// Dos proveedores (2026-09-26): open-banking.io si existe el secreto OPENBANKING_IO_CREDENTIALS (el
// elegido para la cuenta de la EURL, ver el bloque "Proveedor open-banking.io"), y si no Enable Banking.
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
  const filas: FilaMovimiento[] = [];
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

  return guardarMovimientos(supabase, filas);
}

type FilaMovimiento = {
  fitid: string;
  fecha: string;
  importe: number;
  tipo: 'Credito' | 'Debito';
  descripcion: string;
  contraparte: string | null;
  origen: 'sincronizacion';
  conexion_id: string;
  archivo_origen: null;
};

/** Común a los dos proveedores: inserta los movimientos nuevos (deduplicados por fitid) y registra
 * cada pago nuevo como gasto (procesarPago). Los cobros se concilian después en el frontend. */
async function guardarMovimientos(supabase: SupabaseClient, filas: FilaMovimiento[]) {
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

// ── Proveedor open-banking.io (Tatic ApS, sobre Enable Banking) ─────────────────────────────────
//
// Elegido 2026-09-26 porque el modo gratuito de Enable Banking excluye cuentas de empresa y la
// alternativa legal más barata para la cuenta de la EURL es este revendedor: 3 €/mes. Se activa solo
// con el secreto OPENBANKING_IO_CREDENTIALS (el contenido completo de credentials.json exportado desde
// su app); mientras no exista, la función sigue usando Enable Banking o avisa de que falta configurar.
//
// La cuenta se conecta y renueva (cada ~90 días) en la propia web de open-banking.io, no desde el CRM.
// Aquí solo se lee: POST /api/sync para pedir datos frescos al banco y GET de cuentas/movimientos.
// Cada dato sensible llega cifrado ("zero-knowledge"): ECDH P-256 efímero → HKDF-SHA256 →
// AES-256-GCM, mismo esquema que su cliente oficial (github.com/open-banking-io/clients,
// node/src/envelope.ts). Formato: versión(1)=0x01 | clave pública efímera(65) | nonce(12) |
// tag(16) | ciphertext.

type CredencialesObio = {
  apiBaseUrl: string;
  apiKey: string;
  encryptionKey: { privateKey: string };
};

type CuentaObio = {
  id: string;
  aspspName: string;
  aspspCountry: string;
  currency: string;
  needsReconnect: boolean;
  enc?: string | null;
  uidEnc?: string | null;
};

type MovimientoObio = {
  id: string;
  currency: string;
  creditDebitIndicator: string;
  status?: string | null;
  bookingDate?: string | null;
  valueDate?: string | null;
  transactionDate?: string | null;
  enc?: string | null;
};

type MovimientoObioDescifrado = {
  amount?: string | null;
  creditorName?: string | null;
  debtorName?: string | null;
  remittanceInformation?: string | null;
  note?: string | null;
};

type ConexionObio = { validUntil: string; isLive?: boolean; accountIds?: string[] };

type FalloObio = { accountId: string; reason: string };

const OBIO_HKDF_INFO = new TextEncoder().encode('bank.core.ci/zk/v1');
const OBIO_HKDF_SALT = new Uint8Array(32);

function credencialesObio(): CredencialesObio | null {
  const raw = Deno.env.get('OPENBANKING_IO_CREDENTIALS');
  if (!raw) return null;
  let c: CredencialesObio;
  try {
    c = JSON.parse(raw);
  } catch {
    throw new ErrorBanco(
      500,
      'OPENBANKING_IO_CREDENTIALS no es un JSON válido (pega el contenido completo de credentials.json).',
    );
  }
  if (!c?.apiBaseUrl || !c?.apiKey || !c?.encryptionKey?.privateKey) {
    throw new ErrorBanco(
      500,
      'OPENBANKING_IO_CREDENTIALS no tiene apiBaseUrl, apiKey y encryptionKey.privateKey.',
    );
  }
  return c;
}

function base64ABytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
}

/** Descifra un sobre de open-banking.io y devuelve su JSON (null si el campo viene vacío). */
export async function descifrarObio<T>(
  clave: CryptoKey,
  sobre: string | null | undefined,
): Promise<T | null> {
  if (sobre == null) return null;
  const bytes = base64ABytes(sobre);
  if (bytes.length < 1 + 65 + 12 + 16 || bytes[0] !== 0x01)
    throw new Error('Sobre cifrado de open-banking.io no válido');
  const efimera = bytes.subarray(1, 66);
  const nonce = bytes.subarray(66, 78);
  const tag = bytes.subarray(78, 94);
  const cifrado = bytes.subarray(94);
  const claveEfimera = await crypto.subtle.importKey(
    'raw',
    efimera,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const compartido = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: claveEfimera }, clave, 256),
  );
  const hkdf = await crypto.subtle.importKey('raw', compartido, 'HKDF', false, ['deriveKey']);
  const aes = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: OBIO_HKDF_SALT, info: OBIO_HKDF_INFO },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const conTag = new Uint8Array(cifrado.length + tag.length);
  conTag.set(cifrado, 0);
  conTag.set(tag, cifrado.length);
  const claro = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    aes,
    conTag,
  );
  return JSON.parse(new TextDecoder().decode(claro)) as T;
}

export async function importarClaveObio(pkcs8Base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    base64ABytes(pkcs8Base64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
}

async function clienteObio(c: CredencialesObio) {
  const clave = await importarClaveObio(c.encryptionKey.privateKey);
  const base = c.apiBaseUrl.replace(/\/+$/, '');
  const pedir = async <T>(
    ruta: string,
    opciones: { method?: string; body?: unknown; cabeceras?: Record<string, string> } = {},
  ): Promise<T> => {
    const res = await fetch(`${base}${ruta}`, {
      method: opciones.method ?? 'GET',
      headers: {
        ...(opciones.cabeceras ?? {}),
        'X-Api-Key': c.apiKey,
        'Content-Type': 'application/json',
      },
      body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
    });
    if (!res.ok) {
      const texto = await res.text().catch(() => '');
      let motivo = texto;
      try {
        motivo = (JSON.parse(texto) as { reason?: string }).reason ?? texto;
      } catch {
        // cuerpo no JSON
      }
      throw new ErrorBanco(res.status, `open-banking.io (${res.status}): ${motivo.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  };
  return { clave, pedir };
}

const MENSAJES_FALLO_OBIO: Record<string, string> = {
  reconnect_needed: 'La autorización del banco ha caducado — renuévala en open-banking.io.',
  psu_present_required:
    'El banco solo comparte datos con el titular presente: pulsa "Sincronizar ahora" en el CRM.',
};

/** Sincroniza todas las cuentas de open-banking.io. `psu` (IP y navegador de quien pulsa
 * "Sincronizar ahora") solo se envía en una llamada manual: algunos bancos lo exigen. */
async function sincronizarObio(
  supabase: SupabaseClient,
  c: CredencialesObio,
  psu: Record<string, string>,
) {
  const { clave, pedir } = await clienteObio(c);
  const total = {
    conexiones: 0,
    nuevos: 0,
    gastosCreados: 0,
    gastosVinculados: 0,
    pagosAmbiguos: 0,
    errores: [] as string[],
  };

  // 1) Pedir datos frescos al banco (uid de cada cuenta descifrado en local; un uid renovado se
  //    reintenta una vez, igual que el cliente oficial).
  const fallos: FalloObio[] = [];
  for (let intento = 0; intento < 2; intento++) {
    const cuentas = await pedir<CuentaObio[]>('/api/accounts');
    const items: { accountId: string; uid: string }[] = [];
    for (const a of cuentas) {
      if (a.needsReconnect) {
        if (intento === 0) fallos.push({ accountId: a.id, reason: 'reconnect_needed' });
        continue;
      }
      const uid = (await descifrarObio<{ uid?: string | null }>(clave, a.uidEnc))?.uid;
      if (uid) items.push({ accountId: a.id, uid });
    }
    if (items.length === 0) break;
    try {
      const r = await pedir<{ failures?: FalloObio[] }>('/api/sync', {
        method: 'POST',
        body: { items },
        cabeceras: psu,
      });
      const desfasados = (r.failures ?? []).filter((f) => f.reason === 'uid_outdated');
      fallos.push(...(r.failures ?? []).filter((f) => f.reason !== 'uid_outdated'));
      if (desfasados.length === 0 || intento === 1) break;
    } catch (err) {
      // Sin sync online se siguen leyendo los movimientos ya guardados en open-banking.io.
      total.errores.push(err instanceof Error ? err.message : String(err));
      break;
    }
  }

  // 2) Cuentas → banco_conexiones (una fila por cuenta, reutilizada entre ejecuciones).
  const cuentas = await pedir<CuentaObio[]>('/api/accounts');
  const conexionesObio = await pedir<ConexionObio[]>('/api/connections').catch(
    () => [] as ConexionObio[],
  );
  total.conexiones = cuentas.length;

  for (const a of cuentas) {
    const datos = await descifrarObio<{ iban?: string | null }>(clave, a.enc);
    const validez = conexionesObio.find((x) => x.accountIds?.includes(a.id))?.validUntil ?? null;
    const fallo = fallos.find((f) => f.accountId === a.id);
    const ultimoError = fallo
      ? (MENSAJES_FALLO_OBIO[fallo.reason] ?? `open-banking.io: ${fallo.reason}`)
      : null;

    const { data: existentes, error: errorBuscar } = await supabase
      .from('banco_conexiones')
      .select('id, ultima_sincronizacion')
      .eq('proveedor', 'openbanking_io')
      .eq('account_uid', a.id)
      .limit(1);
    if (errorBuscar) throw new Error(`banco_conexiones: ${errorBuscar.message}`);
    const datosConexion = {
      proveedor: 'openbanking_io',
      aspsp_nombre: a.aspspName,
      aspsp_pais: a.aspspCountry,
      session_id: 'openbanking_io',
      account_uid: a.id,
      iban: datos?.iban ?? null,
      valido_hasta: validez,
      estado: a.needsReconnect ? 'caducada' : 'activa',
      ultimo_error: ultimoError,
    };
    let conexionId: string;
    let ultimaSync: string | null = null;
    if (existentes && existentes.length > 0) {
      conexionId = existentes[0].id;
      ultimaSync = existentes[0].ultima_sincronizacion;
      const { error } = await supabase
        .from('banco_conexiones')
        .update(datosConexion)
        .eq('id', conexionId);
      if (error) throw new Error(`banco_conexiones: ${error.message}`);
    } else {
      const { data, error } = await supabase
        .from('banco_conexiones')
        .insert(datosConexion)
        .select('id')
        .single();
      if (error) throw new Error(`banco_conexiones: ${error.message}`);
      conexionId = data.id as string;
    }
    if (ultimoError) total.errores.push(`${a.aspspName}: ${ultimoError}`);

    // 3) Movimientos de la cuenta desde la última sincronización (con solape) o los últimos 90 días.
    const desde = ultimaSync
      ? sumarDias(ultimaSync, -DIAS_SOLAPE)
      : sumarDias(new Date().toISOString(), -DIAS_PRIMERA_SINCRONIZACION);
    const filas: FilaMovimiento[] = [];
    const limite = 200;
    for (let offset = 0; offset < 10_000; offset += limite) {
      const pagina = await pedir<{ items?: MovimientoObio[]; total?: number }>(
        `/api/accounts/${encodeURIComponent(a.id)}/transactions?from=${desde}&limit=${limite}&offset=${offset}`,
      );
      const items = pagina.items ?? [];
      for (const t of items) {
        if (t.status && t.status !== 'BOOK') continue; // solo contabilizados, igual que con Enable Banking
        const fecha = t.bookingDate ?? t.valueDate ?? t.transactionDate;
        if (!fecha) continue;
        const d = await descifrarObio<MovimientoObioDescifrado>(clave, t.enc);
        const esCobro = t.creditDebitIndicator === 'CRDT';
        // El importe llega como texto decimal; el signo se toma del indicador CRDT/DBIT.
        const importe =
          (Math.round(Math.abs(parseFloat(d?.amount ?? '0')) * 100) / 100) * (esCobro ? 1 : -1);
        const contraparte = (esCobro ? d?.debtorName : d?.creditorName) ?? null;
        filas.push({
          fitid: `obio:${t.id}`,
          fecha: fecha.slice(0, 10),
          importe,
          tipo: esCobro ? 'Credito' : 'Debito',
          descripcion:
            (d?.remittanceInformation ?? d?.note ?? '').trim() ||
            contraparte ||
            'Movimiento bancario',
          contraparte,
          origen: 'sincronizacion',
          conexion_id: conexionId,
          archivo_origen: null,
        });
      }
      if (items.length < limite) break;
    }

    const r = await guardarMovimientos(supabase, filas);
    total.nuevos += r.nuevos;
    total.gastosCreados += r.gastosCreados;
    total.gastosVinculados += r.gastosVinculados;
    total.pagosAmbiguos += r.pagosAmbiguos;
    const { error: errorFecha } = await supabase
      .from('banco_conexiones')
      .update({ ultima_sincronizacion: new Date().toISOString() })
      .eq('id', conexionId);
    if (errorFecha) total.errores.push(errorFecha.message);
  }
  return total;
}

/** Cabeceras X-Psu-* de quien pulsa "Sincronizar ahora" (nunca desde el cron). */
function cabecerasPsu(req: Request): Record<string, string> {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  const agente = req.headers.get('user-agent') ?? '';
  if (!ip || !agente) return {};
  const cabeceras: Record<string, string> = { 'X-Psu-Ip-Address': ip, 'X-Psu-User-Agent': agente };
  const idioma = req.headers.get('accept-language');
  if (idioma) cabeceras['X-Psu-Accept-Language'] = idioma;
  return cabeceras;
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
    // open-banking.io tiene prioridad si su secreto está puesto; si no, Enable Banking (si lo está).
    const obio = credencialesObio();
    const hayEnableBanking =
      !!Deno.env.get('ENABLEBANKING_APP_ID') && !!Deno.env.get('ENABLEBANKING_PRIVATE_KEY');
    const proveedor = obio ? 'openbanking_io' : hayEnableBanking ? 'enablebanking' : null;

    if (accion === 'estado') {
      return jsonResponse({ ok: true, configurado: proveedor !== null, proveedor });
    }
    if (obio) {
      switch (accion) {
        case 'sincronizar':
          return jsonResponse({
            ok: true,
            ...(await sincronizarObio(
              supabase,
              obio,
              body.presente === true ? cabecerasPsu(req) : {},
            )),
          });
        case 'desconectar': {
          // La cuenta se desconecta en open-banking.io; aquí solo se deja de mostrar como activa.
          const { error } = await supabase
            .from('banco_conexiones')
            .update({ estado: 'desconectada' })
            .eq('id', String(body.conexion_id ?? ''));
          if (error) throw new Error(`banco_conexiones: ${error.message}`);
          return jsonResponse({ ok: true });
        }
        default:
          return jsonResponse(
            {
              error:
                'Con open-banking.io la cuenta se conecta y renueva desde su propia web, no desde el CRM.',
            },
            400,
          );
      }
    }
    switch (accion) {
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
