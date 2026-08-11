import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import type { Factura } from '../finanzas/facturas/types';
import type { MovimientoBanco } from './types';
import { registrarEvento } from '../../lib/eventos';

function totalFactura(f: Factura) {
  return f.lineas.reduce((s, l) => s + (l.es_incluido ? 0 : l.total_con_iva), 0);
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
      if (!movimiento) return;
      const total = totalFactura(factura);
      const estado_cobro = movimiento.importe >= total - 0.01 ? 'Cobrada' : 'Cobrada parcialmente';
      const { error: errorFactura } = await supabase
        .from('facturas')
        .update({ fecha_pago: movimiento.fecha, monto_pagado: movimiento.importe, estado_cobro })
        .eq('id', factura.id);
      if (errorFactura) throw errorFactura;

      const { error: errorMovimiento } = await supabase
        .from('movimientos_banco')
        .update({ estado: 'Vinculado', factura_id: factura.id })
        .eq('id', movimiento.id);
      if (errorMovimiento) throw errorMovimiento;

      await registrarEvento(
        'factura',
        factura.id,
        `Pago de ${movimiento.importe.toFixed(2)} € vinculado automáticamente desde movimiento bancario importado (OFX)`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturas'] });
      queryClient.invalidateQueries({ queryKey: ['movimientos_banco'] });
      toast.success('Factura marcada como cobrada y movimiento vinculado');
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
