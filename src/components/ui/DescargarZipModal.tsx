import type { ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

type DescargarZipModalProps = {
  open: boolean;
  onClose: () => void;
  titulo: string;
  children: ReactNode;
  cantidad: number;
  generando: boolean;
  progreso?: { hecho: number; total: number } | null;
  onDescargar: () => void;
};

export function DescargarZipModal({
  open,
  onClose,
  titulo,
  children,
  cantidad,
  generando,
  progreso,
  onDescargar,
}: DescargarZipModalProps) {
  return (
    <Modal
      open={open}
      onClose={() => !generando && onClose()}
      title={titulo}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={generando}>
            Cancelar
          </Button>
          <Button onClick={onDescargar} disabled={generando || cantidad === 0}>
            {generando ? (progreso ? `Generando ${progreso.hecho}/${progreso.total}…` : 'Generando…') : 'Descargar ZIP'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {children}
        <p className="text-sm text-gray-600 border-t border-gray-100 pt-3">
          {cantidad === 0
            ? 'Ningún documento coincide con estos filtros.'
            : `${cantidad} documento${cantidad === 1 ? '' : 's'} ${cantidad === 1 ? 'coincide' : 'coinciden'} con estos filtros.`}
        </p>
      </div>
    </Modal>
  );
}
