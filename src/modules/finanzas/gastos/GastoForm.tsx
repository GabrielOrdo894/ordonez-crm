import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Paperclip, Receipt, UploadCloud, X, Eye, Building2, Coins, CreditCard } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../hooks/useToast';
import { Input } from '../../../components/ui/Input';
import { FechaPicker } from '../../../components/ui/FechaPicker';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { SelectorIva } from '../SelectorIva';
import { porcentajeIva, tipoIvaPorDefecto } from '../iva';
import type { Gasto, NuevoGasto } from './types';
import { ProveedorForm } from '../proveedores/ProveedorForm';
import type { Proveedor } from '../proveedores/types';
import { CategoriaPicker } from './CategoriaPicker';
import { cuentaLabel, GRUPOS_CATEGORIA } from './categorias';
import { VistaPreviaAdjunto } from './VistaPreviaAdjunto';
import { registrarAsientoGasto, rectificarAsientos } from '../../../lib/asientosContables';
import { calcularIndemnizacionKm, tarifaPorCv, CV_OPCIONES } from './baremoKilometrico';
import { calcularKmIdaYVuelta } from '../../../lib/calcularKmIdaYVuelta';
import { MapsAutocomplete } from '../../google/MapsAutocomplete';
import type { LugarSeleccionado } from '../../google/MapsAutocomplete';

const NUEVO_PROVEEDOR = '__nuevo__';
const TIPO_INTRACOM = 'INTRACOM';
// Compra a un proveedor de fuera de la UE (importación) — desde 2022 Francia autoliquida su TVA
// exactamente igual que una adquisición intracomunitaria (mismo mecanismo, cuenta deducible
// distinta: 445661 en vez de 445662 — ver asientosContables.ts), así que se trata en paralelo al
// caso INTRACOM en vez de un simple "no aplica" (hallazgo real, auditoría 2026-08-21: antes no
// existía ninguna opción para este caso).
const TIPO_IMPORTACION = 'IMPORTACION';
const CUENTA_KILOMETRICO = '6251';

// Cuentas verificadas 2026-08-16: 624 es "transports de biens" (fletes a terceros), no carburant ni
// desplazamientos propios — error real que tenían Gasolina y Peaje antes de esta corrección. '625' a
// secas ni siquiera existe como cuenta del catálogo (solo 6251/6256/6257), Comida tampoco apuntaba
// bien. Fuentes: keobiz.fr/le-mag/compte-compta-carburant, pennylane.com/fr/fiches-pratiques/plan-comptable/compte-6256-missions.
const PLANTILLAS_RAPIDAS = [
  { label: 'Gasolina', descripcion: 'Carburant véhicule', cuenta_contable: '6061' },
  { label: 'Peaje', descripcion: 'Péage autoroute — déplacement professionnel', cuenta_contable: '6251' },
  { label: 'Comida', descripcion: 'Repas seul en déplacement professionnel', cuenta_contable: '6256' },
  { label: 'Teléfono', descripcion: 'Reembolso 50% línea telefónica profesional', cuenta_contable: '626' },
];

function fechaHoy() {
  return new Date().toISOString().slice(0, 10);
}

function Seccion({ numero, titulo, icono: Icono, children }: { numero: number; titulo: string; icono: typeof Receipt; children: ReactNode }) {
  return (
    <section className="bg-surface border border-gray-200 rounded-sm p-4">
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2.5 mb-4">
        <span className="w-6 h-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center shrink-0">
          {numero}
        </span>
        <Icono size={14} className="text-brand" />
        <p className="text-sm font-semibold text-gray-900">{titulo}</p>
      </div>
      {children}
    </section>
  );
}

type FormState = {
  fecha: string;
  descripcion: string;
  categoria: string;
  proveedor_id: string | null;
  proveedor: string;
  pais: string;
  importe_total: number;
  tipo_iva: string;
  cuenta_contable: string;
  num_factura_proveedor: string;
  es_kilometrico: boolean;
  km: number;
  vehiculo_cv: number;
};

function vacio(): FormState {
  return {
    fecha: fechaHoy(),
    descripcion: '',
    categoria: '',
    proveedor_id: null,
    proveedor: '',
    pais: 'España',
    importe_total: 0,
    tipo_iva: 'IVA_21',
    cuenta_contable: '',
    num_factura_proveedor: '',
    es_kilometrico: false,
    km: 0,
    vehiculo_cv: 5,
  };
}

