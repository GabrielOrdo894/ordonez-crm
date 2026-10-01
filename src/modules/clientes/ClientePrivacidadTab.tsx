import { useState } from 'react';
import { hoyLocalIso } from '../../lib/fechas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { mensajeError } from '../../lib/mensajeError';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { normalizarTelefono } from './types';
import { eliminarEventoVisita } from '../../lib/googleCalendar';
import type { Cliente } from './types';

// solicitudes no cuelga de visita_id (llega antes de que exista una visita) — se localiza por
// teléfono/email del cliente, cruzando todas sus visitas por si contactó con datos distintos
// en cada una. Mismo criterio de normalización que pipelineSync.ts/documenso-webhook.
function datosContactoCliente(cliente: Cliente) {
  const telefonos = new Set(
    [cliente.telefono, ...cliente.visitas.map((v) => v.telefono)]
      .filter(Boolean)
      .map((t) => normalizarTelefono(t as string)),
  );
  const emails = new Set(
    [cliente.email, ...cliente.visitas.map((v) => v.email)]
      .filter((e): e is string => !!e)
      .map((e) => e.toLowerCase()),
  );
  return { telefonos, emails };
}

// Todo lo del cliente, no solo lo que cuelga de sus visitas activas (auditoría 2026-10-01): antes la
// purga y la exportación dejaban fuera sus visitas en la papelera (con sus notas, presupuestos y
// galería) y los presupuestos/facturas sin visita (orientativos, facturas manuales). Se localiza por
// teléfono normalizado o email, igual que las solicitudes.
async function resolverAlcanceCliente(cliente: Cliente, visitaIdsActivas: string[]) {
  const { telefonos, emails } = datosContactoCliente(cliente);
  const coincide = (tel: string | null | undefined, email: string | null | undefined) =>
    (!!tel && telefonos.has(normalizarTelefono(tel))) || (!!email && emails.has(email.toLowerCase()));
  const [visitas, presupuestos, facturas] = await Promise.all([
    supabase.from('visitas').select('id, telefono, email'),
    supabase.from('presupuestos').select('id, visita_id, cliente_tel, cliente_email'),
    supabase.from('facturas').select('id, visita_id, cliente_tel, cliente_email'),
  ]);
  if (visitas.error) throw new Error(`visitas: ${visitas.error.message}`);
  if (presupuestos.error) throw new Error(`presupuestos: ${presupuestos.error.message}`);
  if (facturas.error) throw new Error(`facturas: ${facturas.error.message}`);
  const visitaIds = new Set(visitaIdsActivas);
  for (const v of visitas.data ?? []) if (coincide(v.telefono, v.email)) visitaIds.add(v.id as string);
  const delCliente = (d: { visita_id: string | null; cliente_tel: string | null; cliente_email: string | null }) =>
    (!!d.visita_id && visitaIds.has(d.visita_id)) || coincide(d.cliente_tel, d.cliente_email);
  return {
    visitaIds: [...visitaIds],
    presupuestoIds: (presupuestos.data ?? []).filter(delCliente).map((p) => p.id as string),
    facturaIds: (facturas.data ?? []).filter(delCliente).map((f) => f.id as string),
    claves: [...telefonos, ...emails],
  };
}

async function buscarSolicitudesCliente(cliente: Cliente) {
  const { telefonos, emails } = datosContactoCliente(cliente);
  const { data, error } = await supabase.from('solicitudes').select('*');
  if (error) throw error;
  return (data ?? []).filter((s) => {
    const tel = s.telefono ? normalizarTelefono(s.telefono) : null;
    const email = s.email ? String(s.email).toLowerCase() : null;
    return (tel && telefonos.has(tel)) || (email && emails.has(email));
  });
}

type ClientePrivacidadTabProps = {
  cliente: Cliente;
  visitaIds: string[];
  onPurgado: () => void;
};

function descargarJson(nombreArchivo: string, datos: unknown) {
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}

