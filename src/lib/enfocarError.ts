// Lleva la vista hasta el primer campo marcado en rojo dentro de `raiz` y le pone el foco — para que
// al pulsar Guardar se vea al instante qué dato falta aunque esté fuera de pantalla (petición de
// Gabriel, 2026-10-30). Se apoya en que todos los campos del CRM (Input, Select, TelefonoInput,
// MapsAutocomplete) pintan `border-red-400` cuando reciben `error`, así no hace falta cablear cada
// campo a mano. Se ejecuta tras un tick para dar tiempo a React a pintar el estado de error.
export function enfocarPrimerError(raiz?: HTMLElement | null) {
  setTimeout(() => {
    const ambito: ParentNode = raiz ?? document;
    const el = ambito.querySelector<HTMLElement>('.border-red-400');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const foco = el.matches('input,textarea,button,select')
      ? el
      : el.querySelector<HTMLElement>('input,textarea,button,select');
    foco?.focus({ preventScroll: true });
  }, 0);
}

// Lleva la vista a la línea `indice` de un LineasEditor (contenedor con `data-linea`) y pone el foco
// en su primer campo en rojo — al pulsar Guardar con una línea incompleta o al intentar añadir otra.
export function enfocarLinea(indice: number) {
  if (indice < 0) return;
  const linea = document.querySelector<HTMLElement>(`[data-linea="${indice}"]`);
  if (linea) enfocarPrimerError(linea);
}
