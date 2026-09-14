import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../../db/index.js';

/**
 * Sauvegarde / restauration complète des comptes d'une copropriété au format
 * JSON. Objectifs :
 *   - export : changer de logiciel, archiver, transmettre à un nouveau bureau ;
 *   - import : reconstruire après un incident, dans une copropriété neuve
 *     (identifiants ré-attribués) ou à l'identique (mêmes identifiants).
 *
 * Les identifiants de connexion (app_user) NE sont PAS exportés : ils ne font
 * pas partie des « comptes » de la copropriété et contiennent des données
 * sensibles (empreintes de mots de passe). Ils se recréent après l'import.
 */

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_KIND = 'syndic-coproperty-backup';

/**
 * Ordre d'insertion respectant les dépendances de clés étrangères. C'est aussi
 * l'ordre des sections dans le fichier d'export.
 */
const IMPORT_ORDER = [
  'coproperty',
  'person',
  'building',
  'lot',
  'ownership',
  'distribution_key',
  'lot_distribution_share',
  'accounting_exercise',
  'accounting_account',
  'journal',
  'journal_entry',
  'journal_entry_line',
  'budget',
  'budget_line',
  'fund_call',
  'fund_call_item',
  'receivable',
  'owner_payment',
  'payment_allocation',
  'supplier',
  'supplier_invoice',
  'invoice_distribution',
  'supplier_payment',
  'bank_account',
  'bank_transaction',
  'bank_reconciliation',
  'meter_reading',
  'exercise_carry_forward',
  'payment_notice',
  'payment_notice_line',
  'general_assembly',
  'assembly_resolution',
  'assembly_annex',
] as const;

const IDENT = /^[a-z_][a-z0-9_]*$/;
function ident(name: string): string {
  if (!IDENT.test(name)) throw Object.assign(new Error(`Identifiant SQL invalide : ${name}`), { statusCode: 400 });
  return `"${name}"`;
}

type Row = Record<string, unknown>;
export interface BackupFile {
  formatVersion: number;
  kind: string;
  exportedAt: string;
  copropertyId: string;
  copropertyName: string;
  tables: Record<string, Row[]>;
}

async function ids(sql: string, params: unknown[], col = 'id'): Promise<string[]> {
  const res = await pool.query(sql, params);
  return res.rows.map((r) => r[col] as string);
}

