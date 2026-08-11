import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { mensajeError } from '../../lib/mensajeError';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import type { Cliente } from './types';

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
// visita_id, más documento_eventos/movimientos_banco que cuelgan de presupuesto_id/factura_id/gasto_id.
async function recopilarDatosCliente(visitaIds: string[]) {
  const [visitas, notas, proyectos, presupuestos, facturas, gastos, galeria] = await Promise.all([
    supabase.from('visitas').select('*').in('id', visitaIds),
    supabase.from('notas_cliente').select('*').in('visita_id', visitaIds),
    supabase.from('proyectos').select('*').in('visita_id', visitaIds),
    supabase.from('presupuestos').select('*').in('visita_id', visitaIds),
    supabase.from('facturas').select('*').in('visita_id', visitaIds),
    supabase.from('gastos').select('*').in('visita_id', visitaIds),
    supabase.from('galeria').select('*').in('visita_id', visitaIds),
  ]);

  const resultados = { visitas, notas, proyectos, presupuestos, facturas, gastos, galeria };
  for (const [nombre, res] of Object.entries(resultados)) {
    if (res.error) throw new Error(`${nombre}: ${res.error.message}`);
  }

  const presupuestoIds = (presupuestos.data ?? []).map((p) => p.id as string);
  const facturaIds = (facturas.data ?? []).map((f) => f.id as string);
  const gastoIds = (gastos.data ?? []).map((g) => g.id as string);

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

  return {
    exportado_en: new Date().toISOString(),
    visitas: visitas.data ?? [],
    notas_cliente: notas.data ?? [],
    proyectos: proyectos.data ?? [],
    presupuestos: presupuestos.data ?? [],
    facturas: facturas.data ?? [],
    gastos: gastos.data ?? [],
    galeria: galeria.data ?? [],
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
async function purgarDatosCliente(visitaIds: string[]) {
  const [presus, facs, gas] = await Promise.all([
    supabase.from('presupuestos').select('id').in('visita_id', visitaIds),
    supabase.from('facturas').select('id').in('visita_id', visitaIds),
    supabase.from('gastos').select('id').in('visita_id', visitaIds),
  ]);
  if (presus.error) throw new Error(`presupuestos: ${presus.error.message}`);
  if (facs.error) throw new Error(`facturas: ${facs.error.message}`);
  if (gas.error) throw new Error(`gastos: ${gas.error.message}`);

  const presupuestoIds = (presus.data ?? []).map((p) => p.id as string);
  const facturaIds = (facs.data ?? []).map((f) => f.id as string);
  const gastoIds = (gas.data ?? []).map((g) => g.id as string);

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
    mutationFn: () => recopilarDatosCliente(visitaIds),
    onSuccess: (datos) => {
      const fecha = new Date().toISOString().slice(0, 10);
      descargarJson(`datos-${cliente.apellidos.toLowerCase().replace(/\s+/g, '-')}-${fecha}.json`, datos);
      toast.success('Datos exportados');
    },
    onError: (error) => toast.error(mensajeError(error)),
  });

  const purgarMutation = useMutation({
    mutationFn: () => purgarDatosCliente(visitaIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visitas'] });
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
          planning de obra, presupuestos, facturas, gastos, galería y sus eventos asociados.
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
          Borra para siempre los datos de este cliente en visitas, notas, planning, presupuestos, gastos y
          galería. Las facturas son la única excepción: por ley la numeración debe quedar completa y sin huecos,
          así que no se eliminan — se anonimizan (el nombre, dirección, email y teléfono del cliente se borran de
          la factura, pero el registro numerado se conserva). No se puede deshacer. Las fotos y justificantes
          adjuntos en el almacenamiento no se borran automáticamente — se quedan huérfanos y hay que limpiarlos
          a mano si hace falta.
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
