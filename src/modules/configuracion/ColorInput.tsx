import { useEffect, useState } from 'react';

const HEX_VALIDO = /^#[0-9a-fA-F]{6}$/;

type ColorInputProps = {
  value: string;
  onChange: (hex: string) => void;
};

// Selector de color + campo de texto libre, usado en ConstructorPlantillasPage.tsx y
// ConstructorPlanningPage.tsx. El texto libre solo se confirma al perder el foco si es un hex
// válido — si no, se revierte al último color válido en vez de dejar pasar cualquier cosa. Antes
// un valor inválido no rompía el PDF (hexARgb ya cae a verde de marca por defecto) pero sí la
// vista previa web, que pinta el color tal cual llega sin ninguna validación (bug real corregido
// 2026-08-18).
export function ColorInput({ value, onChange }: ColorInputProps) {
  const [texto, setTexto] = useState(value);
  useEffect(() => setTexto(value), [value]);

  const confirmarTexto = () => {
    if (HEX_VALIDO.test(texto)) {
      onChange(texto);
    } else {
      setTexto(value);
    }
  };

  return (
    <>
      <input
        type="color"
        value={HEX_VALIDO.test(value) ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="w-12 h-9 border border-gray-200 rounded-sm cursor-pointer"
      />
      <input
        type="text"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmarTexto}
        className="w-32 border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
      />
    </>
  );
}
