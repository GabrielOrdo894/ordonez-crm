// Mensaje legible a partir de un error atrapado en un catch (tipado 'unknown' por TypeScript,
// no 'any') — usado en los try/catch de descargas y generación de PDF/ZIP del CRM.
export function mensajeError(err: unknown, fallback = 'Ha ocurrido un error inesperado'): string {
  return err instanceof Error ? err.message : fallback;
}
