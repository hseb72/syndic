import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export interface HealthStatus {
  status: string;
  db: string;
  time: string;
}

export interface Coproperty {
  id: string;
  name: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string;
  created_at: string;
}

export interface CopropertyBackup {
  formatVersion: number;
  kind: string;
  exportedAt: string;
  copropertyId: string;
  copropertyName: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export interface ImportResult {
  copropertyId: string;
  mode: 'NEW' | 'RESTORE';
  inserted: Record<string, number>;
}

export interface CreateCopropertyInput {
  name: string;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string;
}

export interface LotOwner {
  personId: string;
  name: string;
  sharePct: number;
}

export interface LotOverviewRow {
  id: string;
  lotNumber: string;
  description: string | null;
  tantiemes: string;
  quotePart: number | null;
  owners: LotOwner[];
  ownerLabel: string;
}

export interface CopropertyOverview {
  generalKeyBase: string | null;
  totalTantiemes: string;
  lotCount: number;
  lots: LotOverviewRow[];
}

export interface CreateLotInput {
  lotNumber: string;
  tantiemes: number;
  ownerName?: string | null;
  description?: string | null;
}

export interface Exercise {
  id: string;
  label: string | null;
  start_date: string;
  end_date: string;
  status: string;
}

export interface Supplier {
  id: string;
  name: string;
}

export interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  amount: string;
  category: string | null;
  fund: string;
  status: string;
  exerciseId: string;
  supplierName: string;
  paidAmount: string;
}

export interface InvoiceDistributionInput {
  keyCode: 'GENERAL' | 'EAU';
  label?: string | null;
  amount: number;
  periodLabel?: string | null;
}

export interface CreateInvoiceInput {
  supplierId: string;
  exerciseId: string;
  invoiceDate: string;
  amount: number;
  category?: string | null;
  fund?: 'COURANT' | 'TRAVAUX';
  invoiceNumber?: string | null;
  distributions?: InvoiceDistributionInput[];
}

export interface UpdateInvoiceInput {
  supplierId?: string;
  invoiceDate?: string;
  amount?: number;
  category?: string | null;
  fund?: 'COURANT' | 'TRAVAUX';
  invoiceNumber?: string | null;
  dueDate?: string | null;
  distributions?: InvoiceDistributionInput[];
}

export interface InvoiceDetail {
  id: string;
  supplier_id: string;
  invoice_date: string;
  amount: string;
  category: string | null;
  fund: string;
  invoice_number: string | null;
  due_date: string | null;
  distributions: {
    id: string;
    keyCode: string;
    label: string | null;
    amount: string;
    periodLabel: string | null;
  }[];
}

export interface ChargesResult {
  exerciseId: string;
  total: number;
  byLot: { lotId: string; lotNumber: string; amount: number }[];
}

export interface RegularisationLot {
  lotId: string;
  lotNumber: string;
  ownerLabel: string;
  depenses: number;
  provisionsN1: number;
  impayes: number;
  provisionsNext: number;
  workFundNext: number;
  amount: number;
}

export interface MyReceivable {
  id: string;
  lotNumber: string;
  exercise: string | null;
  nature: string;
  amount: string;
  paid: string;
  remaining: number;
  dueDate: string;
  status: string;
}

export interface MySummary {
  linked: boolean;
  personName: string | null;
  lots: { lotNumber: string; tantiemes: string | null }[];
  receivables: MyReceivable[];
  totals: { due: number; paid: number; remaining: number };
}

export interface RegularisationReport {
  exists: boolean;
  label: string | null;
  issueDate: string | null;
  total: number;
  rows: { lotNumber: string; ownerLabel: string; amount: number }[];
}

export interface DashboardSummary {
  lotCount: number;
  totalTantiemes: string;
  cashBalance: number;
  unpaidTotal: number;
  unpaidCount: number;
  worklistCount: number;
  exercise: { id: string; label: string | null; status: string } | null;
  budgetVoted: number | null;
  expenses: number | null;
  budgetByCategory: { category: string; planned: number }[];
}

