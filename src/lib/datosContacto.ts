// Comprueba qué datos de contacto básicos faltan (nombre, teléfono, dirección, email) — usado
// tanto en la ficha de cliente como en el presupuesto para avisar cuando falta algo, sin bloquear
// nada (siguen siendo opcionales a nivel de formulario en varios sitios: entrada manual de
// presupuestos, clientes potenciales convertidos desde una solicitud sin todos los datos...).
export function camposContactoFaltantes(datos: {
  nombre?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  email?: string | null;
}): string[] {
  const faltantes: string[] = [];
  if (!datos.nombre?.trim()) faltantes.push('nombre');
  if (!datos.telefono?.trim()) faltantes.push('teléfono');
  if (!datos.direccion?.trim()) faltantes.push('dirección');
  if (!datos.email?.trim()) faltantes.push('email');
  return faltantes;
}
