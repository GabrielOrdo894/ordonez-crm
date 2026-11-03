import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { fechaVisitaCorta } from '../../lib/fechas';
import { formatearPrecio } from '../finanzas/lineas';
import { CUENTAS_FR } from '../finanzas/gastos/types';
import { TIPOS_IVA } from '../finanzas/iva';
import { totalConIvaFactura, type Factura } from '../finanzas/facturas/types';
import type { Proveedor } from '../finanzas/proveedores/types';
import {
  CONTRAPARTIDAS_BANCO,
  cargarGastosLibres,
  cargarPagosLibres,
  crearGastoPendienteDesdeMovimiento,
  facturasPendientesDeCobro,
  guardarRegla,
  pendienteDeCobro,
  registrarComoOperacion,
  vincularACobrosExistentes,
  vincularAGastos,
  vincularMovimientoAFactura,
  type MovimientoConEnlaces,
} from '../../lib/conciliacionBancaria';
import {
  comercioDeMovimiento,
  normalizarTexto,
  sentidoDe,
  type ReglaBanco,
} from '../../lib/sugerenciasConciliacion';
import { sumarDiasIso, diasEntreIso } from '../../lib/fechas';

export type ReglaBorrador = Omit<ReglaBanco, 'id' | 'veces_aplicada'>;

type Pestana = 'cobros' | 'factura' | 'gastos' | 'nuevo' | 'otro';

type Props = {
  movimiento: MovimientoConEnlaces | null;
  onClose: () => void;
  // «Abrir formulario de gasto» completo (con justificante): lo abre la página, que ya sabe enlazar
  // el gasto guardado al movimiento. La regla se guarda allí, con la cuenta y el proveedor definitivos.
  onAbrirFormularioGasto: (movimiento: MovimientoConEnlaces, recordarPatron: string | null) => void;
};

const INVALIDAR = [
  'movimientos_banco',
  'facturas',
  'pagos_factura',
  'asientos_contables',
  'gastos',
  'reglas_banco',
  'conciliacion',
];

