import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { totalConIvaFactura, estadoCobroDePagos } from '../finanzas/facturas/types';
import type { Factura } from '../finanzas/facturas/types';
import type { MovimientoBanco } from './types';
import { registrarEvento } from '../../lib/eventos';
import { registrarAsientoFacturaCobro } from '../../lib/asientosContables';

function totalFactura(f: Factura) {
  return totalConIvaFactura(f);
}

type VincularFacturaModalProps = {
  movimiento: MovimientoBanco | null;
  onClose: () => void;
};

export function VincularFacturaModal({ movimiento, onClose }: VincularFacturaModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState('');

  const { data: facturas, isLoading } = useQuery({
    queryKey: ['facturas', 'pendientes-vinculo'],
    enabled: !!movimiento,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facturas')
        .select('*')
        .is('eliminado_en', null)
        .in('estado_cobro', ['Pendiente', 'Cobrada parcialmente', 'Vencida'])
        .order('fecha_factura', { ascending: false });
      if (error) throw error;
      return data as Factura[];
    },
  });

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = facturas ?? [];
    const conCoincidencia = lista.filter(
      (f) => !q || `${f.numero} ${f.cliente_nombre} ${f.titulo}`.toLowerCase().includes(q),
    );
    // Las que se acercan al importe del movimiento suben primero — ayuda a encontrar la correcta
    // sin tener que leer el total de cada una.
    if (!movimiento) return conCoincidencia;
    return [...conCoincidencia].sort(
      (a, b) => Math.abs(totalFactura(a) - movimiento.importe) - Math.abs(totalFactura(b) - movimiento.importe),
    );
  }, [facturas, busqueda, movimiento]);

  const vincularMutation = useMutation({
    mutationFn: async (factura: Factura) => {
      if (!movimiento) return null;
      // Un movimiento bancario conciliado es un pago real — mismo modelo que RegistrarPagoModal.tsx
      // (pagos_factura, un pago = una fila): antes esto sobrescribía facturas.monto_pagado/
      // fecha_pago directamente, así que un cobro conciliado por banco (la vía más fiable de
      // todas) quedaba invisible para el Libro de Ingresos/Resultado/Dashboard/Asistente de IVA en
      // cuanto esas pantallas empezaron a leer pagos_factura (hallazgo real, auditoría 2026-09-08).
      const { data: nuevoPago, error: errorPago } = await supabase
        .from('pagos_factura')
        .insert({ factura_id: factura.id, fecha: movimiento.fecha, monto: movimiento.importe, creado_por: 'Conciliación bancaria (OFX)' })
        .select()
        .single();
      if (errorPago) throw errorPago;

      const { data: pagosFactura, error: errorPagos } = await supabase.from('pagos_factura').select('monto').eq('factura_id', factura.id);
      if (errorPagos) throw errorPagos;
      const totalPagado = Math.round((pagosFactura ?? []).reduce((s, p) => s + p.monto, 0) * 100) / 100;
      const estado_cobro = estadoCobroDePagos(totalPagado, totalFactura(factura));

      const { error: errorFactura } = await supabase
        .from('facturas')
        .update({ fecha_pago: movimiento.fecha, monto_pagado: totalPagado, estado_cobro })
        .eq('id', factura.id);
      if (errorFactura) throw errorFactura;

      const { error: errorMovimiento } = await supabase
        .from('movimientos_banco')
        .update({ estado: 'Vinculado', factura_id: factura.id, pago_id: nuevoPago.id })
        .eq('id', movimiento.id);
      if (errorMovimiento) throw errorMovimiento;

      await registrarEvento(
        'factura',
        factura.id,
        `Pago de ${movimiento.importe.toFixed(2)} € vinculado automáticamente desde movimiento bancario importado (OFX)`,
      );

      return { factura, pagoId: nuevoPago.id as string };
    },
    onSuccess: async (resultado) => {
      if (!resultado || !movimiento) {
        onClose();
        return;
      }
      const { factura, pagoId } = resultado;
      queryClient.invalidateQueries({ queryKey: ['facturas'] });
      queryClient.invalidateQueries({ queryKey: ['pagos_factura', factura.id] });
      queryClient.invalidateQueries({ queryKey: ['movimientos_banco'] });
      toast.success('Factura marcada como cobrada y movimiento vinculado');
      // Solo facturas de Francia van al libro diario (PCG). Sin esto, un cobro conciliado por
      // banco quedaba invisible para el Libro Diario/Mayor y la Liasse Fiscale, sin que el KPI de
      // "Descuadre" pudiera detectarlo — cada grupo de asiento cuadra por construcción, así que un
      // cobro que nunca se registró no descuadra nada, solo falta (bug real corregido 2026-08-18).
      // estructura_anterior (2026-08-22): cobro de una empresa anterior a la EURL, no es ingreso
      // real de la EURL — no genera apunte. Se espera (await) antes de cerrar el modal, misma
      // razón que en el resto de esta ronda: un fallo debe verse mientras el modal sigue abierto.
      if (factura.pais === 'Francia' && !factura.estructura_anterior) {
        queryClient.invalidateQueries({ queryKey: ['asientos_contables'] });
        try {
          await registrarAsientoFacturaCobro(
            { id: factura.id, numero: factura.numero, cliente_nombre: factura.cliente_nombre },
            movimiento.importe,
            movimiento.fecha,
            pagoId,
          );
        } catch (error) {
          toast.warning(`Pago vinculado, pero no se pudo registrar en el libro diario: ${(error as Error).message}`);
        }
      }
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Modal open={!!movimiento} onClose={onClose} title="Vincular a una factura" size="lg">
      {movimiento && (
        <>
          <p className="text-sm text-gray-500 mb-3">
            Movimiento: <span className="font-medium text-gray-800">{movimiento.descripcion}</span> ·{' '}
            {movimiento.fecha} · <span className="font-medium text-brand">{movimiento.importe.toFixed(2)} €</span>
          </p>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por cliente, número o título"
              className="w-full border border-gray-200 rounded-sm pl-8 pr-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
            />
          </div>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {isLoading && <p className="text-sm text-gray-400 py-4 text-center">Cargando facturas...</p>}
            {!isLoading && filtradas.length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">No hay facturas pendientes de cobro que coincidan.</p>
            )}
            {filtradas.map((f) => {
              const total = totalFactura(f);
              const diferencia = Math.abs(total - movimiento.importe);
              return (
                <button
                  key={f.id}
                  onClick={() => vincularMutation.mutate(f)}
                  disabled={vincularMutation.isPending}
                  className="w-full flex items-center justify-between gap-3 border border-gray-200 rounded-sm px-3 py-2 text-left hover:border-brand hover:bg-brand-light/40 disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {f.numero} · {f.cliente_nombre}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{f.titulo}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900">{total.toFixed(2)} €</p>
                    {diferencia < 0.01 ? (
                      <p className="text-xs text-brand">Coincide exacto</p>
                    ) : (
                      <p className="text-xs text-gray-400">Δ {diferencia.toFixed(2)} €</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
      <div className="flex justify-end mt-4">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </Modal>
  );
}
