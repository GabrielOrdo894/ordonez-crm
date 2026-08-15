import { supabase } from './supabase';
import { registrarAsientoGasto } from './asientosContables';

export type ActivoInmovilizado = {
  id: string;
  descripcion: string;
  cuenta_pcg: string;
  fecha_adquisicion: string;
  valor_adquisicion: number;
  duracion_anios: number;
  dado_de_baja_en: string | null;
};

function mesIndice(fechaIso: string): number {
  const [anio, mes] = fechaIso.split('-').map(Number);
  return anio * 12 + (mes - 1);
}

// Amortización lineal con prorrateo por meses completos — el mes de adquisición y el mes de baja
// cuentan como meses enteros (simplificación habitual en pequeñas EURL, evita calcular días).
export function calcularDotacionAnual(activo: ActivoInmovilizado, anio: number): number {
  const inicio = mesIndice(activo.fecha_adquisicion);
  const finExclusivo = inicio + activo.duracion_anios * 12;
  const finPorBaja = activo.dado_de_baja_en ? mesIndice(activo.dado_de_baja_en) + 1 : Infinity;
  const yearInicio = anio * 12;
  const yearFin = yearInicio + 12;

  const solapeInicio = Math.max(inicio, yearInicio);
  const solapeFin = Math.min(finExclusivo, finPorBaja, yearFin);
  const meses = Math.max(0, solapeFin - solapeInicio);
  if (meses === 0) return 0;

  const dotacionMensual = activo.valor_adquisicion / activo.duracion_anios / 12;
  return Math.round(dotacionMensual * meses * 100) / 100;
}

// Suma de dotaciones desde el año de adquisición hasta `hastaAnio` inclusive — para mostrar
// amortización acumulada y valor neto contable sin depender de que las dotaciones ya se hayan
// generado como gastos reales (útil también para años futuros, en la previsión del tableau 2055).
export function amortizacionAcumulada(activo: ActivoInmovilizado, hastaAnio: number): number {
  const anioInicio = Number(activo.fecha_adquisicion.slice(0, 4));
  let total = 0;
  for (let anio = anioInicio; anio <= hastaAnio; anio++) {
    total += calcularDotacionAnual(activo, anio);
  }
  return Math.round(total * 100) / 100;
}

export function valorNetoContable(activo: ActivoInmovilizado, hastaAnio: number): number {
  return Math.round((activo.valor_adquisicion - amortizacionAcumulada(activo, hastaAnio)) * 100) / 100;
}

// Genera (si no existe ya) el gasto de dotación del ejercicio para un activo, exactamente como lo
// haría GastoForm para una amortización manual — misma cuenta 681, mismo asiento en el libro
// diario (registrarAsientoGasto) — para no duplicar esa lógica. Idempotente: si ya hay un gasto
// con este inmovilizado_id para ese año, no hace nada.
export async function generarDotacionEjercicio(activo: ActivoInmovilizado, anio: number): Promise<'generada' | 'ya_existia' | 'sin_importe'> {
  const { data: existente, error: errorConsulta } = await supabase
    .from('gastos')
    .select('id')
    .eq('inmovilizado_id', activo.id)
    .gte('fecha', `${anio}-01-01`)
    .lte('fecha', `${anio}-12-31`)
    .maybeSingle();
  if (errorConsulta) throw errorConsulta;
  if (existente) return 'ya_existia';

  const importe = calcularDotacionAnual(activo, anio);
  if (importe <= 0) return 'sin_importe';

  const fecha = `${anio}-12-31`;
  const descripcion = `Dotación amortización — ${activo.descripcion} (${anio})`;
  const { data: gasto, error } = await supabase
    .from('gastos')
    .insert({
      fecha,
      descripcion,
      categoria: 'Amortissements & provisions',
      proveedor: null,
      proveedor_id: null,
      importe_base: importe,
      tipo_iva: 'EXENTO',
      importe_iva: 0,
      pais: 'Francia',
      cuenta_contable: '681',
      inmovilizado_id: activo.id,
      visita_id: null,
      adjunto_url: null,
      adjunto_nombre: null,
      adjunto_tipo: null,
      num_factura_proveedor: null,
    })
    .select('id')
    .single();
  if (error) throw error;

  await registrarAsientoGasto({
    id: gasto.id,
    fecha,
    descripcion,
    proveedor: null,
    cuenta_contable: '681',
    importe_base: importe,
    importe_iva: 0,
  });

  return 'generada';
}
