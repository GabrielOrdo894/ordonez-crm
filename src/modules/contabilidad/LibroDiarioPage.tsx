import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Table } from '../../components/ui/Table';
import { KpiRow } from '../../components/ui/Kpi';
import { BotonExportar } from '../../components/ui/BotonExportar';
import { etiquetaCuenta } from '../../lib/asientosContables';
import { fechaVisitaCorta } from '../../lib/fechas';
import { useGastosSinClasificar } from './useGastosSinClasificar';

type AsientoContable = {
  id: string;
  fecha: string;
  cuenta: string;
  debe: number;
  haber: number;
  concepto: string;
  documento_tipo: string;
};

export default function LibroDiarioPage() {
  const [busqueda, setBusqueda] = useState('');
  const sinClasificar = useGastosSinClasificar();

  const { data: asientos, isLoading } = useQuery({
    queryKey: ['asientos_contables'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('asientos_contables')
        .select('id, fecha, cuenta, debe, haber, concepto, documento_tipo')
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as AsientoContable[];
    },
  });

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = asientos ?? [];
    if (!q) return lista;
    return lista.filter((a) => a.concepto.toLowerCase().includes(q) || a.cuenta.includes(q));
  }, [asientos, busqueda]);

  const kpis = useMemo(() => {
    const lista = asientos ?? [];
    const totalDebe = lista.reduce((s, a) => s + a.debe, 0);
    const totalHaber = lista.reduce((s, a) => s + a.haber, 0);
    return [
      { label: 'Asientos', valor: lista.length },
      { label: 'Total debe', valor: `${totalDebe.toFixed(0)} €` },
      { label: 'Total haber', valor: `${totalHaber.toFixed(0)} €` },
      { label: 'Descuadre', valor: `${(totalDebe - totalHaber).toFixed(2)} €`, acento: Math.abs(totalDebe - totalHaber) > 0.01 },
    ];
  }, [asientos]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-gray-900">Libro diario</h1>
        <p className="text-sm text-gray-500">
          Registro cronológico de asientos contables (PCG francés), generado automáticamente al crear facturas y
          gastos de Francia. Solo lectura — un asiento nunca se edita ni se borra, se corrige con uno nuevo.
        </p>
      </div>

      {sinClasificar.mensaje && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-sm px-3 py-2 mb-4">
          {sinClasificar.mensaje}{' '}
          <Link to="/contabilidad/gastos" className="underline font-medium">
            Ir a Gastos
          </Link>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por concepto o cuenta"
            className="w-full border border-gray-200 rounded-sm pl-8 pr-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
        </div>
        <span className="text-sm text-gray-500 ml-auto mr-2">{filtrados.length} asientos</span>
        <BotonExportar
          nombreArchivo="libro_diario.csv"
          filas={filtrados}
          columnas={[
            { key: 'fecha', label: 'Fecha' },
            { key: 'cuenta', label: 'Cuenta', valor: (a) => etiquetaCuenta(a.cuenta) },
            { key: 'concepto', label: 'Concepto' },
            { key: 'debe', label: 'Debe', valor: (a) => a.debe.toFixed(2) },
            { key: 'haber', label: 'Haber', valor: (a) => a.haber.toFixed(2) },
          ]}
        />
      </div>

      <KpiRow items={kpis} />

      <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden">
        <Table
          loading={isLoading}
          data={filtrados}
          emptyMessage="Sin asientos todavía (se generan al crear facturas y gastos de Francia)"
          columns={[
            { key: 'fecha', label: 'Fecha', render: (a) => fechaVisitaCorta(a.fecha) },
            { key: 'cuenta', label: 'Cuenta', render: (a) => etiquetaCuenta(a.cuenta) },
            { key: 'concepto', label: 'Concepto' },
            { key: 'debe', label: 'Debe', render: (a) => (a.debe > 0 ? `${a.debe.toFixed(2)} €` : '—') },
            { key: 'haber', label: 'Haber', render: (a) => (a.haber > 0 ? `${a.haber.toFixed(2)} €` : '—') },
          ]}
        />
      </div>
    </div>
  );
}
