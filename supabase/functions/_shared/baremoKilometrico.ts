// Fuente de verdad ÚNICA para el lado Edge Functions — mismo contenido que
// src/modules/finanzas/gastos/baremoKilometrico.ts (frontend). Deno no puede importar directamente
// del frontend (runtime distinto, sin bundler compartido), así que este fichero SÍ es una copia
// deliberada de esa fuente — pero es la ÚNICA copia del lado Edge: cualquier Edge Function que
// necesite el barème/CV lo importa de aquí (`../_shared/baremoKilometrico.ts`) en vez de llevar su
// propia constante duplicada. Si se toca este fichero, aplicar el mismo cambio en
// src/modules/finanzas/gastos/baremoKilometrico.ts y viceversa (bug real corregido 2026-09-21: la
// copia de automatizaciones-crm/index.ts se quedó en CV_VEHICULO_DEFECTO=7 cuando el frontend se
// corrigió a 6 el 2026-09-08 — 8 de 22 gastos kilométricos automáticos con tarifa incorrecta).
//
// Barème kilométrique 2026 (voitures), taux par km pour la tranche jusqu'à 5.000 km/an — inchangé
// par rapport à 2025 (source: legisocial.fr/reperes-sociaux/bareme-kilometrique-2026.html, vérifié
// 2026-08-16). Au-delà de 5.000 km/an la formule devient dégressive (barème par tranches) — non
// implémentée ici, peu probable pour l'usage ponctuel de visites techniques.
export const TARIFA_KM_HASTA_5000: Record<number, number> = {
  3: 0.529,
  4: 0.606,
  5: 0.636,
  6: 0.665,
  7: 0.697,
};

// El único vehículo real usado para visitas es el Volkswagen Tiguan, 6 CV confirmados por su
// carte grise (negocio/documentos legales/vehiculos/carte-grise-tiguan.jpeg, 2026-09-08).
export const CV_VEHICULO_DEFECTO = 6;

export const CUENTA_KILOMETRICO = '6251';

export function tarifaPorCv(cv: number): number {
  return TARIFA_KM_HASTA_5000[cv] ?? TARIFA_KM_HASTA_5000[7];
}

export function calcularIndemnizacionKm(km: number, cv: number): number {
  if (km <= 0) return 0;
  return Math.round(km * tarifaPorCv(cv) * 100) / 100;
}
