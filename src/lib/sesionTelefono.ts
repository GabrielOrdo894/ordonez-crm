// En el teléfono la sesión no se cierra a medianoche (Gabriel, 2026-09-30): se inicia sesión una vez
// y queda abierta hasta cerrarla a mano o cambiar la contraseña. En el ordenador el cierre a
// medianoche de App.tsx sigue igual. Se mira la pantalla física (no el ancho de la ventana) y que
// sea táctil, para que una ventana estrecha del ordenador no cuente como teléfono.
export function esTelefono(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 768;
  } catch {
    return false;
  }
}
