import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService, type BankImportRow, type BankTx, type PayerSuggestion } from '../core/api.service';

const COP_STORAGE_KEY = 'syndic.copId';

@Component({
  selector: 'app-bank',
  imports: [TranslocoModule, FormsModule, DecimalPipe],
  templateUrl: './bank.component.html',
})
export class BankComponent implements OnInit {
  private api = inject(ApiService);

  readonly copId = signal<string | null>(null);
  readonly transactions = signal<BankTx[]>([]);
  readonly showAll = signal(false);
  readonly importText = signal('');
  readonly importResult = signal<{ inserted: number; received: number } | null>(null);
  readonly saving = signal(false);

  readonly activeTxId = signal<string | null>(null);
  readonly suggestions = signal<PayerSuggestion[]>([]);
  readonly loadingSuggest = signal(false);

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
