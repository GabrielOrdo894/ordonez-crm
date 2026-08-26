import type { Visita } from '../visitas/types';

export type Cliente = {
  id: string;
  nombre: string;
  apellidos: string;
  telefono: string;
  email: string | null;
  zona: string | null;
  pais: string | null;
  visitas: Visita[];
};

export const ETAPAS_PIPELINE = [
  'Contacto',
  'Visita programada',
  'Visita realizada',
  'Presupuesto enviado',
  'Presupuesto aceptado',
  'En obra',
  'Finalizado',
] as const;

export function normalizarTelefono(tel: string) {
  return tel.replace(/\D/g, '');
}

export function agruparClientes(visitas: Visita[]): Cliente[] {
  const grupos = new Map<string, Visita[]>();
  for (const v of visitas) {
    // Un teléfono sin ningún dígito ("N/A", "-", "sin whatsapp"...) normaliza a cadena vacía —
    // usarla tal cual como clave fundía en una sola ficha a todos los clientes distintos que
    // hubieran escrito un teléfono así (bug real corregido 2026-08-11). Se cae a email y, en
    // último caso, al id de la propia visita, para no agrupar por una clave vacía compartida.
    const telNormalizado = v.telefono ? normalizarTelefono(v.telefono) : '';
    const clave = telNormalizado || v.email || v.id;
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(v);
    else grupos.set(clave, [v]);
  }

  return Array.from(grupos.entries()).map(([clave, vs]) => {
    const ordenadas = [...vs].sort((a, b) =>
      (b.created_at ?? '').localeCompare(a.created_at ?? ''),
    );
    const ultima = ordenadas[0];
    return {
      id: clave,
      nombre: ultima.nombre,
      apellidos: ultima.apellidos,
      telefono: ultima.telefono,
      email: ultima.email,
      zona: ultima.zona,
      pais: ultima.pais,
      visitas: ordenadas,
    };
  });
}

// "Cliente potencial": alguien que todavía no tiene ninguna visita registrada, pero del que ya
// tenemos datos de contacto porque escribió por el formulario web/email (solicitudes) o pidió un
// presupuesto orientativo sin llegar a convertirse en cliente real. No vive en ninguna tabla propia
// — se calcula al vuelo igual que agruparClientes(), y deja de aparecer aquí en cuanto esa persona
// tiene su primera visita real (pasa a agruparClientes() de forma automática, sin ninguna
// "conversión" que mantener).
export type OrigenPotencial = 'solicitud' | 'orientativo';

export type ClientePotencial = {
  id: string;
  origen: OrigenPotencial;
  nombre: string;
  telefono: string;
  email: string | null;
  idioma: string | null;
  detalle: string | null;
};

export const ETIQUETA_ORIGEN_POTENCIAL: Record<OrigenPotencial, string> = {
  solicitud: 'Potencial · Solicitud web',
  orientativo: 'Potencial · Presupuesto orientativo',
};

export type SolicitudPotencialRow = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  email: string | null;
  idioma: string;
  tipo_reforma: string | null;
  estado: string;
};

export type OrientativoPotencialRow = {
  id: string;
  cliente_nombre: string | null;
  cliente_tel: string | null;
  cliente_email: string | null;
  idioma: string;
  numero: string | null;
};

export function agruparPotenciales(
  solicitudes: SolicitudPotencialRow[],
  orientativos: OrientativoPotencialRow[],
  clientesReales: Cliente[],
): ClientePotencial[] {
  const clavesReales = new Set<string>();
  for (const c of clientesReales) {
    const tel = normalizarTelefono(c.telefono);
    if (tel) clavesReales.add(tel);
    if (c.email) clavesReales.add(c.email.toLowerCase());
  }

  const resultado = new Map<string, ClientePotencial>();

  for (const s of solicitudes) {
    if (s.estado === 'Descartada') continue;
    const nombre = s.nombre?.trim();
    if (!nombre && !s.email && !s.telefono) continue;
    const tel = s.telefono ? normalizarTelefono(s.telefono) : '';
    const email = s.email?.toLowerCase() ?? '';
    const clave = tel || email;
    if (!clave || clavesReales.has(clave) || resultado.has(clave)) continue;
    resultado.set(clave, {
      id: s.id,
      origen: 'solicitud',
      nombre: nombre || s.email || 'Sin nombre',
      telefono: s.telefono ?? '',
      email: s.email,
      idioma: s.idioma,
      detalle: s.tipo_reforma,
    });
  }

  for (const p of orientativos) {
    const nombre = p.cliente_nombre?.trim();
    if (!nombre && !p.cliente_email && !p.cliente_tel) continue;
    const tel = p.cliente_tel ? normalizarTelefono(p.cliente_tel) : '';
    const email = p.cliente_email?.toLowerCase() ?? '';
    const clave = tel || email;
    if (!clave || clavesReales.has(clave) || resultado.has(clave)) continue;
    resultado.set(clave, {
      id: p.id,
      origen: 'orientativo',
      nombre: nombre || p.cliente_email || 'Sin nombre',
      telefono: p.cliente_tel ?? '',
      email: p.cliente_email,
      idioma: p.idioma,
      detalle: p.numero ? `Presupuesto orientativo ${p.numero}` : 'Presupuesto orientativo',
    });
  }

  return Array.from(resultado.values());
}
