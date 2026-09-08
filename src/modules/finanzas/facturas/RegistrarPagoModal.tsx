import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { notaSistema } from '../../../lib/notaSistema';
import { registrarEvento } from '../../../lib/eventos';
import { registrarEventoFunnel } from '../../../lib/funnelTracking';
import { registrarAsientoFacturaCobro, rectificarAsientos } from '../../../lib/asientosContables';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../../hooks/useToast';
import { useConfirmar } from '../../../hooks/useConfirm';
import { fechaCorta } from '../../../lib/fechas';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { totalConIvaFactura, estadoCobroDePagos } from './types';
import type { Factura, PagoFactura } from './types';

function fechaHoy() {
  return new Date().toISOString().slice(0, 10);
}

type RegistrarPagoModalProps = {
  factura: Factura | null;
  onClose: () => void;
};

// Lista + alta/baja de pagos individuales contra una factura, en vez de un único formulario que
// sobrescribía monto_pagado/fecha_pago cada vez (2026-09-08, ver comentario en facturas/types.ts).
// Cada pago que entra genera su propio asiento de cobro (nunca reversa los anteriores); eliminar un
// pago concreto reversa solo el asiento de ESE pago (pago_id en asientos_contables).
export function RegistrarPagoModal({ factura, onClose }: RegistrarPagoModalProps) {
  const { user } = useAuth();
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const [fechaPago, setFechaPago] = useState(fechaHoy());
  const [monto, setMonto] = useState(0);

  const nombreUsuarioActual = (user?.user_metadata?.nombre as string) || user?.email || 'Sistema';

  const { data: pagos } = useQuery({
    queryKey: ['pagos_factura', factura?.id],
    enabled: !!factura,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pagos_factura')
        .select('*')
        .eq('factura_id', factura!.id)
        .order('fecha', { ascending: false });
      if (error) throw error;
      return data as PagoFactura[];
    },
  });

  const total = factura ? totalConIvaFactura(factura) : 0;
  const totalPagado = (pagos ?? []).reduce((s, p) => s + p.monto, 0);
  const pendiente = Math.max(0, Math.round((total - totalPagado) * 100) / 100);

  useEffect(() => {
    setFechaPago(fechaHoy());
    setMonto(pendiente);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factura?.id, pagos]);

  const agregarPagoMutation = useMutation({
    mutationFn: async () => {
      if (!factura) return null;
      const { data: nuevoPago, error } = await supabase
        .from('pagos_factura')
        .insert({ factura_id: factura.id, fecha: fechaPago, monto, creado_por: nombreUsuarioActual })
        .select()
        .single();
      if (error) throw error;
      const nuevoTotalPagado = Math.round((totalPagado + monto) * 100) / 100;
      const estado_cobro = estadoCobroDePagos(nuevoTotalPagado, total);
      const { error: errorFactura } = await supabase
        .from('facturas')
        .update({ fecha_pago: fechaPago, monto_pagado: nuevoTotalPagado, estado_cobro })
        .eq('id', factura.id);
      if (errorFactura) throw errorFactura;
      if (factura.visita_id) {
        await notaSistema(
          factura.visita_id,
          `Pago de ${monto.toFixed(2)} € registrado en factura ${factura.numero} por ${nombreUsuarioActual}`,
        );
      }
      await registrarEvento('factura', factura.id, `Pago registrado: ${monto.toFixed(2)} € (${estado_cobro})`);
      if (estado_cobro === 'Cobrada' && factura.presupuesto_id) {
        await registrarEventoFunnel('factura_cobrada', { presupuestoId: factura.presupuesto_id });
      }
      return nuevoPago as PagoFactura;
    },
    onSuccess: async (nuevoPago) => {
      queryClient.invalidateQueries({ queryKey: ['facturas'] });
      queryClient.invalidateQueries({ queryKey: ['pagos_factura', factura?.id] });
      toast.success('Pago registrado');
      // Solo facturas de Francia van al libro diario (PCG). estructura_anterior (2026-08-22): cobro
      // de una empresa anterior a la EURL, no es ingreso real — no genera apunte. Cada pago genera
      // SU PROPIO asiento (nunca reversa los anteriores — a diferencia de antes, un pago nuevo es
      // aditivo, no una corrección del total).
      if (factura && nuevoPago && factura.pais === 'Francia' && !factura.estructura_anterior) {
        queryClient.invalidateQueries({ queryKey: ['asientos_contables'] });
        try {
          await registrarAsientoFacturaCobro(
            { id: factura.id, numero: factura.numero, cliente_nombre: factura.cliente_nombre },
            monto,
            fechaPago,
            nuevoPago.id,
          );
        } catch (error) {
          toast.warning(`Pago guardado, pero no se pudo registrar en el libro diario: ${(error as Error).message}`);
        }
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const eliminarPagoMutation = useMutation({
    mutationFn: async (pago: PagoFactura) => {
      const { error } = await supabase.from('pagos_factura').delete().eq('id', pago.id);
      if (error) throw error;
      const restantes = (pagos ?? []).filter((p) => p.id !== pago.id);
      const nuevoTotalPagado = Math.round(restantes.reduce((s, p) => s + p.monto, 0) * 100) / 100;
      const estado_cobro = estadoCobroDePagos(nuevoTotalPagado, total);
      const ultimaFecha = restantes.reduce<string | null>((max, p) => (!max || p.fecha > max ? p.fecha : max), null);
      const { error: errorFactura } = await supabase
        .from('facturas')
        .update({ monto_pagado: nuevoTotalPagado > 0 ? nuevoTotalPagado : null, fecha_pago: ultimaFecha, estado_cobro })
        .eq('id', factura!.id);
      if (errorFactura) throw errorFactura;
      await registrarEvento('factura', factura!.id, `Pago de ${pago.monto.toFixed(2)} € (${fechaCorta(pago.fecha)}) eliminado por ${nombreUsuarioActual}`);
      return pago;
    },
    onSuccess: async (pago) => {
      queryClient.invalidateQueries({ queryKey: ['facturas'] });
      queryClient.invalidateQueries({ queryKey: ['pagos_factura', factura?.id] });
      toast.success('Pago eliminado');
      if (factura && factura.pais === 'Francia' && !factura.estructura_anterior) {
        queryClient.invalidateQueries({ queryKey: ['asientos_contables'] });
        try {
          // pagoId: solo reversa el asiento de ESTE pago, deja intactos los demás cobros de la
          // misma factura.
          await rectificarAsientos('factura', factura.id, 'cobro', pago.id);
        } catch (error) {
          toast.warning(`Pago eliminado, pero no se pudo corregir el libro diario: ${(error as Error).message}`);
        }
      }
    },
    onError: (error) => toast.error(error.message),
  });

  if (!factura) return null;

  const handleEliminarPago = async (pago: PagoFactura) => {
    const confirmado = await confirmar({
      mensaje: `¿Eliminar el pago de ${pago.monto.toFixed(2)} € del ${fechaCorta(pago.fecha)}? Esta acción no se puede deshacer.`,
      textoConfirmar: 'Eliminar pago',
      peligroso: true,
    });
    if (!confirmado) return;
    eliminarPagoMutation.mutate(pago);
  };

  return (
    <Modal
      open={!!factura}
      onClose={onClose}
      title={`Pagos — ${factura.numero ?? ''}`}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Total: <span className="font-medium text-gray-900">{total.toFixed(2)} €</span> · Pagado:{' '}
          <span className="font-medium text-gray-900">{totalPagado.toFixed(2)} €</span> · Pendiente:{' '}
          <span className="font-medium text-gray-900">{pendiente.toFixed(2)} €</span>
        </p>

        {pagos && pagos.length > 0 && (
          <div className="border border-gray-200 rounded-sm divide-y divide-gray-100">
            {pagos.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-gray-700">
                  {fechaCorta(p.fecha)} — <span className="font-medium text-gray-900">{p.monto.toFixed(2)} €</span>
                </span>
                <button
                  onClick={() => handleEliminarPago(p)}
                  disabled={eliminarPagoMutation.isPending}
                  className="text-gray-400 hover:text-red-600"
                  title="Eliminar este pago"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {pendiente > 0.01 ? (
          <div className="space-y-3 border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Registrar un nuevo pago</p>
            <Input label="Fecha del pago" type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
            <Input
              label="Monto"
              type="number"
              value={monto}
              onChange={(e) => setMonto(Number(e.target.value))}
              hint={monto < pendiente - 0.01 ? 'Menor que lo pendiente: quedará "Cobrada parcialmente".' : undefined}
            />
            <Button onClick={() => agregarPagoMutation.mutate()} disabled={agregarPagoMutation.isPending || monto <= 0}>
              {agregarPagoMutation.isPending ? 'Guardando...' : 'Añadir pago'}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-brand font-medium border-t border-gray-100 pt-3">Factura totalmente cobrada.</p>
        )}
      </div>
    </Modal>
  );
}
