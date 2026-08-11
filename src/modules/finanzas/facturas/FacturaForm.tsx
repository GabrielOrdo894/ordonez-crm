import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { notaSistema } from '../../../lib/notaSistema';
import { sincronizarPipelineCliente } from '../../../lib/pipelineSync';
import { siguienteNumero } from '../../../lib/numeracion';
import { registrarEvento } from '../../../lib/eventos';
import { generarPdfFactura, notasLegales } from '../../../lib/generarPdfFactura';
import { conAvisoDescarga } from '../../../lib/conAvisoDescarga';
import { mensajeError } from '../../../lib/mensajeError';
import { cargarEntidad, cargarConfigCompleta } from '../../../lib/pdfEmpresa';
import { renderizarTC } from '../../../lib/terminos';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../../hooks/useToast';
import { Input } from '../../../components/ui/Input';
import { EditorTexto } from '../../../components/ui/EditorTexto';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { ClienteForm } from '../../clientes/ClienteForm';
import { agruparClientes } from '../../clientes/types';
import type { Visita } from '../../visitas/types';
import { LineasEditor } from '../LineasEditor';
import { DocumentoPreview, configPlantillaDesde } from '../DocumentoPreview';
import { SelectorIva } from '../SelectorIva';
import { tipoIvaPorDefecto, mencionIvaReducida } from '../iva';
import { claseColorEstado } from '../estadoColor';
import {
  ESTADOS_COBRO,
  METODOS_PAGO,
  lineaVacia,
  calcularLinea,
  calcularTotales,
  porcentajeIva,
  paisDesdeTipoIva,
  validarLineas,
  lineaDeduccionAcomptes,
  lineasRectificativa,
  tituloDocumentoFactura,
} from './types';
import type { Factura, NuevaFactura, Linea, TipoFactura } from './types';
import type { Presupuesto } from '../presupuestos/types';

function fechaHoy() {
  return new Date().toISOString().slice(0, 10);
}

