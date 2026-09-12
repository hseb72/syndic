import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { ApiService, type BalanceResult, type JournalLine } from '../core/api.service';
import { AuthService } from '../core/auth.service';

const COP_STORAGE_KEY = 'syndic.copId';
const EX_STORAGE_KEY = 'syndic.exId';

@Component({
  selector: 'app-accounting',
  imports: [TranslocoModule, DecimalPipe],
  template: `
    <ng-container *transloco="let t">
      @if (!copId() || !exId()) {
        <div class="card"><div class="empty">{{ t('coprop.none') }}</div></div>
      } @else {
        <div class="card">
          <div class="card-head">
            <div>
              <h2>{{ t('acc.balance') }}</h2>
              <div class="hint">{{ t('acc.hint') }}</div>
            </div>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
              @if (balance(); as b) {
                <span class="pill" [class.good]="b.balanced" [class.critical]="!b.balanced">
                  {{ b.balanced ? t('acc.balanced') : t('acc.unbalanced') }}
                </span>
              }
              @if (auth.isBureau()) {
                <button class="btn" type="button" [disabled]="generating()" (click)="generate()">{{ t('acc.generate') }}</button>
              }
            </div>
          </div>

          @if (balance(); as b) {
            @if (b.rows.length === 0) {
              <div class="empty">{{ t('acc.empty') }}</div>
            } @else {
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{{ t('acc.account') }}</th>
                      <th class="num">{{ t('acc.debit') }}</th>
                      <th class="num">{{ t('acc.credit') }}</th>
                      <th class="num">{{ t('acc.solde') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of b.rows; track r.number) {
                      <tr>
                        <td>{{ r.number }} · {{ r.name }}</td>
                        <td class="num">{{ r.debit | number: '1.2-2' }}</td>
                        <td class="num">{{ r.credit | number: '1.2-2' }}</td>
                        <td class="num" style="font-weight:600;">{{ r.balance | number: '1.2-2' }}</td>
                      </tr>
                    }
                  </tbody>
                  <tfoot>
                    <tr style="border-top:2px solid var(--line-strong);">
                      <td style="font-weight:700;">{{ t('acc.total') }}</td>
                      <td class="num" style="font-weight:700;">{{ b.totalDebit | number: '1.2-2' }}</td>
                      <td class="num" style="font-weight:700;">{{ b.totalCredit | number: '1.2-2' }}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            }
          }
        </div>

        @if (journal().length > 0) {
          <div class="card">
            <div class="card-head"><h2>{{ t('acc.journal') }}</h2></div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{{ t('th.date') }}</th>
                    <th>{{ t('field.name') }}</th>
                    <th>{{ t('acc.account') }}</th>
                    <th class="num">{{ t('acc.debit') }}</th>
                    <th class="num">{{ t('acc.credit') }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (l of journal(); track $index) {
                    <tr>
                      <td>{{ l.entryDate }}</td>
                      <td>{{ l.description }}</td>
                      <td>{{ l.account }}</td>
                      <td class="num">{{ l.debit ? (l.debit | number: '1.2-2') : '' }}</td>
                      <td class="num">{{ l.credit ? (l.credit | number: '1.2-2') : '' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      }
    </ng-container>
  `,
})
export class AccountingComponent implements OnInit {
  private api = inject(ApiService);
  readonly auth = inject(AuthService);

  readonly copId = signal<string | null>(null);
  readonly exId = signal<string | null>(null);
  readonly balance = signal<BalanceResult | null>(null);
  readonly journal = signal<JournalLine[]>([]);
  readonly generating = signal(false);

  ngOnInit(): void {
    let cop: string | null = null;
    let ex: string | null = null;
    try {
      cop = localStorage.getItem(COP_STORAGE_KEY);
      ex = localStorage.getItem(EX_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.copId.set(cop);
    this.exId.set(ex);
    if (cop && ex) this.load();
  }

  private load(): void {
    const cop = this.copId();
    const ex = this.exId();
    if (!cop || !ex) return;
    this.api.getBalance(cop, ex).subscribe({ next: (b) => this.balance.set(b) });
    this.api.getJournal(cop, ex).subscribe({ next: (j) => this.journal.set(j) });
  }

  generate(): void {
    const cop = this.copId();
    const ex = this.exId();
    if (!cop || !ex) return;
    this.generating.set(true);
    this.api.generateAccounting(cop, ex).subscribe({
      next: (res) => {
        this.balance.set(res);
        this.generating.set(false);
        this.api.getJournal(cop, ex).subscribe({ next: (j) => this.journal.set(j) });
      },
      error: () => this.generating.set(false),
    });
  }
}
