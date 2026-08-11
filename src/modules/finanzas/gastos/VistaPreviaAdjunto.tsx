import { Modal } from '../../../components/ui/Modal';

type VistaPreviaAdjuntoProps = {
  url: string | null;
  onClose: () => void;
};

export function VistaPreviaAdjunto({ url, onClose }: VistaPreviaAdjuntoProps) {
  if (!url) return null;
  const esPdf = url.toLowerCase().includes('.pdf');

  return (
    <Modal open={!!url} onClose={onClose} title="Justificante">
      {esPdf ? (
        <iframe src={url} title="Justificante" className="w-full h-[70vh] border border-gray-200 rounded-sm" />
      ) : (
        <img src={url} alt="Justificante" className="max-w-full max-h-[70vh] mx-auto rounded-sm" />
      )}
      <a href={url} target="_blank" rel="noreferrer" className="block text-xs text-brand hover:underline mt-2 text-center">
        Abrir en pestaña nueva
      </a>
    </Modal>
  );
}
