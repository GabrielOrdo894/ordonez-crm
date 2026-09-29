import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Table } from '../../components/ui/Table';
import { Select } from '../../components/ui/Select';
import { BotonExportar } from '../../components/ui/BotonExportar';
import { InfoTooltip } from '../../components/ui/InfoTooltip';
import { etiquetaCuenta } from '../../lib/asientosContables';
import { limitesEjercicio } from '../fiscalidad/calculos';
import { useGastosSinClasificar } from './useGastosSinClasificar';
import { useAsientosContables } from './useAsientosContables';
import { formatearPrecio } from '../finanzas/lineas';

const PRIMER_EJERCICIO = 2026;

// Cuentas de gestión (clases 6 y 7): solo cuentan los movimientos del ejercicio. El resto (balance)
// se acumula desde el inicio hasta el cierre del ejercicio — sin asiento de cierre, es su saldo real
// a esa fecha (auditoría contable 2026-09-29: antes se sumaba todo el histórico, mezclando años).
function esCuentaDeGestion(cuenta: string) {
  return cuenta.startsWith('6') || cuenta.startsWith('7');
}

type CuentaMayor = {
  id: string;
  cuenta: string;
  totalDebe: number;
  totalHaber: number;
  saldo: number;
};

// Formato exacto que pide Edifiscale para importar la "balance comptable" y auto-rellenar la
// liasse fiscale (modelo real entregado por Edifiscale, ver negocio/documentos legales/modele-balance.csv):
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
  const [anio, setAnio] = useState(new Date().getFullYear());
  const ejercicio = limitesEjercicio(anio);

  const { data: asientos, isLoading } = useAsientosContables();

  // Salvaguarda de integridad — mismo motivo que LibroDiarioPage.tsx.
  const { data: totalReal } = useQuery({
    queryKey: ['asientos_contables', 'count'],
    queryFn: async () => {
      const { count, error } = await supabase.from('asientos_contables').select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
  const truncado = totalReal != null && asientos != null && totalReal > asientos.length;

  const cuentas = useMemo<CuentaMayor[]>(() => {
    const porCuenta = new Map<string, { totalDebe: number; totalHaber: number }>();
    for (const a of asientos ?? []) {
      if (a.fecha > ejercicio.fin) continue;
      if (esCuentaDeGestion(a.cuenta) && a.fecha < ejercicio.inicio) continue;
      const actual = porCuenta.get(a.cuenta) ?? { totalDebe: 0, totalHaber: 0 };
      actual.totalDebe += a.debe;
      actual.totalHaber += a.haber;
      porCuenta.set(a.cuenta, actual);
    }
    return Array.from(porCuenta.entries())
      .map(([cuenta, t]) => ({ id: cuenta, cuenta, totalDebe: t.totalDebe, totalHaber: t.totalHaber, saldo: t.totalDebe - t.totalHaber }))
      .sort((a, b) => a.cuenta.localeCompare(b.cuenta));
  }, [asientos, ejercicio.inicio, ejercicio.fin]);

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-1.5">
            Libro mayor
            <InfoTooltip>
              Asientos del libro diario agrupados por cuenta PCG, con saldo (debe − haber). Cuentas de gasto/venta:
              saldo positivo = gasto/venta acumulado. Cuenta 512 (banco): saldo = caja aproximada de la actividad de
              Francia registrada aquí.
            </InfoTooltip>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Select
            options={Array.from({ length: new Date().getFullYear() - PRIMER_EJERCICIO + 1 }, (_, i) => PRIMER_EJERCICIO + i).map((a) => ({
              value: String(a),
              label: `Ejercicio ${a}`,
            }))}
            value={String(anio)}
            onChange={(e) => setAnio(Number(e.target.value))}
            className="w-36"
          />
          <BotonExportar
            nombreArchivo={`libro_mayor_${anio}.csv`}
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
            nombreArchivo={`balance-edifiscale-${anio}.csv`}
            filas={cuentas.filter((c) => Math.abs(c.saldo) >= 0.005)}
            // Balance de SALDOS del ejercicio (una columna a 0 por cuenta), como el modelo real de
            // Edifiscale — antes se exportaban los movimientos brutos (p. ej. 411 con el mismo
            // importe en Débit y en Crédit), que rellenarían mal el 2050 (auditoría 2026-09-29).
            columnas={[
              { key: 'compte', label: 'Compte', valor: (c) => codigoPcg6(c.cuenta) },
              { key: 'libelle', label: 'Libellé', valor: (c) => nombreCuentaSinCodigo(c.cuenta) },
              { key: 'debit', label: 'Débit', valor: (c) => importeComaDecimal(Math.max(0, c.saldo)) },
              { key: 'credit', label: 'Crédit', valor: (c) => importeComaDecimal(Math.max(0, -c.saldo)) },
            ]}
          />
        </div>
      </div>

      {truncado && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-sm px-3 py-2 mb-4">
          Mostrando {asientos?.length} de {totalReal} apuntes — la consulta se ha truncado. Los saldos por cuenta de
          esta página no se pueden confiar tal cual hasta resolverlo (contacta con soporte técnico).
        </div>
      )}

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
            { key: 'totalDebe', label: 'Total debe', render: (c) => `${formatearPrecio(c.totalDebe)}` },
            { key: 'totalHaber', label: 'Total haber', render: (c) => `${formatearPrecio(c.totalHaber)}` },
            { key: 'saldo', label: 'Saldo', render: (c) => `${formatearPrecio(c.saldo)}` },
          ]}
        />
      </div>
    </div>
  );
}
