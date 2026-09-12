import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { ApiService, type BudgetResult, type Coproperty, type Exercise, type RegularisationReport } from '../core/api.service';

const COP_STORAGE_KEY = 'syndic.copId';
const EX_STORAGE_KEY = 'syndic.exId';

@Component({
  selector: 'app-reports',
  imports: [TranslocoModule, DecimalPipe],
  template: `
    <ng-container *transloco="let t">
      @if (!copId()) {
        <div class="card"><div class="empty">{{ t('coprop.none') }}</div></div>
      } @else {
        <div class="card">
          <div class="card-head">
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
              <h2>{{ t('reports.title') }}</h2>
              @if (coproperties().length > 1) {
                <select class="lang-select" [value]="copId()" (change)="selectCop($any($event.target).value)" style="min-width:180px;">
                  @for (c of coproperties(); track c.id) {
                    <option [value]="c.id" [selected]="c.id === copId()">{{ c.name }}</option>
                  }
                </select>
              }
              @if (exercises().length > 0) {
                <select class="lang-select" [value]="exId()" (change)="selectExercise($any($event.target).value)" style="min-width:140px;">
                  @for (e of exercises(); track e.id) {
                    <option [value]="e.id" [selected]="e.id === exId()">{{ e.label || (e.start_date + ' → ' + e.end_date) }}</option>
                  }
                </select>
              }
            </div>
          </div>
          <div class="hint">{{ t('reports.hint') }}</div>
        </div>

        @if (budget(); as b) {
          <div class="card">
            <div class="card-head"><h2>{{ t('reports.budget') }}</h2></div>
            @if (b.lines.length === 0) {
              <div class="empty">—</div>
            } @else {
              <div class="table-wrap">
                <table>
                  <thead><tr><th>{{ t('th.category') }}</th><th>{{ t('budget.key') }}</th><th class="num">{{ t('th.amount') }}</th></tr></thead>
                  <tbody>
                    @for (l of b.lines; track l.id) {
                      <tr><td>{{ l.category }}</td><td>{{ l.keyName }}</td><td class="num">{{ num(l.plannedAmount) | number: '1.2-2' }}</td></tr>
                    }
                  </tbody>
                  <tfoot><tr><td colspan="2" style="font-weight:700;">{{ t('budget.total') }}</td><td class="num" style="font-weight:700;">{{ b.total | number: '1.2-2' }} €</td></tr></tfoot>
                </table>
              </div>
            }
          </div>
        }

        <div class="card">
          <div class="card-head"><h2>{{ t('reports.regularisation') }}</h2></div>
          @if (report(); as r) {
            @if (!r.exists) {
              <div class="empty">{{ t('reports.none') }}</div>
            } @else {
              <div class="hint" style="margin-bottom:10px;">{{ r.label }} · {{ r.issueDate }}</div>
              <div class="table-wrap">
                <table>
                  <thead><tr><th>{{ t('th.lot') }}</th><th>{{ t('th.owner') }}</th><th class="num">{{ t('reg.colAppel') }}</th></tr></thead>
                  <tbody>
                    @for (row of r.rows; track row.lotNumber) {
                      <tr><td>{{ row.lotNumber }}</td><td>{{ row.ownerLabel || '—' }}</td><td class="num" style="font-weight:600;">{{ row.amount | number: '1.2-2' }} €</td></tr>
                    }
                  </tbody>
                  <tfoot><tr style="border-top:2px solid var(--line-strong);"><td colspan="2" style="font-weight:700;">{{ t('reg.total') }}</td><td class="num" style="font-weight:700;">{{ r.total | number: '1.2-2' }} €</td></tr></tfoot>
                </table>
              </div>
            }
          }
        </div>
      }
    </ng-container>
  `,
})
export class ReportsComponent implements OnInit {
  private api = inject(ApiService);

  readonly coproperties = signal<Coproperty[]>([]);
  readonly copId = signal<string | null>(null);
  readonly exId = signal<string | null>(null);
  readonly exercises = signal<Exercise[]>([]);
  readonly budget = signal<BudgetResult | null>(null);
  readonly report = signal<RegularisationReport | null>(null);

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
    this.exercises.set([]);
    this.budget.set(null);
    this.report.set(null);
    const ex = this.read(EX_STORAGE_KEY);
    this.api.listExercises(id).subscribe({
      next: (rows) => {
        this.exercises.set(rows);
        const initial = rows.find((e) => e.id === ex) ?? rows[0];
        if (initial) this.selectExercise(initial.id);
      },
    });
  }

  private read(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  selectExercise(id: string): void {
    this.exId.set(id);
    try {
      localStorage.setItem(EX_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
    const cop = this.copId();
    if (!cop) return;
    this.api.getBudget(cop, id).subscribe({ next: (b) => this.budget.set(b) });
    this.api.getRegularisationReport(cop, id).subscribe({ next: (r) => this.report.set(r) });
  }

  num(n: string | number): number {
    return Number(n);
  }
}
