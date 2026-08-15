import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { mensajeError } from '../../lib/mensajeError';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { normalizarTelefono } from './types';
import type { Cliente } from './types';

// solicitudes no cuelga de visita_id (llega antes de que exista una visita) — se localiza por
// teléfono/email del cliente, cruzando todas sus visitas por si contactó con datos distintos
// en cada una. Mismo criterio de normalización que pipelineSync.ts/documenso-webhook.
function datosContactoCliente(cliente: Cliente) {
  const telefonos = new Set(
    [cliente.telefono, ...cliente.visitas.map((v) => v.telefono)].filter(Boolean).map((t) => normalizarTelefono(t as string)),
  );
  const emails = new Set(
    [cliente.email, ...cliente.visitas.map((v) => v.email)].filter((e): e is string => !!e).map((e) => e.toLowerCase()),
  );
  return { telefonos, emails };
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
// visita_id, más documento_eventos/movimientos_banco que cuelgan de presupuesto_id/factura_id/gasto_id,
// más solicitudes (localizadas por teléfono/email, no por visita_id) y sus funnel_eventos.
async function recopilarDatosCliente(cliente: Cliente, visitaIds: string[]) {
  const [visitas, notas, proyectos, presupuestos, facturas, gastos, galeria, solicitudes] = await Promise.all([
    supabase.from('visitas').select('*').in('id', visitaIds),
    supabase.from('notas_cliente').select('*').in('visita_id', visitaIds),
    supabase.from('proyectos').select('*').in('visita_id', visitaIds),
    supabase.from('presupuestos').select('*').in('visita_id', visitaIds),
    supabase.from('facturas').select('*').in('visita_id', visitaIds),
    supabase.from('gastos').select('*').in('visita_id', visitaIds),
    supabase.from('galeria').select('*').in('visita_id', visitaIds),
    buscarSolicitudesCliente(cliente).then((data) => ({ data, error: null as { message: string } | null })),
  ]);

  const resultados = { visitas, notas, proyectos, presupuestos, facturas, gastos, galeria, solicitudes };
  for (const [nombre, res] of Object.entries(resultados)) {
    if (res.error) throw new Error(`${nombre}: ${res.error.message}`);
  }

  const presupuestoIds = (presupuestos.data ?? []).map((p) => p.id as string);
  const facturaIds = (facturas.data ?? []).map((f) => f.id as string);
  const gastoIds = (gastos.data ?? []).map((g) => g.id as string);
  const solicitudIds = (solicitudes.data ?? []).map((s) => s.id as string);

  const eventosPresupuesto = presupuestoIds.length
    ? await supabase.from('documento_eventos').select('*').eq('documento_tipo', 'presupuesto').in('documento_id', presupuestoIds)
    : { data: [], error: null };
  if (eventosPresupuesto.error) throw new Error(`documento_eventos (presupuestos): ${eventosPresupuesto.error.message}`);

  const eventosFactura = facturaIds.length
    ? await supabase.from('documento_eventos').select('*').eq('documento_tipo', 'factura').in('documento_id', facturaIds)
    : { data: [], error: null };
  if (eventosFactura.error) throw new Error(`documento_eventos (facturas): ${eventosFactura.error.message}`);

  const movimientosFactura = facturaIds.length
    ? await supabase.from('movimientos_banco').select('*').in('factura_id', facturaIds)
    : { data: [], error: null };
  if (movimientosFactura.error) throw new Error(`movimientos_banco (facturas): ${movimientosFactura.error.message}`);

  const movimientosGasto = gastoIds.length
    ? await supabase.from('movimientos_banco').select('*').in('gasto_id', gastoIds)
    : { data: [], error: null };
  if (movimientosGasto.error) throw new Error(`movimientos_banco (gastos): ${movimientosGasto.error.message}`);

  const eventosFunnelSolicitud = solicitudIds.length
    ? await supabase.from('funnel_eventos').select('*').in('solicitud_id', solicitudIds)
    : { data: [], error: null };
  if (eventosFunnelSolicitud.error) throw new Error(`funnel_eventos (solicitudes): ${eventosFunnelSolicitud.error.message}`);

  const eventosFunnelPresupuesto = presupuestoIds.length
    ? await supabase.from('funnel_eventos').select('*').in('presupuesto_id', presupuestoIds)
    : { data: [], error: null };
  if (eventosFunnelPresupuesto.error) throw new Error(`funnel_eventos (presupuestos): ${eventosFunnelPresupuesto.error.message}`);

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
        [...(eventosFunnelSolicitud.data ?? []), ...(eventosFunnelPresupuesto.data ?? [])].map((e) => [e.id, e]),
      ).values(),
    ),
    documento_eventos: [...(eventosPresupuesto.data ?? []), ...(eventosFactura.data ?? [])],
    movimientos_banco: [...(movimientosFactura.data ?? []), ...(movimientosGasto.data ?? [])],
  };
}

