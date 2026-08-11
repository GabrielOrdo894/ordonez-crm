// Parser permisivo de OFX (formatos 1.x SGML con etiquetas sin cerrar, y 2.x XML) — solo
// extrae lo necesario de cada <STMTTRN>: fecha, importe, descripción y FITID (id único del banco,
// para poder detectar movimientos ya importados antes y no duplicarlos).

export type MovimientoOfx = {
  fitid: string;
  fecha: string; // YYYY-MM-DD
  importe: number;
  descripcion: string;
};

function campoOfx(bloque: string, etiqueta: string): string {
  const m = bloque.match(new RegExp(`<${etiqueta}>([^<\r\n]*)`, 'i'));
  return m ? m[1].trim() : '';
}

function fechaOfx(raw: string): string {
  const digitos = raw.trim().slice(0, 8);
  if (digitos.length !== 8) return '';
  return `${digitos.slice(0, 4)}-${digitos.slice(4, 6)}-${digitos.slice(6, 8)}`;
}

export function parseOfx(texto: string): MovimientoOfx[] {
  const bloques = texto.split(/<STMTTRN>/i).slice(1);
  return bloques
    .map((bloqueCompleto): MovimientoOfx | null => {
      const bloque = bloqueCompleto.split(/<\/STMTTRN>/i)[0];
      const dtposted = campoOfx(bloque, 'DTPOSTED');
      const trnamt = campoOfx(bloque, 'TRNAMT');
      const fitid = campoOfx(bloque, 'FITID');
      const name = campoOfx(bloque, 'NAME');
      const memo = campoOfx(bloque, 'MEMO');
      const fecha = fechaOfx(dtposted);
      const importe = Number(trnamt.replace(',', '.'));
      if (!fecha || Number.isNaN(importe)) return null;
      return {
        fitid: fitid || `${dtposted}-${trnamt}-${(name || memo).slice(0, 30)}`,
        fecha,
        importe,
        descripcion: [name, memo].filter(Boolean).join(' — ') || 'Sin descripción',
      };
    })
    .filter((m): m is MovimientoOfx => m !== null);
}