/** Exporte l'intégralité des données rattachées à une copropriété. */
export async function exportCoproperty(copropertyId: string): Promise<BackupFile> {
  const cop = await pool.query('select id, name from coproperty where id = $1', [copropertyId]);
  if (cop.rows.length === 0) throw Object.assign(new Error('Copropriété introuvable.'), { statusCode: 404 });

  // Jeux d'identifiants nécessaires pour filtrer les tables enfants.
  const buildingIds = await ids('select id from building where coproperty_id = $1', [copropertyId]);
  const lotIds = buildingIds.length
    ? await ids('select id from lot where building_id = any($1::uuid[])', [buildingIds])
    : [];
  const keyIds = await ids('select id from distribution_key where coproperty_id = $1', [copropertyId]);
  const exerciseIds = await ids('select id from accounting_exercise where coproperty_id = $1', [copropertyId]);
  const journalIds = await ids('select id from journal where coproperty_id = $1', [copropertyId]);
  const journalEntryIds = journalIds.length
    ? await ids('select id from journal_entry where journal_id = any($1::uuid[])', [journalIds])
    : [];
  const budgetIds = await ids('select id from budget where coproperty_id = $1', [copropertyId]);
  const fundCallIds = await ids('select id from fund_call where coproperty_id = $1', [copropertyId]);
  const ownerPaymentIds = await ids('select id from owner_payment where coproperty_id = $1', [copropertyId]);
  const supplierInvoiceIds = await ids('select id from supplier_invoice where coproperty_id = $1', [copropertyId]);
  const bankAccountIds = await ids('select id from bank_account where coproperty_id = $1', [copropertyId]);
  const bankTxIds = bankAccountIds.length
    ? await ids('select id from bank_transaction where bank_account_id = any($1::uuid[])', [bankAccountIds])
    : [];
  const noticeIds = await ids('select id from payment_notice where coproperty_id = $1', [copropertyId]);
  const assemblyIds = await ids('select id from general_assembly where coproperty_id = $1', [copropertyId]);

  // Personnes référencées par cette copropriété (propriétaires, débiteurs, payeurs).
  const personIds = await ids(
    `select distinct person_id as id from (
        select person_id from ownership where lot_id = any($1::uuid[])
        union select person_id from receivable where coproperty_id = $2
        union select person_id from owner_payment where coproperty_id = $2 and person_id is not null
        union select person_id from payment_notice where coproperty_id = $2
     ) s`,
    [lotIds, copropertyId],
  );

  async function rows(sql: string, params: unknown[]): Promise<Row[]> {
    const res = await pool.query(sql, params);
    return res.rows as Row[];
  }
  // Une table filtrée sur un jeu d'identifiants vide n'a aucune ligne.
  const byIds = (sql: string, arr: string[]): Promise<Row[]> => (arr.length ? rows(sql, [arr]) : Promise.resolve([]));

  const tables: Record<string, Row[]> = {
    coproperty: await rows('select * from coproperty where id = $1', [copropertyId]),
    person: await byIds('select * from person where id = any($1::uuid[])', personIds),
    building: await rows('select * from building where coproperty_id = $1', [copropertyId]),
    lot: await byIds('select * from lot where building_id = any($1::uuid[])', buildingIds),
    ownership: await byIds('select * from ownership where lot_id = any($1::uuid[])', lotIds),
    distribution_key: await rows('select * from distribution_key where coproperty_id = $1', [copropertyId]),
    lot_distribution_share: await byIds('select * from lot_distribution_share where distribution_key_id = any($1::uuid[])', keyIds),
    accounting_exercise: await rows('select * from accounting_exercise where coproperty_id = $1', [copropertyId]),
    accounting_account: await rows('select * from accounting_account where coproperty_id = $1', [copropertyId]),
    journal: await rows('select * from journal where coproperty_id = $1', [copropertyId]),
    journal_entry: await byIds('select * from journal_entry where journal_id = any($1::uuid[])', journalIds),
    journal_entry_line: await byIds('select * from journal_entry_line where journal_entry_id = any($1::uuid[])', journalEntryIds),
    budget: await rows('select * from budget where coproperty_id = $1', [copropertyId]),
    budget_line: await byIds('select * from budget_line where budget_id = any($1::uuid[])', budgetIds),
    fund_call: await rows('select * from fund_call where coproperty_id = $1', [copropertyId]),
    fund_call_item: await byIds('select * from fund_call_item where fund_call_id = any($1::uuid[])', fundCallIds),
    receivable: await rows('select * from receivable where coproperty_id = $1', [copropertyId]),
    owner_payment: await rows('select * from owner_payment where coproperty_id = $1', [copropertyId]),
    payment_allocation: await byIds('select * from payment_allocation where owner_payment_id = any($1::uuid[])', ownerPaymentIds),
    supplier: await rows('select * from supplier where coproperty_id = $1', [copropertyId]),
    supplier_invoice: await rows('select * from supplier_invoice where coproperty_id = $1', [copropertyId]),
    invoice_distribution: await byIds('select * from invoice_distribution where supplier_invoice_id = any($1::uuid[])', supplierInvoiceIds),
    supplier_payment: await byIds('select * from supplier_payment where supplier_invoice_id = any($1::uuid[])', supplierInvoiceIds),
    bank_account: await rows('select * from bank_account where coproperty_id = $1', [copropertyId]),
    bank_transaction: await byIds('select * from bank_transaction where bank_account_id = any($1::uuid[])', bankAccountIds),
    bank_reconciliation: await byIds('select * from bank_reconciliation where bank_transaction_id = any($1::uuid[])', bankTxIds),
    meter_reading: await byIds('select * from meter_reading where distribution_key_id = any($1::uuid[])', keyIds),
    exercise_carry_forward: await byIds(
      'select * from exercise_carry_forward where to_exercise_id = any($1::uuid[]) or from_exercise_id = any($1::uuid[])',
      exerciseIds,
    ),
    payment_notice: await rows('select * from payment_notice where coproperty_id = $1', [copropertyId]),
    payment_notice_line: await byIds('select * from payment_notice_line where payment_notice_id = any($1::uuid[])', noticeIds),
    general_assembly: await rows('select * from general_assembly where coproperty_id = $1', [copropertyId]),
    assembly_resolution: await byIds('select * from assembly_resolution where assembly_id = any($1::uuid[])', assemblyIds),
    assembly_annex: await byIds('select * from assembly_annex where assembly_id = any($1::uuid[])', assemblyIds),
  };

  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    kind: BACKUP_KIND,
    exportedAt: new Date().toISOString(),
    copropertyId,
    copropertyName: cop.rows[0]!.name as string,
    tables,
  };
}

