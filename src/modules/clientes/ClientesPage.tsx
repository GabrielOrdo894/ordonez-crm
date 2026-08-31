import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Search, ChevronDown, ChevronUp, UserPlus, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useConfirmar } from '../../hooks/useConfirm';
import { useSeleccionMultiple } from '../../hooks/useSeleccionMultiple';
import { Table } from '../../components/ui/Table';
import { KpiRow } from '../../components/ui/Kpi';
import { BotonExportar } from '../../components/ui/BotonExportar';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { BulkActionsBar } from '../../components/ui/BulkActionsBar';
import { AccionesFila } from '../../components/ui/AccionesFila';
import {
  agruparClientes,
  normalizarTelefono,
  ETAPAS_PIPELINE,
  ETIQUETA_ORIGEN_POTENCIAL,
  clavesPresupuestosAceptados,
  esClienteConfirmado,
  potencialesPorVisita,
  type ClientePotencial,
} from './types';
import { useEtiquetasClientes } from './useEtiquetasClientes';
import { ETIQUETAS_DISPONIBLES, COLOR_ETIQUETA, type EtiquetaCliente } from './etiquetas';
import { usePotencialesCliente } from './usePotencialesCliente';
import { fechaVisitaCorta } from '../../lib/fechas';
import { calcularTotales } from '../finanzas/lineas';
import type { Visita } from '../visitas/types';
import type { Presupuesto } from '../finanzas/presupuestos/types';
import type { Factura } from '../finanzas/facturas/types';
import type { VisitaModalContext } from '../../components/layout/AppLayout';

