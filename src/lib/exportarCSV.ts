type ColumnaExport = { key: string; label: string };

export function exportarCSV(nombreArchivo: string, columnas: ColumnaExport[], filas: Record<string, unknown>[]) {
  const escapar = (valor: unknown) => `"${String(valor ?? '').replace(/"/g, '""')}"`;
  const cabecera = columnas.map((c) => escapar(c.label)).join(';');
  const cuerpo = filas.map((fila) => columnas.map((c) => escapar(fila[c.key])).join(';'));
  const csv = [cabecera, ...cuerpo].join('\r\n');

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}
