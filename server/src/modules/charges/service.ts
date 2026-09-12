import { db } from '../../db/index.js';

export interface LotCharge {
  lotId: string;
  lotNumber: string;
  amount: number; // dépense individuelle sur l'exercice (toutes clés)
}

export interface ChargesResult {
  exerciseId: string;
  total: number;
  byLot: LotCharge[];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Répartit les charges réelles d'un exercice sur chaque lot, en suivant les
 * clés de répartition de chaque portion de facture :
 *   - clé TANTIEMES  -> au prorata des parts (share / base)
 *   - clé CONSUMPTION -> au prorata des relevés de la période
 *   - clé EQUAL       -> parts égales
 * C'est la « dépense individuelle » qui alimente la régularisation.
 */
export async function computeChargesByLot(copropertyId: string, exerciseId: string): Promise<ChargesResult> {
  const lots = await db
    .selectFrom('lot')
    .innerJoin('building', 'building.id', 'lot.building_id')
    .select(['lot.id as id', 'lot.lot_number as lotNumber'])
    .where('building.coproperty_id', '=', copropertyId)
    .execute();
  const acc = new Map<string, number>(lots.map((l) => [l.id, 0]));

  const exercise = await db
    .selectFrom('accounting_exercise')
    .select(['label', 'start_date'])
    .where('id', '=', exerciseId)
    .executeTakeFirstOrThrow();
  const fallbackPeriod = exercise.label ?? exercise.start_date.slice(0, 4);

  // Parts tantièmes par clé (pour les clés TANTIEMES) : keyId -> (lotId -> share), base.
  const shareRows = await db
    .selectFrom('lot_distribution_share')
    .select(['distribution_key_id as keyId', 'lot_id as lotId', 'share'])
    .execute();
  const sharesByKey = new Map<string, { byLot: Map<string, number>; base: number }>();
  for (const r of shareRows) {
    const entry = sharesByKey.get(r.keyId) ?? { byLot: new Map(), base: 0 };
    entry.byLot.set(r.lotId, Number(r.share));
    entry.base += Number(r.share);
    sharesByKey.set(r.keyId, entry);
  }

  // Portions de facture de l'exercice, avec la méthode de leur clé.
  const portions = await db
    .selectFrom('invoice_distribution as d')
    .innerJoin('supplier_invoice as inv', 'inv.id', 'd.supplier_invoice_id')
    .innerJoin('distribution_key as k', 'k.id', 'd.distribution_key_id')
    .select([
      'd.distribution_key_id as keyId',
      'd.amount as amount',
      'd.period_label as periodLabel',
      'k.method as method',
    ])
    .where('inv.coproperty_id', '=', copropertyId)
    .where('inv.exercise_id', '=', exerciseId)
    .execute();

  let exactTotal = 0;
  for (const p of portions) {
    const amount = Number(p.amount);
    exactTotal += amount;
    if (p.method === 'TANTIEMES') {
      const key = sharesByKey.get(p.keyId);
      if (!key || key.base === 0) continue;
      for (const [lotId, share] of key.byLot) {
        acc.set(lotId, (acc.get(lotId) ?? 0) + (amount * share) / key.base);
      }
    } else if (p.method === 'CONSUMPTION') {
      const period = p.periodLabel ?? fallbackPeriod;
      const readings = await db
        .selectFrom('meter_reading')
        .select(['lot_id as lotId', 'consumption'])
        .where('distribution_key_id', '=', p.keyId)
        .where('period_label', '=', period)
        .execute();
      const totalConso = readings.reduce((s, r) => s + Number(r.consumption), 0);
      if (totalConso === 0) continue;
      for (const r of readings) {
        acc.set(r.lotId, (acc.get(r.lotId) ?? 0) + (amount * Number(r.consumption)) / totalConso);
      }
    } else if (p.method === 'EQUAL') {
      const per = amount / lots.length;
      for (const l of lots) acc.set(l.id, (acc.get(l.id) ?? 0) + per);
    }
  }

  const byLot: LotCharge[] = lots.map((l) => ({
    lotId: l.id,
    lotNumber: l.lotNumber,
    amount: round2(acc.get(l.id) ?? 0),
  }));
  const total = round2(exactTotal);
  return { exerciseId, total, byLot };
}