export default function ClientesPage() {
  const { abrirNuevoCliente } = useOutletContext<VisitaModalContext>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const nombreUsuarioActual = (user?.user_metadata?.nombre as string) || user?.email || 'Sistema';
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [filtroPais, setFiltroPais] = useState('Todos');
  const [filtroPipeline, setFiltroPipeline] = useState('Todos');
  const [filtroEtiqueta, setFiltroEtiqueta] = useState('Todos');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const { seleccion, toggleFila, toggleTodas, limpiar } = useSeleccionMultiple();
  const { etiquetasDe } = useEtiquetasClientes();
  const [potencialesAbiertos, setPotencialesAbiertos] = useState(false);

  const { data: visitas, isLoading } = useQuery({
    queryKey: ['visitas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visitas')
        .select('*')
        .is('eliminado_en', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Visita[];
    },
  });

  const clientes = useMemo(() => agruparClientes(visitas ?? []), [visitas]);

  // El cálculo ya existía en la ficha individual de cliente (ClienteDetalleContenido.tsx) — se
  // trae aquí para poder ordenar/consultar por valor de cartera de un vistazo, sin abrir ficha
  // por ficha (mejora real, auditoría de Clientes 2026-08-18).
  const { data: presupuestos } = useQuery({
    queryKey: ['presupuestos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('*')
        .is('eliminado_en', null);
      if (error) throw error;
      return data as Presupuesto[];
    },
  });

  // Un cliente solo cuenta como "confirmado" (y aparece en la tabla principal) cuando tiene al
  // menos un presupuesto Aceptado — decisión explícita de Gabriel 2026-08-26: hacer una visita no
  // basta, solo cuenta cuando de verdad se acepta el trabajo. Hasta entonces se muestra abajo como
  // potencial, con el mismo distintivo que las solicitudes/orientativos, pero sigue disponible
  // igual como sugerencia al crear un presupuesto.
  const clavesAceptadas = useMemo(() => clavesPresupuestosAceptados(presupuestos ?? []), [presupuestos]);
  const clientesConfirmados = useMemo(
    () => clientes.filter((c) => esClienteConfirmado(c, clavesAceptadas)),
    [clientes, clavesAceptadas],
  );
  const potencialesPorSolicitud = usePotencialesCliente(clientesConfirmados);
  const potenciales = useMemo(() => {
    const combinados = new Map<string, ClientePotencial>();
    const clave = (p: ClientePotencial) => (p.telefono ? normalizarTelefono(p.telefono) : '') || (p.email?.toLowerCase() ?? '');
    for (const p of potencialesPorSolicitud) {
      const k = clave(p);
      if (k) combinados.set(k, p);
    }
    // "visita" pisa a solicitud/orientativo si coinciden — es la señal más avanzada de las tres.
    for (const p of potencialesPorVisita(clientes, clavesAceptadas)) {
      const k = clave(p);
      if (k) combinados.set(k, p);
    }
    return Array.from(combinados.values());
  }, [potencialesPorSolicitud, clientes, clavesAceptadas]);

  // "Facturado" solo puede significar factura real emitida — antes esta columna sumaba
  // presupuestos.estado === 'Aceptado' (cualquier tipo, incluidos los orientativos, que por diseño
  // nunca se facturan, ver PresupuestosPage.tsx), así que un presupuesto orientativo aceptado
  // aparecía como si estuviera facturado sin haberse emitido ninguna factura (bug real reportado
  // por Gabriel 2026-08-28, caso Xabier Urtizbere). Se suma directamente sobre `facturas`, la única
  // fuente real de lo facturado — mismo criterio que ClienteDetalleContenido.tsx.
  const { data: facturas } = useQuery({
    queryKey: ['facturas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('facturas').select('*').is('eliminado_en', null);
      if (error) throw error;
      return data as Factura[];
    },
  });

  const totalFacturadoPorTelefono = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of facturas ?? []) {
      if (!f.cliente_tel) continue;
      const tel = normalizarTelefono(f.cliente_tel);
      map.set(tel, (map.get(tel) ?? 0) + calcularTotales(f.lineas).totalConIva);
    }
    return map;
  }, [facturas]);

  const eliminarVariosMutation = useMutation({
    mutationFn: async (clienteIds: (string | number)[]) => {
      const idsVisitas = clientesConfirmados
        .filter((c) => clienteIds.includes(c.id))
        .flatMap((c) => c.visitas.map((v) => v.id));
      const { error } = await supabase
        .from('visitas')
        .update({ eliminado_en: new Date().toISOString(), eliminado_por: nombreUsuarioActual })
        .in('id', idsVisitas as string[]);
      if (error) throw error;
    },
    onSuccess: (_data, clienteIds) => {
      queryClient.invalidateQueries({ queryKey: ['visitas'] });
      toast.success(`${clienteIds.length} cliente(s) movido(s) a la papelera`);
      limpiar();
    },
    onError: (error) => toast.error(error.message),
  });

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return clientesConfirmados.filter((c) => {
      if (filtroPais !== 'Todos' && c.pais !== filtroPais) return false;
      if (
        filtroPipeline !== 'Todos' &&
        (c.visitas[0]?.estado_pipeline ?? 'Contacto') !== filtroPipeline
      )
        return false;
      if (
        filtroEtiqueta !== 'Todos' &&
        !etiquetasDe(c.id).includes(filtroEtiqueta as EtiquetaCliente)
      )
        return false;
      const ultima = c.visitas[0]?.fecha_visita ?? '';
      if (desde && (!ultima || ultima < desde)) return false;
      if (hasta && (!ultima || ultima > hasta)) return false;
      if (q && !`${c.nombre} ${c.apellidos} ${c.telefono}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [clientesConfirmados, busqueda, filtroPais, filtroPipeline, filtroEtiqueta, etiquetasDe, desde, hasta]);

  const kpis = useMemo(() => {
    const hoy = new Date();
    const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const nuevosEsteMes = clientesConfirmados.filter((c) => {
      const primera = c.visitas[c.visitas.length - 1];
      return primera?.created_at?.slice(0, 7) === mesActual;
    }).length;
    const pipelineActivo = clientesConfirmados.filter(
      (c) =>
        c.visitas[0]?.estado_pipeline !== 'Finalizado' &&
        c.visitas[0]?.estado_pipeline !== 'Perdido',
    ).length;
    const pendienteConfirmar = clientesConfirmados.filter((c) =>
      c.visitas.some((v) => v.estado === 'Pendiente'),
    ).length;
    return [
      { label: 'Total clientes', valor: clientesConfirmados.length },
      { label: 'Nuevos este mes', valor: nuevosEsteMes },
      { label: 'Pipeline activo', valor: pipelineActivo, acento: true },
      { label: 'Con visita pendiente', valor: pendienteConfirmar },
    ];
  }, [clientesConfirmados]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, apellidos o teléfono"
            className="w-full border border-gray-200 rounded-sm pl-8 pr-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
        </div>
        <span className="text-sm text-gray-500 ml-auto">{filtrados.length} clientes</span>
        <BotonExportar
          nombreArchivo="clientes.csv"
          filas={filtrados}
          columnas={[
            { key: 'nombre', label: 'Nombre' },
            { key: 'apellidos', label: 'Apellidos' },
            { key: 'telefono', label: 'Teléfono' },
            { key: 'email', label: 'Email' },
            { key: 'zona', label: 'Zona' },
            { key: 'pais', label: 'País' },
            { key: 'visitas', label: 'Nº visitas', valor: (c) => c.visitas.length },
            {
              key: 'ultima',
              label: 'Última visita',
              valor: (c) => c.visitas[0]?.fecha_visita ?? '',
            },
            {
              key: 'pipeline',
              label: 'Pipeline',
              valor: (c) => c.visitas[0]?.estado_pipeline ?? '',
            },
            { key: 'etiquetas', label: 'Etiquetas', valor: (c) => etiquetasDe(c.id).join(', ') },
            {
              key: 'facturado',
              label: 'Total facturado',
              valor: (c) =>
                (totalFacturadoPorTelefono.get(normalizarTelefono(c.telefono)) ?? 0).toFixed(2),
            },
          ]}
        />
        <Button onClick={() => abrirNuevoCliente()} className="px-4 py-2 text-sm">
          + Nuevo cliente
        </Button>
      </div>

      <div className="flex items-end gap-2 mb-4 flex-wrap">
        <Select
          label="País"
          options={['Todos', 'España', 'Francia'].map((p) => ({ value: p, label: p }))}
          value={filtroPais}
          onChange={(e) => setFiltroPais(e.target.value)}
          className="w-40"
        />
        <Select
          label="Etapa pipeline"
          options={['Todos', ...ETAPAS_PIPELINE, 'Perdido'].map((p) => ({ value: p, label: p }))}
          value={filtroPipeline}
          onChange={(e) => setFiltroPipeline(e.target.value)}
          className="w-48"
        />
        <Select
          label="Etiqueta"
          options={['Todos', ...ETIQUETAS_DISPONIBLES].map((e) => ({ value: e, label: e }))}
          value={filtroEtiqueta}
          onChange={(e) => setFiltroEtiqueta(e.target.value)}
          className="w-44"
        />
        <Input
          label="Última visita desde"
          type="date"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          className="w-40"
        />
        <Input
          label="Última visita hasta"
          type="date"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          className="w-40"
        />
      </div>

      <KpiRow items={kpis} />

      {potenciales.length > 0 && (
        <div className="bg-surface border border-gray-200 rounded-sm mb-4">
          <button
            onClick={() => setPotencialesAbiertos((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm"
          >
            <span className="font-medium text-gray-700">
              Clientes potenciales <span className="text-gray-400">({potenciales.length})</span>
            </span>
            {potencialesAbiertos ? (
              <ChevronUp size={15} className="text-gray-400" />
            ) : (
              <ChevronDown size={15} className="text-gray-400" />
            )}
          </button>
          {potencialesAbiertos && (
            <div className="border-t border-gray-200 px-4 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {potenciales.map((p) => (
                <div
                  key={`${p.origen}-${p.id}`}
                  className="border border-gray-200 rounded-sm p-2.5 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.nombre}</p>
                    <p className="text-xs text-gray-500 truncate">{p.telefono || p.email || '—'}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {ETIQUETA_ORIGEN_POTENCIAL[p.origen]}
                      {p.detalle ? ` · ${p.detalle}` : ''}
                    </p>
                  </div>
                  {p.origen === 'visita' ? (
                    // Ya tiene historial de visitas — nada que "convertir", va directo a su ficha.
                    <button
                      title="Ver ficha"
                      onClick={() => navigate(`/clientes/${encodeURIComponent(p.id)}`)}
                      className="text-brand hover:text-brand-dark shrink-0 mt-0.5"
                    >
                      <Eye size={15} />
                    </button>
                  ) : (
                    <button
                      title="Convertir en cliente"
                      onClick={() =>
                        abrirNuevoCliente({
                          nombre: p.nombre,
                          telefono: p.telefono,
                          email: p.email ?? undefined,
                          idioma: p.idioma ?? undefined,
                        })
                      }
                      className="text-brand hover:text-brand-dark shrink-0 mt-0.5"
                    >
                      <UserPlus size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <BulkActionsBar
        count={seleccion.size}
        onCancelar={limpiar}
        acciones={[
          {
            label: 'Eliminar',
            variant: 'danger',
            onClick: async () => {
              if (
                !(await confirmar(
                  `¿Eliminar ${seleccion.size} cliente(s)? Su historial de visitas se moverá a la Papelera.`,
                ))
              )
                return;
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
          emptyMessage="No hay clientes registrados"
          onRowClick={(c) => navigate(`/clientes/${encodeURIComponent(c.id)}`)}
          seleccion={seleccion}
          onToggleFila={toggleFila}
          onToggleTodas={toggleTodas}
          columns={[
            {
              key: 'nombre',
              label: 'Nombre + apellidos',
              sortValue: (c) => `${c.nombre} ${c.apellidos}`,
              render: (c) => (
                <div>
                  <p className="font-medium text-gray-900">{c.nombre}</p>
                  <p className="text-xs text-gray-500">{c.apellidos}</p>
                </div>
              ),
            },
            { key: 'telefono', label: 'Teléfono' },
            {
              key: 'etiquetas',
              label: 'Etiquetas',
              sortValue: (c) => etiquetasDe(c.id).join(','),
              render: (c) => (
                <div className="flex flex-wrap gap-1">
                  {etiquetasDe(c.id).map((e) => (
                    <span
                      key={e}
                      className={`text-[10px] font-medium rounded-full px-1.5 py-0.5 border ${COLOR_ETIQUETA[e]}`}
                    >
                      {e}
                    </span>
                  ))}
                </div>
              ),
            },
            {
              key: 'zona',
              label: 'Zona / País',
              sortValue: (c) => `${c.zona ?? ''} ${c.pais ?? ''}`,
              render: (c) => `${c.zona ?? ''} · ${c.pais ?? ''}`,
            },
            {
              key: 'visitas',
              label: 'Visitas',
              sortValue: (c) => c.visitas.length,
              render: (c) => c.visitas.length,
            },
            {
              key: 'ultima',
              label: 'Última visita',
              sortValue: (c) => c.visitas[0]?.fecha_visita ?? '',
              render: (c) => fechaVisitaCorta(c.visitas[0]?.fecha_visita),
            },
            {
              key: 'pipeline',
              label: 'Pipeline',
              sortValue: (c) => c.visitas[0]?.estado_pipeline ?? '',
              render: (c) => c.visitas[0]?.estado_pipeline ?? '—',
            },
            {
              key: 'facturado',
              label: 'Total facturado',
              sortValue: (c) => totalFacturadoPorTelefono.get(normalizarTelefono(c.telefono)) ?? 0,
              render: (c) => {
                const total = totalFacturadoPorTelefono.get(normalizarTelefono(c.telefono)) ?? 0;
                return total > 0 ? `${total.toFixed(2)} €` : '—';
              },
            },
            {
              key: 'acciones',
              label: '',
              sortable: false,
              render: (c) => (
                <AccionesFila
                  menu={[
                    {
                      label: 'Eliminar',
                      destructivo: true,
                      onClick: async () => {
                        if (
                          !(await confirmar(
                            `¿Eliminar a ${c.nombre} ${c.apellidos}? Su historial de visitas se moverá a la Papelera.`,
                          ))
                        )
                          return;
                        eliminarVariosMutation.mutate([c.id]);
                      },
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
