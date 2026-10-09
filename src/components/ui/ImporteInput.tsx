import { useEffect, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Input } from './Input';

type ImporteInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number;
  onChange: (valor: number) => void;
  label?: string;
};

const AVISO = 'Solo números, con coma o punto para los decimales (máximo dos).';

function aTexto(valor: number) {
  return valor ? String(valor).replace('.', ',') : '';
}

function aNumero(texto: string) {
  return Number(texto.replace(',', '.')) || 0;
}

// Importe en euros que admite coma o punto como separador decimal y arranca vacío en vez de con un
// 0. Un `<input type="number">` borraba todo lo tecleado al escribir una coma (petición de Gabriel
// 2026-10-09): aquí la tecla que no vale se ignora y se avisa en rojo, sin perder lo ya escrito.
export function ImporteInput({ value, onChange, ...props }: ImporteInputProps) {
  const [texto, setTexto] = useState(() => aTexto(value));
  const [aviso, setAviso] = useState(false);

  // El valor puede cambiar desde fuera (cargar un gasto, pasar de «total» a «base»): se repinta solo
  // si ya no coincide con lo tecleado, para no pisar un «12,» a medio escribir.
  useEffect(() => {
    setTexto((actual) => (aNumero(actual) === value ? actual : aTexto(value)));
  }, [value]);

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={texto}
      error={aviso ? AVISO : undefined}
      onBlur={() => setAviso(false)}
      onChange={(e) => {
        const nuevo = e.target.value.replace(/\s/g, '');
        if (!/^\d*([.,]\d{0,2})?$/.test(nuevo)) {
          setAviso(true);
          return;
        }
        setAviso(false);
        setTexto(nuevo);
        onChange(aNumero(nuevo));
      }}
    />
  );
}
