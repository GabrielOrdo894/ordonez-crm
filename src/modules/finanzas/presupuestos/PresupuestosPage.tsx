import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Check, Send, RotateCcw, Download, Archive } from 'lucide-react';
import JSZip from 'jszip';
import { supabase } from '../../../lib/supabase';
import { notaSistema } from '../../../lib/notaSistema';
import { sincronizarPipelineCliente } from '../../../lib/pipelineSync';
import { generarPdfPresupuesto, generarPdfPresupuestoBlob } from '../../../lib/generarPdfPresupuesto';
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
import type { AccionMenu } from '../../../components/ui/DropdownMenu';
import { DescargarZipModal } from '../../../components/ui/DescargarZipModal';
import { ESTADOS_PRESUPUESTO, TIPOS_PRESUPUESTO, calcularTotalesRango, porcentajeIva } from './types';
import { formatearPrecio } from '../lineas';
import type { Linea } from '../lineas';
import type { Presupuesto } from './types';
import { PresupuestoForm } from './PresupuestoForm';
import { CrearAcompteModal } from './CrearAcompteModal';
import { IniciarPresupuestoPage } from './IniciarPresupuestoPage';
import type { InicioPresupuesto } from './IniciarPresupuestoPage';
import { FacturaForm } from '../facturas/FacturaForm';

const ESTADOS_FILTRO = ['Todos', ...ESTADOS_PRESUPUESTO];
const TIPOS_FILTRO = [{ value: 'Todos', label: 'Todos' }, ...TIPOS_PRESUPUESTO];
const PAISES_FILTRO = [
  { value: 'Todos', label: 'Todos' },
  { value: 'España', label: 'España' },
  { value: 'Francia', label: 'Francia' },
];

const VARIANTE_ESTADO: Record<string, 'pendiente' | 'confirmada' | 'realizada' | 'cancelada' | 'default'> = {
  Borrador: 'default',
  Pendiente: 'pendiente',
  Aceptado: 'realizada',
  Rechazado: 'cancelada',
};

function totalPresupuestoSinIva(p: Presupuesto) {
  return p.lineas.reduce((s, l) => s + (l.es_incluido ? 0 : l.total_sin_iva), 0);
}

// Orientativo nunca lleva IVA (por normativa se determina en el presupuesto definitivo tras la
// visita técnica) — para esos usa siempre la base sin IVA, nunca el importe "con IVA" guardado.
function totalPresupuesto(p: Presupuesto) {
  if ((p.tipo ?? 'normal') === 'orientativo') return totalPresupuestoSinIva(p);
  return p.lineas.reduce((s, l) => s + (l.es_incluido ? 0 : l.total_con_iva), 0);
}

type FacturarDesde = { presupuesto: Presupuesto; lineaAcompte?: Linea; fechaAcompte?: string };

