import { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { cargarEntidad } from '../../../lib/pdfEmpresa';
import { calcularTotales } from '../lineas';
import type { Factura } from './types';

type RecordatorioPagoModalProps = {
  factura: Factura | null;
  onClose: () => void;
};

function primerNombre(nombreCompleto: string) {
  return nombreCompleto.trim().split(/\s+/)[0] ?? nombreCompleto;
}

export function RecordatorioPagoModal({ factura, onClose }: RecordatorioPagoModalProps) {
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState('');
  const [asunto, setAsunto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (!factura) return;
    setCargando(true);
    (async () => {
      const { entidad } = await cargarEntidad(factura.pais ?? 'España');
      const idioma = factura.idioma === 'Français' ? 'fr' : 'es';
      const { totalConIva } = calcularTotales(factura.lineas);
      const pendiente = (totalConIva - (factura.monto_pagado ?? 0)).toFixed(2);
      const nombre = idioma === 'fr' ? primerNombre(factura.cliente_nombre ?? '') : (factura.cliente_nombre ?? '');
      const iban = entidad.iban ?? '—';
      const contacto = [entidad.razon_social, entidad.telefono].filter(Boolean).join(' · ');

      const texto =
        idioma === 'fr'
          ? `Bonjour ${nombre}, nous vous rappelons que la facture ${factura.numero ?? ''} d'un montant de ${pendiente}€ est due le ${factura.fecha_vence ?? ''}.\nPaiement par virement bancaire: IBAN ${iban}.\nN'hésitez pas à nous contacter pour toute question.\n${contacto}`
          : `Estimado/a ${nombre}, le recordamos que tiene pendiente de pago la factura ${factura.numero ?? ''} por importe de ${pendiente}€ con vencimiento el ${factura.fecha_vence ?? ''}.\nPuede realizar el pago mediante transferencia bancaria al IBAN ${iban}.\nQuedamos a su disposición para cualquier consulta.\n${contacto}`;

      setMensaje(texto);
      setAsunto(
        idioma === 'fr'
          ? `Rappel de paiement — facture ${factura.numero ?? ''}`
          : `Recordatorio de pago — factura ${factura.numero ?? ''}`,
      );
      setTelefono((factura.cliente_tel ?? '').replace(/\D/g, ''));
      setEmail(factura.cliente_email ?? '');
      setCargando(false);
    })();
  }, [factura]);

  if (!factura) return null;

  const { totalConIva } = calcularTotales(factura.lineas);
  const pendiente = totalConIva - (factura.monto_pagado ?? 0);

  const enviarWhatsapp = () => {
    window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`, '_blank');
  };

  const enviarEmail = () => {
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(mensaje)}`;
  };

  const enviarAmbos = () => {
    enviarWhatsapp();
    setTimeout(enviarEmail, 300);
  };

  return (
    <Modal open={!!factura} onClose={onClose} title="Recordatorio de pago">
      {cargando ? (
        <p className="text-sm text-gray-400">Cargando...</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="bg-gray-50 border border-gray-200 rounded-sm px-3 py-2 text-sm">
            <p className="text-gray-900 font-medium">
              {factura.numero} · {factura.cliente_nombre}
            </p>
            <p className="text-xs text-gray-500">
              Pendiente: {pendiente.toFixed(2)} € · Vence: {factura.fecha_vence ?? '—'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Mensaje</label>
            <textarea
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              rows={7}
              className="w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="secondary" onClick={enviarWhatsapp} disabled={!telefono}>
              Enviar por WhatsApp
            </Button>
            <Button size="sm" variant="secondary" onClick={enviarEmail} disabled={!email}>
              Enviar por Email
            </Button>
            <Button size="sm" onClick={enviarAmbos} disabled={!telefono || !email}>
              Enviar por los dos
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
