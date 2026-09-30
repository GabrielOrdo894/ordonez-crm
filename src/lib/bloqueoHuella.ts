// Desbloqueo con huella/cara en el teléfono (Gabriel, 2026-09-30). En el teléfono la sesión no
// caduca (sesionTelefono.ts), así que esto es el candado de la app: al abrirla, o al volver tras
// más de 5 minutos en segundo plano, se pide la huella antes de enseñar nada del CRM.
// Usa WebAuthn con el autenticador del propio móvil y userVerification 'required' — quien comprueba
// la huella es el teléfono, no el servidor: protege contra alguien que coja el móvil desbloqueado,
// no sustituye a la contraseña. Si falla, siempre queda "Entrar con contraseña".
const CLAVE_CREDENCIAL = 'crm_huella_credencial';
const CLAVE_RECHAZADA = 'crm_huella_rechazada';
export const MINUTOS_SIN_BLOQUEO = 5;

function aBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function deBase64(texto: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));
}

function reto(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32));
}

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

export function huellaActivada(): boolean {
  return leer(CLAVE_CREDENCIAL) !== null;
}

export function huellaRechazada(): boolean {
  return leer(CLAVE_RECHAZADA) === '1';
}

export function rechazarHuella(): void {
  try {
    localStorage.setItem(CLAVE_RECHAZADA, '1');
  } catch {
    // sin localStorage — volverá a preguntar, no pasa nada
  }
}

export function desactivarHuella(): void {
  try {
    localStorage.removeItem(CLAVE_CREDENCIAL);
  } catch {
    // sin localStorage — no había nada guardado
  }
}

// ¿El móvil tiene huella/cara configurada y el navegador la deja usar?
export async function huellaDisponible(): Promise<boolean> {
  try {
    return (
      typeof PublicKeyCredential !== 'undefined' &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

export async function activarHuella(userId: string, email: string): Promise<void> {
  const credencial = (await navigator.credentials.create({
    publicKey: {
      challenge: reto(),
      rp: { name: 'Reformas Ordoñez CRM' },
      user: { id: new TextEncoder().encode(userId), name: email, displayName: email },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;
  if (!credencial) throw new Error('No se pudo activar la huella');
  localStorage.setItem(CLAVE_CREDENCIAL, aBase64(credencial.rawId));
  localStorage.removeItem(CLAVE_RECHAZADA);
}

// Lanza si se cancela o la huella no coincide.
export async function comprobarHuella(): Promise<void> {
  const id = leer(CLAVE_CREDENCIAL);
  if (!id) return;
  const resultado = await navigator.credentials.get({
    publicKey: {
      challenge: reto(),
      allowCredentials: [{ type: 'public-key', id: deBase64(id) }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  if (!resultado) throw new Error('No se ha reconocido la huella');
}