// Reúne todo lo que hay en la base de datos vinculado a este cliente — 7 tablas relacionadas por
// visita_id, más documento_eventos/movimientos_banco/pagos_factura que cuelgan de
// presupuesto_id/factura_id/gasto_id, más solicitudes (localizadas por teléfono/email, no por
// visita_id) y sus funnel_eventos.
async function recopilarDatosCliente(cliente: Cliente, visitaIdsActivas: string[]) {
  const alcance = await resolverAlcanceCliente(cliente, visitaIdsActivas);
  const visitaIds = alcance.visitaIds;
  const [visitas, notas, proyectos, presupuestos, facturas, gastos, solicitudes] =
    await Promise.all([
      supabase.from('visitas').select('*').in('id', visitaIds),
      supabase.from('notas_cliente').select('*').in('visita_id', visitaIds),
      supabase.from('proyectos').select('*').in('visita_id', visitaIds),
      supabase.from('presupuestos').select('*').in('id', alcance.presupuestoIds),
      supabase.from('facturas').select('*').in('id', alcance.facturaIds),
      supabase.from('gastos').select('*').in('visita_id', visitaIds),
      buscarSolicitudesCliente(cliente).then((data) => ({
        data,
        error: null as { message: string } | null,
      })),
    ]);

  const resultados = { visitas, notas, proyectos, presupuestos, facturas, gastos, solicitudes };
  for (const [nombre, res] of Object.entries(resultados)) {
    if (res.error) throw new Error(`${nombre}: ${res.error.message}`);
  }

  const presupuestoIds = (presupuestos.data ?? []).map((p) => p.id as string);
  const facturaIds = (facturas.data ?? []).map((f) => f.id as string);
  const gastoIds = (gastos.data ?? []).map((g) => g.id as string);
  const solicitudIds = (solicitudes.data ?? []).map((s) => s.id as string);

  // galeria puede colgar de visita_id, presupuesto_id O factura_id (desde la migración
  // galeria_vincular_obra_real, 2026-09-09 — presupuestos orientativos Aceptados sin visita, o
  // facturas sueltas "sin coincidencia en el CRM"). Buscar solo por visita_id dejaba fuera de la
  // exportación cualquier ficha de galería de esos dos casos (bug real, auditoría 2026-09-21).
  const galeria = await (async () => {
    const [porVisita, porPresupuesto, porFactura] = await Promise.all([
      supabase.from('galeria').select('*').in('visita_id', visitaIds),
      presupuestoIds.length ? supabase.from('galeria').select('*').in('presupuesto_id', presupuestoIds) : { data: [], error: null },
      facturaIds.length ? supabase.from('galeria').select('*').in('factura_id', facturaIds) : { data: [], error: null },
    ]);
    for (const [nombre, res] of Object.entries({ porVisita, porPresupuesto, porFactura })) {
      if (res.error) throw new Error(`galeria (${nombre}): ${res.error.message}`);
    }
    const todas = [...(porVisita.data ?? []), ...(porPresupuesto.data ?? []), ...(porFactura.data ?? [])];
    return { data: Array.from(new Map(todas.map((g) => [g.id, g])).values()), error: null };
  })();

  const eventosPresupuesto = presupuestoIds.length
    ? await supabase
        .from('documento_eventos')
        .select('*')
        .eq('documento_tipo', 'presupuesto')
        .in('documento_id', presupuestoIds)
    : { data: [], error: null };
  if (eventosPresupuesto.error)
    throw new Error(`documento_eventos (presupuestos): ${eventosPresupuesto.error.message}`);

  const eventosFactura = facturaIds.length
    ? await supabase
        .from('documento_eventos')
        .select('*')
        .eq('documento_tipo', 'factura')
        .in('documento_id', facturaIds)
    : { data: [], error: null };
  if (eventosFactura.error)
    throw new Error(`documento_eventos (facturas): ${eventosFactura.error.message}`);

  const movimientosFactura = facturaIds.length
    ? await supabase.from('movimientos_banco').select('*').in('factura_id', facturaIds)
    : { data: [], error: null };
  if (movimientosFactura.error)
    throw new Error(`movimientos_banco (facturas): ${movimientosFactura.error.message}`);

  const movimientosGasto = gastoIds.length
    ? await supabase.from('movimientos_banco').select('*').in('gasto_id', gastoIds)
    : { data: [], error: null };
  if (movimientosGasto.error)
    throw new Error(`movimientos_banco (gastos): ${movimientosGasto.error.message}`);

  // pagos_factura (2026-09-08): fuente de verdad de CUÁNDO y CUÁNTO pagó el cliente cada factura —
  // se había quedado fuera de la exportación desde que existe la tabla (olvido, no una exclusión
  // documentada como sí lo son documento_eventos/movimientos_banco de una factura anonimizada;
  // bug real, auditoría 2026-09-21).
  const pagosFactura = facturaIds.length
    ? await supabase.from('pagos_factura').select('*').in('factura_id', facturaIds)
    : { data: [], error: null };
  if (pagosFactura.error) throw new Error(`pagos_factura: ${pagosFactura.error.message}`);

  const eventosFunnelSolicitud = solicitudIds.length
    ? await supabase.from('funnel_eventos').select('*').in('solicitud_id', solicitudIds)
    : { data: [], error: null };
  if (eventosFunnelSolicitud.error)
    throw new Error(`funnel_eventos (solicitudes): ${eventosFunnelSolicitud.error.message}`);

  const eventosFunnelPresupuesto = presupuestoIds.length
    ? await supabase.from('funnel_eventos').select('*').in('presupuesto_id', presupuestoIds)
    : { data: [], error: null };
  if (eventosFunnelPresupuesto.error)
    throw new Error(`funnel_eventos (presupuestos): ${eventosFunnelPresupuesto.error.message}`);

  return {
    exportado_en: new Date().toISOString(),
    visitas: visitas.data ?? [],
    notas_cliente: notas.data ?? [],
    proyectos: proyectos.data ?? [],
    presupuestos: presupuestos.data ?? [],
    facturas: facturas.data ?? [],
    gastos: gastos.data ?? [],
    galeria: galeria.data ?? [],
    solicitudes: solicitudes.data ?? [],
    // dedupe: un evento 'solicitud_vinculada_presupuesto' tiene solicitud_id Y presupuesto_id, así
    // que puede salir en las dos consultas de arriba.
    funnel_eventos: Array.from(
      new Map(
        [...(eventosFunnelSolicitud.data ?? []), ...(eventosFunnelPresupuesto.data ?? [])].map(
          (e) => [e.id, e],
        ),
      ).values(),
    ),
    documento_eventos: [...(eventosPresupuesto.data ?? []), ...(eventosFactura.data ?? [])],
    movimientos_banco: [...(movimientosFactura.data ?? []), ...(movimientosGasto.data ?? [])],
    pagos_factura: pagosFactura.data ?? [],
  };
}

