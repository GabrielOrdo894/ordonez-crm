import { Modal } from '../../components/ui/Modal';
import { ClienteDetalleContenido, type TabKey } from './ClienteDetalleContenido';
import type { Cliente } from './types';

type ClienteFichaProps = {
  cliente: Cliente | null;
  open: boolean;
  onClose: () => void;
  tabInicial?: TabKey;
};

// Ficha de cliente en modal — se usa desde Pipeline y desde el detalle de un presupuesto/factura,
// donde tiene sentido consultar los datos sin salir de la pantalla actual. Desde la tabla de
// Clientes se navega en su lugar a la página completa (ver ClienteDetallePage.tsx).
export function ClienteFicha({ cliente, open, onClose, tabInicial }: ClienteFichaProps) {
  if (!cliente) return null;
  return (
    <Modal open={open} onClose={onClose} title={`${cliente.nombre} ${cliente.apellidos}`} size="lg">
      <ClienteDetalleContenido cliente={cliente} tabInicial={tabInicial} onPurgado={onClose} />
    </Modal>
  );
}