function sumarDias(fechaISO: string, dias: number) {
  const d = new Date(`${fechaISO}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function diasEntre(desde: string, hasta: string): number {
  const d1 = new Date(`${desde}T00:00:00`);
  const d2 = new Date(`${hasta}T00:00:00`);
  return Math.round((d2.getTime() - d1.getTime()) / 86_400_000);
}

const OPCIONES_VENCIMIENTO = [
  { value: '0', label: 'El mismo día' },
  { value: '1', label: '1 día' },
  { value: '7', label: '7 días' },
];

type FormState = {
  titulo: string;
  tipo: TipoFactura;
  factura_original_id: string | null;
  presupuesto_id: string | null;
  visita_id: string | null;
  pais: string;
  cliente_nombre: string;
  cliente_dir: string;
  cliente_email: string;
  cliente_tel: string;
  idioma: string;
  fecha_factura: string;
  fecha_vence: string;
  tipo_iva: string;
  lineas: Linea[];
  metodo_pago: string;
  nota: string;
  estado_cobro: string;
};

function vacio(): FormState {
  return {
    titulo: '',
    tipo: 'normal',
    factura_original_id: null,
    presupuesto_id: null,
    visita_id: null,
    pais: 'España',
    cliente_nombre: '',
    cliente_dir: '',
    cliente_email: '',
    cliente_tel: '',
    idioma: 'Español',
    fecha_factura: fechaHoy(),
    fecha_vence: sumarDias(fechaHoy(), 7),
    tipo_iva: 'IVA_21',
    lineas: [lineaVacia()],
    metodo_pago: 'Transferencia',
    nota: '',
    estado_cobro: 'Pendiente',
  };
}

type FacturaFormProps = {
  onClose: () => void;
  factura?: Factura | null;
  desdePresupuesto?: Presupuesto | null;
  lineaAcompte?: Linea | null;
  fechaAcompte?: string | null;
  facturaOriginal?: Factura | null;
  clienteInicialId?: string;
  idiomaInicial?: string;
};

export function FacturaForm({
  onClose,
  factura,
  desdePresupuesto,
  lineaAcompte,
  fechaAcompte,
  facturaOriginal,
  clienteInicialId,
  idiomaInicial,
}: FacturaFormProps) {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(vacio());
  const [clienteSeleccionado, setClienteSeleccionado] = useState('');
  const [creandoCliente, setCreandoCliente] = useState(false);
  const [notaActivada, setNotaActivada] = useState(false);
  const [erroresVisibles, setErroresVisibles] = useState(false);

  const nombreUsuarioActual = (user?.user_metadata?.nombre as string) || user?.email || 'Sistema';
  const esManual = !factura && !desdePresupuesto && !facturaOriginal;

  const { data: visitas } = useQuery({
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
    enabled: esManual,
  });

  const clientes = useMemo(() => agruparClientes(visitas ?? []), [visitas]);

  // Anticipos (acompte) ya facturados de este mismo presupuesto — para mostrar el resumen
  // "Acomptes versés / Reste à payer" en la vista previa de la factura final (Total HT/TTC intactos,
  // el descuento se muestra como resumen, no como línea negativa en la tabla de conceptos).
  const { data: acomptesPrevios } = useQuery({
    queryKey: ['facturas', 'acomptes_previos', form.presupuesto_id, factura?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facturas')
        .select('numero, lineas')
        .eq('presupuesto_id', form.presupuesto_id!)
        .eq('tipo', 'acompte')
        .neq('id', factura?.id ?? '00000000-0000-0000-0000-000000000000')
        .is('eliminado_en', null);
      if (error) throw error;
      return data as { numero: string | null; lineas: Linea[] }[];
    },
    enabled: !!form.presupuesto_id && form.tipo === 'normal',
  });

  const { data: presupuestoOrigen } = useQuery({
    queryKey: ['presupuesto', 'numero', form.presupuesto_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('numero, condiciones_pago')
        .eq('id', form.presupuesto_id!)
        .single();
      if (error) throw error;
      return data as { numero: string | null; condiciones_pago: Record<string, string> | null };
    },
    enabled: !!form.presupuesto_id && !desdePresupuesto,
  });

  useEffect(() => {
    if (factura) {
      setForm({
        titulo: factura.titulo ?? '',
        tipo: factura.tipo ?? 'normal',
        factura_original_id: factura.factura_original_id ?? null,
        presupuesto_id: factura.presupuesto_id,
        visita_id: factura.visita_id,
        pais: factura.pais ?? paisDesdeTipoIva(factura.tipo_iva) ?? 'España',
        cliente_nombre: factura.cliente_nombre ?? '',
        cliente_dir: factura.cliente_dir ?? '',
        cliente_email: factura.cliente_email ?? '',
        cliente_tel: factura.cliente_tel ?? '',
        idioma: factura.idioma,
        fecha_factura: factura.fecha_factura ?? fechaHoy(),
        fecha_vence: factura.fecha_vence ?? sumarDias(fechaHoy(), 7),
        tipo_iva: factura.tipo_iva ?? 'IVA_21',
        lineas: factura.lineas.length > 0 ? factura.lineas : [lineaVacia()],
        metodo_pago: factura.metodo_pago ?? 'Transferencia',
        nota: factura.nota ?? '',
        estado_cobro: factura.estado_cobro,
      });
      setNotaActivada(!!factura.nota);
    } else if (desdePresupuesto) {
      setForm({
        titulo: desdePresupuesto.titulo ?? '',
        tipo: lineaAcompte ? 'acompte' : 'normal',
        factura_original_id: null,
        presupuesto_id: desdePresupuesto.id,
        visita_id: desdePresupuesto.visita_id,
        pais: desdePresupuesto.pais ?? paisDesdeTipoIva(desdePresupuesto.tipo_iva) ?? 'España',
        cliente_nombre: desdePresupuesto.cliente_nombre ?? '',
        cliente_dir: desdePresupuesto.cliente_dir ?? '',
        cliente_email: desdePresupuesto.cliente_email ?? '',
        cliente_tel: desdePresupuesto.cliente_tel ?? '',
        idioma: desdePresupuesto.idioma,
        fecha_factura: lineaAcompte ? (fechaAcompte ?? fechaHoy()) : fechaHoy(),
        fecha_vence: sumarDias(lineaAcompte ? (fechaAcompte ?? fechaHoy()) : fechaHoy(), 7),
        tipo_iva: desdePresupuesto.tipo_iva ?? 'IVA_21',
        lineas: lineaAcompte ? [lineaAcompte] : desdePresupuesto.lineas.length > 0 ? desdePresupuesto.lineas : [lineaVacia()],
        metodo_pago: 'Transferencia',
        nota: '',
        estado_cobro: 'Pendiente',
      });
      setNotaActivada(false);
    } else if (facturaOriginal) {
      const notaRectificativa =
        facturaOriginal.idioma === 'Français'
          ? `Facture rectificative de la facture n° ${facturaOriginal.numero ?? '—'} du ${facturaOriginal.fecha_factura ?? '—'}.`
          : `Rectificativa de la factura n.º ${facturaOriginal.numero ?? '—'} de fecha ${facturaOriginal.fecha_factura ?? '—'}.`;
      setForm({
        titulo: facturaOriginal.titulo ?? '',
        tipo: 'rectificativa',
        factura_original_id: facturaOriginal.id,
        presupuesto_id: facturaOriginal.presupuesto_id,
        visita_id: facturaOriginal.visita_id,
        pais: facturaOriginal.pais ?? paisDesdeTipoIva(facturaOriginal.tipo_iva) ?? 'España',
        cliente_nombre: facturaOriginal.cliente_nombre ?? '',
        cliente_dir: facturaOriginal.cliente_dir ?? '',
        cliente_email: facturaOriginal.cliente_email ?? '',
        cliente_tel: facturaOriginal.cliente_tel ?? '',
        idioma: facturaOriginal.idioma,
        fecha_factura: fechaHoy(),
        fecha_vence: sumarDias(fechaHoy(), 7),
        tipo_iva: facturaOriginal.tipo_iva ?? 'IVA_21',
        lineas: lineasRectificativa(facturaOriginal.lineas, facturaOriginal.tipo_iva),
        metodo_pago: facturaOriginal.metodo_pago ?? 'Transferencia',
        nota: notaRectificativa,
        estado_cobro: 'Pendiente',
      });
      setNotaActivada(true);
    } else {
      setForm(vacio());
      setClienteSeleccionado('');
      setNotaActivada(false);
    }
  }, [factura, desdePresupuesto, lineaAcompte, fechaAcompte, facturaOriginal]);

  // "Facturar completo" desde un presupuesto con anticipos ya cobrados: sin esto, la factura final
  // vuelve a cobrar el importe íntegro del presupuesto en vez de solo lo que falta por pagar (los
  // anticipos quedarían pagados dos veces a efectos de estado_cobro/monto_pagado e ingresos). Se
  // añade una única vez, cuando termina de cargar acomptesPrevios — si el usuario la borra a mano
  // después, no se vuelve a insertar.
  const deduccionAcomptesAgregadaRef = useRef(false);
  useEffect(() => {
    deduccionAcomptesAgregadaRef.current = false;
  }, [desdePresupuesto?.id, lineaAcompte]);

  useEffect(() => {
    if (factura || !desdePresupuesto || lineaAcompte) return; // solo "Facturar completo", no edición ni acompte
    if (!acomptesPrevios || acomptesPrevios.length === 0) return;
    if (deduccionAcomptesAgregadaRef.current) return;
    deduccionAcomptesAgregadaRef.current = true;
    setForm((f) => {
      const textoDeduccion = f.idioma === 'Français' ? 'Déduction acompte(s)' : 'Deducción de anticipo(s)';
      if (f.lineas.some((l) => l.designacion === textoDeduccion)) return f;
      const deduccion = lineaDeduccionAcomptes(acomptesPrevios, f.tipo_iva, f.idioma);
      return { ...f, lineas: [...f.lineas, deduccion] };
    });
  }, [acomptesPrevios, factura, desdePresupuesto, lineaAcompte]);

  const handleSeleccionarCliente = (clienteId: string) => {
    setClienteSeleccionado(clienteId);
    const cliente = clientes.find((c) => c.id === clienteId);
    if (!cliente) return;
    const ultima = cliente.visitas[0];
    const nuevoPais = cliente.pais === 'Francia' ? 'Francia' : 'España';
    const nuevoTipo = tipoIvaPorDefecto(nuevoPais);
    setForm((f) => ({
      ...f,
      visita_id: ultima.id,
      pais: nuevoPais,
      cliente_nombre: `${cliente.nombre} ${cliente.apellidos}`,
      cliente_dir: ultima.direccion ?? '',
      cliente_email: cliente.email ?? '',
      cliente_tel: cliente.telefono,
      idioma: ultima.idioma === 'Français' ? 'Français' : 'Español',
      tipo_iva: nuevoTipo,
      lineas: f.lineas.map((l) => calcularLinea(l, porcentajeIva(nuevoTipo))),
    }));
  };

  // Precarga el cliente y el idioma elegidos en el asistente "Nueva factura" (IniciarFacturaPage), solo una vez.
  const clienteInicialAplicadoRef = useRef(false);
  useEffect(() => {
    if (!esManual || !clienteInicialId || clienteInicialAplicadoRef.current || clientes.length === 0) return;
    clienteInicialAplicadoRef.current = true;
    handleSeleccionarCliente(clienteInicialId);
    if (idiomaInicial) setForm((f) => ({ ...f, idioma: idiomaInicial }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esManual, clienteInicialId, idiomaInicial, clientes]);

  const handleClienteCreado = (cliente: Visita) => {
    setCreandoCliente(false);
    setClienteSeleccionado(cliente.id);
    setForm((f) => ({
      ...f,
      visita_id: cliente.id,
      pais: cliente.pais === 'Francia' ? 'Francia' : 'España',
      cliente_nombre: `${cliente.nombre} ${cliente.apellidos}`,
      cliente_dir: cliente.direccion ?? '',
      cliente_email: cliente.email ?? '',
      cliente_tel: cliente.telefono,
      idioma: cliente.idioma === 'Français' ? 'Français' : 'Español',
    }));
  };

  const porcentaje = porcentajeIva(form.tipo_iva);
  const { totalConIva, totalSinIva } = useMemo(() => calcularTotales(form.lineas), [form.lineas]);

  const guardarMutation = useMutation({
    mutationFn: async () => {
      const nueva: NuevaFactura = {
        numero: factura?.numero ?? null,
        titulo: form.titulo || null,
        tipo: form.tipo,
        factura_original_id: form.factura_original_id,
        presupuesto_id: form.presupuesto_id,
        visita_id: form.visita_id,
        pais: form.pais,
        cliente_nombre: form.cliente_nombre || null,
        cliente_dir: form.cliente_dir || null,
        cliente_email: form.cliente_email || null,
        cliente_tel: form.cliente_tel || null,
        idioma: form.idioma,
        fecha_factura: form.fecha_factura,
        fecha_vence: form.fecha_vence,
        tipo_iva: form.tipo_iva,
        lineas: form.lineas,
        metodo_pago: form.metodo_pago,
        nota: notaActivada ? form.nota || null : null,
        estado_cobro: form.estado_cobro,
        fecha_pago: factura?.fecha_pago ?? null,
        monto_pagado: factura?.monto_pagado ?? null,
        resena_enviada: factura?.resena_enviada ?? false,
        resena_fecha_envio: factura?.resena_fecha_envio ?? null,
      };

      if (factura) {
        const { error } = await supabase.from('facturas').update(nueva).eq('id', factura.id);
        if (error) throw error;
        return factura.id;
      }

      const secuencia =
        form.tipo === 'acompte' ? 'seq_factura_acompte' : form.tipo === 'rectificativa' ? 'seq_factura_rectificativa' : 'seq_factura';
      const numero = await siguienteNumero(secuencia);
      const { data, error } = await supabase
        .from('facturas')
        .insert({ ...nueva, numero })
        .select()
        .single();
      if (error) throw error;

      if (form.visita_id) {
        await notaSistema(form.visita_id, `Factura ${numero} creada por ${nombreUsuarioActual}`);
      }
      await registrarEvento('factura', data.id, 'Factura creada');
      if (form.factura_original_id) {
        await registrarEvento('factura', form.factura_original_id, `Rectificada por la factura ${numero}`);
      }
      if (form.presupuesto_id) {
        const tipoTexto = form.tipo === 'acompte' ? 'anticipo' : form.tipo === 'rectificativa' ? 'rectificativa' : 'completa/final';
        await registrarEvento('presupuesto', form.presupuesto_id, `Factura ${numero} generada (${tipoTexto})`);
      }
      return data.id;
    },
    onSuccess: async () => {
      await sincronizarPipelineCliente(form.cliente_tel);
      queryClient.invalidateQueries({ queryKey: ['facturas'] });
      queryClient.invalidateQueries({ queryKey: ['presupuestos'] });
      toast.success(factura ? 'Factura actualizada' : 'Factura creada');
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleGuardar = () => {
    const mensaje = validarLineas(form.lineas);
    if (mensaje) {
      toast.error(mensaje);
      setErroresVisibles(true);
      return;
    }
    guardarMutation.mutate();
  };

  const handleDescargarPdf = async () => {
    if (!factura) return;
    try {
      await conAvisoDescarga(() => generarPdfFactura(factura), toast);
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el PDF'));
    }
  };

  const idiomaCorto = form.idioma === 'Français' ? 'fr' : 'es';

  const { data: entidadInfo } = useQuery({
    queryKey: ['empresa_config', 'entidad', form.pais],
    queryFn: () => cargarEntidad(form.pais),
  });

  const { data: config } = useQuery({
    queryKey: ['empresa_config', 'completa'],
    queryFn: cargarConfigCompleta,
  });

  const configPlantilla = useMemo(() => configPlantillaDesde((config?.datos as { plantilla_documento?: unknown })?.plantilla_documento), [config]);

  const tcRenderizado = useMemo(() => {
    const tcCrudo = idiomaCorto === 'fr' ? config?.tc_fr : config?.tc_es;
    if (!tcCrudo) return undefined;
    return renderizarTC(tcCrudo, undefined, idiomaCorto);
  }, [config, idiomaCorto]);

  const mensajeGracias = idiomaCorto === 'fr' ? config?.mensaje_gracias_fr : config?.mensaje_gracias_es;
  const notas = useMemo(() => notasLegales(idiomaCorto, form.tipo_iva), [idiomaCorto, form.tipo_iva]);

  const condPagoDocumento = desdePresupuesto?.condiciones_pago ?? presupuestoOrigen?.condiciones_pago ?? null;
  const condPago = condPagoDocumento ?? (config?.datos as { condicionesPago?: Record<string, string> })?.condicionesPago;
  const condicionesPago = condPago
    ? {
        delai: idiomaCorto === 'fr' ? condPago.delaiFr : condPago.delaiEs,
        penalizacion: idiomaCorto === 'fr' ? condPago.penalizacionFr : condPago.penalizacionEs,
        medio: idiomaCorto === 'fr' ? condPago.medioFr : condPago.medioEs,
      }
    : undefined;

  const acomptes =
    acomptesPrevios && acomptesPrevios.length > 0
      ? {
          itemizado: acomptesPrevios.map((f) => ({
            numero: f.numero ?? '—',
            total: f.lineas.reduce((s, l) => s + (l.es_incluido ? 0 : l.total_con_iva), 0),
          })),
        }
      : null;

  const devisAsociadoNumero = desdePresupuesto?.numero ?? presupuestoOrigen?.numero ?? null;

  const estadoCanonico = form.estado_cobro === 'Cobrada' ? 'Pagado' : 'Borrador';
  const estadoDocumento =
    idiomaCorto === 'fr' ? (estadoCanonico === 'Pagado' ? 'Payé' : 'Brouillon') : estadoCanonico;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={15} />
          Volver a facturas
        </button>
        <div className="flex gap-2">
          {factura && (
            <Button variant="secondary" onClick={handleDescargarPdf}>
              Descargar PDF
            </Button>
          )}
          <Button onClick={handleGuardar} disabled={guardarMutation.isPending}>
            {guardarMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <div className="flex-1 min-w-0 w-full bg-surface border border-gray-200 rounded-sm p-4 space-y-5">
          {esManual && (
            <div>
              <Select
                label="Cliente existente (opcional)"
                options={[
                  { value: '', label: '— Entrada manual —' },
                  ...clientes.map((c) => ({ value: c.id, label: `${c.nombre} ${c.apellidos} · ${c.telefono}` })),
                ]}
                value={clienteSeleccionado}
                onChange={(e) => handleSeleccionarCliente(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setCreandoCliente(true)}
                className="text-xs text-brand hover:underline mt-1.5"
              >
                + Crear cliente nuevo
              </button>
            </div>
          )}

          <section>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-1 mb-3">
              Título del trabajo
            </p>
            <Input
              label="Título (aparece en la cabecera de la factura)"
              value={form.titulo}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              placeholder="Ej. Reforma integral de baño"
            />
          </section>

          <section>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-1 mb-3">
              Cliente
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Nombre" value={form.cliente_nombre} onChange={(e) => setForm((f) => ({ ...f, cliente_nombre: e.target.value }))} />
              <Input label="Teléfono" value={form.cliente_tel} onChange={(e) => setForm((f) => ({ ...f, cliente_tel: e.target.value }))} />
              <div className="col-span-2">
                <Input label="Dirección" value={form.cliente_dir} onChange={(e) => setForm((f) => ({ ...f, cliente_dir: e.target.value }))} />
              </div>
              <Input label="Email" value={form.cliente_email} onChange={(e) => setForm((f) => ({ ...f, cliente_email: e.target.value }))} />
              <Select
                label="Idioma del documento"
                options={[{ value: 'Español', label: 'Español' }, { value: 'Français', label: 'Français' }]}
                value={form.idioma}
                onChange={(e) => setForm((f) => ({ ...f, idioma: e.target.value }))}
              />
              <Select
                label="País (datos de empresa a mostrar)"
                options={[{ value: 'España', label: 'España' }, { value: 'Francia', label: 'Francia' }]}
                value={form.pais}
                onChange={(e) => {
                  const nuevoPais = e.target.value;
                  const nuevoTipo = tipoIvaPorDefecto(nuevoPais);
                  setForm((f) => ({
                    ...f,
                    pais: nuevoPais,
                    tipo_iva: nuevoTipo,
                    lineas: f.lineas.map((l) => calcularLinea(l, porcentajeIva(nuevoTipo))),
                  }));
                }}
              />
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-1 mb-3">
              Condiciones
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Fecha factura" type="date" value={form.fecha_factura} onChange={(e) => setForm((f) => ({ ...f, fecha_factura: e.target.value }))} />
              <div>
                <Select
                  label="Vencimiento"
                  options={OPCIONES_VENCIMIENTO}
                  value={String(diasEntre(form.fecha_factura, form.fecha_vence))}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fecha_vence: sumarDias(f.fecha_factura, Number(e.target.value)) }))
                  }
                />
                <p className="text-xs text-gray-400 mt-1">→ {form.fecha_vence}</p>
              </div>
              <SelectorIva
                pais={form.pais}
                value={form.tipo_iva}
                onChange={(nuevoTipo) =>
                  setForm((f) => ({
                    ...f,
                    tipo_iva: nuevoTipo,
                    lineas: f.lineas.map((l) => calcularLinea(l, porcentajeIva(nuevoTipo))),
                  }))
                }
              />
              <Select
                label="Método de pago"
                options={METODOS_PAGO.map((m) => ({ value: m, label: m }))}
                value={form.metodo_pago}
                onChange={(e) => setForm((f) => ({ ...f, metodo_pago: e.target.value }))}
              />
              <Select
                label="Estado de cobro"
                options={ESTADOS_COBRO.map((e) => ({ value: e, label: e }))}
                value={form.estado_cobro}
                onChange={(e) => setForm((f) => ({ ...f, estado_cobro: e.target.value }))}
              />
            </div>
            {factura?.monto_pagado != null && (
              <p className="text-xs text-gray-500 mt-3">
                Pagado: {factura.monto_pagado.toFixed(2)} € el {factura.fecha_pago?.slice(0, 10)}
              </p>
            )}
            <div className="mt-3 border-t border-gray-200 pt-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
                <input type="checkbox" checked={notaActivada} onChange={(e) => setNotaActivada(e.target.checked)} />
                Añadir una nota al documento (aparece tras el resumen de pago y el seguro y garantía)
              </label>
              {notaActivada && (
                <EditorTexto
                  value={form.nota}
                  onChange={(v) => setForm((f) => ({ ...f, nota: v }))}
                  placeholder="Observaciones, acuerdos verbales, cosas que nos ha dicho el cliente..."
                  rows={4}
                />
              )}
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-1 mb-3">
              Líneas
            </p>
            <LineasEditor
              lineas={form.lineas}
              porcentajeIva={porcentaje}
              onChange={(lineas) => setForm((f) => ({ ...f, lineas }))}
              erroresVisibles={erroresVisibles}
              idioma={idiomaCorto}
              permitirCantidadNegativa={form.tipo === 'rectificativa'}
            />
          </section>
        </div>

        <div className="w-full lg:w-[420px] shrink-0 lg:sticky lg:top-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Vista previa</p>
          <DocumentoPreview
            plantilla={configPlantilla.estructura}
            colorPrimario={configPlantilla.colorPrimario}
            colorSecundario={configPlantilla.colorSecundario}
            mostrarLogo={configPlantilla.mostrarLogo}
            empresaClienteIzquierda={configPlantilla.empresaClienteIzquierda}
            tamanoTituloDocumento={configPlantilla.tamanoTituloDocumento}
            tamanoTituloReforma={configPlantilla.tamanoTituloReforma}
            tabla={configPlantilla.tabla}
            columnasExtra={configPlantilla.columnas}
            piePagina={configPlantilla.piePagina}
            idioma={idiomaCorto}
            tituloDocumento={tituloDocumentoFactura(form.tipo, idiomaCorto)}
            titulo={form.titulo || undefined}
            numero={factura?.numero ?? null}
            entidad={entidadInfo?.entidad ?? {}}
            logoUrl={entidadInfo?.logoUrl}
            pais={form.pais}
            clienteNombre={form.cliente_nombre}
            clienteDir={form.cliente_dir}
            clienteContacto={[form.cliente_tel, form.cliente_email].filter(Boolean).join(' · ')}
            labelCif={form.pais === 'Francia' ? 'SIRET' : 'CIF'}
            camposDocumento={[
              { label: idiomaCorto === 'fr' ? 'Date facture' : 'Fecha factura', valor: form.fecha_factura },
              { label: idiomaCorto === 'fr' ? 'Échéance' : 'Vencimiento', valor: form.fecha_vence },
              ...(devisAsociadoNumero
                ? [{ label: idiomaCorto === 'fr' ? 'Devis associé' : 'Presupuesto asociado', valor: devisAsociadoNumero }]
                : []),
              {
                label: idiomaCorto === 'fr' ? 'État' : 'Estado',
                valor: estadoDocumento,
                claseColor: claseColorEstado(estadoCanonico),
              },
            ]}
            columnasTabla={
              idiomaCorto === 'fr'
                ? ['Nº', 'Désignation', 'Qt', 'Prix unit. (HT)', 'Total', 'Total TTC']
                : ['Nº', 'Designación', 'Cant.', 'Precio unit. (s/IVA)', 'Total', 'Total con Impuestos']
            }
            lineas={form.lineas}
            totalSinIva={totalSinIva}
            totalConIva={totalConIva}
            porcentajeIva={porcentaje}
            labelBase={idiomaCorto === 'fr' ? 'Base HT' : 'Base imponible'}
            labelIva={idiomaCorto === 'fr' ? 'TVA' : 'IVA'}
            mencionIva={mencionIvaReducida(form.tipo_iva)}
            condicionesPago={condicionesPago}
            acomptes={acomptes}
            notasLegales={notas}
            mensajeGracias={mensajeGracias ?? undefined}
            tc={tcRenderizado}
            labelTyc={idiomaCorto === 'fr' ? 'Conditions générales' : 'Términos y condiciones'}
            nota={notaActivada ? form.nota || undefined : undefined}
            labelNota={idiomaCorto === 'fr' ? 'Note' : 'Nota'}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 flex-wrap mt-4 pt-4 border-t border-gray-200">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={handleGuardar} disabled={guardarMutation.isPending}>
          {guardarMutation.isPending ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>

      <Modal open={creandoCliente} onClose={() => setCreandoCliente(false)} title="Crear cliente nuevo" size="lg">
        <ClienteForm onClose={() => setCreandoCliente(false)} onCreado={handleClienteCreado} />
      </Modal>
    </div>
  );
}
