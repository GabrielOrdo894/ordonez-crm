type ToastWarning = { warning: (mensaje: string) => void };

// La generación de PDF (jsPDF + fetch de logo/portada) es síncrona desde la UI y puede tardar
// varios segundos en documentos grandes, sin ningún indicio visual de que algo está pasando. Si
// no ha terminado en 600ms, avisamos de que la descarga sigue en curso — para PDFs rápidos el
// aviso ni llega a mostrarse.
export async function conAvisoDescarga<T>(accion: () => Promise<T>, toast: ToastWarning): Promise<T> {
  const timer = setTimeout(() => toast.warning('Generando el documento… la descarga empezará en unos segundos.'), 600);
  try {
    return await accion();
  } finally {
    clearTimeout(timer);
  }
}
