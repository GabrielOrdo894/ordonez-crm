// Sintaxis ligera compartida por el editor de descripción (presupuestos, facturas, planning de
// obra) y los generadores de PDF: "- texto" = viñeta, "**texto**" = negrita, "*texto*" o
// "_texto_" = cursiva, línea en blanco = espaciado entre párrafos. El formato se aplica a la
// línea completa, no a palabras sueltas dentro de una línea — así el renderizado en jsPDF (que no
// soporta estilos mixtos en un mismo doc.text) se mantiene simple y fiable.
export type BloqueTexto = {
  texto: string;
  tipo: 'normal' | 'lista' | 'numerada' | 'espacio';
  negrita: boolean;
  cursiva: boolean;
};

export function parsearTextoEnriquecido(valor: string | null | undefined): BloqueTexto[] {
  const lineasCrudas = (valor ?? '').split('\n').map((linea) => linea.trim());

  const bloques: BloqueTexto[] = [];
  let contadorNumerada = 0;
  let ultimaFueEspacio = true; // evita un espacio inicial si el texto empieza con líneas en blanco

  for (const lineaOriginal of lineasCrudas) {
    if (!lineaOriginal) {
      // Varias líneas en blanco seguidas cuentan como un único espaciado — así un usuario que deja
      // 3-4 líneas vacías por costumbre no genera una página de huecos.
      if (!ultimaFueEspacio) bloques.push({ texto: ' ', tipo: 'espacio', negrita: false, cursiva: false });
      ultimaFueEspacio = true;
      continue;
    }
    ultimaFueEspacio = false;

    let texto = lineaOriginal;
    let tipo: 'normal' | 'lista' | 'numerada' = 'normal';
    if (texto.startsWith('- ') || texto.startsWith('* ')) {
      tipo = 'lista';
      texto = texto.slice(2).trim();
    } else if (texto.startsWith('#. ')) {
      tipo = 'numerada';
      texto = texto.slice(3).trim();
    }
    contadorNumerada = tipo === 'numerada' ? contadorNumerada + 1 : 0;

    let negrita = false;
    let cursiva = false;
    if (texto.startsWith('**') && texto.endsWith('**') && texto.length > 4) {
      negrita = true;
      texto = texto.slice(2, -2).trim();
    } else if ((texto.startsWith('*') && texto.endsWith('*') && texto.length > 2) || (texto.startsWith('_') && texto.endsWith('_') && texto.length > 2)) {
      cursiva = true;
      texto = texto.slice(1, -1).trim();
    }

    const prefijo = tipo === 'lista' ? '• ' : tipo === 'numerada' ? `${contadorNumerada}. ` : '';
    bloques.push({ texto: `${prefijo}${texto}`, tipo, negrita, cursiva });
  }

  while (bloques.length && bloques[bloques.length - 1].tipo === 'espacio') bloques.pop();
  return bloques;
}

export function estiloFuente(negrita: boolean, cursiva: boolean): 'normal' | 'bold' | 'italic' | 'bolditalic' {
  if (negrita && cursiva) return 'bolditalic';
  if (negrita) return 'bold';
  if (cursiva) return 'italic';
  return 'normal';
}
