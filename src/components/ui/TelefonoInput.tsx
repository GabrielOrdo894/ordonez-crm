import { useEffect, useState, type FocusEventHandler } from 'react';
import { Select } from './Select';
import {
  formatearNucleoTelefono,
  nucleoDesdeTexto,
  nucleoTelefono,
  telefonoInternacional,
  type PaisTelefono,
} from '../../modules/clientes/types';

// Campo de teléfono con selector de país (+34 España / +33 Francia) y reformateo en vivo
// (Gabriel, 2026-09-25): con el país elegido, "744501173" o "0744501173" se ven como
// "7 44 50 11 73" mientras se escribe y se guardan como "+33 7 44 50 11 73"; "659884706" como
// "659 88 47 06" y "+34 659 88 47 06". Si se pega un número que ya trae prefijo (+33, 0033, +34,
// 0034 o el 0 nacional francés) el selector se coloca solo. El selector arranca VACÍO a propósito
// — el país del teléfono no es el de la obra y no se deduce (ver nucleoTelefono en
// clientes/types.ts): hasta que se elige, el valor se deja tal cual y la validación del
// formulario pide el prefijo al guardar.
type TelefonoInputProps = {
  label?: string;
  value: string;
  onChange: (valor: string) => void;
  error?: string;
  onBlur?: FocusEventHandler<HTMLInputElement>;
};

const OPCIONES_PAIS = [
  { value: '', label: 'País' },
  { value: 'ES', label: '+34' },
  { value: 'FR', label: '+33' },
];

function esPais(v: string): v is PaisTelefono {
  return v === 'ES' || v === 'FR';
}

export function TelefonoInput({ label = 'Teléfono', value, onChange, error, onBlur }: TelefonoInputProps) {
  const [pais, setPais] = useState<PaisTelefono | ''>(() => nucleoTelefono(value)?.pais ?? '');

  // El valor puede cambiar desde fuera (prefill de una solicitud, elegir un cliente, "Cambiar"
  // que lo vacía): el selector sigue al prefijo del valor nuevo, y se vacía si el valor se vacía.
  useEffect(() => {
    const info = nucleoTelefono(value);
    if (info) setPais(info.pais);
    else if (value.trim() === '') setPais('');
  }, [value]);

  const info = nucleoTelefono(value);
  const textoVisible = pais ? formatearNucleoTelefono(pais, info ? info.nucleo : nucleoDesdeTexto(pais, value)) : value;

  const alEscribir = (texto: string) => {
    // Pegado o tecleado con prefijo: el país lo dice el propio número.
    const detectado = nucleoTelefono(texto);
    if (detectado && texto.replace(/\D/g, '').length >= 11) {
      setPais(detectado.pais);
      onChange(telefonoInternacional(detectado.pais, detectado.nucleo));
      return;
    }
    if (!pais) {
      onChange(texto);
      return;
    }
    const nucleo = nucleoDesdeTexto(pais, texto);
    onChange(nucleo ? telefonoInternacional(pais, nucleo) : '');
  };

  const alCambiarPais = (nuevo: string) => {
    if (!esPais(nuevo)) {
      setPais('');
      return;
    }
    setPais(nuevo);
    const base = info ? info.nucleo : value;
    const nucleo = nucleoDesdeTexto(nuevo, base);
    onChange(nucleo ? telefonoInternacional(nuevo, nucleo) : '');
  };

  return (
    <div>
      {label && <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</label>}
      <div className="flex gap-2">
        <div className="w-24 shrink-0">
          <Select options={OPCIONES_PAIS} value={pais} onChange={(e) => alCambiarPais(e.target.value)} error={error ? ' ' : undefined} />
        </div>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={textoVisible}
          onChange={(e) => alEscribir(e.target.value)}
          onBlur={onBlur}
          placeholder={pais === 'FR' ? '7 44 50 11 73' : pais === 'ES' ? '659 88 47 06' : 'Elige el país'}
          className={`flex-1 min-w-0 border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none ${
            error ? 'border-red-400' : ''
          }`}
        />
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
