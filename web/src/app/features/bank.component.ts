import { Component, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import {
  ApiService,
  type BankImportRow,
  type BankTx,
  type InvoiceSuggestion,
  type PayerSuggestion,
  type ReceivableRow,
} from '../core/api.service';
import { extractPdfPages, parseStatement } from '../core/statement-import';
import { CopropertyContextService } from '../core/coproperty-context.service';
import { ExerciseContextService } from '../core/exercise-context.service';

/** Catégories de dépense/recette (codes miroir du serveur, libellés i18n bankcat.*). */
export const BANK_CATEGORIES = [
  'EAU',
  'ELECTRICITE',
  'ASSURANCE',
  'ENTRETIEN',
  'ASCENSEUR',
  'ESPACES_VERTS',
  'TRAVAUX',
  'HONORAIRES',
  'BANQUE',
  'IMPOTS',
  'APPEL_FONDS',
  'AUTRE',
] as const;

interface ReviewRow {
  transactionDate: string;
  amount: number;
  label: string;
  category: string;
  comment: string;
}

@Component({
  selector: 'app-bank',
  imports: [TranslocoModule, FormsModule, DecimalPipe],
  templateUrl: './bank.component.html',
})
export class BankComponent {
  private api = inject(ApiService);
  private transloco = inject(TranslocoService);
  private copCtx = inject(CopropertyContextService);
  private exCtx = inject(ExerciseContextService);

  readonly categories = BANK_CATEGORIES;
  readonly copId = this.copCtx.currentId;
  readonly transactions = signal<BankTx[]>([]);
  readonly showAll = signal(false);
  readonly importText = signal('');
  readonly importResult = signal<{ inserted: number; received: number } | null>(null);
  readonly saving = signal(false);

  // --- Rapprochement unifié ---
  readonly reconcileTx = signal<BankTx | null>(null);
  readonly payers = signal<PayerSuggestion[]>([]);
  readonly payerId = signal<string | null>(null);
  readonly receivables = signal<ReceivableRow[]>([]); // créances candidates (crédit)
  readonly invoiceSug = signal<InvoiceSuggestion[]>([]); // factures candidates (débit)
  readonly amounts = signal<Record<string, number>>({}); // cibleId -> montant affecté
  readonly loadingReco = signal(false);
  readonly showAllRecv = signal(false);
  // création de dépense à la volée (débit)
  readonly showCreateExpense = signal(false);
  ceName = '';
  ceCategory = '';

  // Import PDF : analyse côté navigateur puis revue avant import.
  readonly pdfBusy = signal(false);
  readonly pdfError = signal<string | null>(null);
  readonly pdfName = signal<string | null>(null);
  readonly reviewRows = signal<ReviewRow[]>([]);

  constructor() {
    // La banque ne dépend que de la copropriété : on recharge à son changement.
    effect(() => {
      const cop = this.copCtx.currentId();
      this.reconcileTx.set(null);
      if (!cop) {
        this.transactions.set([]);
        return;
      }
      this.api.listBankTransactions(cop, !this.showAll()).subscribe({ next: (t) => this.transactions.set(t) });
    });
  }

  private load(): void {
    const cop = this.copId();
    if (!cop) return;
    this.api.listBankTransactions(cop, !this.showAll()).subscribe({ next: (t) => this.transactions.set(t) });
  }

  toggleShowAll(): void {
    this.showAll.update((v) => !v);
    this.load();
  }

  private normalizeDate(d: string): string | null {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const m = d.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
    if (m) {
      const [, dd, mm, yy] = m;
      const year = yy!.length === 2 ? `20${yy}` : yy!;
      return `${year}-${mm!.padStart(2, '0')}-${dd!.padStart(2, '0')}`;
    }
    return null;
  }

  private parseAmount(a: string): number | null {
    const n = Number(a.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  private parseStatement(text: string): BankImportRow[] {
    const rows: BankImportRow[] = [];
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const parts = line.split(/[;\t]/).map((s) => s.trim());
      if (parts.length < 2) continue;
      const date = this.normalizeDate(parts[0]!);
      const amount = this.parseAmount(parts[1]!);
      if (date === null || amount === null) continue;
      const label = parts.slice(2).join(' ') || null;
      rows.push({ transactionDate: date, amount, label, externalId: `${date}~${amount}~${label ?? ''}` });
    }
    return rows;
  }

  importStatement(): void {
    const cop = this.copId();
    if (!cop) return;
    const rows = this.parseStatement(this.importText());
    if (rows.length === 0) return;
    this.saving.set(true);
    this.api.importBankTransactions(cop, rows).subscribe({
      next: (res) => {
        this.importResult.set(res);
        this.importText.set('');
        this.saving.set(false);
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }

  // --- Import PDF (analyse locale + revue) ---
  async onPdfSelected(event: Event): Promise<void> {
    const cop = this.copId();
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permet de re-sélectionner le même fichier
    if (!cop || !file) return;
    this.pdfError.set(null);
    this.pdfBusy.set(true);
    this.pdfName.set(file.name);
    this.reviewRows.set([]);
    try {
      const pages = await extractPdfPages(file);
      const parsed = parseStatement(pages);
      if (parsed.length === 0) {
        this.pdfError.set(this.transloco.translate('bank.pdfNone'));
        return;
      }
      const res = await firstValueFrom(
        this.api.previewBankRows(cop, parsed.map((r) => ({ transactionDate: r.transactionDate, amount: r.amount, label: r.label }))),
      );
      this.reviewRows.set(
        res.rows.map((r) => ({
          transactionDate: r.transactionDate,
          amount: r.amount,
          label: r.label ?? '',
          category: r.category ?? 'AUTRE',
          comment: r.comment ?? '',
        })),
      );
    } catch {
      this.pdfError.set(this.transloco.translate('bank.pdfError'));
    } finally {
      this.pdfBusy.set(false);
    }
  }

  removeReviewRow(i: number): void {
    this.reviewRows.update((rows) => rows.filter((_, idx) => idx !== i));
  }

  cancelReview(): void {
    this.reviewRows.set([]);
    this.pdfName.set(null);
    this.pdfError.set(null);
  }

  confirmImport(): void {
    const cop = this.copId();
    const rows = this.reviewRows();
    if (!cop || rows.length === 0) return;
    this.saving.set(true);
    const payload: BankImportRow[] = rows.map((r) => ({
      transactionDate: r.transactionDate,
      amount: r.amount,
      label: r.label || null,
      category: r.category,
      comment: r.comment || null,
      externalId: `${r.transactionDate}~${r.amount}~${r.label}`,
    }));
    this.api.importBankTransactions(cop, payload).subscribe({
      next: (res) => {
        this.importResult.set(res);
        this.saving.set(false);
        this.cancelReview();
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }

  // --- Édition en ligne : catégorie / commentaire ---
  saveCategory(tx: BankTx, category: string): void {
    const cop = this.copId();
    if (!cop) return;
    this.api.updateBankTransaction(cop, tx.id, { category }).subscribe({
      next: () => this.transactions.update((list) => list.map((t) => (t.id === tx.id ? { ...t, category } : t))),
    });
  }

  saveComment(tx: BankTx, comment: string): void {
    const cop = this.copId();
    if (!cop || (tx.comment ?? '') === comment) return;
    this.api.updateBankTransaction(cop, tx.id, { comment: comment || null }).subscribe({
      next: () => this.transactions.update((list) => list.map((t) => (t.id === tx.id ? { ...t, comment: comment || null } : t))),
    });
  }

  isCredit(tx: BankTx): boolean {
    return tx.direction === 'CREDIT';
  }

  openReconcile(tx: BankTx): void {
    if (this.reconcileTx()?.id === tx.id) {
      this.reconcileTx.set(null);
      return;
    }
    const cop = this.copId();
    if (!cop) return;
    this.reconcileTx.set(tx);
    this.amounts.set({});
    this.payers.set([]);
    this.payerId.set(null);
    this.receivables.set([]);
    this.invoiceSug.set([]);
    this.showAllRecv.set(false);
    this.showCreateExpense.set(false);
    this.loadingReco.set(true);
    if (this.isCredit(tx)) {
      // Crédit : encaissement copropriétaire. On suggère le payeur.
      this.api.suggestPayers(cop, tx.id).subscribe({
        next: (s) => {
          this.payers.set(s);
          this.loadingReco.set(false);
          if (s.length > 0) this.pickPayer(s[0]!.personId);
        },
        error: () => this.loadingReco.set(false),
      });
    } else {
      // Débit : décaissement fournisseur. On suggère les factures non soldées.
      this.api.suggestInvoices(cop, tx.id).subscribe({
        next: (inv) => {
          this.invoiceSug.set(inv);
          this.loadingReco.set(false);
          this.prefillInvoices(inv, tx);
        },
        error: () => this.loadingReco.set(false),
      });
    }
  }

  private lineRemaining(): number {
    return this.reconcileTx()?.remaining ?? 0;
  }

  private prefillInvoices(inv: InvoiceSuggestion[], tx: BankTx): void {
    // Priorise une facture dont le reste correspond exactement à la ligne, puis
    // répartit dans cet ordre : chaque case = min(reste dû, reste de la ligne).
    const ordered = [...inv].sort((a, b) => {
      const ea = Math.abs(a.remaining - tx.remaining) <= 0.01 ? 0 : 1;
      const eb = Math.abs(b.remaining - tx.remaining) <= 0.01 ? 0 : 1;
      return ea - eb;
    });
    this.autofillTargets(ordered.map((i) => ({ id: i.id, remaining: i.remaining })));
  }

  pickPayer(personId: string): void {
    const cop = this.copId();
    if (!cop) return;
    this.payerId.set(personId);
    this.showAllRecv.set(false);
    this.api.listReceivables(cop).subscribe({
      next: (rows) => {
        const mine = rows.filter((r) => r.personId === personId && r.remaining > 0);
        this.receivables.set(mine);
        this.autofill(mine);
      },
    });
  }

  loadAllReceivables(): void {
    const cop = this.copId();
    if (!cop) return;
    this.showAllRecv.set(true);
    this.api.listReceivables(cop).subscribe({
      next: (rows) => {
        const open = rows.filter((r) => r.remaining > 0);
        this.receivables.set(open);
        this.autofill(open);
      },
    });
  }

  /** Répartit le reste de la ligne sur les créances, de la plus ancienne à la plus récente. */
  private autofill(rows: ReceivableRow[]): void {
    this.autofillTargets(rows.map((r) => ({ id: r.id, remaining: r.remaining })));
  }

  /**
   * Pré-remplit chaque cible avec min(reste dû, reste de la ligne bancaire), en
   * consommant la ligne de la première cible à la dernière : si la ligne est
   * inférieure au reste dû, la case reçoit le montant de la ligne ; si elle est
   * supérieure, la case reçoit le reste dû (le surplus part sur la cible
   * suivante — split).
   */
  private autofillTargets(rows: { id: string; remaining: number }[]): void {
    let left = this.lineRemaining();
    const map: Record<string, number> = {};
    for (const r of rows) {
      if (left <= 0.01) break;
      const amt = Math.min(r.remaining, left);
      map[r.id] = Math.round(amt * 100) / 100;
      left = Math.round((left - amt) * 100) / 100;
    }
    this.amounts.set(map);
  }

  setAmount(id: string, value: number | string): void {
    const n = Number(String(value).replace(',', '.'));
    this.amounts.update((m) => ({ ...m, [id]: Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0 }));
  }

  amountOf(id: string): number {
    return this.amounts()[id] ?? 0;
  }

  totalAllocated(): number {
    return Math.round(Object.values(this.amounts()).reduce((s, a) => s + (a || 0), 0) * 100) / 100;
  }

  startCreateExpense(): void {
    const tx = this.reconcileTx();
    this.showCreateExpense.set(true);
    this.ceName = tx?.label ?? '';
    this.ceCategory = tx?.category ? this.transloco.translate('bankcat.' + tx.category) : '';
  }

  async submitCreateExpense(): Promise<void> {
    const cop = this.copId();
    const tx = this.reconcileTx();
    if (!cop || !tx || !this.ceName.trim()) return;
    this.saving.set(true);
    try {
      // Exercice courant (piloté par l'entête).
      const exId = this.exCtx.currentId();
      const ex = this.exCtx.exercises();
      const exercise = ex.find((e) => e.id === exId) ?? ex[0];
      if (!exercise) return;
      // Résolution du bénéficiaire (création si nouveau).
      const suppliers = await firstValueFrom(this.api.listSuppliers(cop));
      const name = this.ceName.trim();
      const existing = suppliers.find((s) => s.name.toLowerCase() === name.toLowerCase());
      const supplier = existing ?? (await firstValueFrom(this.api.createSupplier(cop, name)));
      await firstValueFrom(
        this.api.createInvoice(cop, {
          supplierId: supplier.id,
          exerciseId: exercise.id,
          invoiceDate: tx.transactionDate,
          amount: Math.abs(Number(tx.amount)),
          category: this.ceCategory || null,
        }),
      );
      // Recharge les suggestions ; la nouvelle facture apparaît, pré-remplie.
      const inv = await firstValueFrom(this.api.suggestInvoices(cop, tx.id));
      this.invoiceSug.set(inv);
      this.prefillInvoices(inv, tx);
      this.showCreateExpense.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  reconcile(): void {
    const cop = this.copId();
    const tx = this.reconcileTx();
    if (!cop || !tx) return;
    const amounts = this.amounts();
    this.saving.set(true);
    const input: {
      payerPersonId?: string | null;
      receivableAllocations?: { receivableId: string; amount: number }[];
      invoiceAllocations?: { invoiceId: string; amount: number }[];
    } = {};
    if (this.isCredit(tx)) {
      input.payerPersonId = this.payerId();
      input.receivableAllocations = this.receivables()
        .filter((r) => (amounts[r.id] ?? 0) > 0)
        .map((r) => ({ receivableId: r.id, amount: amounts[r.id]! }));
    } else {
      input.invoiceAllocations = this.invoiceSug()
        .filter((i) => (amounts[i.id] ?? 0) > 0)
        .map((i) => ({ invoiceId: i.id, amount: amounts[i.id]! }));
    }
    this.api.reconcileTransaction(cop, tx.id, input).subscribe({
      next: () => {
        this.saving.set(false);
        this.reconcileTx.set(null);
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }

  num(n: string | number): number {
    return Number(n);
  }
}
