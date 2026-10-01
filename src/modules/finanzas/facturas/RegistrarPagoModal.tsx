import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { notaSistema } from '../../../lib/notaSistema';
import { registrarEvento } from '../../../lib/eventos';
import { registrarEventoFunnel } from '../../../lib/funnelTracking';
import { pagosActivosDe, registrarPagoFactura, anularPagoFactura } from '../../../lib/pagosFactura';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../../hooks/useToast';
import { useConfirmar } from '../../../hooks/useConfirm';
import { fechaCorta, hoyLocalIso } from '../../../lib/fechas';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { totalConIvaFactura } from './types';
import type { Factura, PagoFactura } from './types';
import { formatearPrecio } from '../lineas';

function fechaHoy() {
  // Hora local, no UTC (auditoría 2026-09-26: de madrugada daba el día anterior).
  return hoyLocalIso();
}

type RegistrarPagoModalProps = {
  factura: Factura | null;
  onClose: () => void;
};

// Lista + alta/anulación de pagos individuales contra una factura (o de reembolsos, si es una
// rectificativa). La lógica vive en src/lib/pagosFactura.ts: cada pago lleva su propio asiento y
// anular uno reversa solo el de ESE pago (pago_id en asientos_contables).
export function RegistrarPagoModal({ factura, onClose }: RegistrarPagoModalProps) {
  const { user } = useAuth();
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const [fechaPago, setFechaPago] = useState(fechaHoy());
  const [monto, setMonto] = useState(0);

  const nombreUsuarioActual = (user?.user_metadata?.nombre as string) || user?.email || 'Sistema';

  const esRectificativa = factura?.tipo === 'rectificativa';

  const { data: pagos } = useQuery({
    queryKey: ['pagos_factura', factura?.id],
    enabled: !!factura,
    queryFn: () => pagosActivosDe(factura!.id),
  });

  // En valor absoluto: en una rectificativa, el total es negativo y los reembolsos se guardan en
  // negativo (pagosFactura.ts).
  const total = factura ? Math.abs(totalConIvaFactura(factura)) : 0;
  const totalPagado = Math.abs((pagos ?? []).reduce((s, p) => s + p.monto, 0));
  const pendiente = Math.max(0, Math.round((total - totalPagado) * 100) / 100);

  useEffect(() => {
    setFechaPago(fechaHoy());
    setMonto(pendiente);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factura?.id, pagos]);

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['facturas'] });
    queryClient.invalidateQueries({ queryKey: ['factura'] });
    queryClient.invalidateQueries({ queryKey: ['pagos_factura'] });
    queryClient.invalidateQueries({ queryKey: ['asientos_contables'] });
    queryClient.invalidateQueries({ queryKey: ['movimientos_banco'] });
  };

  // El pago y su asiento van juntos (registrarPagoFactura deshace el pago si el asiento falla). Las
  // notas y el embudo van después y un fallo ahí solo avisa: el pago ya está bien registrado.
  const agregarPagoMutation = useMutation({
    mutationFn: async () => {
      if (!factura) return null;
      const { estado_cobro } = await registrarPagoFactura(factura, { fecha: fechaPago, importe: monto, creadoPor: nombreUsuarioActual });
      const texto = esRectificativa ? `Reembolso de ${formatearPrecio(monto)}` : `Pago de ${formatearPrecio(monto)}`;
      try {
        if (factura.visita_id) {
          await notaSistema(factura.visita_id, `${texto} registrado en factura ${factura.numero} por ${nombreUsuarioActual}`);
        }
        await registrarEvento('factura', factura.id, `${texto} registrado (${estado_cobro})`);
        // "Primer acompte cobrado" / "Factura final cobrada" (2026-09-16): la rectificativa no
        // dispara ninguno (es una corrección, no un cobro que cierre nada).
        if (estado_cobro === 'Cobrada' && factura.presupuesto_id) {
          if (factura.tipo === 'acompte') {
            await registrarEventoFunnel('primer_acompte_cobrado', { presupuestoId: factura.presupuesto_id });
          } else if (factura.tipo === 'normal') {
            await registrarEventoFunnel('factura_final_cobrada', { presupuestoId: factura.presupuesto_id });
          }
        }
      } catch (error) {
        toast.warning(`${texto} registrado, pero falló la nota o el historial: ${(error as Error).message}`);
      }
      return estado_cobro;
    },
    onSuccess: () => toast.success(esRectificativa ? 'Reembolso registrado' : 'Pago registrado'),
    onError: (error) => toast.error(error.message),
    onSettled: invalidar,
  });

  const eliminarPagoMutation = useMutation({
    mutationFn: async (pago: PagoFactura) => {
      await anularPagoFactura(factura!, pago.id, nombreUsuarioActual);
      try {
        await registrarEvento(
          'factura',
          factura!.id,
          `${esRectificativa ? 'Reembolso' : 'Pago'} de ${formatearPrecio(Math.abs(pago.monto))} (${fechaCorta(pago.fecha)}) anulado por ${nombreUsuarioActual}`,
        );
      } catch (error) {
        toast.warning(`Anulado, pero no se pudo anotar en el historial: ${(error as Error).message}`);
      }
    },
    onSuccess: () => toast.success(esRectificativa ? 'Reembolso anulado' : 'Pago anulado'),
    onError: (error) => toast.error(error.message),
    onSettled: invalidar,
  });

  if (!factura) return null;

  const handleEliminarPago = async (pago: PagoFactura) => {
    const confirmado = await confirmar({
      mensaje: `¿Anular el ${esRectificativa ? 'reembolso' : 'pago'} de ${formatearPrecio(Math.abs(pago.monto))} del ${fechaCorta(pago.fecha)}? Su asiento se corregirá en el libro diario y, si venía de un movimiento bancario, ese movimiento vuelve a quedar pendiente.`,
      textoConfirmar: 'Anular',
      peligroso: true,
    });
    if (!confirmado) return;
    eliminarPagoMutation.mutate(pago);
  };

  return (
    <Modal
      open={!!factura}
      onClose={onClose}
      title={`${esRectificativa ? 'Reembolsos' : 'Pagos'} — ${factura.numero ?? ''}`}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Total: <span className="font-medium text-gray-900">{formatearPrecio(total)}</span> ·{' '}
          {esRectificativa ? 'Reembolsado' : 'Pagado'}: <span className="font-medium text-gray-900">{formatearPrecio(totalPagado)}</span> · Pendiente:{' '}
          <span className="font-medium text-gray-900">{formatearPrecio(pendiente)}</span>
        </p>

        {pagos && pagos.length > 0 && (
          <div className="border border-gray-200 rounded-sm divide-y divide-gray-100">
            {pagos.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-gray-700">
                  {fechaCorta(p.fecha)} — <span className="font-medium text-gray-900">{formatearPrecio(Math.abs(p.monto))}</span>
                </span>
                <button
                  onClick={() => handleEliminarPago(p)}
                  disabled={eliminarPagoMutation.isPending}
                  className="text-gray-400 hover:text-red-600"
                  title="Anular"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {pendiente > 0.01 ? (
          <div className="space-y-3 border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {esRectificativa ? 'Registrar un reembolso al cliente' : 'Registrar un nuevo pago'}
            </p>
            {esRectificativa && (
              <p className="text-xs text-gray-500">
                Solo si se ha devuelto dinero al cliente. Si la factura original no estaba cobrada, la rectificativa ya
                queda aplicada sin reembolso.
              </p>
            )}
            <Input label={esRectificativa ? 'Fecha del reembolso' : 'Fecha del pago'} type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
            <Input
              label="Monto"
              type="number"
              value={monto}
              onChange={(e) => setMonto(Number(e.target.value))}
              hint={
                monto < pendiente - 0.01
                  ? 'Menor que lo pendiente: quedará "Cobrada parcialmente".'
                  : monto > pendiente + 0.01
                    ? `Mayor que lo pendiente (${formatearPrecio(pendiente)}) — revisa el importe antes de guardar.`
                    : undefined
              }
            />
            <Button onClick={() => agregarPagoMutation.mutate()} disabled={agregarPagoMutation.isPending || monto <= 0}>
              {agregarPagoMutation.isPending ? 'Guardando...' : esRectificativa ? 'Añadir reembolso' : 'Añadir pago'}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-brand font-medium border-t border-gray-100 pt-3">
            {esRectificativa ? 'Rectificativa totalmente reembolsada.' : 'Factura totalmente cobrada.'}
          </p>
        )}
      </div>
    </Modal>
  );
}
