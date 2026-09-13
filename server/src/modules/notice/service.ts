import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { db } from '../../db/index.js';
import { createPayment, allocatePayment } from '../payment/service.js';

const CENT = 0.01;

export interface NoticeLine {
  receivableId: string;
  nature: string;
  exercise: string | null;
  lotNumber: string;
  amount: number;
  paid: number;
  remaining: number;
}

export interface NoticeRow {
  id: string;
  personId: string;
  personName: string;
  label: string;
  issueDate: string;
  dueDate: string;
  total: number;
  paid: number;
  remaining: number;
  status: string;
  lineCount: number;
}

/**
 * Génère les avis de paiement : regroupe, PAR COPROPRIÉTAIRE, ses créances
 * ouvertes non encore portées sur un avis — quelles que soient leur nature et
 * leur exercice — en un seul document à payer. Chaque créance garde sa nature
 * et son exercice : seule la présentation est regroupée.
 */
export async function generateNotices(
  copropertyId: string,
  input: { label: string; issueDate: string; dueDate: string },
): Promise<{ created: number }> {
  // Créances ouvertes, avec reste dû, non déjà rattachées à une ligne d'avis.
  const rows = await sql<{ id: string; personId: string; remaining: string }>`
    select r.id, r.person_id as "personId",
           (r.amount - coalesce((select sum(pa.amount) from payment_allocation pa where pa.receivable_id = r.id), 0)) as remaining
    from receivable r
    where r.coproperty_id = ${copropertyId}
      and r.status = 'OPEN'
      and not exists (select 1 from payment_notice_line pnl where pnl.receivable_id = r.id)
    order by r.person_id
  `.execute(db);

  const byPerson = new Map<string, { id: string; remaining: number }[]>();
  for (const r of rows.rows) {
    const remaining = Math.round(Number(r.remaining) * 100) / 100;
    if (remaining <= CENT) continue;
    const list = byPerson.get(r.personId) ?? [];
    list.push({ id: r.id, remaining });
    byPerson.set(r.personId, list);
  }

  let created = 0;
  for (const [personId, recs] of byPerson) {
    const total = Math.round(recs.reduce((s, r) => s + r.remaining, 0) * 100) / 100;
    if (total <= CENT) continue;
    const noticeId = randomUUID();
    await db.transaction().execute(async (tx) => {
      await tx
        .insertInto('payment_notice')
        .values({
          id: noticeId,
          coproperty_id: copropertyId,
          person_id: personId,
          label: input.label,
          issue_date: input.issueDate,
          due_date: input.dueDate,
          total_amount: total,
          status: 'ISSUED',
        })
        .execute();
      for (const r of recs) {
        await tx
          .insertInto('payment_notice_line')
          .values({ id: randomUUID(), payment_notice_id: noticeId, receivable_id: r.id, amount: r.remaining })
          .execute();
      }
    });
    created++;
  }
  return { created };
}

export async function listNotices(copropertyId: string): Promise<NoticeRow[]> {
  const result = await sql<{
    id: string;
    personId: string;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
    label: string;
    issueDate: string;
    dueDate: string;
    total: string;
    paid: string;
    lineCount: string;
    status: string;
  }>`
    select pn.id, pn.person_id as "personId",
           p.first_name as "firstName", p.last_name as "lastName", p.company_name as "companyName",
           pn.label, pn.issue_date as "issueDate", pn.due_date as "dueDate",
           pn.total_amount as total, pn.status,
           (select count(*) from payment_notice_line l where l.payment_notice_id = pn.id) as "lineCount",
           coalesce((
             select sum(pa.amount) from payment_allocation pa
             where pa.receivable_id in (select l.receivable_id from payment_notice_line l where l.payment_notice_id = pn.id)
           ), 0) as paid
    from payment_notice pn
    join person p on p.id = pn.person_id
    where pn.coproperty_id = ${copropertyId}
    order by pn.issue_date desc, pn.created_at desc
  `.execute(db);

  return result.rows.map((r) => {
    const personName = r.companyName ?? [r.firstName, r.lastName].filter(Boolean).join(' ').trim();
    const total = Number(r.total);
    const paid = Math.round(Number(r.paid) * 100) / 100;
    return {
      id: r.id,
      personId: r.personId,
      personName,
      label: r.label,
      issueDate: r.issueDate,
      dueDate: r.dueDate,
      total,
      paid,
      remaining: Math.round((total - paid) * 100) / 100,
      status: r.status,
      lineCount: Number(r.lineCount),
    };
  });
}