async function pasoBorrado(nombre: string, ejecutar: () => PromiseLike<{ error: { message: string } | null }>) {
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
const BUCKET_JUSTIFICANTES = 'justificantes';

function pathGaleriaDesdeUrl(url: string): string | null {
  const marca = `/storage/v1/object/public/${BUCKET_GALERIA}/`;
  const idx = url.indexOf(marca);
  return idx === -1 ? null : url.slice(idx + marca.length);
}

async function purgarDatosCliente(cliente: Cliente, visitaIds: string[]) {
  const [presus, facs, gas, gal, solicitudesCliente] = await Promise.all([
    supabase.from('presupuestos').select('id').in('visita_id', visitaIds),
    supabase.from('facturas').select('id').in('visita_id', visitaIds),
    supabase.from('gastos').select('id, adjunto_url').in('visita_id', visitaIds),
    supabase.from('galeria').select('fotos').in('visita_id', visitaIds),
    buscarSolicitudesCliente(cliente),
  ]);
  if (presus.error) throw new Error(`presupuestos: ${presus.error.message}`);
  if (facs.error) throw new Error(`facturas: ${facs.error.message}`);
  if (gas.error) throw new Error(`gastos: ${gas.error.message}`);
  if (gal.error) throw new Error(`galeria: ${gal.error.message}`);

  // Las filas de `galeria`/`gastos` se borran más abajo, pero los ficheros de Storage no se
  // borraban solos (a diferencia de GaleriaDetalleModal.tsx, que sí limpia Storage al borrar un
  // proyecto normal) — se quedaban huérfanos incluso en una purga "de verdad" (hallazgo real,
  // revisión 2026-08-12 para galería, 2026-08-14 para justificantes de gastos). Best-effort: un
  // fallo al borrar Storage no debe abortar la purga del resto de datos personales.
  const rutasFotos = (gal.data ?? [])
    .flatMap((g) => (g.fotos as { url: string }[] | null) ?? [])
    .map((f) => pathGaleriaDesdeUrl(f.url))
    .filter((p): p is string => !!p);
  if (rutasFotos.length > 0) {
    const { error: errorStorage } = await supabase.storage.from(BUCKET_GALERIA).remove(rutasFotos);
    if (errorStorage) console.warn('No se pudieron borrar todas las fotos de galería en Storage:', errorStorage.message);
  }

  // `gastos.adjunto_url` ya guarda el path del bucket privado directamente (no una URL pública que
  // haya que recortar, a diferencia de galería) — ver GastoForm.tsx.
  const rutasJustificantes = (gas.data ?? []).map((g) => g.adjunto_url as string | null).filter((p): p is string => !!p);
  if (rutasJustificantes.length > 0) {
    const { error: errorStorage } = await supabase.storage.from(BUCKET_JUSTIFICANTES).remove(rutasJustificantes);
    if (errorStorage) console.warn('No se pudieron borrar todos los justificantes de gastos en Storage:', errorStorage.message);
  }

  const presupuestoIds = (presus.data ?? []).map((p) => p.id as string);
  const facturaIds = (facs.data ?? []).map((f) => f.id as string);
  const gastoIds = (gas.data ?? []).map((g) => g.id as string);
  const solicitudIds = solicitudesCliente.map((s) => s.id as string);

  if (solicitudIds.length) {
    await pasoBorrado('funnel_eventos (solicitudes)', () => supabase.from('funnel_eventos').delete().in('solicitud_id', solicitudIds));
  }
  if (presupuestoIds.length) {
    await pasoBorrado('funnel_eventos (presupuestos)', () =>
      supabase.from('funnel_eventos').delete().in('presupuesto_id', presupuestoIds),
    );
  }
  if (solicitudIds.length) {
    await pasoBorrado('solicitudes', () => supabase.from('solicitudes').delete().in('id', solicitudIds));
  }
  if (gastoIds.length) {
    await pasoBorrado('movimientos_banco (gastos)', () => supabase.from('movimientos_banco').delete().in('gasto_id', gastoIds));
  }
  if (presupuestoIds.length) {
    await pasoBorrado('documento_eventos (presupuestos)', () =>
      supabase.from('documento_eventos').delete().eq('documento_tipo', 'presupuesto').in('documento_id', presupuestoIds),
    );
  }
  await pasoBorrado('notas_cliente', () => supabase.from('notas_cliente').delete().in('visita_id', visitaIds));
  await pasoBorrado('proyectos', () => supabase.from('proyectos').delete().in('visita_id', visitaIds));
  await pasoBorrado('presupuestos', () => supabase.from('presupuestos').delete().in('visita_id', visitaIds));
  if (facturaIds.length) {
    await pasoBorrado('facturas (anonimizado RGPD)', () =>
      supabase
        .from('facturas')
        .update({ cliente_nombre: 'Cliente eliminado (RGPD)', cliente_dir: null, cliente_email: null, cliente_tel: null })
        .in('id', facturaIds),
    );
  }
  await pasoBorrado('gastos', () => supabase.from('gastos').delete().in('visita_id', visitaIds));
  await pasoBorrado('galeria', () => supabase.from('galeria').delete().in('visita_id', visitaIds));
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
      const fecha = new Date().toISOString().slice(0, 10);
      descargarJson(`datos-${cliente.apellidos.toLowerCase().replace(/\s+/g, '-')}-${fecha}.json`, datos);
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
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Derecho de acceso (RGPD)</p>
        <p className="text-sm text-gray-600 mb-3">
          Descarga en un fichero todos los datos que el CRM tiene guardados de este cliente: visitas, notas,
          planning de obra, presupuestos, facturas, gastos, galería, solicitudes de contacto y sus eventos
          asociados.
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
        <p className="text-xs font-semibold uppercase tracking-widest text-red-600 mb-2">Derecho al olvido — irreversible</p>
        <p className="text-sm text-gray-600 mb-3">
          Borra para siempre los datos de este cliente en visitas, notas, planning, presupuestos, gastos,
          galería y solicitudes de contacto. Las facturas son la única excepción: por ley la numeración debe
          quedar completa y sin huecos,
          así que no se eliminan — se anonimizan (el nombre, dirección, email y teléfono del cliente se borran de
          la factura, pero el registro numerado se conserva). También borra las fotos de galería y los
          justificantes de gastos guardados en el almacenamiento. No se puede deshacer.
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
          Esta acción es irreversible y borra de verdad los datos de <strong>{nombreCompleto}</strong>, salvo sus
          facturas, que se anonimizan en vez de eliminarse (numeración legal). Para confirmar, escribe su nombre
          completo tal cual:
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
