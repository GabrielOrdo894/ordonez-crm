import { useEffect, useState } from 'react';
import { Paperclip, Calendar, Building2, Tag, Hash } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { Modal } from '../../../components/ui/Modal';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../hooks/useToast';
import type { Gasto } from './types';

function totalConIva(g: Gasto) {
  return (g.importe_base ?? 0) + (g.importe_iva ?? 0);
}

function fechaLarga(fecha: string | null) {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

type GastoResumenProps = {
  gasto: Gasto | null;
  onClose: () => void;
  onModificar: () => void;
};

export function GastoResumen({ gasto, onClose, onModificar }: GastoResumenProps) {
  // Bucket privado (justificantes) — adjunto_url guarda el path, no una URL usable directamente,
  // hace falta resolver una signed URL de corta duración para poder enlazarla.
  const [urlFirmada, setUrlFirmada] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    setUrlFirmada(null);
    if (!gasto?.adjunto_url) return;
    let cancelado = false;
    supabase.storage
      .from('justificantes')
      .createSignedUrl(gasto.adjunto_url, 3600)
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error) {
          toast.error(`No se pudo cargar el justificante: ${error.message}`);
          return;
        }
        setUrlFirmada(data.signedUrl);
      });
    return () => {
      cancelado = true;
    };
    // toast no es estable entre renders (ToastProvider crea un `value` nuevo en cada uno) — incluirlo
    // volvería a pedir la signed URL cada vez que se dispare CUALQUIER toast en la app, no solo al
    // cambiar de adjunto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gasto?.adjunto_url]);

  if (!gasto) return null;

  return (
    <Modal
      open={!!gasto}
      onClose={onClose}
      title="Resumen del gasto"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onModificar}>Modificar</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="text-base font-semibold text-gray-900">{gasto.descripcion || 'Sin descripción'}</p>
          <div className="flex items-center gap-2 mt-1.5">
            {gasto.categoria && <Badge variant="default">{gasto.categoria}</Badge>}
            {gasto.pais && <Badge variant="realizada">{gasto.pais}</Badge>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
          <div className="flex items-start gap-2">
            <Calendar size={15} className="text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Fecha</p>
              <p className="text-sm text-gray-900">{fechaLarga(gasto.fecha)}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Building2 size={15} className="text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Proveedor</p>
              <p className="text-sm text-gray-900">{gasto.proveedor || '—'}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Tag size={15} className="text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Cuenta contable</p>
              <p className="text-sm text-gray-900">{gasto.cuenta_contable || '—'}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Hash size={15} className="text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Nº factura proveedor</p>
              <p className="text-sm text-gray-900">{gasto.num_factura_proveedor || '—'}</p>
            </div>
          </div>
        </div>

        <div className="bg-brand-light rounded-sm px-4 py-3 flex justify-between items-center">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Base</p>
            <p className="text-sm text-gray-900">{(gasto.importe_base ?? 0).toFixed(2)} €</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">IVA deducible</p>
            <p className="text-sm text-gray-900">{(gasto.importe_iva ?? 0).toFixed(2)} €</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-gray-500">Total</p>
            <p className="text-base font-semibold text-brand">{totalConIva(gasto).toFixed(2)} €</p>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-gray-100 pt-4">
          <Paperclip size={15} className="text-gray-400" />
          <p className="text-xs uppercase tracking-wide text-gray-400">Justificante</p>
          {gasto.adjunto_url ? (
            urlFirmada ? (
              <a
                href={urlFirmada}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-brand text-sm hover:underline ml-1"
              >
                <Paperclip size={14} />
                {gasto.adjunto_nombre || 'Ver adjunto'}
              </a>
            ) : (
              <span className="text-sm text-gray-400 ml-1">Cargando...</span>
            )
          ) : (
            <span className="text-sm text-gray-400 ml-1">Sin adjuntar</span>
          )}
        </div>
      </div>
    </Modal>
  );
}
