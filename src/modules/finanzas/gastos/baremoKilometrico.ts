// Barème kilométrique 2026 (voitures), taux par km pour la tranche jusqu'à 5.000 km/an — inchangé par
// rapport à 2025 (source: legisocial.fr/reperes-sociaux/bareme-kilometrique-2026.html, vérifié 2026-08-16).
// Au-delà de 5.000 km/an la formule devient dégressive (barème par tranches) — non implémentée ici,
// peu probable pour l'usage ponctuel de visites techniques de Reformas Ordoñez ; si un jour un
// véhicule dépasse ce seuil, il faut compléter cette table avant de faire confiance au calcul.
export const TARIFA_KM_HASTA_5000: Record<number, number> = {
  3: 0.529,
  4: 0.606,
  5: 0.636,
  6: 0.665,
  7: 0.697,
};

export const CV_OPCIONES = [3, 4, 5, 6, 7] as const;

export function tarifaPorCv(cv: number): number {
  return TARIFA_KM_HASTA_5000[cv] ?? TARIFA_KM_HASTA_5000[7];
}

export function calcularIndemnizacionKm(km: number, cv: number): number {
  if (km <= 0) return 0;
  return Math.round(km * tarifaPorCv(cv) * 100) / 100;
}