async function pasoBorrado(
  nombre: string,
  ejecutar: () => PromiseLike<{ error: { message: string } | null }>,
) {
  const { error } = await ejecutar();
  if (error) throw new Error(`Fallo al borrar ${nombre}: ${error.message}`);
}

// Borra en cascada todo lo vinculado al cliente, con UNA excepción: las facturas nunca se borran de
// verdad (numeración correlativa sin huecos exigida por ley — Code de commerce art. A123-12 en FR,
// RD 1619/2012 en ES; ver también /papelera, que tampoco permite el borrado definitivo de facturas).
// El derecho al olvido se satisface anonimizando los datos personales de la factura en vez de
// eliminar la fila — el registro contable/fiscal numerado se conserva. Por eso, a diferencia del
// resto de tablas, ni la factura ni lo que cuelga de ella (movimientos_banco, documento_eventos) se
// borra aquí. El resto del orden está pensado para no dejar huérfanos si algún paso falla a medias:
// primero lo que depende de presupuesto_id/gasto_id, luego lo que depende de visita_id, y las filas
// de visitas al final (todo lo demás las referencia; facturas.visita_id queda a NULL automáticamente).
const BUCKET_GALERIA = 'galeria';

function pathGaleriaDesdeUrl(url: string): string | null {
  const marca = `/storage/v1/object/public/${BUCKET_GALERIA}/`;
  const idx = url.indexOf(marca);
  return idx === -1 ? null : url.slice(idx + marca.length);
}

