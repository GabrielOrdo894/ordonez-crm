import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Trash2, Star, Plus, Copy, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { notaSistema } from '../../../lib/notaSistema';
import { sincronizarPipelineCliente } from '../../../lib/pipelineSync';
import { siguienteNumero } from '../../../lib/numeracion';
import { registrarEvento } from '../../../lib/eventos';
import { generarPdfPresupuesto } from '../../../lib/generarPdfPresupuesto';
import { enviarPresupuestoAFirmar } from '../../../lib/documenso';
import { conAvisoDescarga } from '../../../lib/conAvisoDescarga';
import { mensajeError } from '../../../lib/mensajeError';
import { cargarEntidad, cargarConfigCompleta, FOTO_PORTADA_DEFECTO } from '../../../lib/pdfEmpresa';
import { renderizarTC } from '../../../lib/terminos';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../../hooks/useToast';
import { Input } from '../../../components/ui/Input';
import { EditorTexto } from '../../../components/ui/EditorTexto';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { agruparClientes, normalizarTelefono } from '../../clientes/types';
import type { Visita } from '../../visitas/types';
import { LineasEditor } from '../LineasEditor';
import { DocumentoPreview, configPlantillaDesde } from '../DocumentoPreview';
import { CondicionesPagoEditor, type CondicionesPagoValor } from '../CondicionesPagoEditor';
import { SelectorIva } from '../SelectorIva';
import { tipoIvaPorDefecto, mencionIvaReducida } from '../iva';
import { claseColorEstado } from '../estadoColor';
import { Modal } from '../../../components/ui/Modal';
import {
  lineaVacia,
  calcularLinea,
  calcularTotales,
  calcularTotalesRango,
  porcentajeIva,
  paisDesdeTipoIva,
  validarLineas,
} from './types';
import type { Presupuesto, NuevoPresupuesto, Linea, PlazoPago, TipoPresupuesto, FormatoPresupuesto } from './types';

const NOTA_ORIENTATIVO: Record<'es' | 'fr', string> = {
  es: 'Presupuesto orientativo — los precios son estimados y pueden variar tras la visita técnica.',
  fr: 'Devis indicatif — les prix sont estimés et peuvent varier après la visite technique.',
};

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

const OPCIONES_VALIDEZ = [
  { value: '1', label: '1 día' },
  { value: '7', label: '7 días' },
  { value: '15', label: '15 días' },
  { value: '30', label: '30 días' },
];

const ESTADO_FR: Record<string, string> = {
  Borrador: 'Brouillon',
  Pendiente: 'En attente',
  Aceptado: 'Accepté',
  Rechazado: 'Refusé',
};

type FormState = {
  visita_id: string | null;
  pais: string;
  titulo: string;
  cliente_nombre: string;
  cliente_dir: string;
  cliente_dir_extra: string;
  cliente_email: string;
  cliente_tel: string;
  idioma: string;
  fecha_emision: string;
  fecha_validez: string;
  tipo_iva: string;
  tipo: TipoPresupuesto;
  formato: FormatoPresupuesto;
  portada_foto_url: string | null;
  banco_titular: string;
  banco_nombre: string;
  banco_iban: string;
  banco_bic: string;
  lineas: Linea[];
  plan_pago: PlazoPago[];
  terminos_condiciones: string;
  condiciones_pago: CondicionesPagoValor | null;
  nota: string;
  estado: string;
};

function vacio(): FormState {
  return {
    visita_id: null,
    pais: 'España',
    titulo: '',
    cliente_nombre: '',
    cliente_dir: '',
    cliente_dir_extra: '',
    cliente_email: '',
    cliente_tel: '',
    idioma: 'Español',
    fecha_emision: fechaHoy(),
    fecha_validez: sumarDias(fechaHoy(), 30),
    tipo_iva: 'IVA_21',
    tipo: 'normal',
    formato: 'rapido',
    portada_foto_url: null,
    banco_titular: '',
    banco_nombre: '',
    banco_iban: '',
    banco_bic: '',
    lineas: [lineaVacia()],
    plan_pago: [],
    terminos_condiciones: '',
    condiciones_pago: null,
    nota: '',
    estado: 'Borrador',
  };
}

function FaseCard({ numero, titulo, children }: { numero: number; titulo: string; children: ReactNode }) {
  return (
    <section className="bg-surface border border-gray-200 rounded-sm p-4">
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2.5 mb-4">
        <span className="w-6 h-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center shrink-0">
          {numero}
        </span>
        <p className="text-sm font-semibold text-gray-900">{titulo}</p>
      </div>
      {children}
    </section>
  );
}

type PresupuestoFormProps = {
  onClose: () => void;
  presupuesto?: Presupuesto | null;
  tipoInicial?: TipoPresupuesto;
  formatoInicial?: FormatoPresupuesto;
  clienteInicialId?: string;
  idiomaInicial?: string;
  desdeOrientativo?: Presupuesto | null;
};

