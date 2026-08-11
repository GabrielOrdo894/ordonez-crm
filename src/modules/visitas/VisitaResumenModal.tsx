import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { VisitaDetalleContenido, urlGoogleMaps } from './VisitaDetalleContenido';
import type { Visita } from './types';

export { urlGoogleMaps };

type VisitaResumenModalProps = {
  visita: Visita | null;
  onClose: () => void;
  onModificar: (visita: Visita) => void;
  onCancelar: (visita: Visita) => void;
};

export function VisitaResumenModal({ visita, onClose, onModificar, onCancelar }: VisitaResumenModalProps) {
  if (!visita) return null;
  const puedeCancelar = visita.estado !== 'Cancelada';

  const acciones = (
    <>
      {puedeCancelar && (
        <Button variant="danger" onClick={() => onCancelar(visita)}>
          Cancelar visita
        </Button>
      )}
      <Button variant="secondary" onClick={() => onModificar(visita)}>
        Modificar
      </Button>
    </>
  );

  return (
    <Modal open={!!visita} onClose={onClose} title={`${visita.nombre} ${visita.apellidos}`} size="lg" footer={acciones}>
      <VisitaDetalleContenido visita={visita} />
    </Modal>
  );
}
