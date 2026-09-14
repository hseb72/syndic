import { Component, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { ApiService, type DashboardSummary } from '../core/api.service';
import { CopropertyContextService } from '../core/coproperty-context.service';
import { ExerciseContextService } from '../core/exercise-context.service';

@Component({
  selector: 'app-dashboard',
  imports: [TranslocoModule, DecimalPipe],
  template: `
    <ng-container *transloco="let t">
      @if (!copId()) {
        <div class="card"><div class="empty">{{ t('dashboard.noData') }}</div></div>
      } @else if (data()) {
        @if (data()!; as d) {
        <div class="grid stats">
          <div class="card stat">
            <div class="label">{{ t('dashboard.cash') }}</div>
            <div class="value num" [class.good]="d.cashBalance >= 0" [class.critical]="d.cashBalance < 0">
              {{ d.cashBalance | number: '1.2-2' }} €
            </div>
          </div>
          <div class="card stat">
            <div class="label">{{ t('dashboard.unpaid') }}</div>
            <div class="value num" [class.critical]="d.unpaidTotal > 0">{{ d.unpaidTotal | number: '1.2-2' }} €</div>
            <div class="foot">{{ d.unpaidCount }} · {{ t('cash.receivables') }}</div>
          </div>
          <div class="card stat">
            <div class="label">{{ t('dashboard.worklist') }}</div>
            <div class="value num">{{ d.worklistCount }}</div>
          </div>
          <div class="card stat">
            <div class="label">{{ t('dashboard.lots') }}</div>
            <div class="value num">{{ d.lotCount }}</div>
            <div class="foot">{{ d.totalTantiemes }} {{ t('th.tantiemes') }}</div>
          </div>
        </div>

        @if (d.exercise && d.budgetVoted !== null) {
          <div class="card">
            <div class="card-head">
              <h2>{{ t('dashboard.budgetTitle', { y: d.exercise.label }) }}</h2>
              <div class="hint">{{ consumedPct(d) | number: '1.0-0' }} % {{ t('dashboard.consumed') }}</div>
            </div>
            <div class="kv"><span class="k">{{ t('dashboard.budgetVoted') }}</span><span class="v num">{{ d.budgetVoted | number: '1.2-2' }} €</span></div>
            <div class="kv"><span class="k">{{ t('dashboard.expensesReal') }}</span><span class="v num">{{ (d.expenses ?? 0) | number: '1.2-2' }} €</span></div>
            <div class="bar-track" role="img" [attr.aria-label]="(consumedPct(d) | number: '1.0-0') + '%'">
              <div class="bar-fill" [style.width.%]="barWidth(d)"></div>
            </div>
            @if (d.budgetByCategory.length > 0) {
              <div class="section-title">{{ t('dashboard.lines') }}</div>
              @for (line of d.budgetByCategory; track line.category) {
                <div class="kv"><span class="k">{{ line.category }}</span><span class="v num">{{ line.planned | number: '1.2-2' }} €</span></div>
              }
            }
          </div>
        }
        }
      }
    </ng-container>
  `,
  styles: [
    `
      .bar-track { height: 12px; border-radius: 999px; background: var(--bar-prevu); overflow: hidden; margin-top: 12px; }
      .bar-fill { height: 100%; background: var(--bar-realise); border-radius: 999px; }
      .section-title { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 700; margin: 16px 0 8px; }
      .kv { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
      .kv:last-child { border-bottom: none; }
      .kv .k { color: var(--ink-soft); }
      .kv .v { font-weight: 600; }
    `,
  ],
})
export class DashboardComponent {
  private api = inject(ApiService);
  private copCtx = inject(CopropertyContextService);
  private exCtx = inject(ExerciseContextService);
  readonly copId = this.copCtx.currentId;
  readonly data = signal<DashboardSummary | null>(null);

  constructor() {
    // Recharge dès que la copropriété ou l'exercice courant change (entête).
    effect(() => {
      const cop = this.copCtx.currentId();
      const ex = this.exCtx.currentId();
      if (!cop) {
        this.data.set(null);
        return;
      }
      this.api.getDashboard(cop, ex ?? undefined).subscribe({ next: (d) => this.data.set(d) });
    });
  }

  consumedPct(d: DashboardSummary): number {
    if (!d.budgetVoted || d.budgetVoted === 0) return 0;
    return ((d.expenses ?? 0) / d.budgetVoted) * 100;
  }

  barWidth(d: DashboardSummary): number {
    return Math.min(100, Math.max(0, this.consumedPct(d)));
  }
}