export function ConciliarMovimientoModal({ movimiento, onClose, onAbrirFormularioGasto }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const esCobro = (movimiento?.importe ?? 0) >= 0;
  const [pestana, setPestana] = useState<Pestana>('cobros');
  const [busqueda, setBusqueda] = useState('');
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [recordar, setRecordar] = useState(false);
  const [patron, setPatron] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [tipoIva, setTipoIva] = useState('TVA_20');
  const [proveedorId, setProveedorId] = useState('');
  const [contrapartida, setContrapartida] = useState('');
  const [concepto, setConcepto] = useState('');

  useEffect(() => {
    if (!movimiento) return;
    setPestana(movimiento.importe >= 0 ? 'cobros' : 'gastos');
    setBusqueda('');
    setElegidos(new Set());
    setRecordar(false);
    setPatron(comercioDeMovimiento(movimiento.descripcion));
    setCuenta('');
    setTipoIva('TVA_20');
    setProveedorId('');
    setContrapartida('');
    setConcepto(comercioDeMovimiento(movimiento.descripcion));
  }, [movimiento]);

  const abierto = !!movimiento;
  const { data: pagos } = useQuery({
    queryKey: ['conciliacion', 'pagos-libres'],
    enabled: abierto && esCobro,
    queryFn: cargarPagosLibres,
  });
  const { data: facturas } = useQuery({
    queryKey: ['facturas', 'pendientes-vinculo'],
    enabled: abierto && esCobro,
    queryFn: facturasPendientesDeCobro,
  });
  const desdeGastos = movimiento ? sumarDiasIso(movimiento.fecha, -120) : '';
  const { data: gastos } = useQuery({
    queryKey: ['conciliacion', 'gastos-libres', desdeGastos],
    enabled: abierto && !esCobro,
    queryFn: () => cargarGastosLibres(desdeGastos),
  });
  const { data: proveedores } = useQuery({
    queryKey: ['proveedores'],
    enabled: abierto && !esCobro,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proveedores')
        .select('*')
        .order('razon_social', { ascending: true });
      if (error) throw error;
      return data as Proveedor[];
    },
  });
  // ['proveedores'] la comparte ProveedoresPage con otro orden: se ordena aquí.
  const opcionesProveedor = useMemo(
    () => [
      { value: '', label: '— Sin proveedor —' },
      ...[...(proveedores ?? [])]
        .sort((a, b) => (a.razon_social ?? '').localeCompare(b.razon_social ?? '', 'es'))
        .map((p) => ({ value: p.id, label: p.razon_social ?? '—' })),
    ],
    [proveedores],
  );

  const importe = Math.abs(movimiento?.importe ?? 0);
  const q = normalizarTexto(busqueda);
  const cercania = (fecha: string) =>
    movimiento ? Math.abs(diasEntreIso(movimiento.fecha, fecha)) : 0;

  const pagosFiltrados = useMemo(
    () =>
      (pagos ?? [])
        .filter((p) => !q || normalizarTexto(`${p.numero} ${p.cliente_nombre}`).includes(q))
        .sort((a, b) => cercania(a.fecha) - cercania(b.fecha))
        .slice(0, 60),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pagos, q, movimiento],
  );
  const gastosFiltrados = useMemo(
    () =>
      (gastos ?? [])
        .filter((g) => !q || normalizarTexto(`${g.proveedor} ${g.descripcion}`).includes(q))
        .sort((a, b) => cercania(a.fecha) - cercania(b.fecha))
        .slice(0, 80),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gastos, q, movimiento],
  );
  const facturasFiltradas = useMemo(
    () =>
      [...(facturas ?? [])]
        .filter(
          (f) => !q || normalizarTexto(`${f.numero} ${f.cliente_nombre} ${f.titulo}`).includes(q),
        )
        .sort(
          (a, b) =>
            Math.abs(pendienteDeCobro(a) - importe) - Math.abs(pendienteDeCobro(b) - importe),
        ),
    [facturas, q, importe],
  );

  const sumaElegidos =
    pestana === 'cobros'
      ? (pagos ?? []).filter((p) => elegidos.has(p.id)).reduce((s, p) => s + p.monto, 0)
      : (gastos ?? []).filter((g) => elegidos.has(g.id)).reduce((s, g) => s + g.total, 0);
  const diferencia = Math.round((importe - sumaElegidos) * 100) / 100;

  const alternar = (id: string) =>
    setElegidos((actual) => {
      const s = new Set(actual);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const terminar = (mensaje: string) => {
    for (const k of INVALIDAR) queryClient.invalidateQueries({ queryKey: [k] });
    toast.success(mensaje);
    onClose();
  };

  const reglaBorrador = (accion: ReglaBorrador['accion']): ReglaBorrador | null =>
    recordar && movimiento
      ? {
          patron: patron.trim(),
          sentido: sentidoDe(movimiento.importe),
          accion,
          proveedor_id: accion === 'gasto' ? proveedorId || null : null,
          cuenta_contable: accion === 'gasto' ? cuenta || null : null,
          tipo_iva: accion === 'gasto' ? tipoIva : null,
          descripcion: accion === 'operacion' ? concepto.trim() || null : null,
          contrapartida: accion === 'operacion' ? contrapartida || null : null,
        }
      : null;

  const mutation = useMutation({
    mutationFn: async ({
      accion,
      factura,
    }: {
      accion: 'enlazar' | 'factura' | 'gasto_pendiente' | 'operacion' | 'ignorar';
      factura?: Factura;
    }) => {
      if (!movimiento) return '';
      if (accion === 'enlazar' && pestana === 'cobros') {
        await vincularACobrosExistentes(
          movimiento,
          (pagos ?? []).filter((p) => elegidos.has(p.id)),
        );
        return 'Ingreso conciliado con los cobros ya registrados';
      }
      if (accion === 'enlazar') {
        await vincularAGastos(
          movimiento,
          (gastos ?? []).filter((g) => elegidos.has(g.id)),
        );
        return 'Pago conciliado con los gastos';
      }
      if (accion === 'factura' && factura) {
        const { avisoAsiento } = await vincularMovimientoAFactura(movimiento, factura, 'manual');
        if (avisoAsiento) toast.warning(avisoAsiento);
        return `Cobro registrado en ${factura.numero} y conciliado`;
      }
      const regla = reglaBorrador(
        accion === 'gasto_pendiente' ? 'gasto' : accion === 'operacion' ? 'operacion' : 'ignorar',
      );
      if (accion === 'gasto_pendiente') {
        const datos = {
          patron: patron.trim(),
          sentido: 'pago' as const,
          accion: 'gasto' as const,
          proveedor_id: proveedorId || null,
          cuenta_contable: cuenta || null,
          tipo_iva: tipoIva,
          descripcion: null,
          contrapartida: null,
        };
        await crearGastoPendienteDesdeMovimiento(movimiento, {
          ...datos,
          id: '',
          veces_aplicada: 0,
        });
        if (regla) await guardarRegla(regla);
        return 'Gasto pendiente creado: complétalo con su justificante en Gastos';
      }
      if (accion === 'operacion') {
        if (!contrapartida) throw new Error('Elige qué es el movimiento.');
        if (!concepto.trim()) throw new Error('Escribe un concepto.');
        await registrarComoOperacion(movimiento, contrapartida, concepto.trim());
        if (regla) await guardarRegla(regla);
        return 'Movimiento registrado en el libro diario';
      }
      const { error } = await supabase
        .from('movimientos_banco')
        .update({ estado: 'Ignorado' })
        .eq('id', movimiento.id)
        .eq('estado', 'Pendiente');
      if (error) throw error;
      if (regla) await guardarRegla(regla);
      return regla
        ? `Ignorado, y se ignorarán los próximos de «${regla.patron}»`
        : 'Movimiento ignorado';
    },
    onSuccess: (mensaje) => terminar(mensaje),
    onError: (error: Error) => toast.error(error.message),
  });

  if (!movimiento) return null;

  const pestanas: { id: Pestana; label: string }[] = esCobro
    ? [
        { id: 'cobros', label: 'Cobros ya registrados' },
        { id: 'factura', label: 'Factura pendiente' },
        { id: 'otro', label: 'Otro (socio, préstamo…)' },
      ]
    : [
        { id: 'gastos', label: 'Gastos ya registrados' },
        { id: 'nuevo', label: 'Gasto nuevo' },
        { id: 'otro', label: 'Otro (TVA, comisión, socio…)' },
      ];

  const bloqueRecordar = (
    <label className="flex items-start gap-2 text-sm text-gray-700 mt-3">
      <input
        type="checkbox"
        checked={recordar}
        onChange={(e) => setRecordar(e.target.checked)}
        className="mt-1"
      />
      <span className="flex-1">
        Recordar para los próximos movimientos que contengan
        {recordar && (
          <Input
            value={patron}
            onChange={(e) => setPatron(e.target.value)}
            className="mt-1"
            hint="Puedes acortarlo (p. ej. «ASF» para todos los peajes)."
          />
        )}
        {!recordar && <span className="font-medium"> «{patron}»</span>}
      </span>
    </label>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={esCobro ? 'Conciliar ingreso' : 'Conciliar pago'}
      size="lg"
    >
      <p className="text-sm text-gray-500 mb-3">
        <span className="font-medium text-gray-800">
          {comercioDeMovimiento(movimiento.descripcion) || movimiento.descripcion}
        </span>{' '}
        · {fechaVisitaCorta(movimiento.fecha)} ·{' '}
        <span className={`font-semibold ${esCobro ? 'text-brand' : 'text-gray-900'}`}>
          {formatearPrecio(movimiento.importe)}
        </span>
      </p>

      <div className="inline-flex rounded-sm border border-gray-200 overflow-hidden text-xs mb-3">
        {pestanas.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setPestana(p.id);
              setElegidos(new Set());
            }}
            className={`px-2.5 py-1.5 ${pestana === p.id ? 'bg-brand text-white' : 'bg-surface text-gray-600 hover:bg-gray-50'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {(pestana === 'cobros' || pestana === 'gastos' || pestana === 'factura') && (
        <div className="relative mb-3">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={
              pestana === 'gastos'
                ? 'Buscar por proveedor o descripción'
                : 'Buscar por cliente o número'
            }
            className="w-full border border-gray-200 rounded-sm pl-8 pr-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
        </div>
      )}

      {pestana === 'cobros' && (
        <>
          <p className="text-xs text-gray-500 mb-2">
            Cobros que registraste a mano y que todavía no están unidos a ningún movimiento. Marca
            uno o varios (una transferencia que paga varias facturas): no se crea ningún pago nuevo.
          </p>
          <ListaSeleccion
            vacia="No hay cobros registrados sin conciliar."
            filas={pagosFiltrados.map((p) => ({
              id: p.id,
              titulo: `${p.numero ?? '—'} · ${p.cliente_nombre ?? ''}`,
              detalle: `Cobro del ${fechaVisitaCorta(p.fecha)}`,
              importe: p.monto,
            }))}
            elegidos={elegidos}
            alternar={alternar}
            importeObjetivo={importe}
          />
        </>
      )}

      {pestana === 'gastos' && (
        <>
          <p className="text-xs text-gray-500 mb-2">
            Gastos registrados que todavía no están unidos a ningún pago del banco. Marca uno o
            varios (una transferencia al proveedor que salda varias facturas suyas).
          </p>
          <ListaSeleccion
            vacia="No hay gastos sin conciliar en los últimos meses."
            filas={gastosFiltrados.map((g) => ({
              id: g.id,
              titulo: g.proveedor ?? 'Sin proveedor',
              detalle: `${fechaVisitaCorta(g.fecha)} · ${g.descripcion ?? ''}`,
              importe: g.total,
            }))}
            elegidos={elegidos}
            alternar={alternar}
            importeObjetivo={importe}
          />
        </>
      )}

      {(pestana === 'cobros' || pestana === 'gastos') && (
        <div className="flex items-center justify-between mt-3 text-sm">
          <span
            className={
              diferencia === 0 && elegidos.size > 0 ? 'text-brand font-medium' : 'text-gray-500'
            }
          >
            Elegido {formatearPrecio(sumaElegidos)} de {formatearPrecio(importe)}
            {elegidos.size > 0 && diferencia !== 0 && ` · faltan ${formatearPrecio(diferencia)}`}
          </span>
          <Button
            disabled={elegidos.size === 0 || diferencia !== 0 || mutation.isPending}
            onClick={() => mutation.mutate({ accion: 'enlazar' })}
          >
            {mutation.isPending ? 'Conciliando...' : 'Conciliar'}
          </Button>
        </div>
      )}

      {pestana === 'factura' && (
        <>
          <p className="text-xs text-gray-500 mb-2">
            Registra el cobro en una factura que todavía tiene importe pendiente (crea el pago y su
            asiento). Si el cobro ya lo apuntaste a mano, usa «Cobros ya registrados».
          </p>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {facturasFiltradas.length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">
                No hay facturas pendientes de cobro.
              </p>
            )}
            {facturasFiltradas.map((f) => {
              const pendiente = pendienteDeCobro(f);
              return (
                <button
                  key={f.id}
                  onClick={() => mutation.mutate({ accion: 'factura', factura: f })}
                  disabled={mutation.isPending || importe > pendiente + 0.005}
                  className="w-full flex items-center justify-between gap-3 border border-gray-200 rounded-sm px-3 py-2 text-left hover:border-brand hover:bg-brand-light/40 disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {f.numero} · {f.cliente_nombre}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {f.titulo} · total {formatearPrecio(totalConIvaFactura(f))}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {formatearPrecio(pendiente)}
                    </p>
                    <p
                      className={`text-xs ${Math.abs(pendiente - importe) < 0.01 ? 'text-brand' : 'text-gray-400'}`}
                    >
                      {Math.abs(pendiente - importe) < 0.01
                        ? 'Coincide exacto'
                        : importe > pendiente
                          ? 'Supera lo pendiente'
                          : 'Cobro parcial'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {pestana === 'nuevo' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            «Formulario completo» abre el gasto con su justificante y lo deja registrado. «Gasto
            pendiente» lo crea ya con la cuenta y el IVA para completarlo después en Gastos (no
            entra en la contabilidad hasta tener el justificante).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Cuenta"
              value={cuenta}
              onChange={(e) => setCuenta(e.target.value)}
              options={[{ value: '', label: '— Sin cuenta —' }, ...CUENTAS_FR]}
            />
            <Select
              label="IVA del ticket"
              value={tipoIva}
              onChange={(e) => setTipoIva(e.target.value)}
              options={TIPOS_IVA.filter((t) => t.value !== 'IVA_21' && t.value !== 'IVA_10').map(
                (t) => ({ value: t.value, label: t.label }),
              )}
            />
            <div className="col-span-2">
              <Select
                label="Proveedor"
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
                options={opcionesProveedor}
              />
            </div>
          </div>
          {bloqueRecordar}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => onAbrirFormularioGasto(movimiento, recordar ? patron.trim() : null)}
            >
              Formulario completo
            </Button>
            <Button
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ accion: 'gasto_pendiente' })}
            >
              {mutation.isPending ? 'Creando...' : 'Crear gasto pendiente'}
            </Button>
          </div>
        </div>
      )}

      {pestana === 'otro' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Para lo que no es una venta ni un gasto con factura. Se registra en el libro diario
            contra el banco (512).
          </p>
          <Select
            label="Qué es"
            value={contrapartida}
            onChange={(e) => setContrapartida(e.target.value)}
            options={[
              { value: '', label: '— Elige —' },
              ...CONTRAPARTIDAS_BANCO.filter(
                (c) => c.sentido === sentidoDe(movimiento.importe),
              ).map((c) => ({ value: c.cuenta, label: c.etiqueta })),
            ]}
          />
          <Input label="Concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          {bloqueRecordar}
          <div className="flex justify-between gap-2">
            <Button
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ accion: 'ignorar' })}
            >
              {recordar ? 'Ignorar este y los próximos' : 'Ignorar este movimiento'}
            </Button>
            <Button
              disabled={mutation.isPending || !contrapartida}
              onClick={() => mutation.mutate({ accion: 'operacion' })}
            >
              {mutation.isPending ? 'Registrando...' : 'Registrar en el libro'}
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-end mt-4">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </Modal>
  );
}

function ListaSeleccion({
  filas,
  elegidos,
  alternar,
  vacia,
  importeObjetivo,
}: {
  filas: { id: string; titulo: string; detalle: string; importe: number }[];
  elegidos: Set<string>;
  alternar: (id: string) => void;
  vacia: string;
  importeObjetivo: number;
}) {
  if (filas.length === 0) return <p className="text-sm text-gray-400 py-4 text-center">{vacia}</p>;
  return (
    <div className="space-y-1.5 max-h-72 overflow-y-auto">
      {filas.map((f) => (
        <label
          key={f.id}
          className={`flex items-center gap-3 border rounded-sm px-3 py-2 cursor-pointer ${
            elegidos.has(f.id)
              ? 'border-brand bg-brand-light/40'
              : 'border-gray-200 hover:border-brand'
          }`}
        >
          <input type="checkbox" checked={elegidos.has(f.id)} onChange={() => alternar(f.id)} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 truncate">{f.titulo}</p>
            <p className="text-xs text-gray-500 truncate">{f.detalle}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold text-gray-900">{formatearPrecio(f.importe)}</p>
            {Math.abs(f.importe - importeObjetivo) < 0.01 && (
              <p className="text-xs text-brand">Mismo importe</p>
            )}
          </div>
        </label>
      ))}
    </div>
  );
}
