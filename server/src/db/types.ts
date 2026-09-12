import type { ColumnType, Generated } from 'kysely';

/**
 * Types de la base pour Kysely.
 *
 * On étend cette interface table par table, au fil des étapes du MVP.
 * Étape 1 (socle) : coproperty, building, lot + schema_migrations.
 * Les montants NUMERIC arrivent en `string` depuis node-postgres — on les
 * traite comme des chaînes décimales et on ne fait jamais d'arithmétique en
 * flottant dessus côté JS.
 */

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface SchemaMigrationsTable {
  version: string;
  applied_at: Generated<Timestamp>;
}

export interface CopropertyTable {
  id: string;
  name: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: Generated<string>;
  created_at: Generated<Timestamp>;
}

export interface BuildingTable {
  id: string;
  coproperty_id: string;
  name: string;
  address: string | null;
  created_at: Generated<Timestamp>;
}

export interface LotTable {
  id: string;
  building_id: string;
  lot_number: string;
  description: string | null;
  created_at: Generated<Timestamp>;
}

export interface Database {
  schema_migrations: SchemaMigrationsTable;
  coproperty: CopropertyTable;
  building: BuildingTable;
  lot: LotTable;
}