async function purgarDatosCliente(cliente: Cliente, visitaIdsActivas: string[]) {
  const alcance = await resolverAlcanceCliente(cliente, visitaIdsActivas);
  const visitaIds = alcance.visitaIds;
  const presupuestoIds = alcance.presupuestoIds;
  const facturaIds = alcance.facturaIds;
  const [gas, solicitudesCliente, visitasCompletas] = await Promise.all([
    supabase.from('gastos').select('id, adjunto_url').in('visita_id', visitaIds),
    buscarSolicitudesCliente(cliente),
    supabase.from('visitas').select('id, google_event_id, fotos_previas').in('id', visitaIds),
  ]);
  if (gas.error) throw new Error(`gastos: ${gas.error.message}`);
  if (visitasCompletas.error) throw new Error(`visitas: ${visitasCompletas.error.message}`);

  // Fotos y PDF de la casa del cliente (bucket privado fotos-visita) y eventos de Google Calendar,
  // que llevan nombre, teléfono, dirección y enlaces a esas fotos (auditoría 2026-10-01: no se
  // borraban). Best-effort, como el resto de Storage: un fallo no aborta la purga.
  const rutasFotosVisita = (visitasCompletas.data ?? [])
    .flatMap((v) => (v.fotos_previas as { path: string }[] | null) ?? [])
    .map((f) => f.path)
    .filter(Boolean);
  if (rutasFotosVisita.length > 0) {
    const { error: errorFotos } = await supabase.storage.from('fotos-visita').remove(rutasFotosVisita);
    if (errorFotos) console.warn('No se pudieron borrar todas las fotos de visita en Storage:', errorFotos.message);
  }
  for (const v of visitasCompletas.data ?? []) {
    if (!v.google_event_id) continue;
    try {
      await eliminarEventoVisita(v.google_event_id as string);
    } catch (error) {
      console.warn('No se pudo borrar un evento de Google Calendar del cliente:', (error as Error).message);
    }
  }

  // galeria puede colgar de visita_id, presupuesto_id O factura_id (ver mismo comentario en
  // recopilarDatosCliente) — buscar solo por visita_id dejaba fotos reales sin purgar ni borrar de
  // Storage (bug real, auditoría 2026-09-21).
  const [galPorVisita, galPorPresupuesto, galPorFactura] = await Promise.all([
    supabase.from('galeria').select('id, fotos').in('visita_id', visitaIds),
    presupuestoIds.length
      ? supabase.from('galeria').select('id, fotos').in('presupuesto_id', presupuestoIds)
      : { data: [], error: null },
    facturaIds.length
      ? supabase.from('galeria').select('id, fotos').in('factura_id', facturaIds)
      : { data: [], error: null },
  ]);
  if (galPorVisita.error) throw new Error(`galeria: ${galPorVisita.error.message}`);
  if (galPorPresupuesto.error) throw new Error(`galeria: ${galPorPresupuesto.error.message}`);
  if (galPorFactura.error) throw new Error(`galeria: ${galPorFactura.error.message}`);
  const gal = {
    data: Array.from(
      new Map(
        [...(galPorVisita.data ?? []), ...(galPorPresupuesto.data ?? []), ...(galPorFactura.data ?? [])].map((g) => [g.id, g]),
      ).values(),
    ),
  };

  // Las filas de `galeria`/`gastos` se borran más abajo, pero los ficheros de Storage no se
  // borraban solos (a diferencia de GaleriaDetallePage.tsx, que sí limpia Storage al borrar un
  // proyecto normal) — se quedaban huérfanos incluso en una purga "de verdad" (hallazgo real,
  // revisión 2026-08-12 para galería, 2026-08-14 para justificantes de gastos). Best-effort: un
  // fallo al borrar Storage no debe abortar la purga del resto de datos personales.
  const rutasFotos = (gal.data ?? [])
    .flatMap((g) => (g.fotos as { url: string }[] | null) ?? [])
    .map((f) => pathGaleriaDesdeUrl(f.url))
    .filter((p): p is string => !!p);
  if (rutasFotos.length > 0) {
    const { error: errorStorage } = await supabase.storage.from(BUCKET_GALERIA).remove(rutasFotos);
    if (errorStorage)
      console.warn(
        'No se pudieron borrar todas las fotos de galería en Storage:',
        errorStorage.message,
      );
  }

  // Los justificantes de gastos NO se borran (2026-09-29): son documentos contables que hay que
  // conservar 10 años (Code de commerce L123-22), igual que las facturas. Ver más abajo: los gastos
  // se desvinculan de la visita en vez de borrarse.

  const galeriaIds = gal.data.map((g) => g.id as string);
  const gastoIds = (gas.data ?? []).map((g) => g.id as string);
  const solicitudIds = solicitudesCliente.map((s) => s.id as string);

  if (solicitudIds.length) {
    await pasoBorrado('funnel_eventos (solicitudes)', () =>
      supabase.from('funnel_eventos').delete().in('solicitud_id', solicitudIds),
    );
  }
  if (presupuestoIds.length) {
    await pasoBorrado('funnel_eventos (presupuestos)', () =>
      supabase.from('funnel_eventos').delete().in('presupuesto_id', presupuestoIds),
    );
  }
  if (solicitudIds.length) {
    await pasoBorrado('solicitudes', () =>
      supabase.from('solicitudes').delete().in('id', solicitudIds),
    );
  }
  if (presupuestoIds.length) {
    await pasoBorrado('documento_eventos (presupuestos)', () =>
      supabase
        .from('documento_eventos')
        .delete()
        .eq('documento_tipo', 'presupuesto')
        .in('documento_id', presupuestoIds),
    );
  }
  await pasoBorrado('notas_cliente', () =>
    supabase.from('notas_cliente').delete().in('visita_id', visitaIds),
  );
  await pasoBorrado('proyectos', () =>
    supabase.from('proyectos').delete().in('visita_id', visitaIds),
  );
  if (presupuestoIds.length) {
    await pasoBorrado('proyectos (por presupuesto)', () =>
      supabase.from('proyectos').delete().in('presupuesto_id', presupuestoIds),
    );
    await pasoBorrado('presupuestos', () => supabase.from('presupuestos').delete().in('id', presupuestoIds));
  }
  if (alcance.claves.length) {
    await pasoBorrado('etiquetas del cliente', () =>
      supabase.from('cliente_etiquetas').delete().in('clave', alcance.claves),
    );
  }
  if (facturaIds.length) {
    await pasoBorrado('facturas (anonimizado RGPD)', () =>
      supabase
        .from('facturas')
        .update({
          cliente_nombre: 'Cliente eliminado (RGPD)',
          cliente_dir: null,
          cliente_email: null,
          cliente_tel: null,
        })
        .in('id', facturaIds),
    );
  }
  // Gastos: son gastos reales de la empresa (kilometraje, material), con su asiento, su justificante y
  // a veces su movimiento bancario — la ley obliga a conservarlos 10 años (Code de commerce L123-22).
  // Hasta 2026-09-29 se borraban y se anulaba su contabilidad; ahora solo se desvinculan de la visita
  // y, en el kilometraje, se quita el nombre del cliente de la descripción (auditoría 2026-09-29).
  if (gastoIds.length) {
    await pasoBorrado('gastos (desvinculados)', () =>
      supabase.from('gastos').update({ visita_id: null }).in('id', gastoIds),
    );
    await pasoBorrado('gastos de kilometraje (anonimizados)', () =>
      supabase
        .from('gastos')
        .update({ descripcion: 'Indemnité kilométrique — visita (datos del cliente eliminados, RGPD)' })
        .in('id', gastoIds)
        .not('km', 'is', null),
    );
  }
  // Por id recopilado (visita_id + presupuesto_id + factura_id), no solo visita_id — ver comentario
  // grande más arriba.
  if (galeriaIds.length) {
    await pasoBorrado('galeria', () => supabase.from('galeria').delete().in('id', galeriaIds));
  }
  await pasoBorrado('visitas', () => supabase.from('visitas').delete().in('id', visitaIds));
}

