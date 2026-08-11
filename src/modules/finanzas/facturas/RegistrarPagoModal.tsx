import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { notaSistema } from '../../../lib/notaSistema';
import { registrarEvento } from '../../../lib/eventos';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../../hooks/useToast';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import type { Factura } from './types';

function fechaHoy() {
  return new Date().toISOString().slice(0, 10);
}

function totalFactura(f: Factura) {
  return f.lineas.reduce((s, l) => s + (l.es_incluido ? 0 : l.total_con_iva), 0);
}

type RegistrarPagoModalProps = {
  factura: Factura | null;
  onClose: () => void;
};

export function RegistrarPagoModal({ factura, onClose }: RegistrarPagoModalProps) {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [fechaPago, setFechaPago] = useState(fechaHoy());
  const [monto, setMonto] = useState(0);

  const nombreUsuarioActual = (user?.user_metadata?.nombre as string) || user?.email || 'Sistema';

  useEffect(() => {
    if (factura) {
      setFechaPago(factura.fecha_pago ?? fechaHoy());
      setMonto(factura.monto_pagado ?? totalFactura(factura));
    }
  }, [factura]);

  const registrarMutation = useMutation({
    mutationFn: async () => {
      if (!factura) return;
      const total = totalFactura(factura);
      const estado_cobro = monto >= total - 0.01 ? 'Cobrada' : 'Cobrada parcialmente';
      const { error } = await supabase
        .from('facturas')
        .update({ fecha_pago: fechaPago, monto_pagado: monto, estado_cobro })
        .eq('id', factura.id);
      if (error) throw error;
      if (factura.visita_id) {
        await notaSistema(
          factura.visita_id,
          `Pago de ${monto.toFixed(2)} € registrado en factura ${factura.numero} por ${nombreUsuarioActual}`,
        );
      }
      await registrarEvento('factura', factura.id, `Pago registrado: ${monto.toFixed(2)} € (${estado_cobro})`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturas'] });
      toast.success('Pago registrado');
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  if (!factura) return null;

  const total = totalFactura(factura);

  return (
    <Modal
      open={!!factura}
      onClose={onClose}
      title={`Registrar pago — ${factura.numero ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => registrarMutation.mutate()} disabled={registrarMutation.isPending}>
            {registrarMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-500">Total de la factura: {total.toFixed(2)} €</p>
        <Input label="Fecha del pago" type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
        <Input
          label="Monto pagado"
          type="number"
          value={monto}
          onChange={(e) => setMonto(Number(e.target.value))}
          hint={monto < total - 0.01 ? 'Menor que el total: quedará marcada como "Cobrada parcialmente".' : undefined}
        />
      </div>
    </Modal>
  );
}
