import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Table } from '../../components/ui/Table';
import { BotonExportar } from '../../components/ui/BotonExportar';
import { etiquetaCuenta } from '../../lib/asientosContables';
import { useGastosSinClasificar } from './useGastosSinClasificar';

type AsientoContable = {
  cuenta: string;
  debe: number;
  haber: number;
};

type CuentaMayor = {
  id: string;
  cuenta: string;
  totalDebe: number;
  totalHaber: number;
  saldo: number;
};

// Formato exacto que pide Edifiscale para importar la "balance comptable" y auto-rellenar la
// liasse fiscale (modelo real entregado por Edifiscale, ver documentos legales/modele-balance.csv):
// código de cuenta a 6 dígitos (relleno con ceros a la derecha, convención PCG estándar) y los
// importes con coma decimal en vez de punto.
function codigoPcg6(cuenta: string): string {
  return cuenta.padEnd(6, '0');
}

function nombreCuentaSinCodigo(cuenta: string): string {
  return etiquetaCuenta(cuenta).replace(/^[^·]+·\s*/, '');
}

function importeComaDecimal(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

export default function LibroMayorPage() {
  const sinClasificar = useGastosSinClasificar();

  const { data: asientos, isLoading } = useQuery({
    queryKey: ['asientos_contables'],
    queryFn: async () => {
      const { data, error } = await supabase.from('asientos_contables').select('cuenta, debe, haber');
      if (error) throw error;
      return data as AsientoContable[];
    },
  });

  const cuentas = useMemo<CuentaMayor[]>(() => {
    const porCuenta = new Map<string, { totalDebe: number; totalHaber: number }>();
    for (const a of asientos ?? []) {
      const actual = porCuenta.get(a.cuenta) ?? { totalDebe: 0, totalHaber: 0 };
      actual.totalDebe += a.debe;
      actual.totalHaber += a.haber;
      porCuenta.set(a.cuenta, actual);
    }
    return Array.from(porCuenta.entries())
      .map(([cuenta, t]) => ({ id: cuenta, cuenta, totalDebe: t.totalDebe, totalHaber: t.totalHaber, saldo: t.totalDebe - t.totalHaber }))
      .sort((a, b) => a.cuenta.localeCompare(b.cuenta));
  }, [asientos]);

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Libro mayor</h1>
          <p className="text-sm text-gray-500">
            Asientos del libro diario agrupados por cuenta PCG, con saldo (debe − haber). Cuentas de gasto/venta:
            saldo positivo = gasto/venta acumulado. Cuenta 512 (banco): saldo = caja aproximada de la actividad
            de Francia registrada aquí.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BotonExportar
            nombreArchivo="libro_mayor.csv"
            filas={cuentas}
            columnas={[
              { key: 'cuenta', label: 'Cuenta', valor: (c) => etiquetaCuenta(c.cuenta) },
              { key: 'totalDebe', label: 'Total debe', valor: (c) => c.totalDebe.toFixed(2) },
              { key: 'totalHaber', label: 'Total haber', valor: (c) => c.totalHaber.toFixed(2) },
              { key: 'saldo', label: 'Saldo', valor: (c) => c.saldo.toFixed(2) },
            ]}
          />
          <BotonExportar
            label="Exportar para Edifiscale (CSV)"
            nombreArchivo="balance-edifiscale.csv"
            filas={cuentas}
            columnas={[
              { key: 'compte', label: 'Compte', valor: (c) => codigoPcg6(c.cuenta) },
              { key: 'libelle', label: 'Libellé', valor: (c) => nombreCuentaSinCodigo(c.cuenta) },
              { key: 'debit', label: 'Débit', valor: (c) => importeComaDecimal(c.totalDebe) },
              { key: 'credit', label: 'Crédit', valor: (c) => importeComaDecimal(c.totalHaber) },
            ]}
          />
        </div>
      </div>

      {sinClasificar.mensaje && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-sm px-3 py-2 mb-4">
          {sinClasificar.mensaje}{' '}
          <Link to="/contabilidad/gastos" className="underline font-medium">
            Ir a Gastos
          </Link>
        </div>
      )}

      <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden">
        <Table
          loading={isLoading}
          data={cuentas}
          emptyMessage="Sin movimientos todavía (se generan al crear facturas y gastos de Francia)"
          columns={[
            { key: 'cuenta', label: 'Cuenta', render: (c) => etiquetaCuenta(c.cuenta) },
            { key: 'totalDebe', label: 'Total debe', render: (c) => `${c.totalDebe.toFixed(2)} €` },
            { key: 'totalHaber', label: 'Total haber', render: (c) => `${c.totalHaber.toFixed(2)} €` },
            { key: 'saldo', label: 'Saldo', render: (c) => `${c.saldo.toFixed(2)} €` },
          ]}
        />
      </div>
    </div>
  );
}
