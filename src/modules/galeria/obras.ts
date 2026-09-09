import { supabase } from '../../lib/supabase';
import { normalizarTelefono } from '../clientes/types';

// Una "obra" para la Galería es una unidad de trabajo real (1 obra = 1 presupuesto), nunca texto
// libre: existe si hay un presupuesto con estado 'Aceptado', o si hay una factura/acompte (con o
// sin presupuesto vinculado) que la respalde — petición de Gabriel 2026-09-09. `clave` identifica
// la fila en el desplegable; `galeriaId` es null si la obra todavía no tiene ficha en `galeria`.
export type ObraGaleria = {
  clave: string;
  presupuestoId: string | null;
  facturaId: string | null;
  visitaId: string | null;
  clienteTel: string | null;
  clienteEmail: string | null;
  clienteNombre: string;
  numero: string;
  zona: string | null;
  pais: string | null;
  fecha: string | null;
  tipoObra: string | null;
  galeriaId: string | null;
};

export async function cargarObrasDisponibles(): Promise<ObraGaleria[]> {
  const [presupuestosRes, facturasRes, galeriaRes] = await Promise.all([
    supabase
      .from('presupuestos')
      .select('id, numero, cliente_nombre, cliente_tel, cliente_email, titulo, pais, fecha_emision, visita_id, estado')
      .is('eliminado_en', null),
    supabase
      .from('facturas')
      .select('id, numero, cliente_nombre, cliente_tel, cliente_email, titulo, pais, fecha_factura, presupuesto_id')
      .is('eliminado_en', null)
      .eq('estructura_anterior', false)
      .in('tipo', ['normal', 'acompte']),
    supabase.from('galeria').select('id, presupuesto_id, factura_id'),
  ]);
  if (presupuestosRes.error) throw presupuestosRes.error;
  if (facturasRes.error) throw facturasRes.error;
  if (galeriaRes.error) throw galeriaRes.error;

  const presupuestos = presupuestosRes.data ?? [];
  const facturas = facturasRes.data ?? [];
  const galeria = galeriaRes.data ?? [];

  const galeriaPorPresupuesto = new Map(
    galeria.filter((g) => g.presupuesto_id).map((g) => [g.presupuesto_id as string, g.id as string]),
  );
  const galeriaPorFactura = new Map(galeria.filter((g) => g.factura_id).map((g) => [g.factura_id as string, g.id as string]));

  // Zonas de obra: solo vienen de la visita del presupuesto (facturas no tienen zona propia).
  const visitaIds = [...new Set(presupuestos.map((p) => p.visita_id).filter((v): v is string => !!v))];
  let zonasPorVisita = new Map<string, string | null>();
  if (visitaIds.length > 0) {
    const { data: visitas, error } = await supabase.from('visitas').select('id, zona').in('id', visitaIds);
    if (error) throw error;
    zonasPorVisita = new Map((visitas ?? []).map((v) => [v.id, v.zona]));
  }

  // 1) Un presupuesto es obra si está Aceptado, o si alguna factura/acompte ya lo referencia
  // (aunque el presupuesto en sí ya no esté en estado Aceptado).
  const idsConFactura = new Set(facturas.map((f) => f.presupuesto_id).filter((id): id is string => !!id));
  const obrasPorPresupuesto: ObraGaleria[] = [];
  for (const p of presupuestos) {
    if (p.estado !== 'Aceptado' && !idsConFactura.has(p.id)) continue;
    obrasPorPresupuesto.push({
      clave: `p:${p.id}`,
      presupuestoId: p.id,
      facturaId: null,
      visitaId: p.visita_id,
      clienteTel: p.cliente_tel,
      clienteEmail: p.cliente_email,
      clienteNombre: p.cliente_nombre ?? 'Sin nombre',
      numero: p.numero ?? '—',
      zona: p.visita_id ? (zonasPorVisita.get(p.visita_id) ?? null) : null,
      pais: p.pais,
      fecha: p.fecha_emision,
      tipoObra: p.titulo,
      galeriaId: galeriaPorPresupuesto.get(p.id) ?? null,
    });
  }

  // 2) Facturas sin presupuesto_id ("sin coincidencia en el CRM", ver CLAUDE.md) — se agrupan por
  // contacto normalizado (mismo criterio que agruparClientes/vincularSolicitudPorContacto), una
  // obra por cliente distinto, anclada a su factura más antigua.
  const facturasSueltas = facturas.filter((f) => !f.presupuesto_id);
  const gruposSueltos = new Map<string, typeof facturasSueltas>();
  for (const f of facturasSueltas) {
    const tel = f.cliente_tel ? normalizarTelefono(f.cliente_tel) : '';
    const email = f.cliente_email ? f.cliente_email.toLowerCase() : '';
    const clave = tel || email || f.id;
    const grupo = gruposSueltos.get(clave);
    if (grupo) grupo.push(f);
    else gruposSueltos.set(clave, [f]);
  }
  const obrasPorFactura: ObraGaleria[] = [];
  for (const grupo of gruposSueltos.values()) {
    const ordenadas = [...grupo].sort((a, b) => (a.fecha_factura ?? '').localeCompare(b.fecha_factura ?? ''));
    const ancla = ordenadas[0];
    obrasPorFactura.push({
      clave: `f:${ancla.id}`,
      presupuestoId: null,
      facturaId: ancla.id,
      visitaId: null,
      clienteTel: ancla.cliente_tel,
      clienteEmail: ancla.cliente_email,
      clienteNombre: ancla.cliente_nombre ?? 'Sin nombre',
      numero: ancla.numero ?? '—',
      zona: null,
      pais: ancla.pais,
      fecha: ancla.fecha_factura,
      tipoObra: ancla.titulo,
      galeriaId: galeriaPorFactura.get(ancla.id) ?? null,
    });
  }

  return [...obrasPorPresupuesto, ...obrasPorFactura].sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''));
}

