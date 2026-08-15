import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UploadCloud, Link2, Ban, Receipt, Undo2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { KpiRow } from '../../components/ui/Kpi';
import { parseOfx } from '../../lib/ofx';
import { fechaVisitaCorta } from '../../lib/fechas';
import { GastoForm } from '../finanzas/gastos/GastoForm';
import { VincularFacturaModal } from './VincularFacturaModal';
import type { MovimientoBanco } from './types';

const FILTROS = ['Todos', 'Pendiente', 'Vinculado', 'Ignorado'] as const;
type Filtro = (typeof FILTROS)[number];

const VARIANTE_ESTADO = { Pendiente: 'pendiente', Vinculado: 'realizada', Ignorado: 'cancelada' } as const;

export default function BancoPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('Pendiente');
  const [movimientoParaFactura, setMovimientoParaFactura] = useState<MovimientoBanco | null>(null);
  const [movimientoParaGasto, setMovimientoParaGasto] = useState<MovimientoBanco | null>(null);

  const { data: movimientos, isLoading } = useQuery({
    queryKey: ['movimientos_banco'],
    queryFn: async () => {
      const { data, error } = await supabase.from('movimientos_banco').select('*').order('fecha', { ascending: false });
      if (error) throw error;
      return data as MovimientoBanco[];
    },
  });

  const ignorarMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('movimientos_banco').update({ estado: 'Ignorado' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movimientos_banco'] });
      toast.success('Movimiento ignorado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Solo deshace el estado del movimiento en sí — si ya se había marcado una factura como cobrada
  // o creado un gasto a partir de él, eso hay que corregirlo aparte en Facturas/Gastos.
  const deshacerMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('movimientos_banco')
        .update({ estado: 'Pendiente', factura_id: null, gasto_id: null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movimientos_banco'] });
      toast.success('Vínculo deshecho — revisa la factura o el gasto si hace falta corregirlo también allí');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleSubirArchivo = async (file: File) => {
    setSubiendo(true);
    try {
      const texto = await file.text();
      const parseados = parseOfx(texto);
      if (parseados.length === 0) {
        toast.error('No se ha encontrado ningún movimiento en el fichero. ¿Es un OFX válido?');
        return;
      }
      const { data: existentes, error: errorExistentes } = await supabase
        .from('movimientos_banco')
        .select('fitid')
        .in('fitid', parseados.map((m) => m.fitid));
      if (errorExistentes) throw errorExistentes;
      const fitidsExistentes = new Set((existentes ?? []).map((m) => m.fitid));
      const nuevos = parseados.filter((m) => !fitidsExistentes.has(m.fitid));

      if (nuevos.length === 0) {
        toast.success('Todos los movimientos de este fichero ya estaban importados');
        return;
      }

      const { error: errorInsert } = await supabase.from('movimientos_banco').insert(
        nuevos.map((m) => ({
          fitid: m.fitid,
          fecha: m.fecha,
          importe: m.importe,
          tipo: m.importe >= 0 ? 'Credito' : 'Debito',
          descripcion: m.descripcion,
          archivo_origen: file.name,
        })),
      );
      if (errorInsert) throw errorInsert;

      queryClient.invalidateQueries({ queryKey: ['movimientos_banco'] });
      const omitidos = parseados.length - nuevos.length;
      toast.success(`${nuevos.length} movimientos nuevos importados${omitidos > 0 ? ` (${omitidos} ya existían)` : ''}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo leer el fichero');
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const filtrados = (movimientos ?? []).filter((m) => filtro === 'Todos' || m.estado === filtro);

  const kpis = (() => {
    const pendientes = (movimientos ?? []).filter((m) => m.estado === 'Pendiente');
    const pendientesCredito = pendientes.filter((m) => m.importe >= 0).reduce((s, m) => s + m.importe, 0);
    const pendientesDebito = pendientes.filter((m) => m.importe < 0).reduce((s, m) => s + m.importe, 0);
    return [
      { label: 'Movimientos importados', valor: movimientos?.length ?? 0 },
      { label: 'Pendientes de revisar', valor: pendientes.length },
      { label: 'Ingresos pendientes', valor: `${pendientesCredito.toFixed(0)} €` },
      { label: 'Gastos pendientes', valor: `${Math.abs(pendientesDebito).toFixed(0)} €`, acento: true },
    ];
  })();

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Movimientos bancarios</h1>
        <p className="text-sm text-gray-500">
          Importa el fichero OFX exportado desde la banca online y vincula cada movimiento a una factura (ingreso) o
          crea un gasto — sin conexión automática todavía, ver Configuración → Sincronización bancaria para el plan a
          futuro.
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <label
          className={`flex items-center gap-2 border border-dashed rounded-sm px-4 py-2.5 text-sm cursor-pointer transition-colors ${
            subiendo ? 'border-gray-200 text-gray-400' : 'border-brand text-brand hover:bg-brand-light/40'
          }`}
        >
          <UploadCloud size={16} />
          {subiendo ? 'Importando...' : 'Importar fichero OFX'}
          <input
            ref={inputRef}
            type="file"
            accept=".ofx,.qfx"
            disabled={subiendo}
            onChange={(e) => e.target.files?.[0] && handleSubirArchivo(e.target.files[0])}
            className="hidden"
          />
        </label>
        <div className="inline-flex rounded-sm border border-gray-200 overflow-hidden text-xs ml-auto">
          {FILTROS.map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-2.5 py-1.5 ${filtro === f ? 'bg-brand text-white' : 'bg-surface text-gray-600 hover:bg-gray-50'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <KpiRow items={kpis} />

      <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden mt-4">
        <Table
          loading={isLoading}
          data={filtrados}
          emptyMessage="Sin movimientos — importa un fichero OFX de tu banca online para empezar"
          columns={[
            { key: 'fecha', label: 'Fecha', render: (m) => fechaVisitaCorta(m.fecha) },
            { key: 'descripcion', label: 'Descripción' },
            {
              key: 'importe',
              label: 'Importe',
              render: (m) => (
                <span className={m.importe >= 0 ? 'text-brand font-medium' : 'text-gray-900'}>
                  {m.importe.toFixed(2)} €
                </span>
              ),
            },
            {
              key: 'estado',
              label: 'Estado',
              render: (m) => <Badge variant={VARIANTE_ESTADO[m.estado]}>{m.estado}</Badge>,
            },
            {
              key: 'acciones',
              label: '',
              sortable: false,
              render: (m) => (
                <div className="flex items-center justify-end gap-1.5">
                  {m.estado === 'Pendiente' && m.importe >= 0 && (
                    <Button size="sm" variant="secondary" onClick={() => setMovimientoParaFactura(m)}>
                      <Link2 size={13} className="mr-1" />
                      Vincular a factura
                    </Button>
                  )}
                  {m.estado === 'Pendiente' && m.importe < 0 && (
                    <Button size="sm" variant="secondary" onClick={() => setMovimientoParaGasto(m)}>
                      <Receipt size={13} className="mr-1" />
                      Crear gasto
                    </Button>
                  )}
                  {m.estado === 'Pendiente' && (
                    <Button size="sm" variant="secondary" onClick={() => ignorarMutation.mutate(m.id)}>
                      <Ban size={13} className="mr-1" />
                      Ignorar
                    </Button>
                  )}
                  {m.estado !== 'Pendiente' && (
                    <Button size="sm" variant="secondary" onClick={() => deshacerMutation.mutate(m.id)}>
                      <Undo2 size={13} className="mr-1" />
                      Deshacer
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>

      <VincularFacturaModal movimiento={movimientoParaFactura} onClose={() => setMovimientoParaFactura(null)} />

      {movimientoParaGasto && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto animate-[fade-in_150ms_ease-out]">
          <div className="bg-transparent w-full">
            <GastoForm
              onClose={() => setMovimientoParaGasto(null)}
              prefill={{
                fecha: movimientoParaGasto.fecha,
                descripcion: movimientoParaGasto.descripcion ?? '',
                importeTotal: Math.abs(movimientoParaGasto.importe),
              }}
              onGuardado={async (gastoId) => {
                const { error } = await supabase
                  .from('movimientos_banco')
                  .update({ estado: 'Vinculado', gasto_id: gastoId })
                  .eq('id', movimientoParaGasto.id);
                if (error) {
                  toast.error(`Gasto creado, pero no se pudo marcar el movimiento como vinculado: ${error.message}`);
                  return;
                }
                queryClient.invalidateQueries({ queryKey: ['movimientos_banco'] });
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
