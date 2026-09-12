import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService, type BankImportRow, type BankTx, type PayerSuggestion } from '../core/api.service';
import { extractPdfPages, parseStatement } from '../core/statement-import';

const COP_STORAGE_KEY = 'syndic.copId';

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
export class BankComponent implements OnInit {
  private api = inject(ApiService);
  private transloco = inject(TranslocoService);

  readonly categories = BANK_CATEGORIES;
  readonly copId = signal<string | null>(null);
  readonly transactions = signal<BankTx[]>([]);
  readonly showAll = signal(false);
  readonly importText = signal('');
  readonly importResult = signal<{ inserted: number; received: number } | null>(null);
  readonly saving = signal(false);

  readonly activeTxId = signal<string | null>(null);
  readonly suggestions = signal<PayerSuggestion[]>([]);
  readonly loadingSuggest = signal(false);

  // Import PDF : analyse côté navigateur puis revue avant import.
  readonly pdfBusy = signal(false);
  readonly pdfError = signal<string | null>(null);
  readonly pdfName = signal<string | null>(null);
  readonly reviewRows = signal<ReviewRow[]>([]);

  ngOnInit(): void {
    let cop: string | null = null;
    try {
      cop = localStorage.getItem(COP_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.copId.set(cop);
    if (cop) this.load();
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

  startReconcile(tx: BankTx): void {
    if (this.activeTxId() === tx.id) {
      this.activeTxId.set(null);
      return;
    }
    const cop = this.copId();
    if (!cop) return;
    this.activeTxId.set(tx.id);
    this.suggestions.set([]);
    this.loadingSuggest.set(true);
    this.api.suggestPayers(cop, tx.id).subscribe({
      next: (s) => {
        this.suggestions.set(s);
        this.loadingSuggest.set(false);
      },
      error: () => this.loadingSuggest.set(false),
    });
  }

  async record(tx: BankTx, personId: string): Promise<void> {
    const cop = this.copId();
    if (!cop) return;
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.recordOwnerPaymentFromLine(cop, tx.id, personId));
      this.activeTxId.set(null);
      this.load();
    } finally {
      this.saving.set(false);
    }
  }

  num(n: string | number): number {
    return Number(n);
  }
}
