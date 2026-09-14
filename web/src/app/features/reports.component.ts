import { Component, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { ApiService, type BudgetResult, type RegularisationReport } from '../core/api.service';
import { CopropertyContextService } from '../core/coproperty-context.service';
import { ExerciseContextService } from '../core/exercise-context.service';

@Component({
  selector: 'app-reports',
  imports: [TranslocoModule, DecimalPipe],
  template: `
    <ng-container *transloco="let t">
      @if (!copId()) {
        <div class="card"><div class="empty">{{ t('coprop.none') }}</div></div>
      } @else {
        <div class="card">
          <div class="card-head"><h2>{{ t('reports.title') }}</h2></div>
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
export class ReportsComponent {
  private api = inject(ApiService);
  private copCtx = inject(CopropertyContextService);
  private exCtx = inject(ExerciseContextService);

  readonly copId = this.copCtx.currentId;
  readonly exId = this.exCtx.currentId;
  readonly exercises = this.exCtx.exercises;
  readonly budget = signal<BudgetResult | null>(null);
  readonly report = signal<RegularisationReport | null>(null);

  constructor() {
    effect(() => {
      const cop = this.copCtx.currentId();
      const ex = this.exCtx.currentId();
      this.budget.set(null);
      this.report.set(null);
      if (!cop || !ex) return;
      this.api.getBudget(cop, ex).subscribe({ next: (b) => this.budget.set(b) });
      this.api.getRegularisationReport(cop, ex).subscribe({ next: (r) => this.report.set(r) });
    });
  }

  num(n: string | number): number {
    return Number(n);
  }
}