// Para los atajos "+ Foto a galería" de la ficha de Visita/Cliente (2026-09-09): busca si esa
// visita (o su contacto) ya corresponde a una obra verificada, sin tener que pasar por el
// desplegable de /galeria.
export async function encontrarObraPorContacto(datos: {
  visitaId?: string | null;
  telefono?: string | null;
  email?: string | null;
}): Promise<ObraGaleria | null> {
  const obras = await cargarObrasDisponibles();
  const tel = datos.telefono ? normalizarTelefono(datos.telefono) : null;
  const email = datos.email ? datos.email.toLowerCase() : null;
  return (
    obras.find((o) => {
      if (datos.visitaId && o.visitaId === datos.visitaId) return true;
      if (tel && o.clienteTel && normalizarTelefono(o.clienteTel) === tel) return true;
      if (email && o.clienteEmail && o.clienteEmail.toLowerCase() === email) return true;
      return false;
    }) ?? null
  );
}

// Crea la ficha de `galeria` para una obra que todavía no la tiene, autorrellenando desde los
// datos ya verificados de la obra — nunca texto libre. Devuelve el id ya existente si la obra ya
// tenía ficha (evita duplicados aunque se llame dos veces seguidas).
export async function abrirOCrearFichaGaleria(obra: ObraGaleria): Promise<string> {
  if (obra.galeriaId) return obra.galeriaId;
  const { data, error } = await supabase
    .from('galeria')
    .insert({
      visita_id: obra.visitaId,
      proyecto_id: null,
      presupuesto_id: obra.presupuestoId,
      factura_id: obra.facturaId,
      titulo: obra.tipoObra || `${obra.clienteNombre} — ${obra.numero}`,
      tipo_obra: obra.tipoObra,
      zona: obra.zona,
      fecha_obra: obra.fecha,
      descripcion: null,
      fotos: [],
      destacado: false,
      publicado: false,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}
