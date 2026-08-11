import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus, BookmarkPlus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { Input } from '../../components/ui/Input';
import { EditorTexto } from '../../components/ui/EditorTexto';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import {
  UNIDADES,
  getTiposServicio,
  lineaVacia,
  calcularLinea,
  calcularTotales,
  calcularTotalesRango,
  totalLineaMax,
  formatearUnidadTexto,
  lineaInvalida,
} from './lineas';
import type { Linea, LineaCatalogo } from './lineas';

type LineasEditorProps = {
  lineas: Linea[];
  porcentajeIva: number;
  onChange: (lineas: Linea[]) => void;
  rango?: boolean;
  erroresVisibles?: boolean;
  idioma?: 'es' | 'fr';
  // Las facturas rectificativas usan cantidad negativa a propósito (lineasRectificativa en
  // facturas/types.ts) para restar el importe de la factura original — en cualquier otro
  // documento una cantidad negativa es un error de tecleo, así que se bloquea por defecto.
  permitirCantidadNegativa?: boolean;
};

// Combobox de designación: al enfocar el campo se abre un desplegable con las líneas del
// catálogo cuya designación contiene el texto escrito. Si el usuario escribe directamente sin
// elegir ninguna sugerencia, la línea queda como una línea manual — no pasa nada especial.
function DesignacionCombobox({
  value,
  catalogo,
  error,
  onChange,
  onSeleccionar,
}: {
  value: string;
  catalogo: LineaCatalogo[];
  error?: string;
  onChange: (texto: string) => void;
  onSeleccionar: (item: LineaCatalogo) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alClicar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', alClicar);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('mousedown', alClicar);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierto]);

  const texto = value.trim().toLowerCase();
  const sugerencias = (texto ? catalogo.filter((c) => c.designacion.toLowerCase().includes(texto)) : catalogo).slice(0, 8);

  return (
    <div ref={ref} className="relative">
      <Input
        label="Designación"
        value={value}
        error={error}
        onFocus={() => setAbierto(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setAbierto(true);
        }}
      />
      {abierto && sugerencias.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-surface border border-gray-200 rounded-sm shadow-sm z-20 py-1 max-h-56 overflow-y-auto">
          {sugerencias.map((item) => (
            <button
              key={item.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSeleccionar(item);
                setAbierto(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-brand-light"
            >
              <p className="text-gray-900 truncate">{item.designacion}</p>
              {(item.referencia || item.precio_unit != null) && (
                <p className="text-xs text-gray-400 truncate">
                  {[item.referencia, item.precio_unit != null ? `${item.precio_unit.toFixed(2)} €` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LineasEditor({
  lineas,
  porcentajeIva,
  onChange,
  rango,
  erroresVisibles,
  idioma,
  permitirCantidadNegativa,
}: LineasEditorProps) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: catalogo } = useQuery({
    queryKey: ['lineas_catalogo'],
    queryFn: async () => {
      const { data, error } = await supabase.from('lineas_catalogo').select('*').order('designacion');
      if (error) throw error;
      return data as LineaCatalogo[];
    },
  });

  // Cada línea preestablecida se guardó para español o francés — solo tiene sentido sugerirla en
  // un documento de ese mismo idioma. Las líneas sin idioma asignado (dato antiguo) se muestran
  // siempre, para no ocultar nada por un dato que falte.
  const catalogoIdioma = useMemo(
    () => (catalogo ?? []).filter((c) => !idioma || !c.idioma || c.idioma === idioma),
    [catalogo, idioma],
  );

  const guardarEnCatalogoMutation = useMutation({
    mutationFn: async (linea: Linea) => {
      const { error } = await supabase.from('lineas_catalogo').insert({
        designacion: linea.designacion,
        referencia: linea.referencia || null,
        descripcion: linea.descripcion || null,
        unidad: linea.unidad,
        tipo_servicio: linea.tipo_servicio,
        precio_unit: linea.precio_unit,
        idioma: idioma ?? 'es',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lineas_catalogo'] });
      toast.success('Línea guardada en el catálogo');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleCambiarLinea = (index: number, cambios: Partial<Linea>) => {
    onChange(lineas.map((l, i) => (i === index ? calcularLinea({ ...l, ...cambios }, porcentajeIva) : l)));
  };

  const handleEliminarLinea = (index: number) => {
    onChange(lineas.filter((_, i) => i !== index));
  };

  const handleSeleccionarCatalogo = (index: number, item: LineaCatalogo) => {
    handleCambiarLinea(index, {
      designacion: item.designacion,
      referencia: item.referencia ?? '',
      descripcion: item.descripcion ?? '',
      unidad: item.unidad ?? 'ud',
      tipo_servicio: item.tipo_servicio ?? '—',
      precio_unit: item.precio_unit ?? 0,
    });
  };

  const { totalSinIva, totalConIva } = calcularTotales(lineas);
  const rangoTotales = rango ? calcularTotalesRango(lineas, porcentajeIva) : null;

  return (
    <div>
      <p className="text-xs text-gray-400 mb-4">
        Cada línea es un concepto del presupuesto. Los precios se introducen sin IVA — el IVA se calcula automáticamente.
        {rango && ' En modo orientativo, el precio "hasta" es opcional: si se deja vacío, ese concepto no varía.'}
      </p>

      <div className="flex flex-col gap-3">
        {lineas.map((linea, i) => {
          const max = totalLineaMax(linea, porcentajeIva);
          const mostrarError = erroresVisibles && lineaInvalida(linea);
          return (
            <div key={i} className="border border-gray-200 rounded-sm p-3.5 bg-gray-50/50">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Línea {i + 1}</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => guardarEnCatalogoMutation.mutate(linea)}
                    disabled={!linea.designacion.trim() || guardarEnCatalogoMutation.isPending}
                    className="text-gray-300 hover:text-brand disabled:hover:text-gray-300 disabled:opacity-50"
                    title="Guardar esta línea en el catálogo"
                  >
                    <BookmarkPlus size={15} />
                  </button>
                  <button
                    onClick={() => handleEliminarLinea(i)}
                    className="text-gray-300 hover:text-red-600"
                    title="Eliminar línea"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div className="sm:col-span-2">
                  <DesignacionCombobox
                    value={linea.designacion}
                    catalogo={catalogoIdioma}
                    error={erroresVisibles && !linea.designacion.trim() ? 'Obligatorio' : undefined}
                    onChange={(designacion) => handleCambiarLinea(i, { designacion })}
                    onSeleccionar={(item) => handleSeleccionarCatalogo(i, item)}
                  />
                </div>
                <Input
                  label="Referencia"
                  value={linea.referencia}
                  error={erroresVisibles && !linea.referencia.trim() ? 'Obligatorio' : undefined}
                  onChange={(e) => handleCambiarLinea(i, { referencia: e.target.value })}
                />
              </div>

              <EditorTexto
                label="Descripción"
                className="mb-3"
                rows={5}
                value={linea.descripcion}
                onChange={(descripcion) => handleCambiarLinea(i, { descripcion })}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <Select
                  label="Unidad"
                  options={(rango ? UNIDADES.filter((u) => u !== 'forfait') : UNIDADES).map((u) => ({
                    value: u,
                    label: formatearUnidadTexto(u),
                  }))}
                  value={linea.unidad}
                  onChange={(e) => handleCambiarLinea(i, { unidad: e.target.value })}
                />
                <Select
                  label="Tipo de servicio"
                  required
                  error={erroresVisibles && (!linea.tipo_servicio || linea.tipo_servicio === '—') ? 'Obligatorio' : undefined}
                  options={getTiposServicio(idioma).map((s) => ({ value: s, label: s }))}
                  value={linea.tipo_servicio}
                  onChange={(e) => handleCambiarLinea(i, { tipo_servicio: e.target.value })}
                />
              </div>

              <div className={`grid grid-cols-1 ${rango ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-3 mb-3`}>
                <Input
                  label="Cantidad"
                  type="number"
                  min={permitirCantidadNegativa ? undefined : 1}
                  max={rango ? 99 : undefined}
                  value={linea.cantidad}
                  onChange={(e) => {
                    const cantidadBruta = Number(e.target.value);
                    const cantidad = permitirCantidadNegativa ? cantidadBruta : Math.max(1, cantidadBruta);
                    handleCambiarLinea(i, { cantidad: rango ? Math.min(99, cantidad) : cantidad });
                  }}
                />
                <Input
                  label={rango ? 'Precio desde (sin IVA)' : 'Precio unit. (sin IVA)'}
                  type="number"
                  value={linea.precio_unit}
                  onChange={(e) => handleCambiarLinea(i, { precio_unit: Number(e.target.value) })}
                />
                {rango && (
                  <Input
                    label="Precio hasta (opcional)"
                    type="number"
                    value={linea.precio_unit_max ?? ''}
                    onChange={(e) =>
                      handleCambiarLinea(i, { precio_unit_max: e.target.value === '' ? undefined : Number(e.target.value) })
                    }
                  />
                )}
              </div>

              <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-3">
                <input
                  type="checkbox"
                  checked={linea.es_incluido}
                  onChange={(e) => handleCambiarLinea(i, { es_incluido: e.target.checked })}
                />
                Este concepto está incluido (sin importe)
              </label>

              <div className="flex items-center justify-between border-t border-gray-200 pt-2.5">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Total de la línea</span>
                {linea.es_incluido ? (
                  <span className="text-sm text-gray-700">Incluido</span>
                ) : rango ? (
                  <span className="text-sm text-gray-900 font-semibold">
                    {linea.total_con_iva.toFixed(2)} – {max.conIva.toFixed(2)} €{' '}
                    <span className="text-xs text-gray-400 font-normal">
                      (s/IVA {linea.total_sin_iva.toFixed(2)} – {max.sinIva.toFixed(2)} €)
                    </span>
                  </span>
                ) : (
                  <span className="text-sm text-gray-900 font-semibold">
                    {linea.total_con_iva.toFixed(2)} €{' '}
                    <span className="text-xs text-gray-400 font-normal">(s/IVA {linea.total_sin_iva.toFixed(2)} €)</span>
                  </span>
                )}
              </div>

              {mostrarError && <p className="text-xs text-red-600 mt-2">Completa los campos obligatorios de esta línea.</p>}
            </div>
          );
        })}
      </div>

      <Button size="md" variant="primary" onClick={() => onChange([...lineas, lineaVacia()])} className="mt-3">
        <span className="flex items-center gap-1.5">
          <Plus size={15} />
          Añadir línea
        </span>
      </Button>

      {rangoTotales ? (
        <div className="flex justify-end gap-6 mt-4 pt-3 border-t border-gray-200 text-sm">
          <p className="text-gray-500">
            Base: {rangoTotales.totalSinIvaMin.toFixed(2)} – {rangoTotales.totalSinIvaMax.toFixed(2)} €
          </p>
          <p className="text-gray-900 font-semibold">
            TOTAL: {rangoTotales.totalConIvaMin.toFixed(2)} – {rangoTotales.totalConIvaMax.toFixed(2)} €
          </p>
        </div>
      ) : (
        <div className="flex justify-end gap-6 mt-4 pt-3 border-t border-gray-200 text-sm">
          <p className="text-gray-500">Base: {totalSinIva.toFixed(2)} €</p>
          <p className="text-gray-500">
            IVA ({porcentajeIva}%): {(totalConIva - totalSinIva).toFixed(2)} €
          </p>
          <p className="text-gray-900 font-semibold">TOTAL: {totalConIva.toFixed(2)} €</p>
        </div>
      )}
    </div>
  );
}
