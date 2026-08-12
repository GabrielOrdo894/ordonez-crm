// PostgREST usa `,`, `(` y `)` como separadores/agrupadores dentro de un filtro `.or(...)`, y `"`
// para delimitar valores que los contienen. Un texto de búsqueda escrito por el usuario (p. ej.
// "Dupont, Marie") rompía la sintaxis del filtro y la búsqueda fallaba en silencio (auditoría
// 2026-08-12). Envolver el valor entre comillas dobles y escapar `\` y `"` es la forma que
// documenta PostgREST para que esos caracteres se traten como texto literal.
function escaparValorFiltroOr(valor: string): string {
  return valor.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Construye el valor listo para usar en `.ilike.${valor}` dentro de un `.or(...)`, con el
// comodín `%` de siempre a cada lado del texto ya escapado.
export function valorIlikeParaOr(texto: string): string {
  return `"%${escaparValorFiltroOr(texto)}%"`;
}
