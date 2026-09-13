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
  // Colonne à défaut SQL (1) mais typée en clair : Generated<Numeric> casse les
  // insertions Kysely (cf. montants). On fournit donc toujours la valeur.
  ownership_share: Numeric;
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

export interface MeterReadingTable {
  id: string;
  distribution_key_id: string;
  lot_id: string;
  period_label: string;
  consumption: Numeric;
  created_at: Generated<Timestamp>;
}

export interface AccountingExerciseTable {
  id: string;
  coproperty_id: string;
  label: string | null;
  start_date: DateString;
  end_date: DateString;
  status: Generated<string>;
  closed_at: Timestamp | null;
  approved_at: DateString | null;
  created_at: Generated<Timestamp>;
}

export interface SupplierTable {
  id: string;
  coproperty_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  registration_no: string | null;
  created_at: Generated<Timestamp>;
}

export interface SupplierInvoiceTable {
  id: string;
  coproperty_id: string;
  supplier_id: string;
  exercise_id: string;
  invoice_number: string | null;
  invoice_date: DateString;
  due_date: DateString | null;
  amount: Numeric;
  category: string | null;
  status: Generated<string>;
  created_at: Generated<Timestamp>;
}

export interface SupplierPaymentTable {
  id: string;
  supplier_invoice_id: string;
  payment_date: DateString;
  amount: Numeric;
  reference: string | null;
  created_at: Generated<Timestamp>;
}

export interface InvoiceDistributionTable {
  id: string;
  supplier_invoice_id: string;
  distribution_key_id: string;
  label: string | null;
  amount: Numeric;
  period_label: string | null;
  created_at: Generated<Timestamp>;
}

export interface ExerciseCarryForwardTable {
  id: string;
  from_exercise_id: string;
  to_exercise_id: string;
  lot_id: string | null;
  kind: string;
  amount: Numeric;
  note: string | null;
  created_at: Generated<Timestamp>;
}

export interface BudgetTable {
  id: string;
  coproperty_id: string;
  exercise_id: string;
  status: Generated<string>;
  voted_at: DateString | null;
  created_at: Generated<Timestamp>;
}

export interface BudgetLineTable {
  id: string;
  budget_id: string;
  category: string;
  distribution_key_id: string;
  planned_amount: Numeric;
}

export interface FundCallTable {
  id: string;
  coproperty_id: string;
  exercise_id: string;
  call_type: Generated<string>;
  label: string;
  issue_date: DateString;
  due_date: DateString;
  total_amount: Numeric;
  status: Generated<string>;
  created_at: Generated<Timestamp>;
}

export interface FundCallItemTable {
  id: string;
  fund_call_id: string;
  lot_id: string;
  distribution_key_id: string | null;
  amount: Numeric;
  created_at: Generated<Timestamp>;
}

export interface ReceivableTable {
  id: string;
  coproperty_id: string;
  lot_id: string;
  person_id: string;
  exercise_id: string;
  source_type: string;
  source_id: string;
  nature: Generated<string>; // PROVISION | REGULARISATION | HORS_BUDGET | AUTRE
  amount: Numeric;
  due_date: DateString;
  status: Generated<string>;
  cancelled_at: Timestamp | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  created_at: Generated<Timestamp>;
}

export interface OwnerPaymentTable {
  id: string;
  coproperty_id: string;
  person_id: string | null;
  payment_date: DateString;
  amount: Numeric;
  reference: string | null;
  status: Generated<string>;
  reversed_at: Timestamp | null;
  reversed_by: string | null;
  reversal_reason: string | null;
  created_at: Generated<Timestamp>;
}

export interface PaymentAllocationTable {
  id: string;
  owner_payment_id: string;
  receivable_id: string;
  amount: Numeric;
  created_at: Generated<Timestamp>;
}

export interface BankAccountTable {
  id: string;
  coproperty_id: string;
  name: string;
  iban: string | null;
  initial_balance: Numeric;
  initial_date: DateString | null;
  created_at: Generated<Timestamp>;
}

export interface BankTransactionTable {
  id: string;
  bank_account_id: string;
  transaction_date: DateString;
  value_date: DateString | null;
  amount: Numeric;
  label: string | null;
  external_id: string | null;
  category: string | null;
  comment: string | null;
  created_at: Generated<Timestamp>;
}

export interface BankReconciliationTable {
  id: string;
  bank_transaction_id: string;
  target_type: string; // OWNER_PAYMENT | SUPPLIER_PAYMENT
  target_id: string;
  amount: Numeric;
  created_at: Generated<Timestamp>;
}

export interface AppUserTable {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  role: Generated<string>;
  coproperty_id: string | null;
  person_id: string | null;
  created_at: Generated<Timestamp>;
}

export interface AccountingAccountTable {
  id: string;
  coproperty_id: string;
  number: string;
  name: string;
  created_at: Generated<Timestamp>;
}

export interface JournalTable {
  id: string;
  coproperty_id: string;
  code: string;
  name: string;
}

export interface JournalEntryTable {
  id: string;
  journal_id: string;
  exercise_id: string;
  entry_date: DateString;
  description: string;
  source_type: string | null;
  source_id: string | null;
  created_at: Generated<Timestamp>;
}

export interface JournalEntryLineTable {
  id: string;
  journal_entry_id: string;
  accounting_account_id: string;
  debit: Numeric;
  credit: Numeric;
  description: Generated<string | null>;
}

export interface Database {
  schema_migrations: SchemaMigrationsTable;
  app_user: AppUserTable;
  coproperty: CopropertyTable;
  building: BuildingTable;
  lot: LotTable;
  person: PersonTable;
  ownership: OwnershipTable;
  distribution_key: DistributionKeyTable;
  lot_distribution_share: LotDistributionShareTable;
  meter_reading: MeterReadingTable;
  accounting_exercise: AccountingExerciseTable;
  exercise_carry_forward: ExerciseCarryForwardTable;
  supplier: SupplierTable;
  supplier_invoice: SupplierInvoiceTable;
  supplier_payment: SupplierPaymentTable;
  invoice_distribution: InvoiceDistributionTable;
  budget: BudgetTable;
  budget_line: BudgetLineTable;
  fund_call: FundCallTable;
  fund_call_item: FundCallItemTable;
  receivable: ReceivableTable;
  owner_payment: OwnerPaymentTable;
  payment_allocation: PaymentAllocationTable;
  bank_account: BankAccountTable;
  bank_transaction: BankTransactionTable;
  bank_reconciliation: BankReconciliationTable;
  accounting_account: AccountingAccountTable;
  journal: JournalTable;
  journal_entry: JournalEntryTable;
  journal_entry_line: JournalEntryLineTable;
}
