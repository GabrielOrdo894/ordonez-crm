import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, AlertTriangle, Check, Download, Undo2, Archive } from 'lucide-react';
import JSZip from 'jszip';
import { supabase } from '../../../lib/supabase';
import { notaSistema } from '../../../lib/notaSistema';
import { generarPdfFactura, generarPdfFacturaBlob } from '../../../lib/generarPdfFactura';
import { conAvisoDescarga } from '../../../lib/conAvisoDescarga';
import { mensajeError } from '../../../lib/mensajeError';
import { fechaCorta } from '../../../lib/fechas';
import { numeroOrdenable } from '../../../lib/numeracion';
import { registrarEvento } from '../../../lib/eventos';
import { DocumentoDetalleInline, type TipoDocumento } from '../DocumentoDetalleInline';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../../hooks/useToast';
import { useConfirmar } from '../../../hooks/useConfirm';
import { useSeleccionMultiple } from '../../../hooks/useSeleccionMultiple';
import { Table } from '../../../components/ui/Table';
import { Badge } from '../../../components/ui/Badge';
import { Select } from '../../../components/ui/Select';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { KpiRow } from '../../../components/ui/Kpi';
import { BulkActionsBar } from '../../../components/ui/BulkActionsBar';
import { AccionesFila, type AccionRapida } from '../../../components/ui/AccionesFila';
import { DescargarZipModal } from '../../../components/ui/DescargarZipModal';
import { ESTADOS_COBRO } from './types';
import { formatearPrecio } from '../lineas';
import type { Factura } from './types';
import { FacturaForm } from './FacturaForm';
import { IniciarFacturaPage, type InicioFactura } from './IniciarFacturaPage';
import { RegistrarPagoModal } from './RegistrarPagoModal';
import { RecordatorioPagoModal } from './RecordatorioPagoModal';

const ESTADOS_FILTRO = ['Todos', ...ESTADOS_COBRO];
const TIPOS_FILTRO = [
  { value: 'Todos', label: 'Todos' },
  { value: 'normal', label: 'Normal' },
  { value: 'acompte', label: 'Anticipo (acompte)' },
];
const PAISES_FILTRO = [
  { value: 'Todos', label: 'Todos' },
  { value: 'España', label: 'España' },
  { value: 'Francia', label: 'Francia' },
];

const VARIANTE_ESTADO: Record<string, 'pendiente' | 'confirmada' | 'realizada' | 'cancelada' | 'vencida' | 'default'> = {
  Pendiente: 'pendiente',
  Cobrada: 'realizada',
  'Cobrada parcialmente': 'confirmada',
  Vencida: 'vencida',
};

function totalFactura(f: Factura) {
  return f.lineas.reduce((s, l) => s + (l.es_incluido ? 0 : l.total_con_iva), 0);
}

function totalFacturaSinIva(f: Factura) {
  return f.lineas.reduce((s, l) => s + (l.es_incluido ? 0 : l.total_sin_iva), 0);
}

