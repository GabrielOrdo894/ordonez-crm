import { supabase } from './supabase';
import { calcularKmIdaYVuelta } from './calcularKmIdaYVuelta';
import { calcularIndemnizacionKm } from '../modules/finanzas/gastos/baremoKilometrico';
import { cuentaLabel } from '../modules/finanzas/gastos/categorias';
import type { NuevoGasto } from '../modules/finanzas/gastos/types';
import type { Visita } from '../modules/visitas/types';

export const CUENTA_KILOMETRICO = '6251';

// Potencia fiscal por defecto para el kilometraje automático — el vehículo real es un Volkswagen
// Tiguan (matrícula francesa BF-513-GB), pero su CV exacto depende del motor/año y no está
// documentado en ningún sitio del proyecto; 7 CV es el valor más alto que soporta hoy el barème
// implementado (CV_OPCIONES en baremoKilometrico.ts) y su fórmula de reserva ya cubre cualquier
// vehículo de 7 CV o más, así que es la aproximación más segura mientras no se confirme el dato
// real (corregible a mano en cada gasto, o editando esta constante).
export const CV_VEHICULO_DEFECTO = 7;

/** Crea un gasto de kilometraje "pendiente de revisar" para una visita recién completada — nunca
 * genera asiento contable (eso solo pasa al "Registrar pago" desde Gastos, ver GastosPage.tsx).
 * Se aplica a cualquier visita, sea de España o de Francia (confirmado por Gabriel 2026-08-17): el
 * barème kilométrique es la deducción de la EURL francesa, que existe sea cual sea el país donde
 * esté la obra — por eso el gasto resultante siempre se guarda con pais:'Francia', igual que ya
 * fuerza GastoForm.tsx al activar "Indemnité kilométrique" a mano. No falla si ya existe un gasto
 * para esta visita (evita duplicados si se llama más de una vez) ni si el cálculo de km falla
 * (Google Maps no disponible) — en ese caso el km queda vacío para rellenarlo a mano. */
export async function crearGastoKilometricoPendiente(visita: Visita): Promise<void> {
  const { data: existente, error: errorExistente } = await supabase
    .from('gastos')
    .select('id')
    .eq('visita_id', visita.id)
    .limit(1);
  if (errorExistente) throw errorExistente;
  if (existente && existente.length > 0) return;

  const km = visita.lat != null && visita.lng != null ? await calcularKmIdaYVuelta({ lat: visita.lat, lng: visita.lng }) : null;
  const importeBase = km != null ? calcularIndemnizacionKm(km, CV_VEHICULO_DEFECTO) : 0;

  const nuevo: NuevoGasto = {
    fecha: visita.fecha_visita,
    descripcion: `Indemnité kilométrique — visita ${visita.nombre} ${visita.apellidos}${km != null ? ` (${km} km)` : ' (km pendiente de completar)'}`,
    categoria: cuentaLabel(CUENTA_KILOMETRICO),
    proveedor: null,
    proveedor_id: null,
    importe_base: Math.round(importeBase * 100) / 100,
    tipo_iva: 'EXENTO',
    importe_iva: 0,
    pais: 'Francia',
    cuenta_contable: CUENTA_KILOMETRICO,
    visita_id: visita.id,
    adjunto_url: null,
    adjunto_nombre: null,
    adjunto_tipo: null,
    num_factura_proveedor: null,
    inmovilizado_id: null,
    km,
    vehiculo_cv: CV_VEHICULO_DEFECTO,
    estado_gasto: 'pendiente',
  };

  const { error } = await supabase.from('gastos').insert(nuevo);
  if (error) throw error;
}