function formDesdeGasto(g: Gasto): FormState {
  return {
    fecha: g.fecha ?? fechaHoy(),
    descripcion: g.descripcion ?? '',
    categoria: g.categoria ?? '',
    proveedor_id: g.proveedor_id,
    proveedor: g.proveedor ?? '',
    pais: g.pais ?? 'España',
    importe_total: (g.importe_base ?? 0) + (g.importe_iva ?? 0),
    tipo_iva: g.tipo_iva ?? 'IVA_21',
    cuenta_contable: g.cuenta_contable ?? '',
    num_factura_proveedor: g.num_factura_proveedor ?? '',
    es_kilometrico: g.km != null,
    km: g.km ?? 0,
    vehiculo_cv: g.vehiculo_cv ?? 5,
  };
}

type GastoFormProps = {
  onClose: () => void;
  gasto?: Gasto | null;
  duplicarDesde?: Gasto | null;
  // Solo para crear uno nuevo a partir de un movimiento bancario importado (ver BancoPage) —
  // el importe se trata como total con IVA, igual que el resto del formulario.
  prefill?: { fecha?: string; descripcion?: string; importeTotal?: number };
  onGuardado?: (id: string) => void;
};

export function GastoForm({ onClose, gasto, duplicarDesde, prefill, onGuardado }: GastoFormProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => {
    if (gasto) return formDesdeGasto(gasto);
    if (duplicarDesde) return { ...formDesdeGasto(duplicarDesde), fecha: fechaHoy(), num_factura_proveedor: '' };
    if (prefill) {
      return {
        ...vacio(),
        fecha: prefill.fecha ?? fechaHoy(),
        descripcion: prefill.descripcion ?? '',
        importe_total: prefill.importeTotal ?? 0,
      };
    }
    return vacio();
  });
  // adjunto.path es lo que se persiste en gastos.adjunto_url (bucket privado, el nombre de columna
  // se mantiene por compatibilidad) — adjunto.url es una signed URL de corta duración solo para
  // previsualizar en esta sesión, nunca se guarda.
  const [adjunto, setAdjunto] = useState<{ path: string; url: string; nombre: string; tipo: string } | null>(null);

  useEffect(() => {
    if (!gasto?.adjunto_url) return;
    let cancelado = false;
    supabase.storage
      .from('justificantes')
      .createSignedUrl(gasto.adjunto_url, 3600)
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error) {
          toast.error(`No se pudo cargar el justificante: ${error.message}`);
          return;
        }
        setAdjunto({ path: gasto.adjunto_url!, url: data.signedUrl, nombre: gasto.adjunto_nombre ?? '', tipo: gasto.adjunto_tipo ?? '' });
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gasto?.id]);
  const [subiendo, setSubiendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [vistaPreviaAbierta, setVistaPreviaAbierta] = useState(false);
  const [creandoProveedor, setCreandoProveedor] = useState(false);
  const [mostrandoCategorias, setMostrandoCategorias] = useState(false);
  const [modoImporte, setModoImporte] = useState<'total' | 'base'>('total');
  const [direccionVisita, setDireccionVisita] = useState('');
  const [calculandoKm, setCalculandoKm] = useState(false);

  const { data: proveedores } = useQuery({
    queryKey: ['proveedores'],
    queryFn: async () => {
      const { data, error } = await supabase.from('proveedores').select('*').order('razon_social', { ascending: true });
      if (error) throw error;
      return data as Proveedor[];
    },
  });

  const handleSeleccionarProveedor = (valor: string) => {
    if (valor === NUEVO_PROVEEDOR) {
      setCreandoProveedor(true);
      return;
    }
    const proveedor = proveedores?.find((p) => p.id === valor);
    setForm((f) => ({
      ...f,
      proveedor_id: valor || null,
      proveedor: proveedor?.razon_social ?? '',
      pais: proveedor?.pais ?? f.pais,
    }));
  };

  const handleProveedorCreado = (proveedor: Proveedor) => {
    setForm((f) => ({ ...f, proveedor_id: proveedor.id, proveedor: proveedor.razon_social ?? '', pais: proveedor.pais ?? f.pais }));
    setCreandoProveedor(false);
  };

  const aplicarPlantilla = (plantilla: (typeof PLANTILLAS_RAPIDAS)[number]) => {
    setForm((f) => ({
      ...f,
      categoria: cuentaLabel(plantilla.cuenta_contable),
      descripcion: plantilla.descripcion,
      cuenta_contable: plantilla.cuenta_contable,
    }));
  };

  const activarKilometrico = () => {
    setForm((f) => ({
      ...f,
      es_kilometrico: true,
      categoria: cuentaLabel(CUENTA_KILOMETRICO),
      cuenta_contable: CUENTA_KILOMETRICO,
      tipo_iva: 'EXENTO',
      // El barème kilométrique y la exención de cotisations/IR es una regla francesa (TNS/IS) — sin
      // esto, un gasto kilométrico se podía quedar en 'España' por defecto y no generaba asiento
      // contable ni contaba en el Simulador (que solo suma gastos de Francia con km).
      pais: 'Francia',
    }));
    setDireccionVisita('');
  };

  const handleSeleccionarDireccionVisita = async (lugar: LugarSeleccionado) => {
    setDireccionVisita(lugar.direccion);
    if (lugar.lat == null || lugar.lng == null) return;
    setCalculandoKm(true);
    const km = await calcularKmIdaYVuelta({ lat: lugar.lat, lng: lugar.lng });
    setCalculandoKm(false);
    if (km != null) setForm((f) => ({ ...f, km }));
  };

  const esIntracomunitario = form.tipo_iva === TIPO_INTRACOM;
  const esImportacion = form.tipo_iva === TIPO_IMPORTACION;
  const cuentasAmortizacion = GRUPOS_CATEGORIA.find((g) => g.id === 'amortissements')?.cuentas ?? [];
  const esAmortizacion = cuentasAmortizacion.includes(form.cuenta_contable);
  const porcentaje =
    esIntracomunitario || esImportacion || esAmortizacion || form.es_kilometrico ? 0 : porcentajeIva(form.tipo_iva);
  const importeTotalEfectivo = form.es_kilometrico ? calcularIndemnizacionKm(form.km, form.vehiculo_cv) : form.importe_total;
  const importeBase = porcentaje > 0 ? importeTotalEfectivo / (1 + porcentaje / 100) : importeTotalEfectivo;
  const importeIvaDeducible = importeTotalEfectivo - importeBase;

  useEffect(() => {
    if (esAmortizacion && form.tipo_iva !== 'EXENTO') {
      setForm((f) => ({ ...f, tipo_iva: 'EXENTO' }));
    }
  }, [esAmortizacion, form.tipo_iva]);

  useEffect(() => {
    if (form.es_kilometrico && form.tipo_iva !== 'EXENTO') {
      setForm((f) => ({ ...f, tipo_iva: 'EXENTO', cuenta_contable: f.cuenta_contable || CUENTA_KILOMETRICO }));
    }
  }, [form.es_kilometrico, form.tipo_iva]);

  const handleImporteChange = (valor: number) => {
    if (modoImporte === 'base') {
      setForm((f) => ({ ...f, importe_total: porcentaje > 0 ? valor * (1 + porcentaje / 100) : valor }));
    } else {
      setForm((f) => ({ ...f, importe_total: valor }));
    }
  };

  const TAMANO_MAX_ADJUNTO = 10 * 1024 * 1024; // 10 MB

  const handleSubirAdjunto = async (file: File) => {
    // El accept="image/*,.pdf" del <input type="file"> solo restringe el selector nativo —
    // arrastrar-y-soltar lo saltaba por completo, y no había límite de tamaño en ningún punto
    // antes de subir a Storage (bug real corregido 2026-08-11).
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      toast.error('Solo se admiten imágenes o PDF como justificante');
      return;
    }
    if (file.size > TAMANO_MAX_ADJUNTO) {
      toast.error(`El archivo pesa demasiado (máximo ${TAMANO_MAX_ADJUNTO / 1024 / 1024} MB)`);
      return;
    }
    setSubiendo(true);
    const extension = file.name.split('.').pop() ?? 'jpg';
    const path = `gastos/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from('justificantes').upload(path, file, { contentType: file.type });
    if (error) {
      setSubiendo(false);
      toast.error(error.message);
      return;
    }
    const { data, error: errorFirma } = await supabase.storage.from('justificantes').createSignedUrl(path, 3600);
    setSubiendo(false);
    if (errorFirma) {
      toast.error(errorFirma.message);
      return;
    }
    setAdjunto({ path, url: data.signedUrl, nombre: file.name, tipo: file.type });
  };

  const guardarMutation = useMutation({
    mutationFn: async () => {
      const nuevo: NuevoGasto = {
        fecha: form.fecha,
        descripcion:
          form.descripcion ||
          (form.es_kilometrico ? `Indemnité kilométrique — ${form.km} km (${form.vehiculo_cv} CV)` : null),
        categoria: form.categoria || null,
        proveedor: form.proveedor || null,
        proveedor_id: form.proveedor_id,
        importe_base: Math.round(importeBase * 100) / 100,
        tipo_iva: form.tipo_iva,
        importe_iva: Math.round(importeIvaDeducible * 100) / 100,
        pais: form.pais,
        cuenta_contable: form.cuenta_contable || null,
        visita_id: null,
        adjunto_url: adjunto?.path ?? null,
        adjunto_nombre: adjunto?.nombre ?? null,
        adjunto_tipo: adjunto?.tipo ?? null,
        num_factura_proveedor: form.num_factura_proveedor || null,
        inmovilizado_id: gasto?.inmovilizado_id ?? null,
        km: form.es_kilometrico ? form.km : null,
        vehiculo_cv: form.es_kilometrico ? form.vehiculo_cv : null,
        // Un gasto creado a mano aquí siempre se considera ya pagado. Al editar uno que ya existe
        // se preserva su estado_gasto tal cual estaba — aprobarlo es una acción explícita vía
        // "Registrar pago" en GastosPage, nunca un efecto colateral de corregir un campo (bug
        // real corregido 2026-08-18: editar un gasto de kilometraje pendiente lo aprobaba y
        // contabilizaba en silencio, sin pasar por esa revisión).
        estado_gasto: gasto?.estado_gasto ?? 'pagado',
      };

      if (gasto) {
        const { error } = await supabase.from('gastos').update(nuevo).eq('id', gasto.id);
        if (error) throw error;
        return;
      }
      const { data, error } = await supabase.from('gastos').insert(nuevo).select('id').single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['gastos'] });
      queryClient.invalidateQueries({ queryKey: ['asientos_contables'] });
      toast.success(gasto ? 'Gasto actualizado' : 'Gasto registrado');
      // Al crear: asiento nuevo si es de Francia. Al editar: se rectifica (asiento espejo, nunca
      // se toca el original — ver plan de Contabilidad francesa) el asiento previo si existía, y
      // se registra uno nuevo con los valores corregidos si sigue siendo de Francia. Si algo falla
      // no debe deshacer ni bloquear el guardado del gasto ya confirmado.
      if (id && form.pais === 'Francia') {
        registrarAsientoGasto({
          id,
          fecha: form.fecha,
          descripcion: form.descripcion || null,
          proveedor: form.proveedor || null,
          cuenta_contable: form.cuenta_contable || null,
          importe_base: Math.round(importeBase * 100) / 100,
          importe_iva: Math.round(importeIvaDeducible * 100) / 100,
          tipo_iva: form.tipo_iva,
        }).catch((error) => toast.warning(`Gasto guardado, pero no se pudo registrar en el libro diario: ${error.message}`));
      } else if (gasto && gasto.estado_gasto !== 'pendiente') {
        (async () => {
          try {
            await rectificarAsientos('gasto', gasto.id, 'creacion', gasto.fecha ?? form.fecha);
            if (form.pais === 'Francia') {
              await registrarAsientoGasto({
                id: gasto.id,
                fecha: form.fecha,
                descripcion: form.descripcion || null,
                proveedor: form.proveedor || null,
                cuenta_contable: form.cuenta_contable || null,
                importe_base: Math.round(importeBase * 100) / 100,
                importe_iva: Math.round(importeIvaDeducible * 100) / 100,
                tipo_iva: form.tipo_iva,
              });
            }
          } catch (error) {
            toast.warning(`Gasto actualizado, pero no se pudo corregir el libro diario: ${(error as Error).message}`);
          }
        })();
      }
      if (id) onGuardado?.(id);
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const esImagenAdjunto = adjunto?.tipo ? adjunto.tipo.startsWith('image/') : !adjunto?.url.toLowerCase().includes('.pdf');

  // Página completa en vez de modal — con 12 grupos y ~50 cuentas del PCG no cabía con comodidad
  // en un modal (hallazgo real, auditoría 2026-08-21).
  if (mostrandoCategorias) {
    return (
      <div className="max-w-5xl mx-auto animate-[scale-in_180ms_ease-out]">
        <CategoriaPicker
          seleccionActual={form.cuenta_contable}
          onVolver={() => setMostrandoCategorias(false)}
          onSeleccionar={(categoria, cuenta_contable) => {
            setForm((f) => ({ ...f, categoria, cuenta_contable }));
            setMostrandoCategorias(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto animate-[scale-in_180ms_ease-out]">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-5">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={15} />
          Volver a gastos
        </button>
        {!creandoProveedor && (
          <Button onClick={() => guardarMutation.mutate()} disabled={guardarMutation.isPending}>
            {guardarMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        )}
      </div>

      {creandoProveedor ? (
        <ProveedorForm variante="inline" open onClose={() => setCreandoProveedor(false)} proveedor={null} onCreado={handleProveedorCreado} />
      ) : (
        <>
          <h1 className="text-xl font-bold text-gray-900 mb-1">{gasto ? 'Editar gasto' : 'Nuevo gasto'}</h1>
          <p className="text-sm text-gray-500 mb-6">
            {gasto ? 'Modifica los datos del gasto y su justificante.' : 'Registra un nuevo gasto y adjunta su justificante.'}
          </p>

          {!gasto && (
            <div className="flex gap-2 mb-4">
              <span className="text-xs text-gray-400 self-center mr-1">Plantillas rápidas:</span>
              {PLANTILLAS_RAPIDAS.map((p) => (
                <Button key={p.label} size="sm" variant="secondary" onClick={() => aplicarPlantilla(p)}>
                  {p.label}
                </Button>
              ))}
              <Button size="sm" variant="secondary" onClick={activarKilometrico}>
                Indemnité kilométrique
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <Seccion numero={1} titulo="Proveedor" icono={Building2}>
              <Select
                label="Proveedor"
                options={[
                  { value: '', label: '— Sin proveedor —' },
                  ...(proveedores ?? []).map((p) => ({ value: p.id, label: `${p.razon_social} · ${p.pais}` })),
                  { value: NUEVO_PROVEEDOR, label: '+ Añadir proveedor' },
                ]}
                value={form.proveedor_id ?? ''}
                onChange={(e) => handleSeleccionarProveedor(e.target.value)}
              />
            </Seccion>

            <Seccion numero={2} titulo="Detalles del gasto" icono={Receipt}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FechaPicker label="Fecha" value={form.fecha} onChange={(fecha) => setForm((f) => ({ ...f, fecha }))} />
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Categoría contable</label>
                  <button
                    type="button"
                    onClick={() => setMostrandoCategorias(true)}
                    className="w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm text-left bg-surface hover:border-brand focus:border-brand focus:outline-none truncate"
                  >
                    {form.categoria || '— Elegir categoría —'}
                  </button>
                </div>
                <div className="col-span-2">
                  <Input
                    label="Descripción"
                    value={form.descripcion}
                    onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  />
                </div>
                <Input
                  label="Nº factura proveedor"
                  value={form.num_factura_proveedor}
                  onChange={(e) => setForm((f) => ({ ...f, num_factura_proveedor: e.target.value }))}
                />
                <Select
                  label="País del gasto"
                  options={[{ value: 'España', label: 'España' }, { value: 'Francia', label: 'Francia' }]}
                  value={form.pais}
                  onChange={(e) => setForm((f) => ({ ...f, pais: e.target.value }))}
                />
              </div>
            </Seccion>

            <Seccion numero={3} titulo="Importe e IVA" icono={Coins}>
              {form.es_kilometrico ? (
                <>
                  <div className="mb-3">
                    <MapsAutocomplete
                      label="Dirección de la visita (calcula los km ida y vuelta desde el taller — 4 Avenue des Allées)"
                      value={direccionVisita}
                      onChange={setDireccionVisita}
                      onSelect={handleSeleccionarDireccionVisita}
                    />
                    {calculandoKm && <p className="text-xs text-gray-400 mt-1">Calculando distancia...</p>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <Input
                      label="Kilómetros recorridos (ida y vuelta)"
                      type="number"
                      min={0}
                      value={form.km}
                      onChange={(e) => setForm((f) => ({ ...f, km: Number(e.target.value) }))}
                    />
                    <Select
                      label="Puissance fiscale del vehículo (CV)"
                      options={CV_OPCIONES.map((cv) => ({ value: String(cv), label: `${cv} CV${cv === 7 ? ' o más' : ''}` }))}
                      value={String(form.vehiculo_cv)}
                      onChange={(e) => setForm((f) => ({ ...f, vehiculo_cv: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="bg-brand-light rounded-sm px-4 py-3 flex items-center justify-between mb-3">
                    <p className="text-xs text-gray-600">
                      Barème kilométrique 2026: {form.km} km × {tarifaPorCv(form.vehiculo_cv)} €/km
                    </p>
                    <p className="text-base font-semibold text-brand">{importeTotalEfectivo.toFixed(2)} €</p>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">
                    Indemnité kilométrique por uso profesional puntual de un vehículo personal — sin IVA (no es una compra,
                    es un reembolso). Válido hasta 5.000 km/año; si este vehículo supera esa cifra en el ejercicio, avisa
                    para ajustar el cálculo (la fórmula cambia por tramos).
                  </p>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, es_kilometrico: false }))}
                    className="text-xs text-gray-500 hover:text-gray-800 underline mb-3"
                  >
                    Cambiar a gasto normal
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {modoImporte === 'base' ? 'Base imponible (sin IVA)' : 'Importe total (con IVA)'}
                    </label>
                    <div className="inline-flex rounded-sm border border-gray-200 overflow-hidden text-xs shrink-0">
                      <button
                        type="button"
                        onClick={() => setModoImporte('total')}
                        className={`px-2.5 py-1 ${modoImporte === 'total' ? 'bg-brand text-white' : 'bg-surface text-gray-600 hover:bg-gray-50'}`}
                      >
                        Total con IVA
                      </button>
                      <button
                        type="button"
                        onClick={() => setModoImporte('base')}
                        className={`px-2.5 py-1 border-l border-gray-200 ${
                          modoImporte === 'base' ? 'bg-brand text-white' : 'bg-surface text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Base sin IVA
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <Input
                      type="number"
                      value={modoImporte === 'base' ? Number(importeBase.toFixed(2)) : form.importe_total}
                      onChange={(e) => handleImporteChange(Number(e.target.value))}
                    />
                    {esIntracomunitario || esImportacion ? (
                      <p className="text-xs text-gray-500 border border-gray-200 rounded-sm px-2.5 py-1.5 bg-gray-50 self-center">
                        Sin IVA — autoliquidación
                      </p>
                    ) : esAmortizacion ? (
                      <p className="text-xs text-gray-500 border border-gray-200 rounded-sm px-2.5 py-1.5 bg-gray-50 self-center">
                        Sin IVA — apunte contable
                      </p>
                    ) : (
                      <SelectorIva pais={form.pais} value={form.tipo_iva} onChange={(tipo_iva) => setForm((f) => ({ ...f, tipo_iva }))} />
                    )}
                  </div>

                  {esAmortizacion && (
                    <p className="text-xs text-gray-400 mb-3">
                      Las dotaciones a amortizaciones son un apunte contable interno, no una factura de proveedor — no llevan
                      IVA deducible, por lo que no sumarán nada en el Asistente de IVA.
                    </p>
                  )}
                </>
              )}

              {!form.es_kilometrico && (
                <>
                  <div className="mb-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Origen de la compra</p>
                    <div className="inline-flex border border-gray-200 rounded-sm overflow-hidden text-sm">
                      <button
                        type="button"
                        disabled={esAmortizacion}
                        onClick={() => setForm((f) => ({ ...f, tipo_iva: tipoIvaPorDefecto(f.pais) }))}
                        className={`px-2.5 py-1 ${!esIntracomunitario && !esImportacion ? 'bg-brand text-white' : 'bg-surface text-gray-600 hover:bg-gray-50'}`}
                      >
                        Nacional
                      </button>
                      <button
                        type="button"
                        disabled={esAmortizacion}
                        onClick={() => setForm((f) => ({ ...f, tipo_iva: TIPO_INTRACOM }))}
                        className={`px-2.5 py-1 border-l border-gray-200 ${esIntracomunitario ? 'bg-brand text-white' : 'bg-surface text-gray-600 hover:bg-gray-50'}`}
                      >
                        Intracomunitario (UE)
                      </button>
                      <button
                        type="button"
                        disabled={esAmortizacion}
                        onClick={() => setForm((f) => ({ ...f, tipo_iva: TIPO_IMPORTACION }))}
                        className={`px-2.5 py-1 border-l border-gray-200 ${esImportacion ? 'bg-brand text-white' : 'bg-surface text-gray-600 hover:bg-gray-50'}`}
                      >
                        Importación (fuera de UE)
                      </button>
                    </div>
                  </div>
                  {(esIntracomunitario || esImportacion) && (
                    <p className="text-xs text-gray-400 mb-3">
                      El importe total se registra como base, sin IVA soportado directo. Se declarará por autoliquidación en
                      el Asistente de IVA{esImportacion ? ' (importación fuera de la UE)' : ' (adquisición intracomunitaria)'}.
                    </p>
                  )}

                  <div className="bg-brand-light rounded-sm px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Base</p>
                      <p className="text-sm text-gray-900">{importeBase.toFixed(2)} €</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">IVA deducible ({porcentaje}%)</p>
                      <p className="text-sm text-gray-900">{importeIvaDeducible.toFixed(2)} €</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Total</p>
                      <p className="text-base font-semibold text-brand">{importeTotalEfectivo.toFixed(2)} €</p>
                    </div>
                  </div>
                </>
              )}
            </Seccion>

            <Seccion numero={4} titulo="Justificante" icono={CreditCard}>
              {adjunto ? (
                <div className="flex items-center justify-between border border-gray-200 rounded-sm px-3 py-2 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => setVistaPreviaAbierta(true)}
                    className="flex items-center gap-2.5 text-left overflow-hidden"
                  >
                    {esImagenAdjunto ? (
                      <img src={adjunto.url} alt="" className="w-9 h-9 object-cover rounded-sm border border-gray-200 shrink-0" />
                    ) : (
                      <span className="w-9 h-9 rounded-sm bg-brand-light flex items-center justify-center shrink-0">
                        <Paperclip size={14} className="text-brand" />
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-brand text-sm hover:underline truncate">
                      <Eye size={13} />
                      {adjunto.nombre || 'Ver adjunto'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjunto(null)}
                    className="text-gray-400 hover:text-red-600 shrink-0 ml-2"
                    title="Quitar justificante"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setArrastrando(true);
                  }}
                  onDragLeave={() => setArrastrando(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setArrastrando(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleSubirAdjunto(file);
                  }}
                  className={`flex flex-col items-center justify-center gap-1.5 border border-dashed rounded-sm py-5 text-center cursor-pointer transition-colors ${
                    arrastrando ? 'border-brand bg-brand-light/60' : 'border-gray-300 hover:border-brand hover:bg-brand-light/40'
                  }`}
                >
                  <UploadCloud size={20} className={subiendo ? 'text-gray-300 animate-pulse' : 'text-gray-400'} />
                  <span className="text-sm text-gray-600">
                    {subiendo ? 'Subiendo...' : 'Arrastra una foto o PDF aquí, o haz clic para elegir'}
                  </span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => e.target.files?.[0] && handleSubirAdjunto(e.target.files[0])}
                    disabled={subiendo}
                    className="hidden"
                  />
                </label>
              )}
            </Seccion>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap mt-5">
            <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
              <ArrowLeft size={15} />
              Volver a gastos
            </button>
            <Button onClick={() => guardarMutation.mutate()} disabled={guardarMutation.isPending}>
              {guardarMutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </>
      )}

      <VistaPreviaAdjunto url={vistaPreviaAbierta ? adjunto?.url ?? null : null} onClose={() => setVistaPreviaAbierta(false)} />
    </div>
  );
}
