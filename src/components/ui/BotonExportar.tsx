import { Download } from 'lucide-react';
import { Button } from './Button';
import { exportarCSV } from '../../lib/exportarCSV';

type ColumnaExportar<T> = {
  key: string;
  label: string;
  valor?: (fila: T) => string | number;
};

type BotonExportarProps<T> = {
  nombreArchivo: string;
  columnas: ColumnaExportar<T>[];
  filas: T[];
};

export function BotonExportar<T>({ nombreArchivo, columnas, filas }: BotonExportarProps<T>) {
  const handleExportar = () => {
    const columnasCsv = columnas.map((c) => ({ key: c.key, label: c.label }));
    const filasCsv = filas.map((fila) => {
      const obj: Record<string, unknown> = {};
      for (const c of columnas) {
        obj[c.key] = c.valor ? c.valor(fila) : (fila as Record<string, unknown>)[c.key];
      }
      return obj;
    });
    exportarCSV(nombreArchivo, columnasCsv, filasCsv);
  };

  return (
    <Button size="sm" variant="secondary" onClick={handleExportar} disabled={filas.length === 0}>
      <Download size={14} className="inline mr-1.5 -mt-0.5" />
      Exportar CSV
    </Button>
  );
}
