// En móvil la pantalla principal es la de acciones rápidas (/rapido), no la Home del CRM
// (Gabriel, 2026-09-25) — salvo que se haya pulsado "Ir al CRM completo" en esa pantalla, que deja
// esta marca de sesión (se borra al volver a /rapido). sessionStorage a propósito: dura lo que la
// pestaña/app abierta, así al abrir la app al día siguiente vuelve a arrancar en acciones rápidas.
// Vive en su propio módulo para que App.tsx y RapidoPage.tsx no se importen mutuamente.
export const CLAVE_CRM_COMPLETO_MOVIL = 'crm_completo_movil';

export function quiereCrmCompletoEnMovil(): boolean {
  try {
    return sessionStorage.getItem(CLAVE_CRM_COMPLETO_MOVIL) === '1';
  } catch {
    // sin sessionStorage (modo privado muy restrictivo): se comporta como escritorio
    return true;
  }
}

export function marcarCrmCompletoEnMovil(valor: boolean): void {
  try {
    if (valor) sessionStorage.setItem(CLAVE_CRM_COMPLETO_MOVIL, '1');
    else sessionStorage.removeItem(CLAVE_CRM_COMPLETO_MOVIL);
  } catch {
    // sin sessionStorage — no pasa nada
  }
}
