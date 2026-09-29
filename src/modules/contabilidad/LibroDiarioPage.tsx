import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FileDown, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Table } from '../../components/ui/Table';
import { KpiRow } from '../../components/ui/Kpi';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { BotonExportar } from '../../components/ui/BotonExportar';
import { InfoTooltip } from '../../components/ui/InfoTooltip';
import { etiquetaCuenta } from '../../lib/asientosContables';
import { fechaVisitaCorta } from '../../lib/fechas';
import { codificarLatin9, construirFec, nombreFicheroFec } from '../../lib/fec';
import { cargarEntidad } from '../../lib/pdfEmpresa';
import { useToast } from '../../hooks/useToast';
import { limitesEjercicio } from '../fiscalidad/calculos';
import { useGastosSinClasificar } from './useGastosSinClasificar';
import { useAsientosContables } from './useAsientosContables';
import { formatearPrecio, formatearPrecioEntero } from '../finanzas/lineas';

const PRIMER_EJERCICIO = 2026;

export default function LibroDiarioPage() {
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [anioFec, setAnioFec] = useState(new Date().getFullYear());
  const [generandoFec, setGenerandoFec] = useState(false);
  const sinClasificar = useGastosSinClasificar();

  const { data: asientos, isLoading } = useAsientosContables();

  const exportarFec = async () => {
    setGenerandoFec(true);
    try {
      const { entidad } = await cargarEntidad('Francia');
      if (!entidad.siren) throw new Error('Falta el SIREN de la empresa en Configuración (datos de Francia).');
      const [facturas, gastos] = await Promise.all([
        supabase.from('facturas').select('id, numero'),
        supabase.from('gastos').select('id, num_factura_proveedor'),
      ]);
      if (facturas.error) throw facturas.error;
      if (gastos.error) throw gastos.error;
      const referencias = new Map<string, string>();
      for (const f of facturas.data ?? []) if (f.numero) referencias.set(f.id, f.numero);
      for (const g of gastos.data ?? []) if (g.num_factura_proveedor) referencias.set(g.id, g.num_factura_proveedor);
      const ejercicio = limitesEjercicio(anioFec);
      const contenido = construirFec(asientos ?? [], ejercicio, referencias);
      const blob = new Blob([codificarLatin9(contenido)], { type: 'text/plain;charset=iso-8859-15' });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombreFicheroFec(entidad.siren, ejercicio.fin);
      enlace.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setGenerandoFec(false);
    }
  };

  // Salvaguarda de integridad: ahora se carga todo por páginas (useAsientosContables), así que
  // esto solo avisaría si algo fallara a mitad de la carga.
  const { data: totalReal } = useQuery({
    queryKey: ['asientos_contables', 'count'],
    queryFn: async () => {
      const { count, error } = await supabase.from('asientos_contables').select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
  const truncado = totalReal != null && asientos != null && totalReal > asientos.length;

  // Control documento ↔ asiento (auditoría 2026-09-29): toda factura de Francia de la EURL y todo gasto
  // pagado de Francia debe tener su asiento vivo. Ya pasó con AC-2026-0021 (se guardó sin asiento) y
  // nada lo detectaba. Consultas con claves propias (no las compartidas ['facturas']/['gastos']).
  const { data: documentosContables } = useQuery({
    queryKey: ['libro-diario', 'documentos-contables'],
    queryFn: async () => {
      const [facturas, gastos] = await Promise.all([
        supabase.from('facturas').select('id, numero').eq('pais', 'Francia').eq('estructura_anterior', false).is('eliminado_en', null),
        supabase.from('gastos').select('id, descripcion, fecha').eq('pais', 'Francia').eq('estado_gasto', 'pagado'),
      ]);
      if (facturas.error) throw facturas.error;
      if (gastos.error) throw gastos.error;
      return {
        facturas: (facturas.data ?? []).map((f) => ({ id: f.id as string, nombre: (f.numero as string | null) ?? 'Factura' })),
        gastos: (gastos.data ?? []).map((g) => ({ id: g.id as string, nombre: `${(g.descripcion as string | null) ?? 'Gasto'} (${g.fecha ?? ''})` })),
      };
    },
  });
  const sinAsiento = useMemo(() => {
    if (!documentosContables || !asientos) return [];
    const vivos = new Set<string>();
    const netos = new Map<string, number>();
    for (const a of asientos) {
      if (a.tipo_evento !== 'creacion') continue;
      const clave = `${a.documento_id}|${a.cuenta}`;
      netos.set(clave, (netos.get(clave) ?? 0) + a.debe - a.haber);
    }
    for (const [clave, neto] of netos) if (Math.abs(neto) >= 0.005) vivos.add(clave.split('|')[0]);
    return [...documentosContables.facturas, ...documentosContables.gastos].filter((d) => !vivos.has(d.id));
  }, [documentosContables, asientos]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    // Orden aplicado aquí y no solo en el queryFn: la queryKey la comparten otras pantallas sin el
    // mismo .order() y Tanstack Query cachea el resultado de la primera que carga (mismo bug ya
    // corregido en Facturas/Presupuestos; hallazgo real de Gabriel 2026-09-25).
    const lista = [...(asientos ?? [])].sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (!q) return lista;
    return lista.filter((a) => a.concepto.toLowerCase().includes(q) || a.cuenta.includes(q));
  }, [asientos, busqueda]);

  const kpis = useMemo(() => {
    const lista = asientos ?? [];
    const totalDebe = lista.reduce((s, a) => s + a.debe, 0);
    const totalHaber = lista.reduce((s, a) => s + a.haber, 0);
    return [
      { label: 'Asientos', valor: lista.length },
      { label: 'Total debe', valor: `${formatearPrecioEntero(totalDebe)}` },
      { label: 'Total haber', valor: `${formatearPrecioEntero(totalHaber)}` },
      { label: 'Descuadre', valor: `${formatearPrecio((totalDebe - totalHaber))}`, acento: Math.abs(totalDebe - totalHaber) > 0.01 },
    ];
  }, [asientos]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-1.5">
          Libro diario
          <InfoTooltip>
            Registro cronológico de asientos contables (PCG francés), generado automáticamente al crear facturas y
            gastos de Francia. Solo lectura — un asiento nunca se edita ni se borra, se corrige con uno nuevo.
          </InfoTooltip>
        </h1>
      </div>

      {truncado && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-sm px-3 py-2 mb-4">
          Mostrando {asientos?.length} de {totalReal} apuntes — la consulta se ha truncado. Este libro no se puede
          confiar tal cual hasta resolverlo (contacta con soporte técnico).
        </div>
      )}

      {sinAsiento.length > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-sm px-3 py-2 mb-4">
          {sinAsiento.length} documento(s) sin asiento en el libro: {sinAsiento.slice(0, 5).map((d) => d.nombre).join(', ')}
          {sinAsiento.length > 5 ? '…' : ''}. Ábrelos y guárdalos de nuevo para contabilizarlos.
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
        <Select
          options={Array.from({ length: new Date().getFullYear() - PRIMER_EJERCICIO + 1 }, (_, i) => PRIMER_EJERCICIO + i).map((a) => ({
            value: String(a),
            label: `Ejercicio ${a}`,
          }))}
          value={String(anioFec)}
          onChange={(e) => setAnioFec(Number(e.target.value))}
          className="w-36"
        />
        <Button size="sm" variant="secondary" onClick={exportarFec} disabled={generandoFec || isLoading}>
          <span className="flex items-center gap-1.5">
            <FileDown size={14} />
            {generandoFec ? 'Generando...' : 'Exportar FEC'}
          </span>
        </Button>
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
            { key: 'debe', label: 'Debe', render: (a) => (a.debe > 0 ? `${formatearPrecio(a.debe)}` : '—') },
            { key: 'haber', label: 'Haber', render: (a) => (a.haber > 0 ? `${formatearPrecio(a.haber)}` : '—') },
          ]}
        />
      </div>
    </div>
  );
}