export default function FacturasPage() {
  const { user } = useAuth();
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('Todos');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<Factura | null>(null);
  const [creandoNueva, setCreandoNueva] = useState(false);
  const [inicioFactura, setInicioFactura] = useState<InicioFactura | null>(null);
  const [registrandoPago, setRegistrandoPago] = useState<Factura | null>(null);
  const [recordandoPago, setRecordandoPago] = useState<Factura | null>(null);
  const [viendoId, setViendoId] = useState<string | null>(null);
  const { seleccion, toggleFila, toggleTodas, limpiar } = useSeleccionMultiple();

  const [zipAbierto, setZipAbierto] = useState(false);
  const [zipEstado, setZipEstado] = useState('Todos');
  const [zipTipo, setZipTipo] = useState('Todos');
  const [zipPais, setZipPais] = useState('Todos');
  const [zipDesde, setZipDesde] = useState('');
  const [zipHasta, setZipHasta] = useState('');
  const [generandoZip, setGenerandoZip] = useState(false);
  const [progresoZip, setProgresoZip] = useState<{ hecho: number; total: number } | null>(null);

  const onAbrirOtro = (tipo: TipoDocumento, id: string) => {
    if (tipo === 'factura') {
      setViendoId(id);
    } else {
      navigate('/finanzas/presupuestos', { state: { verDocId: id, verDocTipo: 'presupuesto' } });
    }
  };

  useEffect(() => {
    const st = location.state as { verDocId?: string; verDocTipo?: TipoDocumento } | null;
    if (st?.verDocTipo === 'factura' && st.verDocId) {
      setViendoId(st.verDocId);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  const nombreUsuarioActual = (user?.user_metadata?.nombre as string) || user?.email || 'Sistema';

  const { data: facturas, isLoading } = useQuery({
    queryKey: ['facturas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facturas')
        .select('*')
        .is('eliminado_en', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Factura[];
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('facturas')
        .update({ eliminado_en: new Date().toISOString(), eliminado_por: nombreUsuarioActual })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturas'] });
      toast.success('Factura movida a la papelera');
    },
    onError: (error) => toast.error(error.message),
  });

  const quitarPagoMutation = useMutation({
    mutationFn: async (f: Factura) => {
      const { error } = await supabase
        .from('facturas')
        .update({ estado_cobro: 'Pendiente', fecha_pago: null, monto_pagado: null })
        .eq('id', f.id);
      if (error) throw error;
      if (f.visita_id) {
        await notaSistema(f.visita_id, `Pago de la factura ${f.numero} revertido por ${nombreUsuarioActual}`);
      }
      await registrarEvento('factura', f.id, 'Registro de pago revertido — vuelve a Pendiente');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturas'] });
      toast.success('Registro de pago eliminado, factura vuelve a Pendiente');
    },
    onError: (error) => toast.error(error.message),
  });

  const eliminarVariasMutation = useMutation({
    mutationFn: async (ids: (string | number)[]) => {
      const { error } = await supabase
        .from('facturas')
        .update({ eliminado_en: new Date().toISOString(), eliminado_por: nombreUsuarioActual })
        .in('id', ids as string[]);
      if (error) throw error;
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ['facturas'] });
      toast.success(`${ids.length} factura(s) movida(s) a la papelera`);
      limpiar();
    },
    onError: (error) => toast.error(error.message),
  });

  const quitarPagoVariasMutation = useMutation({
    mutationFn: async (ids: (string | number)[]) => {
      const { error } = await supabase
        .from('facturas')
        .update({ estado_cobro: 'Pendiente', fecha_pago: null, monto_pagado: null })
        .in('id', ids as string[]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturas'] });
      toast.success('Facturas marcadas como pendientes de cobro');
      limpiar();
    },
    onError: (error) => toast.error(error.message),
  });

  const filtradas = useMemo(() => {
    if (!facturas) return [];
    const q = busqueda.trim().toLowerCase();
    return facturas.filter((f) => {
      if (filtroEstado !== 'Todos' && f.estado_cobro !== filtroEstado) return false;
      if (desde && (!f.fecha_factura || f.fecha_factura < desde)) return false;
      if (hasta && (!f.fecha_factura || f.fecha_factura > hasta)) return false;
      if (q && !`${f.numero ?? ''} ${f.cliente_nombre ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [facturas, busqueda, filtroEstado, desde, hasta]);

  const paraZip = useMemo(() => {
    if (!facturas) return [];
    return facturas.filter((f) => {
      if (zipEstado !== 'Todos' && f.estado_cobro !== zipEstado) return false;
      if (zipTipo !== 'Todos' && (f.tipo ?? 'normal') !== zipTipo) return false;
      if (zipPais !== 'Todos' && (f.pais ?? '') !== zipPais) return false;
      if (zipDesde && (!f.fecha_factura || f.fecha_factura < zipDesde)) return false;
      if (zipHasta && (!f.fecha_factura || f.fecha_factura > zipHasta)) return false;
      return true;
    });
  }, [facturas, zipEstado, zipTipo, zipPais, zipDesde, zipHasta]);

  const kpis = useMemo(() => {
    const todas = facturas ?? [];
    const pendientes = todas.filter((f) => f.estado_cobro === 'Pendiente' || f.estado_cobro === 'Cobrada parcialmente').length;
    const cobradas = todas.filter((f) => f.estado_cobro === 'Cobrada');
    const vencidas = todas.filter((f) => f.estado_cobro === 'Vencida');
    const sinIva = (lista: Factura[]) => lista.reduce((s, f) => s + totalFacturaSinIva(f), 0);
    const conIva = (lista: Factura[]) => lista.reduce((s, f) => s + totalFactura(f), 0);
    const ingresosPais = (pais: string) => conIva(todas.filter((f) => f.pais === pais));
    return [
      { label: 'Total facturas', valor: todas.length },
      { label: 'Pendientes de cobro', valor: pendientes },
      { label: 'Ingresos Francia (con IVA)', valor: formatearPrecio(ingresosPais('Francia')), acento: true },
      { label: 'Ingresos España (con IVA)', valor: formatearPrecio(ingresosPais('España')) },
      {
        label: `Cobradas (${cobradas.length})`,
        valor: `${formatearPrecio(sinIva(cobradas))} sin IVA`,
        valorSecundario: `${formatearPrecio(conIva(cobradas))} con IVA`,
        acento: true,
      },
      {
        label: `Vencidas (${vencidas.length})`,
        valor: `${formatearPrecio(sinIva(vencidas))} sin IVA`,
        valorSecundario: `${formatearPrecio(conIva(vencidas))} con IVA`,
        acento: vencidas.length > 0,
      },
    ];
  }, [facturas]);

  const handleEliminar = async (f: Factura) => {
    if (!(await confirmar(`¿Eliminar la factura ${f.numero ?? ''}? Se moverá a la Papelera.`))) return;
    eliminarMutation.mutate(f.id);
  };

  const handleDescargarPdf = async (f: Factura) => {
    try {
      await conAvisoDescarga(() => generarPdfFactura(f), toast);
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el PDF'));
    }
  };

  const abrirZip = () => {
    setZipEstado(filtroEstado);
    setZipTipo('Todos');
    setZipDesde(desde);
    setZipHasta(hasta);
    setZipPais('Todos');
    setZipAbierto(true);
  };

  const handleDescargarZip = async () => {
    if (paraZip.length === 0) return;
    setGenerandoZip(true);
    setProgresoZip({ hecho: 0, total: paraZip.length });
    try {
      const zip = new JSZip();
      for (let i = 0; i < paraZip.length; i++) {
        const f = paraZip[i];
        const { blob } = await generarPdfFacturaBlob(f);
        zip.file(`${f.numero ?? `factura_${i + 1}`}.pdf`, blob);
        setProgresoZip({ hecho: i + 1, total: paraZip.length });
      }
      const contenido = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(contenido);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `facturas_${new Date().toISOString().slice(0, 10)}.zip`;
      enlace.click();
      URL.revokeObjectURL(url);
      toast.success(`${paraZip.length} factura(s) descargada(s) en ZIP`);
      setZipAbierto(false);
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el ZIP'));
    } finally {
      setGenerandoZip(false);
      setProgresoZip(null);
    }
  };

  const rapidasFactura = (f: Factura): AccionRapida[] => {
    const descargar: AccionRapida = { icon: Download, label: 'Descargar PDF', tono: 'neutro', onClick: () => handleDescargarPdf(f) };
    if (f.estado_cobro === 'Cobrada' || f.estado_cobro === 'Cobrada parcialmente') {
      return [{ icon: Undo2, label: 'Quitar registro de pago', tono: 'neutro', onClick: () => quitarPagoMutation.mutate(f) }, descargar];
    }
    return [{ icon: Check, label: 'Registrar pago', tono: 'brand', onClick: () => setRegistrandoPago(f) }, descargar];
  };

  if (creandoNueva && !inicioFactura) {
    return (
      <IniciarFacturaPage
        onCancelar={() => setCreandoNueva(false)}
        onContinuar={(inicio) => setInicioFactura(inicio)}
      />
    );
  }
  if (creandoNueva && inicioFactura) {
    const cerrarNueva = () => {
      setCreandoNueva(false);
      setInicioFactura(null);
    };
    if (inicioFactura.modo === 'presupuesto') {
      return <FacturaForm onClose={cerrarNueva} factura={null} desdePresupuesto={inicioFactura.presupuesto} />;
    }
    return (
      <FacturaForm
        onClose={cerrarNueva}
        factura={null}
        clienteInicialId={inicioFactura.clienteId}
        idiomaInicial={inicioFactura.idioma}
      />
    );
  }
  if (facturaSeleccionada) {
    return <FacturaForm onClose={() => setFacturaSeleccionada(null)} factura={facturaSeleccionada} />;
  }
  if (viendoId) {
    return <DocumentoDetalleInline tipo="factura" id={viendoId} onClose={() => setViendoId(null)} onAbrirOtro={onAbrirOtro} />;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por número o cliente"
            className="w-full border border-gray-200 rounded-sm pl-8 pr-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
        </div>
        <span className="text-sm text-gray-500 ml-auto mr-2">{filtradas.length} facturas</span>
        <Button variant="secondary" onClick={abrirZip} className="px-3 py-2 text-sm">
          <span className="flex items-center gap-1.5">
            <Archive size={14} />
            Descargar
          </span>
        </Button>
        <Button onClick={() => setCreandoNueva(true)} className="px-4 py-2 text-sm">
          + Nueva factura
        </Button>
      </div>

      <div className="flex items-end gap-2 mb-4 flex-wrap">
        <Select
          label="Estado de cobro"
          options={ESTADOS_FILTRO.map((e) => ({ value: e, label: e }))}
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="w-48"
        />
        <Input label="Fecha desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" />
        <Input label="Fecha hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" />
      </div>

      <KpiRow items={kpis} />

      <BulkActionsBar
        count={seleccion.size}
        onCancelar={limpiar}
        acciones={[
          {
            label: 'Quitar registro de pago',
            onClick: () => quitarPagoVariasMutation.mutate(Array.from(seleccion)),
            disabled: quitarPagoVariasMutation.isPending,
          },
          {
            label: 'Eliminar',
            variant: 'danger',
            onClick: async () => {
              if (!(await confirmar(`¿Eliminar ${seleccion.size} factura(s)? Se moverán a la Papelera.`))) return;
              eliminarVariasMutation.mutate(Array.from(seleccion));
            },
            disabled: eliminarVariasMutation.isPending,
          },
        ]}
      />

      <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden">
        <Table
          loading={isLoading}
          data={filtradas}
          emptyMessage="No hay facturas"
          onRowClick={(f) => setViendoId(f.id)}
          seleccion={seleccion}
          onToggleFila={toggleFila}
          onToggleTodas={toggleTodas}
          columns={[
            {
              key: 'numero',
              label: 'Factura',
              sortValue: (f) => numeroOrdenable(f.numero),
              render: (f) => (
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">
                    {f.numero ?? '—'}
                    {f.titulo && <span className="font-normal text-gray-500"> · {f.titulo}</span>}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{f.cliente_nombre}</p>
                  <p className="text-xs text-gray-400">
                    {fechaCorta(f.fecha_factura)} → {fechaCorta(f.fecha_vence)}
                  </p>
                </div>
              ),
            },
            {
              key: 'base',
              label: 'Base (sin IVA)',
              sortValue: (f) => totalFacturaSinIva(f),
              render: (f) => `${totalFacturaSinIva(f).toFixed(2)} €`,
            },
            {
              key: 'total',
              label: 'Total (con IVA)',
              sortValue: (f) => totalFactura(f),
              render: (f) => `${totalFactura(f).toFixed(2)} €`,
            },
            {
              key: 'estado_cobro',
              label: 'Estado',
              render: (f) => (
                <span className="flex items-center gap-1.5">
                  {f.estado_cobro === 'Vencida' && <AlertTriangle size={13} className="text-red-600" />}
                  <Badge variant={VARIANTE_ESTADO[f.estado_cobro] ?? 'default'}>{f.estado_cobro}</Badge>
                </span>
              ),
            },
            {
              key: 'acciones',
              label: '',
              sortable: false,
              render: (f) => (
                <AccionesFila
                  rapidas={rapidasFactura(f)}
                  menu={[
                    { label: 'Editar', onClick: () => setFacturaSeleccionada(f) },
                    { label: 'Descargar PDF', onClick: () => handleDescargarPdf(f) },
                    {
                      label: 'Recordar pago',
                      onClick: () => setRecordandoPago(f),
                      oculto: f.estado_cobro === 'Cobrada',
                    },
                    {
                      label: 'Registrar pago',
                      onClick: () => setRegistrandoPago(f),
                      oculto: f.estado_cobro === 'Cobrada',
                    },
                    {
                      label: 'Quitar registro de pago',
                      onClick: () => quitarPagoMutation.mutate(f),
                      oculto: f.estado_cobro !== 'Cobrada' && f.estado_cobro !== 'Cobrada parcialmente',
                    },
                    { label: 'Eliminar', onClick: () => handleEliminar(f), destructivo: true },
                  ]}
                />
              ),
            },
          ]}
        />
      </div>

      <RegistrarPagoModal factura={registrandoPago} onClose={() => setRegistrandoPago(null)} />
      <RecordatorioPagoModal factura={recordandoPago} onClose={() => setRecordandoPago(null)} />

      <DescargarZipModal
        open={zipAbierto}
        onClose={() => setZipAbierto(false)}
        titulo="Descargar facturas en ZIP"
        cantidad={paraZip.length}
        generando={generandoZip}
        progreso={progresoZip}
        onDescargar={handleDescargarZip}
      >
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Estado de cobro"
            options={ESTADOS_FILTRO.map((e) => ({ value: e, label: e }))}
            value={zipEstado}
            onChange={(e) => setZipEstado(e.target.value)}
          />
          <Select label="Tipo" options={TIPOS_FILTRO} value={zipTipo} onChange={(e) => setZipTipo(e.target.value)} />
          <Select label="País" options={PAISES_FILTRO} value={zipPais} onChange={(e) => setZipPais(e.target.value)} />
          <div />
          <Input label="Fecha desde" type="date" value={zipDesde} onChange={(e) => setZipDesde(e.target.value)} />
          <Input label="Fecha hasta" type="date" value={zipHasta} onChange={(e) => setZipHasta(e.target.value)} />
        </div>
      </DescargarZipModal>
    </div>
  );
}
