import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { ApiService, type Coproperty, type MySummary } from '../core/api.service';

const COP_STORAGE_KEY = 'syndic.copId';
const EX_STORAGE_KEY = 'syndic.exId';

@Component({
  selector: 'app-mycharges',
  imports: [TranslocoModule, DecimalPipe],
  template: `
    <ng-container *transloco="let t">
      @if (coproperties().length > 1) {
        <div class="card">
          <div class="card-head">
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
              <h2>{{ t('coprop.select') }}</h2>
              <select class="lang-select" [value]="copId()" (change)="selectCop($any($event.target).value)" style="min-width:200px;">
                @for (c of coproperties(); track c.id) {
                  <option [value]="c.id" [selected]="c.id === copId()">{{ c.name }}</option>
                }
              </select>
            </div>
          </div>
        </div>
      }

      @if (data(); as d) {
        @if (!d.linked) {
          <div class="card"><div class="banner tip">{{ t('mine.notLinked') }}</div></div>
        } @else {
          <div class="card">
            <div class="card-head">
              <div>
                <h2>{{ t('mine.title') }}</h2>
                <div class="hint">{{ d.personName }} · {{ t('mine.lots') }} : {{ lotsLabel(d) }}</div>
              </div>
            </div>
            <div class="grid stats">
              <div class="card stat">
                <div class="label">{{ t('mine.due') }}</div>
                <div class="value num">{{ d.totals.due | number: '1.2-2' }} €</div>
              </div>
              <div class="card stat">
                <div class="label">{{ t('mine.paid') }}</div>
                <div class="value num good">{{ d.totals.paid | number: '1.2-2' }} €</div>
              </div>
              <div class="card stat">
                <div class="label">{{ t('mine.remaining') }}</div>
                <div class="value num" [class.critical]="d.totals.remaining > 0">{{ d.totals.remaining | number: '1.2-2' }} €</div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h2>{{ t('mine.title') }}</h2></div>
            @if (d.receivables.length === 0) {
              <div class="empty">{{ t('mine.empty') }}</div>
            } @else {
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{{ t('mine.exercise') }}</th>
                      <th>{{ t('th.lot') }}</th>
                      <th class="num">{{ t('th.amount') }}</th>
                      <th class="num">{{ t('th.paid') }}</th>
                      <th class="num">{{ t('mine.remaining') }}</th>
                      <th>{{ t('th.status') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of d.receivables; track r.id) {
                      <tr>
                        <td>{{ r.exercise }}</td>
                        <td>{{ r.lotNumber }}</td>
                        <td class="num">{{ num(r.amount) | number: '1.2-2' }}</td>
                        <td class="num">{{ num(r.paid) | number: '1.2-2' }}</td>
                        <td class="num" style="font-weight:600;">{{ r.remaining | number: '1.2-2' }}</td>
                        <td><span class="pill" [class.good]="r.status === 'PAID'" [class.warning]="r.status !== 'PAID'">{{ r.status }}</span></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }
      } @else if (coproperties().length === 0) {
        <div class="card"><div class="banner tip">{{ t('mine.notLinked') }}</div></div>
      }
    </ng-container>
  `,
})
export class MyChargesComponent implements OnInit {
  private api = inject(ApiService);
  readonly data = signal<MySummary | null>(null);
  readonly coproperties = signal<Coproperty[]>([]);
  readonly copId = signal<string | null>(null);

  ngOnInit(): void {
    this.api.listCoproperties().subscribe({
      next: (rows) => {
        this.coproperties.set(rows);
        const stored = this.read(COP_STORAGE_KEY);
        const initial = rows.find((c) => c.id === stored) ?? rows[0];
        if (initial) this.selectCop(initial.id);
      },
    });
  }

  selectCop(id: string): void {
    this.copId.set(id);
    try {
      localStorage.setItem(COP_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
    const ex = this.read(EX_STORAGE_KEY);
    this.data.set(null);
    this.api.getMySummary(id, ex ?? undefined).subscribe({ next: (d) => this.data.set(d) });
  }

  private read(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  lotsLabel(d: MySummary): string {
    return d.lots.map((l) => l.lotNumber).join(', ') || '—';
  }

  num(n: string | number): number {
    return Number(n);
  }
}
