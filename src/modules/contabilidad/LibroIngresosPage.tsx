import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Table } from '../../components/ui/Table';
import { KpiRow } from '../../components/ui/Kpi';
import { BotonExportar } from '../../components/ui/BotonExportar';
import { porcentajeIva } from '../finanzas/iva';
import { fechaVisitaCorta } from '../../lib/fechas';

type FacturaCobrada = {
  id: string;
  numero: string | null;
  cliente_nombre: string | null;
  fecha_pago: string | null;
  monto_pagado: number | null;
  tipo_iva: string | null;
};

type Ingreso = {
  id: string;
  fecha: string;
  titulo: string;
  sinIva: number;
  conIva: number;
};

export default function LibroIngresosPage() {
  const [busqueda, setBusqueda] = useState('');

  const { data: facturas, isLoading } = useQuery({
    queryKey: ['facturas', 'cobradas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facturas')
        .select('id, numero, cliente_nombre, fecha_pago, monto_pagado, tipo_iva')
        .is('eliminado_en', null)
        .not('monto_pagado', 'is', null)
        .order('fecha_pago', { ascending: false });
      if (error) throw error;
      return data as FacturaCobrada[];
    },
  });

  const ingresos = useMemo<Ingreso[]>(() => {
    return (facturas ?? []).map((f) => {
      const pct = porcentajeIva(f.tipo_iva);
      const conIva = f.monto_pagado ?? 0;
      const sinIva = pct > 0 ? conIva / (1 + pct / 100) : conIva;
      return {
        id: f.id,
        fecha: f.fecha_pago ?? '',
        titulo: `${f.numero ?? ''} · ${f.cliente_nombre ?? ''}`,
        sinIva,
        conIva,
      };
    });
  }, [facturas]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return ingresos;
    return ingresos.filter((i) => i.titulo.toLowerCase().includes(q));
  }, [ingresos, busqueda]);

  const kpis = useMemo(() => {
    const hoyMes = new Date().toISOString().slice(0, 7);
    const esteMes = ingresos.filter((i) => i.fecha.slice(0, 7) === hoyMes);
    const totalSinIva = ingresos.reduce((s, i) => s + i.sinIva, 0);
    const totalConIva = ingresos.reduce((s, i) => s + i.conIva, 0);
    return [
      { label: 'Total ingresos', valor: ingresos.length },
      { label: 'Este mes', valor: `${esteMes.reduce((s, i) => s + i.conIva, 0).toFixed(0)} €` },
      { label: 'Ingresos sin IVA', valor: `${totalSinIva.toFixed(0)} €` },
      { label: 'Ingresos con IVA', valor: `${totalConIva.toFixed(0)} €`, acento: true },
    ];
  }, [ingresos]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente o número"
            className="w-full border border-gray-200 rounded-sm pl-8 pr-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
        </div>
        <span className="text-sm text-gray-500 ml-auto mr-2">{filtrados.length} ingresos</span>
        <BotonExportar
          nombreArchivo="libro_ingresos.csv"
          filas={filtrados}
          columnas={[
            { key: 'fecha', label: 'Fecha de cobro' },
            { key: 'titulo', label: 'Título' },
            { key: 'sinIva', label: 'Ingresos sin IVA', valor: (i) => i.sinIva.toFixed(2) },
            { key: 'conIva', label: 'Ingresos con IVA', valor: (i) => i.conIva.toFixed(2) },
          ]}
        />
      </div>

      <KpiRow items={kpis} />

      <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden">
        <Table
          loading={isLoading}
          data={filtrados}
          emptyMessage="Sin ingresos registrados todavía (se rellena al registrar pagos de facturas)"
          columns={[
            { key: 'fecha', label: 'Fecha de cobro', render: (i) => fechaVisitaCorta(i.fecha) },
            { key: 'titulo', label: 'Título' },
            { key: 'sinIva', label: 'Ingresos sin IVA', render: (i) => `${i.sinIva.toFixed(2)} €` },
            { key: 'conIva', label: 'Ingresos con IVA', render: (i) => `${i.conIva.toFixed(2)} €` },
          ]}
        />
      </div>
    </div>
  );
}