export default function PresupuestosPage() {
  const { user } = useAuth();
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('Todos');
  const [filtroTipo, setFiltroTipo] = useState('Todos');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [presupuestoSeleccionado, setPresupuestoSeleccionado] = useState<Presupuesto | null>(null);
  const [creandoNuevo, setCreandoNuevo] = useState(false);
  const [inicioPresupuesto, setInicioPresupuesto] = useState<InicioPresupuesto | null>(null);
  const [facturandoDesde, setFacturandoDesde] = useState<FacturarDesde | null>(null);
  const [creandoDesdeOrientativo, setCreandoDesdeOrientativo] = useState<Presupuesto | null>(null);
  const [creandoAcompte, setCreandoAcompte] = useState<Presupuesto | null>(null);
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
    if (tipo === 'presupuesto') {
      setViendoId(id);
    } else {
      navigate('/finanzas/facturas', { state: { verDocId: id, verDocTipo: 'factura' } });
    }
  };

  useEffect(() => {
    const st = location.state as { verDocId?: string; verDocTipo?: TipoDocumento } | null;
    if (st?.verDocTipo === 'presupuesto' && st.verDocId) {
      setViendoId(st.verDocId);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  useEffect(() => {
    if ((location.state as { autoCrear?: boolean } | null)?.autoCrear) {
      setCreandoNuevo(true);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  const nombreUsuarioActual = (user?.user_metadata?.nombre as string) || user?.email || 'Sistema';

  const { data: presupuestos, isLoading } = useQuery({
    queryKey: ['presupuestos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('*')
        .is('eliminado_en', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Presupuesto[];
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('presupuestos')
        .update({ eliminado_en: new Date().toISOString(), eliminado_por: nombreUsuarioActual })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['presupuestos'] });
      toast.success('Presupuesto movido a la papelera');
    },
    onError: (error) => toast.error(error.message),
  });

  const cambiarEstadoMutation = useMutation({
    mutationFn: async ({ p, estado }: { p: Presupuesto; estado: string }) => {
      const { error } = await supabase.from('presupuestos').update({ estado }).eq('id', p.id);
      if (error) throw error;
      if (p.visita_id) {
        await notaSistema(p.visita_id, `Presupuesto ${p.numero} marcado como ${estado} por ${nombreUsuarioActual}`);
      }
      await registrarEvento('presupuesto', p.id, `Marcado como ${estado}`);
      await sincronizarPipelineCliente(p.cliente_tel);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['presupuestos'] });
      toast.success('Estado actualizado');
    },
    onError: (error) => toast.error(error.message),
  });

  const eliminarVariosMutation = useMutation({
    mutationFn: async (ids: (string | number)[]) => {
      const { error } = await supabase
        .from('presupuestos')
        .update({ eliminado_en: new Date().toISOString(), eliminado_por: nombreUsuarioActual })
        .in('id', ids as string[]);
      if (error) throw error;
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ['presupuestos'] });
      toast.success(`${ids.length} presupuesto(s) movido(s) a la papelera`);
      limpiar();
    },
    onError: (error) => toast.error(error.message),
  });

  const cambiarEstadoVariosMutation = useMutation({
    mutationFn: async ({ ids, estado }: { ids: (string | number)[]; estado: string }) => {
      const { error } = await supabase.from('presupuestos').update({ estado }).in('id', ids as string[]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['presupuestos'] });
      toast.success('Estado actualizado');
      limpiar();
    },
    onError: (error) => toast.error(error.message),
  });

  const filtrados = useMemo(() => {
    if (!presupuestos) return [];
    const q = busqueda.trim().toLowerCase();
    return presupuestos.filter((p) => {
      if (filtroEstado !== 'Todos' && p.estado !== filtroEstado) return false;
      if (filtroTipo !== 'Todos' && (p.tipo ?? 'normal') !== filtroTipo) return false;
      if (desde && (!p.fecha_emision || p.fecha_emision < desde)) return false;
      if (hasta && (!p.fecha_emision || p.fecha_emision > hasta)) return false;
      if (q && !`${p.numero ?? ''} ${p.cliente_nombre ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [presupuestos, busqueda, filtroEstado, filtroTipo, desde, hasta]);

  const paraZip = useMemo(() => {
    if (!presupuestos) return [];
    return presupuestos.filter((p) => {
      if (zipEstado !== 'Todos' && p.estado !== zipEstado) return false;
      if (zipTipo !== 'Todos' && (p.tipo ?? 'normal') !== zipTipo) return false;
      if (zipPais !== 'Todos' && (p.pais ?? '') !== zipPais) return false;
      if (zipDesde && (!p.fecha_emision || p.fecha_emision < zipDesde)) return false;
      if (zipHasta && (!p.fecha_emision || p.fecha_emision > zipHasta)) return false;
      return true;
    });
  }, [presupuestos, zipEstado, zipTipo, zipPais, zipDesde, zipHasta]);

  const kpis = useMemo(() => {
    const todos = presupuestos ?? [];
    const aceptados = todos.filter((p) => p.estado === 'Aceptado');
    const enEspera = todos.filter((p) => p.estado === 'Pendiente');
    const normales = todos.filter((p) => (p.tipo ?? 'normal') === 'normal');
    const orientativos = todos.filter((p) => p.tipo === 'orientativo');
    const normalesFrancia = normales.filter((p) => p.pais === 'Francia').length;
    const normalesEspana = normales.filter((p) => p.pais === 'España').length;
    const sinIva = (lista: Presupuesto[]) => lista.reduce((s, p) => s + totalPresupuestoSinIva(p), 0);
    const conIva = (lista: Presupuesto[]) => lista.reduce((s, p) => s + totalPresupuesto(p), 0);
    return [
      { label: 'Presupuestos normales Francia', valor: normalesFrancia, acento: true },
      { label: 'Presupuestos normales España', valor: normalesEspana },
      {
        label: 'Aceptados / en espera',
        valor: `${aceptados.length} aceptados`,
        valorSecundario: `${enEspera.length} en espera`,
      },
      {
        label: 'Normales / orientativos',
        valor: `${normales.length} normales`,
        valorSecundario: `${orientativos.length} orientativos`,
      },
      {
        label: `Aceptados (${aceptados.length})`,
        valor: `${formatearPrecio(sinIva(aceptados))} sin IVA`,
        valorSecundario: `${formatearPrecio(conIva(aceptados))} con IVA`,
        acento: true,
      },
      {
        label: `En espera (${enEspera.length})`,
        valor: `${formatearPrecio(sinIva(enEspera))} sin IVA`,
        valorSecundario: `${formatearPrecio(conIva(enEspera))} con IVA`,
      },
    ];
  }, [presupuestos]);

  const handleEliminar = async (p: Presupuesto) => {
    if (!(await confirmar(`¿Eliminar el presupuesto ${p.numero ?? ''}? Se moverá a la Papelera.`))) return;
    eliminarMutation.mutate(p.id);
  };

  const handleDescargarPdf = async (p: Presupuesto) => {
    try {
      await conAvisoDescarga(() => generarPdfPresupuesto(p), toast);
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el PDF'));
    }
  };

  const abrirZip = () => {
    setZipEstado(filtroEstado);
    setZipTipo(filtroTipo);
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
        const p = paraZip[i];
        const { blob } = await generarPdfPresupuestoBlob(p);
        zip.file(`${p.numero ?? `presupuesto_${i + 1}`}.pdf`, blob);
        setProgresoZip({ hecho: i + 1, total: paraZip.length });
      }
      const contenido = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(contenido);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `presupuestos_${new Date().toISOString().slice(0, 10)}.zip`;
      enlace.click();
      URL.revokeObjectURL(url);
      toast.success(`${paraZip.length} presupuesto(s) descargado(s) en ZIP`);
      setZipAbierto(false);
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el ZIP'));
    } finally {
      setGenerandoZip(false);
      setProgresoZip(null);
    }
  };

  const rapidasPresupuesto = (p: Presupuesto): AccionRapida[] => {
    const cambiar = (estado: string) => () => cambiarEstadoMutation.mutate({ p, estado });
    const transicion: AccionRapida =
      p.estado === 'Pendiente'
        ? { icon: Check, label: 'Marcar como aceptado', tono: 'brand', onClick: cambiar('Aceptado') }
        : p.estado === 'Borrador'
          ? { icon: Send, label: 'Marcar como pendiente', tono: 'neutro', onClick: cambiar('Pendiente') }
          : { icon: RotateCcw, label: 'Volver a borrador', tono: 'neutro', onClick: cambiar('Borrador') };
    return [transicion, { icon: Download, label: 'Descargar PDF', tono: 'neutro', onClick: () => handleDescargarPdf(p) }];
  };

  if (creandoNuevo && !inicioPresupuesto) {
    return (
      <IniciarPresupuestoPage
        onCancelar={() => setCreandoNuevo(false)}
        onContinuar={(inicio) => setInicioPresupuesto(inicio)}
      />
    );
  }
  if (creandoNuevo && inicioPresupuesto) {
    return (
      <PresupuestoForm
        onClose={() => {
          setCreandoNuevo(false);
          setInicioPresupuesto(null);
        }}
        presupuesto={null}
        tipoInicial={inicioPresupuesto.tipo}
        formatoInicial={inicioPresupuesto.formato}
        clienteInicialId={inicioPresupuesto.clienteId}
        idiomaInicial={inicioPresupuesto.idioma}
      />
    );
  }
  if (presupuestoSeleccionado) {
    return <PresupuestoForm onClose={() => setPresupuestoSeleccionado(null)} presupuesto={presupuestoSeleccionado} />;
  }
  if (viendoId) {
    return (
      <DocumentoDetalleInline tipo="presupuesto" id={viendoId} onClose={() => setViendoId(null)} onAbrirOtro={onAbrirOtro} />
    );
  }
  if (creandoDesdeOrientativo) {
    return (
      <PresupuestoForm onClose={() => setCreandoDesdeOrientativo(null)} presupuesto={null} desdeOrientativo={creandoDesdeOrientativo} />
    );
  }
  if (facturandoDesde) {
    return (
      <FacturaForm
        onClose={() => setFacturandoDesde(null)}
        desdePresupuesto={facturandoDesde.presupuesto}
        lineaAcompte={facturandoDesde.lineaAcompte ?? null}
        fechaAcompte={facturandoDesde.fechaAcompte ?? null}
      />
    );
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
        <span className="text-sm text-gray-500 ml-auto mr-2">{filtrados.length} presupuestos</span>
        <Button variant="secondary" onClick={abrirZip} className="px-3 py-2 text-sm">
          <span className="flex items-center gap-1.5">
            <Archive size={14} />
            Descargar
          </span>
        </Button>
        <Button onClick={() => setCreandoNuevo(true)} className="px-4 py-2 text-sm">
          + Nuevo presupuesto
        </Button>
      </div>

      <div className="flex items-end gap-2 mb-4 flex-wrap">
        <Select
          label="Estado"
          options={ESTADOS_FILTRO.map((e) => ({ value: e, label: e }))}
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="w-48"
        />
        <Select
          label="Tipo"
          options={TIPOS_FILTRO}
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="w-48"
        />
        <Input label="Emisión desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" />
        <Input label="Emisión hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" />
      </div>

      <KpiRow items={kpis} />

      <BulkActionsBar
        count={seleccion.size}
        onCancelar={limpiar}
        acciones={[
          {
            label: 'Marcar aceptado',
            onClick: () => cambiarEstadoVariosMutation.mutate({ ids: Array.from(seleccion), estado: 'Aceptado' }),
            disabled: cambiarEstadoVariosMutation.isPending,
          },
          {
            label: 'Marcar rechazado',
            onClick: () => cambiarEstadoVariosMutation.mutate({ ids: Array.from(seleccion), estado: 'Rechazado' }),
            disabled: cambiarEstadoVariosMutation.isPending,
          },
          {
            label: 'Eliminar',
            variant: 'danger',
            onClick: async () => {
              if (!(await confirmar(`¿Eliminar ${seleccion.size} presupuesto(s)? Se moverán a la Papelera.`))) return;
              eliminarVariosMutation.mutate(Array.from(seleccion));
            },
            disabled: eliminarVariosMutation.isPending,
          },
        ]}
      />

      <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden">
        <Table
          loading={isLoading}
          data={filtrados}
          emptyMessage="No hay presupuestos"
          onRowClick={(p) => setViendoId(p.id)}
          seleccion={seleccion}
          onToggleFila={toggleFila}
          onToggleTodas={toggleTodas}
          columns={[
            {
              key: 'numero',
              label: 'Presupuesto',
              sortValue: (p) => numeroOrdenable(p.numero),
              render: (p) => (
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">
                    {p.numero ?? '—'}
                    {p.titulo && <span className="font-normal text-gray-500"> · {p.titulo}</span>}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{p.cliente_nombre}</p>
                  <p className="text-xs text-gray-400">
                    {fechaCorta(p.fecha_emision)} → {fechaCorta(p.fecha_validez)}
                  </p>
                </div>
              ),
            },
            {
              key: 'tipo',
              label: 'Tipo',
              render: (p) =>
                (p.tipo ?? 'normal') === 'orientativo' ? (
                  <Badge variant="pendiente">Orientativo</Badge>
                ) : (
                  <span className="text-gray-400">Normal</span>
                ),
            },
            {
              key: 'base',
              label: 'Base (sin IVA)',
              sortValue: (p) => totalPresupuestoSinIva(p),
              render: (p) => {
                if ((p.tipo ?? 'normal') !== 'orientativo') return `${totalPresupuestoSinIva(p).toFixed(2)} €`;
                const rango = calcularTotalesRango(p.lineas, porcentajeIva(p.tipo_iva));
                return `${rango.totalSinIvaMin.toFixed(2)} – ${rango.totalSinIvaMax.toFixed(2)} €`;
              },
            },
            {
              key: 'total',
              label: 'Total (con IVA)',
              sortValue: (p) => totalPresupuesto(p),
              render: (p) => {
                if ((p.tipo ?? 'normal') !== 'orientativo') return `${totalPresupuesto(p).toFixed(2)} €`;
                // Orientativo nunca lleva IVA — mismo importe que "Base (sin IVA)", nunca se le suma nada.
                const rango = calcularTotalesRango(p.lineas, 0);
                return `${rango.totalSinIvaMin.toFixed(2)} – ${rango.totalSinIvaMax.toFixed(2)} €`;
              },
            },
            {
              key: 'estado',
              label: 'Estado',
              render: (p) => <Badge variant={VARIANTE_ESTADO[p.estado] ?? 'default'}>{p.estado}</Badge>,
            },
            {
              key: 'acciones',
              label: '',
              sortable: false,
              render: (p) => {
                const esAceptado = p.estado === 'Aceptado';
                const esOrientativo = p.tipo === 'orientativo';
                // Los orientativos solo sirven para dar una idea al cliente y llevarlo a un
                // presupuesto real — nunca se firman ni se facturan, solo cambian de estado
                // (Aceptado/Rechazado/Pendiente).
                const menu: AccionMenu[] = [
                  { label: 'Editar / Firmar', onClick: () => setPresupuestoSeleccionado(p) },
                  { label: 'Descargar PDF', onClick: () => handleDescargarPdf(p) },
                  {
                    label: 'Marcar como aceptado',
                    onClick: () => cambiarEstadoMutation.mutate({ p, estado: 'Aceptado' }),
                    oculto: p.estado === 'Aceptado',
                  },
                  {
                    label: 'Marcar como pendiente',
                    onClick: () => cambiarEstadoMutation.mutate({ p, estado: 'Pendiente' }),
                    oculto: p.estado === 'Pendiente',
                  },
                  {
                    label: 'Marcar como rechazado',
                    onClick: () => cambiarEstadoMutation.mutate({ p, estado: 'Rechazado' }),
                    oculto: p.estado === 'Rechazado',
                    destructivo: true,
                  },
                  {
                    label: 'Crear presupuesto normal vinculado',
                    onClick: () => setCreandoDesdeOrientativo(p),
                    oculto: !esOrientativo || !esAceptado,
                  },
                  {
                    label: 'Crear factura completa',
                    onClick: () => setFacturandoDesde({ presupuesto: p }),
                    oculto: !esAceptado || esOrientativo,
                  },
                  {
                    label: 'Crear anticipo (acompte)',
                    onClick: () => setCreandoAcompte(p),
                    oculto: !esAceptado || esOrientativo,
                  },
                  { label: 'Eliminar', onClick: () => handleEliminar(p), destructivo: true },
                ];
                return <AccionesFila rapidas={rapidasPresupuesto(p)} menu={menu} />;
              },
            },
          ]}
        />
      </div>

      <CrearAcompteModal
        presupuesto={creandoAcompte}
        onClose={() => setCreandoAcompte(null)}
        onCrear={({ linea, fecha }) => {
          if (creandoAcompte) setFacturandoDesde({ presupuesto: creandoAcompte, lineaAcompte: linea, fechaAcompte: fecha });
          setCreandoAcompte(null);
        }}
      />

      <DescargarZipModal
        open={zipAbierto}
        onClose={() => setZipAbierto(false)}
        titulo="Descargar presupuestos en ZIP"
        cantidad={paraZip.length}
        generando={generandoZip}
        progreso={progresoZip}
        onDescargar={handleDescargarZip}
      >
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Estado"
            options={ESTADOS_FILTRO.map((e) => ({ value: e, label: e }))}
            value={zipEstado}
            onChange={(e) => setZipEstado(e.target.value)}
          />
          <Select label="Tipo" options={TIPOS_FILTRO} value={zipTipo} onChange={(e) => setZipTipo(e.target.value)} />
          <Select label="País" options={PAISES_FILTRO} value={zipPais} onChange={(e) => setZipPais(e.target.value)} />
          <div />
          <Input label="Emisión desde" type="date" value={zipDesde} onChange={(e) => setZipDesde(e.target.value)} />
          <Input label="Emisión hasta" type="date" value={zipHasta} onChange={(e) => setZipHasta(e.target.value)} />
        </div>
      </DescargarZipModal>
    </div>
  );
}