export function ClientePrivacidadTab({ cliente, visitaIds, onPurgado }: ClientePrivacidadTabProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [modalPurgaAbierto, setModalPurgaAbierto] = useState(false);
  const [nombreEscrito, setNombreEscrito] = useState('');

  const nombreCompleto = `${cliente.nombre} ${cliente.apellidos}`.trim();
  const confirmacionValida = nombreEscrito.trim().toLowerCase() === nombreCompleto.toLowerCase();

  const exportarMutation = useMutation({
    mutationFn: () => recopilarDatosCliente(cliente, visitaIds),
    onSuccess: (datos) => {
      const fecha = hoyLocalIso();
      descargarJson(
        `datos-${cliente.apellidos.toLowerCase().replace(/\s+/g, '-')}-${fecha}.json`,
        datos,
      );
      toast.success('Datos exportados');
    },
    onError: (error) => toast.error(mensajeError(error)),
  });

  const purgarMutation = useMutation({
    mutationFn: () => purgarDatosCliente(cliente, visitaIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visitas'] });
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] });
      queryClient.invalidateQueries({ queryKey: ['funnel_eventos'] });
      toast.success('Datos del cliente borrados (las facturas se han anonimizado, no eliminado)');
      setModalPurgaAbierto(false);
      onPurgado();
    },
    onError: (error) => toast.error(mensajeError(error)),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="border border-gray-200 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
          Derecho de acceso (RGPD)
        </p>
        <p className="text-sm text-gray-600 mb-3">
          Descarga en un fichero todos los datos que el CRM tiene guardados de este cliente:
          visitas, notas, planning de obra, presupuestos, facturas, gastos, galería, solicitudes de
          contacto y sus eventos asociados.
        </p>
        <Button
          variant="secondary"
          size="sm"
          disabled={exportarMutation.isPending}
          onClick={() => exportarMutation.mutate()}
        >
          <span className="flex items-center gap-1.5">
            <Download size={14} />
            {exportarMutation.isPending ? 'Reuniendo datos...' : 'Exportar datos'}
          </span>
        </Button>
      </div>

      <div className="border border-red-200 bg-red-50/40 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-600 mb-2">
          Derecho al olvido — irreversible
        </p>
        <p className="text-sm text-gray-600 mb-3">
          Borra para siempre los datos de este cliente en visitas, notas, planning, presupuestos,
          galería y solicitudes de contacto. Las facturas y los gastos se conservan porque la ley
          obliga a guardar los documentos contables 10 años: de las facturas se borran el nombre,
          dirección, email y teléfono del cliente, y los gastos (con sus justificantes) solo se
          desvinculan de sus visitas. También borra las fotos de galería. No se puede deshacer.
        </p>
        <Button variant="danger" size="sm" onClick={() => setModalPurgaAbierto(true)}>
          <span className="flex items-center gap-1.5">
            <ShieldAlert size={14} />
            Purgar todos los datos de este cliente
          </span>
        </Button>
      </div>

      <Modal
        open={modalPurgaAbierto}
        onClose={() => {
          setModalPurgaAbierto(false);
          setNombreEscrito('');
        }}
        title="Purgar todos los datos del cliente"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setModalPurgaAbierto(false);
                setNombreEscrito('');
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={!confirmacionValida || purgarMutation.isPending}
              onClick={() => purgarMutation.mutate()}
            >
              {purgarMutation.isPending ? 'Purgando...' : 'Purgar definitivamente'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600 mb-3">
          Esta acción es irreversible y borra de verdad los datos de{' '}
          <strong>{nombreCompleto}</strong>, salvo sus facturas, que se anonimizan en vez de
          eliminarse (numeración legal). Para confirmar, escribe su nombre completo tal cual:
        </p>
        <Input
          value={nombreEscrito}
          onChange={(e) => setNombreEscrito(e.target.value)}
          placeholder={nombreCompleto}
          autoFocus
        />
      </Modal>
    </div>
  );
}