export async function getNoticeLines(copropertyId: string, noticeId: string): Promise<NoticeLine[]> {
  const result = await sql<{
    receivableId: string;
    nature: string;
    exercise: string | null;
    lotNumber: string;
    amount: string;
    paid: string;
  }>`
    select l.receivable_id as "receivableId", r.nature, ex.label as exercise,
           lot.lot_number as "lotNumber", l.amount,
           coalesce((select sum(pa.amount) from payment_allocation pa where pa.receivable_id = r.id), 0) as paid
    from payment_notice_line l
    join payment_notice pn on pn.id = l.payment_notice_id
    join receivable r on r.id = l.receivable_id
    join accounting_exercise ex on ex.id = r.exercise_id
    join lot on lot.id = r.lot_id
    where l.payment_notice_id = ${noticeId} and pn.coproperty_id = ${copropertyId}
    order by ex.start_date, r.nature
  `.execute(db);

  return result.rows.map((r) => {
    const amount = Number(r.amount);
    const paid = Math.round(Number(r.paid) * 100) / 100;
    return {
      receivableId: r.receivableId,
      nature: r.nature,
      exercise: r.exercise,
      lotNumber: r.lotNumber,
      amount,
      paid,
      remaining: Math.round((amount - paid) * 100) / 100,
    };
  });
}

/**
 * Encaisse un avis en un seul paiement : crée l'encaissement du copropriétaire
 * et l'affecte aux créances de l'avis (chacune reçoit sa part). Le virement
 * unique est ainsi ventilé sur des créances de natures/exercices différents.
 */
export async function payNotice(
  copropertyId: string,
  noticeId: string,
  input: { paymentDate: string },
): Promise<{ paymentId: string; allocated: number }> {
  const notice = await db
    .selectFrom('payment_notice')
    .selectAll()
    .where('id', '=', noticeId)
    .where('coproperty_id', '=', copropertyId)
    .executeTakeFirst();
  if (!notice) throw Object.assign(new Error('Avis introuvable.'), { statusCode: 404 });
  if (notice.status !== 'ISSUED') throw Object.assign(new Error('Avis non payable.'), { statusCode: 400 });

  const lines = await getNoticeLines(copropertyId, noticeId);
  const allocations = lines.filter((l) => l.remaining > CENT).map((l) => ({ receivableId: l.receivableId, amount: l.remaining }));
  const total = Math.round(allocations.reduce((s, a) => s + a.amount, 0) * 100) / 100;
  if (total <= CENT) throw Object.assign(new Error('Rien à encaisser sur cet avis.'), { statusCode: 400 });

  const payment = await createPayment(copropertyId, {
    personId: notice.person_id,
    paymentDate: input.paymentDate,
    amount: total,
    reference: notice.label,
    autoAllocate: false,
  });
  await allocatePayment(payment.id, { allocations });
  return { paymentId: payment.id, allocated: total };
}

/** Annule un avis (les créances redeviennent disponibles pour un nouvel avis). */
export async function cancelNotice(copropertyId: string, noticeId: string): Promise<{ cancelled: boolean }> {
  const notice = await db
    .selectFrom('payment_notice')
    .select('id')
    .where('id', '=', noticeId)
    .where('coproperty_id', '=', copropertyId)
    .executeTakeFirst();
  if (!notice) throw Object.assign(new Error('Avis introuvable.'), { statusCode: 404 });
  await db.transaction().execute(async (tx) => {
    await tx.deleteFrom('payment_notice_line').where('payment_notice_id', '=', noticeId).execute();
    await tx.updateTable('payment_notice').set({ status: 'CANCELLED' }).where('id', '=', noticeId).execute();
  });
  return { cancelled: true };
}