export function PresupuestoForm({
  onClose,
  presupuesto,
  tipoInicial,
  formatoInicial,
  clienteInicialId,
  idiomaInicial,
  desdeOrientativo,
}: PresupuestoFormProps) {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => ({
    ...vacio(),
    tipo: tipoInicial ?? 'normal',
    formato: formatoInicial ?? 'rapido',
    idioma: idiomaInicial ?? 'Español',
  }));
  const [clienteSeleccionado, setClienteSeleccionado] = useState(clienteInicialId ?? '');
  const [editandoCliente, setEditandoCliente] = useState(false);
  const [confirmarEdicionAbierto, setConfirmarEdicionAbierto] = useState(false);
  const [notaActivada, setNotaActivada] = useState(false);
  const [erroresVisibles, setErroresVisibles] = useState(false);
  const [subiendoPortada, setSubiendoPortada] = useState(false);

  const nombreUsuarioActual = (user?.user_metadata?.nombre as string) || user?.email || 'Sistema';

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
    enabled: !presupuesto,
  });

  const clientes = useMemo(() => agruparClientes(visitas ?? []), [visitas]);

  useEffect(() => {
    if (presupuesto) {
      setForm({
        visita_id: presupuesto.visita_id,
        pais: presupuesto.pais ?? paisDesdeTipoIva(presupuesto.tipo_iva) ?? 'España',
        titulo: presupuesto.titulo ?? '',
        cliente_nombre: presupuesto.cliente_nombre ?? '',
        cliente_dir: presupuesto.cliente_dir ?? '',
        cliente_dir_extra: presupuesto.cliente_dir_extra ?? '',
        cliente_email: presupuesto.cliente_email ?? '',
        cliente_tel: presupuesto.cliente_tel ?? '',
        idioma: presupuesto.idioma,
        fecha_emision: presupuesto.fecha_emision ?? fechaHoy(),
        fecha_validez: presupuesto.fecha_validez ?? sumarDias(fechaHoy(), 30),
        tipo_iva: presupuesto.tipo_iva ?? 'IVA_21',
        tipo: presupuesto.tipo ?? 'normal',
        formato: presupuesto.formato ?? 'rapido',
        portada_foto_url: presupuesto.portada_foto_url ?? null,
        banco_titular: presupuesto.banco_titular ?? '',
        banco_nombre: presupuesto.banco_nombre ?? '',
        banco_iban: presupuesto.banco_iban ?? '',
        banco_bic: presupuesto.banco_bic ?? '',
        lineas: presupuesto.lineas.length > 0 ? presupuesto.lineas : [lineaVacia()],
        plan_pago: presupuesto.plan_pago ?? [],
        terminos_condiciones: presupuesto.terminos_condiciones ?? '',
        condiciones_pago: (presupuesto.condiciones_pago as CondicionesPagoValor | null) ?? null,
        nota: presupuesto.nota ?? '',
        estado: presupuesto.estado,
      });
      setNotaActivada(!!presupuesto.nota);
    } else if (desdeOrientativo) {
      const tipoIva = tipoIvaPorDefecto(desdeOrientativo.pais ?? 'España');
      setForm({
        ...vacio(),
        visita_id: desdeOrientativo.visita_id,
        pais: desdeOrientativo.pais ?? 'España',
        titulo: desdeOrientativo.titulo ?? '',
        cliente_nombre: desdeOrientativo.cliente_nombre ?? '',
        cliente_dir: desdeOrientativo.cliente_dir ?? '',
        cliente_dir_extra: desdeOrientativo.cliente_dir_extra ?? '',
        cliente_email: desdeOrientativo.cliente_email ?? '',
        cliente_tel: desdeOrientativo.cliente_tel ?? '',
        idioma: desdeOrientativo.idioma,
        tipo_iva: tipoIva,
        tipo: 'normal',
        formato: desdeOrientativo.formato ?? 'rapido',
        portada_foto_url: desdeOrientativo.portada_foto_url ?? null,
        lineas: (desdeOrientativo.lineas.length > 0 ? desdeOrientativo.lineas : [lineaVacia()]).map((l) =>
          calcularLinea(l, porcentajeIva(tipoIva)),
        ),
      });
      setClienteSeleccionado('');
      setNotaActivada(false);
    } else {
      setForm({ ...vacio(), tipo: tipoInicial ?? 'normal', formato: formatoInicial ?? 'rapido', idioma: idiomaInicial ?? 'Español' });
      setClienteSeleccionado(clienteInicialId ?? '');
      setNotaActivada(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presupuesto, desdeOrientativo]);

  useEffect(() => {
    if (!presupuesto && clienteInicialId && clientes.length > 0) {
      handleSeleccionarCliente(clienteInicialId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes]);

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
      cliente_dir_extra: ultima.direccion_extra ?? '',
      cliente_email: cliente.email ?? '',
      cliente_tel: cliente.telefono,
      idioma: ultima.idioma === 'Français' ? 'Français' : 'Español',
      tipo_iva: nuevoTipo,
      lineas: f.lineas.map((l) => calcularLinea(l, porcentajeIva(nuevoTipo))),
    }));
  };

  const handleSubirPortada = async (file: File) => {
    setSubiendoPortada(true);
    const extension = file.name.split('.').pop() ?? 'jpg';
    const path = `portada_presupuesto_${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from('empresa').upload(path, file, { contentType: file.type, upsert: true });
    if (error) {
      toast.error(error.message);
      setSubiendoPortada(false);
      return;
    }
    const { data } = supabase.storage.from('empresa').getPublicUrl(path);
    setForm((f) => ({ ...f, portada_foto_url: data.publicUrl }));
    setSubiendoPortada(false);
    toast.success('Foto de portada subida — pulsa Guardar para confirmar');
  };

  const porcentaje = porcentajeIva(form.tipo_iva);
  const esOrientativo = form.tipo === 'orientativo';

  // Por normativa un presupuesto orientativo no lleva IVA (se determina en el presupuesto normal
  // tras la visita técnica) — se fuerza a "Exento" para que ningún cálculo le aplique impuesto.
  useEffect(() => {
    if (esOrientativo && form.tipo_iva !== 'EXENTO') {
      setForm((f) => ({ ...f, tipo_iva: 'EXENTO', lineas: f.lineas.map((l) => calcularLinea(l, 0)) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esOrientativo]);

  const { totalConIva, totalSinIva } = useMemo(() => calcularTotales(form.lineas), [form.lineas]);
  const rangoTotales = useMemo(
    () => (esOrientativo ? calcularTotalesRango(form.lineas, porcentaje) : null),
    [esOrientativo, form.lineas, porcentaje],
  );

  const aplicarPreset = (preset: '50/50' | '40-40-20' | 'firma') => {
    if (preset === 'firma') {
      setForm((f) => ({ ...f, plan_pago: [{ concepto: 'A la firma', porcentaje: 100, importe: totalConIva }] }));
      return;
    }
    if (preset === '50/50') {
      setForm((f) => ({
        ...f,
        plan_pago: [
          { concepto: 'Al inicio', porcentaje: 50, importe: totalConIva * 0.5 },
          { concepto: 'Al finalizar', porcentaje: 50, importe: totalConIva * 0.5 },
        ],
      }));
      return;
    }
    setForm((f) => ({
      ...f,
      plan_pago: [
        { concepto: 'Al inicio', porcentaje: 40, importe: totalConIva * 0.4 },
        { concepto: 'A mitad de obra', porcentaje: 40, importe: totalConIva * 0.4 },
        { concepto: 'Al finalizar', porcentaje: 20, importe: totalConIva * 0.2 },
      ],
    }));
  };

  const handleEliminarPlazo = (index: number) => {
    setForm((f) => ({ ...f, plan_pago: f.plan_pago.filter((_, i) => i !== index) }));
  };

  const handleCambiarPlazo = (index: number, cambios: Partial<Pick<PlazoPago, 'concepto' | 'porcentaje'>>) => {
    setForm((f) => ({
      ...f,
      plan_pago: f.plan_pago.map((p, i) => {
        if (i !== index) return p;
        const porcentaje = cambios.porcentaje ?? p.porcentaje;
        return { ...p, ...cambios, importe: totalConIva * (porcentaje / 100) };
      }),
    }));
  };

  const [nuevoConceptoPlazo, setNuevoConceptoPlazo] = useState('');
  const [nuevoPorcentajePlazo, setNuevoPorcentajePlazo] = useState(0);

  const handleAnadirPlazo = () => {
    if (!nuevoConceptoPlazo.trim() || nuevoPorcentajePlazo <= 0) return;
    setForm((f) => ({
      ...f,
      plan_pago: [
        ...f.plan_pago,
        { concepto: nuevoConceptoPlazo.trim(), porcentaje: nuevoPorcentajePlazo, importe: totalConIva * (nuevoPorcentajePlazo / 100) },
      ],
    }));
    setNuevoConceptoPlazo('');
    setNuevoPorcentajePlazo(0);
  };

  const sumaPorcentajesPlazo = Math.round(form.plan_pago.reduce((s, p) => s + p.porcentaje, 0) * 10) / 10;

  const guardarMutation = useMutation({
    mutationFn: async () => {
      const nuevo: NuevoPresupuesto = {
        numero: presupuesto?.numero ?? null,
        visita_id: form.visita_id,
        pais: form.pais,
        titulo: form.titulo || null,
        cliente_nombre: form.cliente_nombre || null,
        cliente_dir: form.cliente_dir || null,
        cliente_dir_extra: form.cliente_dir_extra || null,
        cliente_email: form.cliente_email || null,
        cliente_tel: form.cliente_tel || null,
        idioma: form.idioma,
        fecha_emision: form.fecha_emision,
        fecha_validez: form.fecha_validez,
        tipo_iva: form.tipo_iva,
        tipo: form.tipo,
        formato: form.formato,
        portada_foto_url: form.formato === 'completo' ? form.portada_foto_url || null : null,
        presupuesto_origen_id: presupuesto?.presupuesto_origen_id ?? desdeOrientativo?.id ?? null,
        banco_titular: form.banco_titular || null,
        banco_nombre: form.banco_nombre || null,
        banco_iban: form.banco_iban || null,
        banco_bic: form.banco_bic || null,
        lineas: form.lineas,
        plan_pago: form.plan_pago,
        terminos_condiciones: form.terminos_condiciones || null,
        condiciones_pago: form.condiciones_pago,
        nota: notaActivada ? form.nota || null : null,
        estado: form.estado,
        firmado: presupuesto?.firmado ?? false,
        firma_nombre: presupuesto?.firma_nombre ?? null,
        firma_fecha: presupuesto?.firma_fecha ?? null,
        firma_base64: presupuesto?.firma_base64 ?? null,
        firma_metodo: presupuesto?.firma_metodo ?? 'manual',
        documenso_envelope_id: presupuesto?.documenso_envelope_id ?? null,
        documenso_signing_url: presupuesto?.documenso_signing_url ?? null,
        documenso_estado: presupuesto?.documenso_estado ?? null,
      };

      if (presupuesto) {
        const { error } = await supabase.from('presupuestos').update(nuevo).eq('id', presupuesto.id);
        if (error) throw error;
        return presupuesto.id;
      }

      const numero = await siguienteNumero('seq_presupuesto');
      const { data, error } = await supabase
        .from('presupuestos')
        .insert({ ...nuevo, numero })
        .select()
        .single();
      if (error) throw error;
      if (form.visita_id) {
        await notaSistema(form.visita_id, `Presupuesto ${numero} creado por ${nombreUsuarioActual}`);
      }
      await registrarEvento('presupuesto', data.id, 'Presupuesto creado');
      if (desdeOrientativo) {
        await registrarEvento('presupuesto', desdeOrientativo.id, `Presupuesto normal ${numero} creado a partir de este orientativo`);
      }
      return data.id;
    },
    onSuccess: async () => {
      await sincronizarPipelineCliente(form.cliente_tel);
      queryClient.invalidateQueries({ queryKey: ['presupuestos'] });
      toast.success(presupuesto ? 'Presupuesto actualizado' : 'Presupuesto creado');
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

  const [linkDocumenso, setLinkDocumenso] = useState<string | null>(presupuesto?.documenso_signing_url ?? null);

  const enviarDocumensoMutation = useMutation({
    mutationFn: async (regenerar: boolean = false) => {
      if (!presupuesto) throw new Error('Guarda el presupuesto antes de enviarlo a firmar');
      return enviarPresupuestoAFirmar(presupuesto, { regenerar });
    },
    onSuccess: async (resultado) => {
      setLinkDocumenso(resultado.signingUrl);
      if (presupuesto?.visita_id) {
        await notaSistema(presupuesto.visita_id, `Presupuesto ${presupuesto.numero} enviado a firmar con Documenso`);
      }
      if (presupuesto) await registrarEvento('presupuesto', presupuesto.id, 'Enviado a firmar con Documenso');
      queryClient.invalidateQueries({ queryKey: ['presupuestos'] });
      toast.success('Enlace de firma generado');
    },
    onError: (error) => toast.error(error.message),
  });

  const copiarLinkDocumenso = () => {
    if (!linkDocumenso) return;
    navigator.clipboard.writeText(linkDocumenso);
    toast.success('Enlace copiado');
  };

  const handleDescargarPdf = async () => {
    if (!presupuesto) return;
    try {
      await conAvisoDescarga(() => generarPdfPresupuesto(presupuesto), toast);
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el PDF'));
    }
  };

  const idiomaCorto = form.idioma === 'Français' ? 'fr' : 'es';

  const { data: entidadInfo } = useQuery({
    queryKey: ['empresa_config', 'entidad', form.pais],
    queryFn: () => cargarEntidad(form.pais),
  });

  const entidadConBanco = useMemo(
    () => ({
      ...(entidadInfo?.entidad ?? {}),
      nombre_titular: form.banco_titular || entidadInfo?.entidad?.nombre_titular || '',
      banco: form.banco_nombre || entidadInfo?.entidad?.banco || '',
      iban: form.banco_iban || entidadInfo?.entidad?.iban || '',
      bic: form.banco_bic || entidadInfo?.entidad?.bic || '',
    }),
    [entidadInfo, form.banco_titular, form.banco_nombre, form.banco_iban, form.banco_bic],
  );

  useEffect(() => {
    if (!entidadInfo) return;
    setForm((f) => {
      if (f.banco_titular || f.banco_nombre || f.banco_iban || f.banco_bic) return f;
      const e = entidadInfo.entidad;
      if (!e.nombre_titular && !e.banco && !e.iban && !e.bic) return f;
      return {
        ...f,
        banco_titular: e.nombre_titular ?? '',
        banco_nombre: e.banco ?? '',
        banco_iban: e.iban ?? '',
        banco_bic: e.bic ?? '',
      };
    });
  }, [entidadInfo]);

  const { data: config } = useQuery({
    queryKey: ['empresa_config', 'completa'],
    queryFn: cargarConfigCompleta,
  });

  const configPlantilla = useMemo(() => configPlantillaDesde((config?.datos as { plantilla_documento?: unknown })?.plantilla_documento), [config]);

  const tcRenderizado = useMemo(() => {
    const configTc = config as { tc_es_orientativo?: string; tc_fr_orientativo?: string } | undefined;
    // Los T&C propios del presupuesto (pestaña "Condiciones") sustituyen a los generales de
    // Configuración — igual prioridad que usa generarPdfPresupuesto.ts al generar el PDF, para que
    // la vista previa refleje de verdad lo que se va a descargar.
    const tcCrudo =
      form.terminos_condiciones ||
      (esOrientativo
        ? idiomaCorto === 'fr'
          ? configTc?.tc_fr_orientativo || config?.tc_fr
          : configTc?.tc_es_orientativo || config?.tc_es
        : idiomaCorto === 'fr'
          ? config?.tc_fr
          : config?.tc_es);
    if (!tcCrudo) return undefined;
    return renderizarTC(tcCrudo, form.plan_pago, idiomaCorto);
  }, [config, form.terminos_condiciones, form.plan_pago, idiomaCorto, esOrientativo]);

  const mensajeGracias = idiomaCorto === 'fr' ? config?.mensaje_gracias_fr : config?.mensaje_gracias_es;
  const condPago = (config?.datos as { condicionesPago?: CondicionesPagoValor })?.condicionesPago;
  const condPagoEfectivo = form.condiciones_pago ?? condPago;
  const condicionesPago = condPagoEfectivo
    ? {
        delai: idiomaCorto === 'fr' ? condPagoEfectivo.delaiFr : condPagoEfectivo.delaiEs,
        penalizacion: idiomaCorto === 'fr' ? condPagoEfectivo.penalizacionFr : condPagoEfectivo.penalizacionEs,
        medio: idiomaCorto === 'fr' ? condPagoEfectivo.medioFr : condPagoEfectivo.medioEs,
      }
    : undefined;

  const fidelidadConfig = useMemo(() => {
    const datos = (config?.datos ?? {}) as { fidelidad?: { umbral?: number; porcentaje?: number; importeFijo?: number } };
    return {
      umbral: datos.fidelidad?.umbral ?? 10000,
      porcentaje: datos.fidelidad?.porcentaje ?? 10,
      importeFijo: datos.fidelidad?.importeFijo ?? 150,
    };
  }, [config]);

  const clienteFidelizado = useMemo(() => {
    const tel = normalizarTelefono(form.cliente_tel || '');
    if (!tel) return null;
    const cliente = clientes.find((c) => normalizarTelefono(c.telefono) === tel);
    return cliente && cliente.visitas.length > 1 ? cliente : null;
  }, [form.cliente_tel, clientes]);

  const descuentoYaAplicado = form.lineas.some((l) => l.designacion === 'DESC-FID');

  const descuentoPropuesto = useMemo(
    () =>
      totalConIva > fidelidadConfig.umbral ? totalConIva * (fidelidadConfig.porcentaje / 100) : fidelidadConfig.importeFijo,
    [totalConIva, fidelidadConfig],
  );

  const [descuentoImporte, setDescuentoImporte] = useState(0);

  useEffect(() => {
    setDescuentoImporte(Math.round(descuentoPropuesto * 100) / 100);
  }, [descuentoPropuesto]);

  const handleAplicarDescuento = () => {
    const nuevaLinea = calcularLinea(
      {
        ...lineaVacia(),
        designacion: 'DESC-FID',
        descripcion: 'Descuento cliente fidelizado / Remise client fidélisé',
        unidad: 'forfait',
        cantidad: 1,
        precio_unit: -descuentoImporte,
      },
      porcentaje,
    );
    setForm((f) => ({ ...f, lineas: [...f.lineas, nuevaLinea] }));
  };

  return (
    <div className="animate-[scale-in_180ms_ease-out]">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={15} />
          Volver a presupuestos
        </button>
        <div className="flex gap-2">
          {presupuesto && (
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
        <div className="flex-1 min-w-0 w-full flex flex-col gap-4">
          <FaseCard numero={1} titulo="Título y tipo">
            <Input
              label="Título"
              placeholder="Ej. Reforma de baño completa"
              value={form.titulo}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              className="mb-4"
            />
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Tipo de presupuesto</p>
            <span
              className={`inline-block text-xs font-medium rounded-sm px-2.5 py-1 ${
                esOrientativo ? 'bg-amber-50 text-amber-800' : 'bg-brand-light text-brand'
              }`}
            >
              {esOrientativo ? 'Orientativo' : 'Normal'}
            </span>
            {esOrientativo && (
              <p className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-sm px-2.5 py-1.5 mt-2">
                Los precios de las líneas se introducen como rango (desde/hasta), sin plan de pago ni firma.
              </p>
            )}

            {form.formato === 'completo' && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Foto de portada de este presupuesto</p>
                <p className="text-xs text-gray-400 mb-3">
                  Opcional — si no subes ninguna, se usa la foto por defecto del Constructor de portadas.
                </p>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-20 border border-gray-200 rounded-sm flex items-center justify-center bg-gray-50 shrink-0 overflow-hidden">
                    {form.portada_foto_url || FOTO_PORTADA_DEFECTO ? (
                      <img src={form.portada_foto_url || FOTO_PORTADA_DEFECTO} alt="Foto de portada" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={20} className="text-gray-300" />
                    )}
                  </div>
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => e.target.files?.[0] && handleSubirPortada(e.target.files[0])}
                      disabled={subiendoPortada}
                      className="text-sm"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      {subiendoPortada
                        ? 'Subiendo...'
                        : form.portada_foto_url
                          ? 'Foto propia de este presupuesto.'
                          : 'Usando la foto por defecto.'}
                    </p>
                    {form.portada_foto_url && (
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, portada_foto_url: null }))}
                        className="text-xs text-brand hover:underline mt-1"
                      >
                        Quitar y usar la de por defecto
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </FaseCard>

          <FaseCard numero={2} titulo="Cliente">
            {!editandoCliente && form.cliente_nombre.trim() ? (
              <button
                onClick={() => setConfirmarEdicionAbierto(true)}
                className="w-full text-left border border-gray-200 rounded-sm px-3.5 py-3 hover:border-brand transition-colors"
              >
                <p className="text-sm font-semibold text-gray-900">{form.cliente_nombre}</p>
                <p className="text-xs text-gray-500 mt-0.5">{[form.cliente_dir, form.pais].filter(Boolean).join(' · ') || '—'}</p>
                <p className="text-xs text-brand mt-1.5">Pulsa para modificar los datos del cliente</p>
              </button>
            ) : (
              <>
                {!presupuesto && (
                  <Select
                    label="Cliente existente (opcional)"
                    options={[
                      { value: '', label: '— Entrada manual —' },
                      ...clientes.map((c) => ({ value: c.id, label: `${c.nombre} ${c.apellidos} · ${c.telefono}` })),
                    ]}
                    value={clienteSeleccionado}
                    onChange={(e) => handleSeleccionarCliente(e.target.value)}
                    className="mb-4"
                  />
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="Nombre" value={form.cliente_nombre} onChange={(e) => setForm((f) => ({ ...f, cliente_nombre: e.target.value }))} />
                  <Input label="Teléfono" value={form.cliente_tel} onChange={(e) => setForm((f) => ({ ...f, cliente_tel: e.target.value }))} />
                  <div className="col-span-2">
                    <Input label="Dirección" value={form.cliente_dir} onChange={(e) => setForm((f) => ({ ...f, cliente_dir: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <Input
                      label="Piso / puerta / referencia (opcional)"
                      hint="Ej.: 2º piso, puerta B — étage 4, porte gauche"
                      value={form.cliente_dir_extra}
                      onChange={(e) => setForm((f) => ({ ...f, cliente_dir_extra: e.target.value }))}
                    />
                  </div>
                  <Input label="Email" value={form.cliente_email} onChange={(e) => setForm((f) => ({ ...f, cliente_email: e.target.value }))} />
                  {form.pais === 'Francia' && (
                    <Select
                      label="Idioma del documento"
                      options={[{ value: 'Español', label: 'Español' }, { value: 'Français', label: 'Français' }]}
                      value={form.idioma}
                      onChange={(e) => setForm((f) => ({ ...f, idioma: e.target.value }))}
                    />
                  )}
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
                        idioma: nuevoPais === 'España' ? 'Español' : f.idioma,
                        tipo_iva: nuevoTipo,
                        lineas: f.lineas.map((l) => calcularLinea(l, porcentajeIva(nuevoTipo))),
                      }));
                    }}
                  />
                </div>
                {editandoCliente && (
                  <Button size="sm" variant="secondary" className="mt-3" onClick={() => setEditandoCliente(false)}>
                    Listo
                  </Button>
                )}
              </>
            )}

            {clienteFidelizado && !descuentoYaAplicado && (
              <div className="bg-brand-light border border-gray-200 rounded-sm px-3 py-2.5 flex items-center justify-between gap-3 mt-4">
                <div className="flex items-center gap-2 text-xs text-brand">
                  <Star size={14} className="shrink-0" />
                  <span>
                    Cliente fidelizado — {clienteFidelizado.visitas.length} obras registradas. Descuento propuesto:{' '}
                    {descuentoImporte.toFixed(2)} €
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    value={descuentoImporte}
                    onChange={(e) => setDescuentoImporte(Number(e.target.value))}
                    className="w-24 border border-gray-200 rounded-sm px-2 py-1 text-xs focus:border-brand focus:outline-none"
                  />
                  <Button size="sm" variant="secondary" onClick={handleAplicarDescuento}>
                    Aplicar descuento
                  </Button>
                </div>
              </div>
            )}
          </FaseCard>

          <FaseCard numero={3} titulo="Líneas del presupuesto">
            <LineasEditor
              lineas={form.lineas}
              porcentajeIva={porcentaje}
              onChange={(lineas) => setForm((f) => ({ ...f, lineas }))}
              rango={esOrientativo}
              erroresVisibles={erroresVisibles}
              idioma={idiomaCorto}
            />
          </FaseCard>

          <FaseCard numero={4} titulo="Condiciones">
            {presupuesto && (
              <p className="text-xs text-gray-500 mb-3">
                Estado actual: <span className="font-medium text-gray-800">{presupuesto.estado}</span> — cámbialo desde el
                menú de la tabla de presupuestos.
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Fecha emisión" type="date" value={form.fecha_emision} onChange={(e) => setForm((f) => ({ ...f, fecha_emision: e.target.value }))} />
              <div>
                <Select
                  label="Válido hasta"
                  options={OPCIONES_VALIDEZ}
                  value={String(diasEntre(form.fecha_emision, form.fecha_validez))}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fecha_validez: sumarDias(f.fecha_emision, Number(e.target.value)) }))
                  }
                />
                <p className="text-xs text-gray-400 mt-1">→ {form.fecha_validez}</p>
              </div>
              {esOrientativo ? (
                <div>
                  <p className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Impuesto</p>
                  <p className="text-sm text-gray-500 border border-gray-200 rounded-sm px-2.5 py-1.5">
                    Sin IVA — se determina en el presupuesto normal tras la visita técnica
                  </p>
                </div>
              ) : (
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
              )}
            </div>
            <div className="mt-3">
              <EditorTexto
                label="Términos y condiciones (opcional)"
                value={form.terminos_condiciones}
                onChange={(v) => setForm((f) => ({ ...f, terminos_condiciones: v }))}
                placeholder="Déjalo vacío para usar los términos y condiciones generales de Configuración"
                rows={5}
              />
            </div>
            <div className="mt-3 border-t border-gray-200 pt-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
                <input
                  type="checkbox"
                  checked={form.condiciones_pago !== null}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      condiciones_pago: e.target.checked
                        ? (condPago ?? { delaiEs: '', delaiFr: '', penalizacionEs: '', penalizacionFr: '', medioEs: '', medioFr: '' })
                        : null,
                    }))
                  }
                />
                Usar condiciones de pago distintas para este presupuesto
              </label>
              {form.condiciones_pago && (
                <CondicionesPagoEditor
                  valor={form.condiciones_pago}
                  onChange={(v) => setForm((f) => ({ ...f, condiciones_pago: v }))}
                />
              )}
            </div>
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
          </FaseCard>

          <FaseCard numero={5} titulo="Datos bancarios">
            <p className="text-xs text-gray-400 mb-3">
              Se rellenan por defecto con los datos de Configuración — cámbialos aquí solo si este presupuesto necesita unos
              distintos.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Titular de la cuenta"
                value={form.banco_titular}
                onChange={(e) => setForm((f) => ({ ...f, banco_titular: e.target.value }))}
              />
              <Input
                label="Banco"
                value={form.banco_nombre}
                onChange={(e) => setForm((f) => ({ ...f, banco_nombre: e.target.value }))}
              />
              <Input
                label="IBAN"
                value={form.banco_iban}
                onChange={(e) => setForm((f) => ({ ...f, banco_iban: e.target.value }))}
              />
              <Input
                label="BIC / SWIFT"
                value={form.banco_bic}
                onChange={(e) => setForm((f) => ({ ...f, banco_bic: e.target.value }))}
              />
            </div>
          </FaseCard>

          {!esOrientativo && (
            <FaseCard numero={6} titulo="Plan de pago">
              <div className="flex gap-2 mb-3">
                <Button size="sm" variant="secondary" onClick={() => aplicarPreset('50/50')}>
                  50/50
                </Button>
                <Button size="sm" variant="secondary" onClick={() => aplicarPreset('40-40-20')}>
                  40-40-20
                </Button>
                <Button size="sm" variant="secondary" onClick={() => aplicarPreset('firma')}>
                  100% a la firma
                </Button>
              </div>
              <div className="flex flex-col gap-1.5">
                {form.plan_pago.length === 0 && <p className="text-sm text-gray-400">Sin plan de pago definido</p>}
                {form.plan_pago.map((plazo, i) => (
                  <div key={i} className="flex items-center gap-2 border border-gray-200 rounded-sm pl-3 pr-2 py-1.5">
                    <input
                      value={plazo.concepto}
                      onChange={(e) => handleCambiarPlazo(i, { concepto: e.target.value })}
                      placeholder="Concepto (p. ej. Al inicio de obra)"
                      className="flex-1 min-w-0 text-sm text-gray-900 bg-transparent focus:outline-none"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={plazo.porcentaje}
                        onChange={(e) => handleCambiarPlazo(i, { porcentaje: Number(e.target.value) })}
                        className="w-14 text-sm text-right border border-gray-200 rounded-sm px-1.5 py-0.5 focus:border-brand focus:outline-none"
                      />
                      <span className="text-sm text-gray-500">%</span>
                    </div>
                    <span className="text-sm text-gray-600 w-24 text-right shrink-0">{plazo.importe.toFixed(2)} €</span>
                    <button onClick={() => handleEliminarPlazo(i)} className="text-gray-300 hover:text-red-600 shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                <input
                  value={nuevoConceptoPlazo}
                  onChange={(e) => setNuevoConceptoPlazo(e.target.value)}
                  placeholder="Concepto del nuevo plazo"
                  className="flex-1 min-w-0 border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={nuevoPorcentajePlazo || ''}
                    onChange={(e) => setNuevoPorcentajePlazo(Number(e.target.value))}
                    placeholder="%"
                    className="w-16 border border-gray-200 rounded-sm px-2 py-1.5 text-sm text-right focus:border-brand focus:outline-none"
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleAnadirPlazo}
                  disabled={!nuevoConceptoPlazo.trim() || nuevoPorcentajePlazo <= 0}
                >
                  <span className="flex items-center gap-1">
                    <Plus size={13} />
                    Añadir plazo
                  </span>
                </Button>
              </div>

              {form.plan_pago.length > 0 && (
                <p className={`text-xs mt-2 ${sumaPorcentajesPlazo === 100 ? 'text-gray-400' : 'text-amber-600'}`}>
                  Suma de porcentajes: {sumaPorcentajesPlazo}%{sumaPorcentajesPlazo !== 100 ? ' — no suma 100%' : ''}
                </p>
              )}
            </FaseCard>
          )}

          {presupuesto && !esOrientativo && (
            <FaseCard numero={7} titulo="Firma">
              {presupuesto.firmado ? (
                <p className="text-sm text-gray-600">
                  Firmado {presupuesto.firma_metodo === 'documenso' ? 'electrónicamente (Documenso) ' : ''}
                  por {presupuesto.firma_nombre} el {presupuesto.firma_fecha?.slice(0, 10)}
                </p>
              ) : linkDocumenso ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Input value={linkDocumenso} readOnly className="flex-1" />
                    <Button size="sm" variant="secondary" onClick={copiarLinkDocumenso}>
                      <span className="flex items-center gap-1">
                        <Copy size={13} />
                        Copiar
                      </span>
                    </Button>
                  </div>
                  <p className="text-xs text-gray-400">
                    Comparte este enlace con el cliente para que firme. Al firmar, el presupuesto pasará a
                    "Aceptado" automáticamente.
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => enviarDocumensoMutation.mutate(true)}
                    disabled={enviarDocumensoMutation.isPending}
                    className="self-start"
                  >
                    {enviarDocumensoMutation.isPending ? 'Generando…' : 'Generar nuevo enlace'}
                  </Button>
                </div>
              ) : (
                <div>
                  <Button
                    size="sm"
                    onClick={() => enviarDocumensoMutation.mutate(false)}
                    disabled={enviarDocumensoMutation.isPending || !form.cliente_email}
                  >
                    {enviarDocumensoMutation.isPending ? 'Generando…' : 'Obtener enlace de firma'}
                  </Button>
                  {!form.cliente_email && (
                    <p className="text-xs text-amber-600 mt-1">Añade un email de cliente para poder enviarlo a firmar.</p>
                  )}
                </div>
              )}
            </FaseCard>
          )}
        </div>

        <div className="w-full lg:w-[420px] shrink-0 lg:sticky lg:top-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Vista previa</p>
          <DocumentoPreview
            plantilla={configPlantilla.estructura}
            colorPrimario={configPlantilla.colorPrimario}
            colorSecundario={configPlantilla.colorSecundario}
            mostrarLogo={configPlantilla.mostrarLogo}
            empresaClienteIzquierda={configPlantilla.empresaClienteIzquierda}
            columnasInvertidas={configPlantilla.planPagoIzquierda}
            tamanoTituloDocumento={configPlantilla.tamanoTituloDocumento}
            tamanoTituloReforma={configPlantilla.tamanoTituloReforma}
            tabla={configPlantilla.tabla}
            columnasExtra={configPlantilla.columnas}
            piePagina={configPlantilla.piePagina}
            idioma={idiomaCorto}
            tituloDocumento={
              (idiomaCorto === 'fr' ? 'DEVIS' : 'PRESUPUESTO') + (esOrientativo ? (idiomaCorto === 'fr' ? ' INDICATIF' : ' ORIENTATIVO') : '')
            }
            titulo={form.titulo || undefined}
            numero={presupuesto?.numero ?? null}
            entidad={entidadConBanco}
            logoUrl={entidadInfo?.logoUrl}
            pais={form.pais}
            clienteNombre={form.cliente_nombre}
            clienteDir={form.cliente_dir}
            clienteDirExtra={form.cliente_dir_extra || undefined}
            clienteContacto={[form.cliente_tel, form.cliente_email].filter(Boolean).join(' · ')}
            labelCif={form.pais === 'Francia' ? 'SIRET' : 'CIF'}
            camposDocumento={[
              { label: idiomaCorto === 'fr' ? 'Numéro' : 'Número', valor: presupuesto?.numero ?? '—' },
              { label: idiomaCorto === 'fr' ? 'Émission' : 'Emisión', valor: form.fecha_emision },
              { label: idiomaCorto === 'fr' ? "Valable jusqu'au" : 'Válido hasta', valor: form.fecha_validez },
              { label: idiomaCorto === 'fr' ? 'TVA' : 'IVA', valor: `${porcentaje}%` },
              {
                label: idiomaCorto === 'fr' ? 'État' : 'Estado',
                valor: idiomaCorto === 'fr' ? (ESTADO_FR[form.estado] ?? form.estado) : form.estado,
                claseColor: claseColorEstado(form.estado),
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
            totalSinIvaMax={rangoTotales?.totalSinIvaMax}
            totalConIvaMax={rangoTotales?.totalConIvaMax}
            porcentajeIva={porcentaje}
            labelBase={idiomaCorto === 'fr' ? 'Base HT' : 'Base imponible'}
            labelIva={idiomaCorto === 'fr' ? 'TVA' : 'IVA'}
            mencionIva={mencionIvaReducida(form.tipo_iva)}
            notaOrientativo={esOrientativo ? NOTA_ORIENTATIVO[idiomaCorto] : undefined}
            planPago={form.plan_pago}
            labelPlanPago={idiomaCorto === 'fr' ? 'Plan de paiement' : 'Plan de pago'}
            condicionesPago={condicionesPago}
            firmaBase64={esOrientativo ? undefined : presupuesto?.firma_base64}
            firmaNombre={presupuesto?.firma_nombre}
            firmaFecha={presupuesto?.firma_fecha}
            labelFirma={esOrientativo ? undefined : idiomaCorto === 'fr' ? 'Signature du client' : 'Firma del cliente'}
            labelPendienteFirma={idiomaCorto === 'fr' ? 'En attente de signature' : 'Pendiente de firma'}
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

      <Modal
        open={confirmarEdicionAbierto}
        onClose={() => setConfirmarEdicionAbierto(false)}
        title="Modificar cliente"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmarEdicionAbierto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setEditandoCliente(true);
                setConfirmarEdicionAbierto(false);
              }}
            >
              Confirmar
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          ¿Quieres modificar los datos de este cliente? Los cambios se guardarán en este presupuesto al pulsar "Guardar".
        </p>
      </Modal>
    </div>
  );
}
