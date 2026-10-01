// Escapa texto para meterlo en el HTML de un correo (nombres que pueden venir del formulario web).
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
