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

// Solicitudes web y presupuestos orientativos solo guardan el nombre completo en un único campo,
// nunca separan nombre/apellidos como sí hace `visitas` — no hay ninguna heurística mejor que la
// posición de las palabras disponible sin depender de un servicio externo, así que se asume que la
// primera palabra es el nombre y el resto los apellidos (petición de Gabriel 2026-09-02, para no
// tener que rellenar los apellidos a mano cada vez que se elige un potencial en VisitaForm.tsx).
export function dividirNombreCompleto(nombreCompleto: string): { nombre: string; apellidos: string } {
  const partes = nombreCompleto.trim().split(/\s+/).filter(Boolean);
  return { nombre: partes[0] ?? '', apellidos: partes.slice(1).join(' ') };
}

export function normalizarTelefono(tel: string) {
  // Se queda con los últimos 9 dígitos (núcleo del número en España y Francia) para que el mismo
  // teléfono cruce sin importar si está guardado en formato nacional (0612345678) o internacional
  // (+33612345678 / 33612345678) — antes ambos formatos generaban claves distintas y no cruzaban
  // (bug real, ver funnelTracking.ts / pipelineSync.ts).
  return tel.replace(/\D/g, '').slice(-9);
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
export type OrigenPotencial = 'solicitud' | 'orientativo' | 'visita';

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
  visita: 'Potencial · Visita realizada',
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

// "Cliente confirmado": decisión explícita de Gabriel 2026-08-26 — hacer una visita no basta para
// considerar a alguien cliente real, solo cuenta cuando acepta un presupuesto (y a partir de ahí se
// trabaja/factura con él). Hasta entonces se muestra en /clientes como potencial, con el mismo
// distintivo que las solicitudes/orientativos — pero sigue siendo un Cliente normal (agruparClientes
// no cambia) para Pipeline, Presupuestos, Facturas y Planning, que necesitan verlo desde el primer
// contacto para poder trabajar las etapas previas a la aceptación.
export type PresupuestoParaClaves = { estado: string; cliente_tel: string | null; cliente_email: string | null };

export function clavesPresupuestosAceptados(presupuestos: PresupuestoParaClaves[]): Set<string> {
  const claves = new Set<string>();
  for (const p of presupuestos) {
    if (p.estado !== 'Aceptado') continue;
    if (p.cliente_tel) claves.add(normalizarTelefono(p.cliente_tel));
    if (p.cliente_email) claves.add(p.cliente_email.toLowerCase());
  }
  return claves;
}

export function esClienteConfirmado(cliente: Cliente, clavesAceptadas: Set<string>): boolean {
  const tel = normalizarTelefono(cliente.telefono);
  return (!!tel && clavesAceptadas.has(tel)) || (!!cliente.email && clavesAceptadas.has(cliente.email.toLowerCase()));
}

// Clientes (agrupados por visita) que todavía no tienen ningún presupuesto Aceptado — se muestran
// como potenciales en /clientes, con acceso directo a su ficha real (ya tienen historial de
// visitas, a diferencia de los potenciales por solicitud/orientativo que aún no tienen ninguna).
export function potencialesPorVisita(clientes: Cliente[], clavesAceptadas: Set<string>): ClientePotencial[] {
  return clientes
    .filter((c) => !esClienteConfirmado(c, clavesAceptadas))
    .map((c) => ({
      id: c.id,
      origen: 'visita' as const,
      nombre: `${c.nombre} ${c.apellidos}`.trim() || 'Sin nombre',
      telefono: c.telefono,
      email: c.email,
      idioma: c.visitas[0]?.idioma ?? null,
      detalle: `${c.visitas.length} visita${c.visitas.length === 1 ? '' : 's'} · última ${c.visitas[0]?.fecha_visita ?? '—'}`,
    }));
}
