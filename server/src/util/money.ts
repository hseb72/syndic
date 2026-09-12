/**
 * Répartition monétaire par plus-fort-reste : répartit `total` (euros) selon
 * des poids, en arrondissant au centime de sorte que la SOMME des parts soit
 * EXACTEMENT égale à `total`. Indispensable pour que les appels et la
 * régularisation « tombent juste » lot par lot.
 */
export function distribute(total: number, weights: number[]): number[] {
  const totalCents = Math.round(total * 100);
  const wsum = weights.reduce((a, b) => a + b, 0);
  if (wsum <= 0) return weights.map(() => 0);

  const raw = weights.map((w) => (totalCents * w) / wsum);
  const floors = raw.map((x) => Math.floor(x));
  let remainder = totalCents - floors.reduce((a, b) => a + b, 0);

  // Distribue les centimes restants aux plus fortes fractions décimales.
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  const cents = floors.slice();
  for (let k = 0; k < remainder && order.length > 0; k++) {
    const idx = order[k % order.length]!.i;
    cents[idx]!++;
  }
  return cents.map((c) => c / 100);
}
