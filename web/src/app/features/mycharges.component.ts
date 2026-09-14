import { Component, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { ApiService, type MySummary } from '../core/api.service';
import { CopropertyContextService } from '../core/coproperty-context.service';
import { ExerciseContextService } from '../core/exercise-context.service';

@Component({
  selector: 'app-mycharges',
  imports: [TranslocoModule, DecimalPipe],
  template: `
    <ng-container *transloco="let t">
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
                      <th>{{ t('th.nature') }}</th>
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
                        <td><span class="pill neutral">{{ t('recnat.' + r.nature) }}</span></td>
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
      } @else if (!copId()) {
        <div class="card"><div class="empty">{{ t('coprop.none') }}</div></div>
      }
    </ng-container>
  `,
})
export class MyChargesComponent {
  private api = inject(ApiService);
  private copCtx = inject(CopropertyContextService);
  private exCtx = inject(ExerciseContextService);
  readonly data = signal<MySummary | null>(null);
  readonly copId = this.copCtx.currentId;

  constructor() {
    effect(() => {
      const cop = this.copCtx.currentId();
      const ex = this.exCtx.currentId();
      this.data.set(null);
      if (!cop) return;
      this.api.getMySummary(cop, ex ?? undefined).subscribe({ next: (d) => this.data.set(d) });
    });
  }

  lotsLabel(d: MySummary): string {
    return d.lots.map((l) => l.lotNumber).join(', ') || '—';
  }

  num(n: string | number): number {
    return Number(n);
  }
}