export interface BankTx {
  id: string;
  transactionDate: string;
  amount: string;
  label: string | null;
  category: string | null;
  comment: string | null;
  reconciled: string;
  remaining: number;
  status: string;
  direction: 'CREDIT' | 'DEBIT';
}

export interface PayerSuggestion {
  personId: string;
  name: string;
  lotNumber: string;
}

export interface InvoiceSuggestion {
  id: string;
  supplierName: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  category: string | null;
  amount: string;
  remaining: number;
  score: number;
}

export interface BankImportRow {
  transactionDate: string;
  amount: number;
  label?: string | null;
  externalId?: string | null;
  category?: string | null;
  comment?: string | null;
}

export interface BalanceRow {
  number: string;
  name: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface BalanceResult {
  rows: BalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

export interface JournalLine {
  entryId: string;
  entryDate: string;
  description: string;
  account: string;
  debit: number;
  credit: number;
}

export interface BudgetLine {
  id: string;
  category: string;
  plannedAmount: string;
  keyCode: string;
  keyName: string;
}

export interface BudgetResult {
  budget: { id: string; status: string; voted_at: string | null };
  lines: BudgetLine[];
  total: number;
}

export interface FundCall {
  id: string;
  label: string;
  call_type: string;
  issue_date: string;
  due_date: string;
  total_amount: string;
  status: string;
  exercise_id: string;
}

export interface ReceivableRow {
  id: string;
  lotId: string;
  lotNumber: string;
  personId: string;
  personName: string;
  amount: string;
  computedAmount: string | null;
  allocated: string;
  remaining: number;
  dueDate: string;
  status: string;
  nature: string;
  exercise: string | null;
}

export interface RegularisationResult {
  exerciseN1Id: string;
  totals: {
    depenses: number;
    provisionsN1: number;
    impayes: number;
    provisionsNext: number;
    workFundNext: number;
    amount: number;
  };
  byLot: RegularisationLot[];
}

export interface PaymentNotice {
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

export interface NoticeLine {
  receivableId: string;
  nature: string;
  exercise: string | null;
  lotNumber: string;
  amount: number;
  paid: number;
  remaining: number;
}

export interface Assembly {
  id: string;
  kind: string;
  meeting_date: string;
  meeting_time: string | null;
  location: string | null;
  convocation_date: string | null;
  status: string;
  notes: string | null;
}
export interface Resolution {
  id: string;
  position: number;
  title: string;
  body: string | null;
  majority: string;
  exercise_id: string | null;
}
export interface Annex {
  id: string;
  position: number;
  report_type: string;
  exercise_id: string | null;
  label: string | null;
  note: string | null;
}
export interface AssemblyDetail {
  assembly: Assembly;
  resolutions: Resolution[];
  annexes: Annex[];
}
export interface ComparisonResult {
  rows: { category: string; budget: number; real: number; variance: number }[];
  budgetTotal: number;
  realTotal: number;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  // --- Assemblées générales ---
  listAssemblies(copId: string): Observable<Assembly[]> {
    return this.http.get<Assembly[]>(`/api/coproperties/${copId}/assemblies`);
  }
  createAssembly(copId: string, input: Partial<Assembly> & { meetingDate: string }): Observable<Assembly> {
    return this.http.post<Assembly>(`/api/coproperties/${copId}/assemblies`, input);
  }
  getAssembly(copId: string, id: string): Observable<AssemblyDetail> {
    return this.http.get<AssemblyDetail>(`/api/coproperties/${copId}/assemblies/${id}`);
  }
  updateAssembly(copId: string, id: string, input: Record<string, unknown>): Observable<Assembly> {
    return this.http.patch<Assembly>(`/api/coproperties/${copId}/assemblies/${id}`, input);
  }
  deleteAssembly(copId: string, id: string): Observable<unknown> {
    return this.http.delete(`/api/coproperties/${copId}/assemblies/${id}`);
  }
  addResolution(copId: string, id: string, input: { title: string; body?: string | null; majority?: string; exerciseId?: string | null }): Observable<Resolution> {
    return this.http.post<Resolution>(`/api/coproperties/${copId}/assemblies/${id}/resolutions`, input);
  }
  deleteResolution(copId: string, id: string, subId: string): Observable<unknown> {
    return this.http.delete(`/api/coproperties/${copId}/assemblies/${id}/resolutions/${subId}`);
  }
  addAnnex(copId: string, id: string, input: { reportType: string; exerciseId?: string | null; label?: string | null; note?: string | null }): Observable<Annex> {
    return this.http.post<Annex>(`/api/coproperties/${copId}/assemblies/${id}/annexes`, input);
  }
  deleteAnnex(copId: string, id: string, subId: string): Observable<unknown> {
    return this.http.delete(`/api/coproperties/${copId}/assemblies/${id}/annexes/${subId}`);
  }
  getBudgetComparison(copId: string, exerciseId: string): Observable<ComparisonResult> {
    return this.http.get<ComparisonResult>(`/api/coproperties/${copId}/budget-comparison?exerciseId=${exerciseId}`);
  }

  listPaymentNotices(copId: string): Observable<PaymentNotice[]> {
    return this.http.get<PaymentNotice[]>(`/api/coproperties/${copId}/payment-notices`);
  }

  getNoticeLines(copId: string, id: string): Observable<NoticeLine[]> {
    return this.http.get<NoticeLine[]>(`/api/coproperties/${copId}/payment-notices/${id}/lines`);
  }

  generateNotices(copId: string, input: { label: string; issueDate: string; dueDate: string }): Observable<{ created: number }> {
    return this.http.post<{ created: number }>(`/api/coproperties/${copId}/payment-notices/generate`, input);
  }

  payNotice(copId: string, id: string, input: { paymentDate: string }): Observable<{ paymentId: string; allocated: number }> {
    return this.http.post<{ paymentId: string; allocated: number }>(`/api/coproperties/${copId}/payment-notices/${id}/pay`, input);
  }

  cancelNotice(copId: string, id: string): Observable<{ cancelled: boolean }> {
    return this.http.post<{ cancelled: boolean }>(`/api/coproperties/${copId}/payment-notices/${id}/cancel`, {});
  }

  health(): Observable<HealthStatus> {
    return this.http.get<HealthStatus>('/health');
  }

  getDashboard(copId: string, exerciseId?: string): Observable<DashboardSummary> {
    const q = exerciseId ? `?exerciseId=${exerciseId}` : '';
    return this.http.get<DashboardSummary>(`/api/coproperties/${copId}/dashboard${q}`);
  }

  getMySummary(copId: string, exerciseId?: string): Observable<MySummary> {
    const ex = exerciseId ? `&exerciseId=${exerciseId}` : '';
    return this.http.get<MySummary>(`/api/me/summary?copId=${copId}${ex}`);
  }

  getRegularisationReport(copId: string, exerciseId: string): Observable<RegularisationReport> {
    return this.http.get<RegularisationReport>(
      `/api/coproperties/${copId}/exercises/${exerciseId}/regularisation-report`,
    );
  }

  createOwnerAccess(input: { email: string; password: string; personId: string; copropertyId: string }): Observable<unknown> {
    return this.http.post('/api/auth/register', { ...input, role: 'COPROPRIETAIRE' });
  }

  generateAccounting(copId: string, exerciseId: string): Observable<BalanceResult & { entries: number }> {
    return this.http.post<BalanceResult & { entries: number }>(
      `/api/coproperties/${copId}/exercises/${exerciseId}/accounting/generate`,
      {},
    );
  }

  getBalance(copId: string, exerciseId: string): Observable<BalanceResult> {
    return this.http.get<BalanceResult>(`/api/coproperties/${copId}/exercises/${exerciseId}/accounting/balance`);
  }

  getJournal(copId: string, exerciseId: string): Observable<JournalLine[]> {
    return this.http.get<JournalLine[]>(`/api/coproperties/${copId}/exercises/${exerciseId}/accounting/journal`);
  }

  listCoproperties(): Observable<Coproperty[]> {
    return this.http.get<Coproperty[]>('/api/coproperties');
  }

  createCoproperty(input: CreateCopropertyInput): Observable<Coproperty> {
    return this.http.post<Coproperty>('/api/coproperties', input);
  }

  updateCoproperty(id: string, input: Partial<CreateCopropertyInput>): Observable<Coproperty> {
    return this.http.patch<Coproperty>(`/api/coproperties/${id}`, input);
  }

  exportCoproperty(copId: string): Observable<CopropertyBackup> {
    return this.http.get<CopropertyBackup>(`/api/coproperties/${copId}/export`);
  }

  importCoproperty(file: CopropertyBackup, mode: 'NEW' | 'RESTORE'): Observable<ImportResult> {
    return this.http.post<ImportResult>('/api/coproperty-import', { mode, file });
  }

  getOverview(copId: string): Observable<CopropertyOverview> {
    return this.http.get<CopropertyOverview>(`/api/coproperties/${copId}/overview`);
  }

  createLot(copId: string, input: CreateLotInput): Observable<CopropertyOverview> {
    return this.http.post<CopropertyOverview>(`/api/coproperties/${copId}/lots`, input);
  }

  updateLotTantiemes(copId: string, lotId: string, tantiemes: number): Observable<CopropertyOverview> {
    return this.http.patch<CopropertyOverview>(`/api/coproperties/${copId}/lots/${lotId}`, { tantiemes });
  }

  setLotOwner(copId: string, lotId: string, name: string): Observable<CopropertyOverview> {
    return this.http.post<CopropertyOverview>(`/api/coproperties/${copId}/lots/${lotId}/owner`, { name });
  }

  addLotOwner(
    copId: string,
    lotId: string,
    input: { personId?: string; name?: string; sharePct?: number },
  ): Observable<CopropertyOverview> {
    return this.http.post<CopropertyOverview>(`/api/coproperties/${copId}/lots/${lotId}/owners`, input);
  }

  setOwnerShare(copId: string, lotId: string, personId: string, sharePct: number): Observable<CopropertyOverview> {
    return this.http.patch<CopropertyOverview>(`/api/coproperties/${copId}/lots/${lotId}/owners/${personId}`, { sharePct });
  }

  removeLotOwner(copId: string, lotId: string, personId: string): Observable<CopropertyOverview> {
    return this.http.delete<CopropertyOverview>(`/api/coproperties/${copId}/lots/${lotId}/owners/${personId}`);
  }

  equalizeOwners(copId: string, lotId: string): Observable<CopropertyOverview> {
    return this.http.post<CopropertyOverview>(`/api/coproperties/${copId}/lots/${lotId}/owners/equalize`, {});
  }

  deleteLot(copId: string, lotId: string): Observable<CopropertyOverview> {
    return this.http.delete<CopropertyOverview>(`/api/coproperties/${copId}/lots/${lotId}`);
  }

  listExercises(copId: string): Observable<Exercise[]> {
    return this.http.get<Exercise[]>(`/api/coproperties/${copId}/exercises`);
  }

  createExercise(copId: string, input: { label: string; startDate: string; endDate: string }): Observable<Exercise> {
    return this.http.post<Exercise>(`/api/coproperties/${copId}/exercises`, input);
  }

  listSuppliers(copId: string): Observable<Supplier[]> {
    return this.http.get<Supplier[]>(`/api/coproperties/${copId}/suppliers`);
  }

  createSupplier(copId: string, name: string): Observable<Supplier> {
    return this.http.post<Supplier>(`/api/coproperties/${copId}/suppliers`, { name });
  }

  listInvoices(copId: string, exerciseId: string): Observable<InvoiceRow[]> {
    return this.http.get<InvoiceRow[]>(`/api/coproperties/${copId}/invoices?exerciseId=${exerciseId}`);
  }

  createInvoice(copId: string, input: CreateInvoiceInput): Observable<unknown> {
    return this.http.post(`/api/coproperties/${copId}/invoices`, input);
  }

  getInvoice(copId: string, invoiceId: string): Observable<InvoiceDetail> {
    return this.http.get<InvoiceDetail>(`/api/coproperties/${copId}/invoices/${invoiceId}`);
  }

  updateInvoice(copId: string, invoiceId: string, input: UpdateInvoiceInput): Observable<unknown> {
    return this.http.patch(`/api/coproperties/${copId}/invoices/${invoiceId}`, input);
  }

  deleteInvoice(copId: string, invoiceId: string): Observable<unknown> {
    return this.http.delete(`/api/coproperties/${copId}/invoices/${invoiceId}`);
  }

  getCharges(copId: string, exerciseId: string): Observable<ChargesResult> {
    return this.http.get<ChargesResult>(`/api/coproperties/${copId}/exercises/${exerciseId}/charges`);
  }

  getWaterReadings(
    copId: string,
    period: string,
  ): Observable<{ periodLabel: string; readings: { lotId: string; consumption: string }[] }> {
    return this.http.get<{ periodLabel: string; readings: { lotId: string; consumption: string }[] }>(
      `/api/coproperties/${copId}/water-readings/${period}`,
    );
  }

  setWaterReadings(
    copId: string,
    periodLabel: string,
    readings: { lotId: string; consumption: number }[],
  ): Observable<unknown> {
    return this.http.put(`/api/coproperties/${copId}/water-readings`, { periodLabel, readings });
  }

  recordInvoicePayment(
    copId: string,
    invoiceId: string,
    input: { paymentDate: string; amount: number },
  ): Observable<unknown> {
    return this.http.post(`/api/coproperties/${copId}/invoices/${invoiceId}/payments`, input);
  }

  computeRegularisation(
    copId: string,
    input: { exerciseN1Id: string; provisionsNextTotal: number; workFundNextTotal: number },
  ): Observable<RegularisationResult> {
    return this.http.post<RegularisationResult>(`/api/coproperties/${copId}/regularisation/compute`, input);
  }

  generateRegularisation(
    copId: string,
    input: {
      exerciseN1Id: string;
      provisionsNextTotal: number;
      workFundNextTotal: number;
      label: string;
      issueDate: string;
      dueDate: string;
    },
  ): Observable<{ total: number; receivablesCreated: number; credits: number }> {
    return this.http.post<{ total: number; receivablesCreated: number; credits: number }>(
      `/api/coproperties/${copId}/regularisation/generate`,
      input,
    );
  }

  getBudget(copId: string, exerciseId: string): Observable<BudgetResult> {
    return this.http.get<BudgetResult>(`/api/coproperties/${copId}/exercises/${exerciseId}/budget`);
  }

  addBudgetLine(
    copId: string,
    exerciseId: string,
    input: { category: string; keyCode: 'GENERAL' | 'EAU'; plannedAmount: number },
  ): Observable<BudgetResult> {
    return this.http.post<BudgetResult>(`/api/coproperties/${copId}/exercises/${exerciseId}/budget/lines`, input);
  }

  voteBudget(copId: string, exerciseId: string): Observable<BudgetResult> {
    return this.http.post<BudgetResult>(`/api/coproperties/${copId}/exercises/${exerciseId}/budget/vote`, {});
  }

  listFundCalls(copId: string, exerciseId: string): Observable<FundCall[]> {
    return this.http.get<FundCall[]>(`/api/coproperties/${copId}/fund-calls?exerciseId=${exerciseId}`);
  }

  createProvisionCall(
    copId: string,
    input: { exerciseId: string; label: string; issueDate: string; dueDate: string; totalAmount: number },
  ): Observable<FundCall> {
    return this.http.post<FundCall>(`/api/coproperties/${copId}/fund-calls`, input);
  }

  updateReceivableAmount(copId: string, receivableId: string, amount: number): Observable<unknown> {
    return this.http.patch(`/api/coproperties/${copId}/receivables/${receivableId}`, { amount });
  }

  listReceivables(copId: string, exerciseId?: string): Observable<ReceivableRow[]> {
    const q = exerciseId ? `?exerciseId=${exerciseId}` : '';
    return this.http.get<ReceivableRow[]>(`/api/coproperties/${copId}/receivables${q}`);
  }

  closeExercise(copId: string, exerciseId: string): Observable<Exercise> {
    return this.http.post<Exercise>(`/api/coproperties/${copId}/exercises/${exerciseId}/close`, {});
  }

  reopenExercise(copId: string, exerciseId: string): Observable<Exercise> {
    return this.http.post<Exercise>(`/api/coproperties/${copId}/exercises/${exerciseId}/reopen`, {});
  }

  listCarryForward(copId: string, exerciseId: string): Observable<{ id: string; lotNumber: string; kind: string; amount: string }[]> {
    return this.http.get<{ id: string; lotNumber: string; kind: string; amount: string }[]>(
      `/api/coproperties/${copId}/exercises/${exerciseId}/carry-forward`,
    );
  }

  createPayment(
    copId: string,
    input: { personId: string; paymentDate: string; amount: number; autoAllocate: boolean },
  ): Observable<unknown> {
    return this.http.post(`/api/coproperties/${copId}/payments`, input);
  }

  listBankTransactions(copId: string, unreconciled: boolean): Observable<BankTx[]> {
    return this.http.get<BankTx[]>(`/api/coproperties/${copId}/bank-transactions?unreconciled=${unreconciled}`);
  }

  importBankTransactions(copId: string, rows: BankImportRow[]): Observable<{ inserted: number; received: number }> {
    return this.http.post<{ inserted: number; received: number }>(
      `/api/coproperties/${copId}/bank-transactions/import`,
      { rows },
    );
  }

  previewBankRows(
    copId: string,
    rows: { transactionDate: string; amount: number; label?: string | null }[],
  ): Observable<{ rows: BankImportRow[] }> {
    return this.http.post<{ rows: BankImportRow[] }>(`/api/coproperties/${copId}/bank-transactions/preview`, { rows });
  }

  updateBankTransaction(
    copId: string,
    txId: string,
    input: { category?: string | null; comment?: string | null },
  ): Observable<{ updated: boolean }> {
    return this.http.patch<{ updated: boolean }>(`/api/coproperties/${copId}/bank-transactions/${txId}`, input);
  }

  suggestPayers(copId: string, txId: string): Observable<PayerSuggestion[]> {
    return this.http.get<PayerSuggestion[]>(`/api/coproperties/${copId}/bank-transactions/${txId}/suggest`);
  }

  suggestInvoices(copId: string, txId: string): Observable<InvoiceSuggestion[]> {
    return this.http.get<InvoiceSuggestion[]>(`/api/coproperties/${copId}/bank-transactions/${txId}/suggest-invoices`);
  }

  reconcileTransaction(
    copId: string,
    txId: string,
    input: {
      payerPersonId?: string | null;
      receivableAllocations?: { receivableId: string; amount: number }[];
      invoiceAllocations?: { invoiceId: string; amount: number }[];
    },
  ): Observable<{ reconciled: number }> {
    return this.http.post<{ reconciled: number }>(`/api/coproperties/${copId}/bank-transactions/${txId}/reconcile`, input);
  }

  recordOwnerPaymentFromLine(copId: string, txId: string, personId: string): Observable<unknown> {
    return this.http.post(`/api/coproperties/${copId}/bank-transactions/${txId}/record-owner-payment`, { personId });
  }
}
