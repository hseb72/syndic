import type { ColumnType, Generated } from 'kysely';

/**
 * Types de la base pour Kysely.
 *
 * On étend cette interface table par table, au fil des étapes du MVP.
 * Étape 1 (socle) : coproperty, building, lot + schema_migrations.
 * Étape 2 (copropriété) : person, ownership, distribution_key, lot_distribution_share.
 * Les montants NUMERIC arrivent en `string` depuis node-postgres — on les
 * traite comme des chaînes décimales et on ne fait jamais d'arithmétique en
 * flottant dessus côté JS.
 */

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type DateString = ColumnType<string, string, string>;
type Numeric = ColumnType<string, string | number, string | number>;

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

export interface PersonTable {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: Generated<string>;
  created_at: Generated<Timestamp>;
}

export interface OwnershipTable {
  id: string;
  lot_id: string;
  person_id: string;
  ownership_share: Generated<Numeric>;
  valid_from: DateString;
  valid_to: DateString | null;
  created_at: Generated<Timestamp>;
}

export interface DistributionKeyTable {
  id: string;
  coproperty_id: string;
  code: string;
  name: string;
  method: Generated<string>;
  base: Numeric | null;
  created_at: Generated<Timestamp>;
}

export interface LotDistributionShareTable {
  id: string;
  distribution_key_id: string;
  lot_id: string;
  share: Numeric;
  created_at: Generated<Timestamp>;
}

export interface Database {
  schema_migrations: SchemaMigrationsTable;
  coproperty: CopropertyTable;
  building: BuildingTable;
  lot: LotTable;
  person: PersonTable;
  ownership: OwnershipTable;
  distribution_key: DistributionKeyTable;
  lot_distribution_share: LotDistributionShareTable;
}