export type ImportMode = 'NEW' | 'RESTORE';
export interface ImportResult {
  copropertyId: string;
  mode: ImportMode;
  inserted: Record<string, number>;
}

function assertBackup(file: unknown): asserts file is BackupFile {
  const f = file as BackupFile;
  if (!f || f.kind !== BACKUP_KIND || typeof f.tables !== 'object' || !f.tables) {
    throw Object.assign(new Error('Fichier de sauvegarde non reconnu.'), { statusCode: 400 });
  }
  if (f.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw Object.assign(new Error(`Version de format non supportée (${f.formatVersion}).`), { statusCode: 400 });
  }
  if (!Array.isArray(f.tables.coproperty) || f.tables.coproperty.length !== 1) {
    throw Object.assign(new Error('Le fichier ne contient pas exactement une copropriété.'), { statusCode: 400 });
  }
}

/**
 * Restaure un export. En mode NEW, tous les identifiants (UUID) sont ré-attribués
 * de façon cohérente (l'ensemble forme une nouvelle copropriété indépendante).
 * En mode RESTORE, les données sont réinsérées à l'identique et l'opération
 * échoue si la copropriété existe déjà.
 */
export async function importCoproperty(file: unknown, mode: ImportMode): Promise<ImportResult> {
  assertBackup(file);

  // Carte de ré-attribution des identifiants (mode NEW).
  const idMap = new Map<string, string>();
  if (mode === 'NEW') {
    for (const table of IMPORT_ORDER) {
      for (const row of file.tables[table] ?? []) {
        const oldId = row['id'];
        if (typeof oldId === 'string' && !idMap.has(oldId)) idMap.set(oldId, randomUUID());
      }
    }
  }
  const remap = (v: unknown): unknown => (typeof v === 'string' && idMap.has(v) ? idMap.get(v)! : v);

  const copRow = (file.tables.coproperty ?? [])[0];
  if (!copRow) throw Object.assign(new Error('Le fichier ne contient pas de copropriété.'), { statusCode: 400 });
  const originalCopId = copRow['id'] as string;
  const newCopId = mode === 'NEW' ? idMap.get(originalCopId)! : originalCopId;

  const client: PoolClient = await pool.connect();
  const inserted: Record<string, number> = {};
  try {
    await client.query('BEGIN');

    if (mode === 'RESTORE') {
      const exists = await client.query('select 1 from coproperty where id = $1', [originalCopId]);
      if (exists.rows.length > 0) {
        throw Object.assign(
          new Error('Cette copropriété existe déjà : restauration à l’identique impossible. Utilisez le mode « nouvelle copropriété ».'),
          { statusCode: 409 },
        );
      }
    }

    for (const table of IMPORT_ORDER) {
      const rows = file.tables[table] ?? [];
      let count = 0;
      for (const row of rows) {
        const cols = Object.keys(row);
        if (cols.length === 0) continue;
        const colSql = cols.map(ident).join(', ');
        const values = cols.map((c) => (mode === 'NEW' ? remap(row[c]) : row[c]));
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(`insert into ${ident(table)} (${colSql}) values (${placeholders})`, values);
        count++;
      }
      inserted[table] = count;
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return { copropertyId: newCopId, mode, inserted };
}
