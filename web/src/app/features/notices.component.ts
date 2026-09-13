import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { ApiService, type NoticeLine, type PaymentNotice } from '../core/api.service';

const COP_STORAGE_KEY = 'syndic.copId';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function plusDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

@Component({
  selector: 'app-notices',
  imports: [TranslocoModule, ReactiveFormsModule, DecimalPipe],
  template: `
    <ng-container *transloco="let t">
      @if (!copId()) {
        <div class="card"><div class="empty">{{ t('coprop.none') }}</div></div>
      } @else {
        <div class="card">
          <div class="card-head">
            <div>
              <h2>{{ t('notices.title') }}</h2>
              <div class="hint">{{ t('notices.hint') }}</div>
            </div>
          </div>
          <form class="form-grid" [formGroup]="genForm" (ngSubmit)="generate()" style="align-items:end;">
            <div class="field">
              <label for="n-label">{{ t('notices.label') }}</label>
              <input id="n-label" type="text" formControlName="label" />
            </div>
            <div class="field">
              <label for="n-issue">{{ t('notices.issueDate') }}</label>
              <input id="n-issue" type="date" formControlName="issueDate" />
            </div>
            <div class="field">
              <label for="n-due">{{ t('notices.dueDate') }}</label>
              <input id="n-due" type="date" formControlName="dueDate" />
            </div>
            <div class="form-actions" style="margin:0;">
              <button class="btn primary" type="submit" [disabled]="genForm.invalid || saving()">{{ t('notices.generate') }}</button>
            </div>
          </form>
          @if (genResult() !== null) {
            <div class="banner tip" style="margin-top:10px;">{{ t('notices.generated', { n: genResult() }) }}</div>
          }
        </div>

        <div class="card">
          <div class="card-head"><h2>{{ t('notices.list') }}</h2></div>
          @if (notices().length === 0) {
            <div class="empty">{{ t('notices.empty') }}</div>
          } @else {
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{{ t('th.owner') }}</th>
                    <th>{{ t('notices.issueDate') }}</th>
                    <th class="num">{{ t('budget.total') }}</th>
                    <th class="num">{{ t('th.paid') }}</th>
                    <th class="num">{{ t('cash.remaining') }}</th>
                    <th>{{ t('th.status') }}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (n of notices(); track n.id) {
                    <tr>
                      <td>{{ n.personName }}</td>
                      <td>{{ n.issueDate }}</td>
                      <td class="num">{{ n.total | number: '1.2-2' }} €</td>
                      <td class="num good">{{ n.paid | number: '1.2-2' }}</td>
                      <td class="num" [class.critical]="n.remaining > 0">{{ n.remaining | number: '1.2-2' }}</td>
                      <td>
                        <span class="pill" [class.good]="n.remaining <= 0 && n.status === 'ISSUED'" [class.warning]="n.remaining > 0" [class.neutral]="n.status === 'CANCELLED'">
                          {{ n.status === 'CANCELLED' ? t('notices.cancelled') : n.remaining <= 0 ? t('notices.paid') : t('notices.open') }}
                        </span>
                      </td>
                      <td style="text-align:right; white-space:nowrap;">
                        <button class="btn sm ghost" type="button" (click)="toggle(n)">{{ t('notices.detail') }}</button>
                        @if (n.status === 'ISSUED' && n.remaining > 0) {
                          <button class="btn sm primary" type="button" [disabled]="saving()" (click)="pay(n)">{{ t('notices.markPaid') }}</button>
                          <button class="btn sm ghost danger" type="button" [disabled]="saving()" (click)="cancel(n)">{{ t('btn.cancel') }}</button>
                        }
                      </td>
                    </tr>
                    @if (openId() === n.id) {
                      <tr>
                        <td colspan="7" style="background:var(--surface-2);">
                          <div style="padding:6px 4px;">
                            <div class="hint" style="margin-bottom:6px;">{{ n.label }} · {{ t('notices.dueDate') }} {{ n.dueDate }}</div>
                            <table style="width:100%;">
                              <thead><tr><th>{{ t('th.nature') }}</th><th>{{ t('mine.exercise') }}</th><th>{{ t('th.lot') }}</th><th class="num">{{ t('th.amount') }}</th><th class="num">{{ t('cash.remaining') }}</th></tr></thead>
                              <tbody>
                                @for (l of lines(); track l.receivableId) {
                                  <tr>
                                    <td><span class="pill neutral">{{ t('recnat.' + l.nature) }}</span></td>
                                    <td>{{ l.exercise || '—' }}</td>
                                    <td>{{ l.lotNumber }}</td>
                                    <td class="num">{{ l.amount | number: '1.2-2' }}</td>
                                    <td class="num" style="font-weight:600;">{{ l.remaining | number: '1.2-2' }}</td>
                                  </tr>
                                }
                              </tbody>
                              <tfoot><tr style="border-top:2px solid var(--line-strong);"><td colspan="3" style="font-weight:700;">{{ t('notices.totalDue') }}</td><td class="num" style="font-weight:700;">{{ n.total | number: '1.2-2' }} €</td><td></td></tr></tfoot>
                            </table>
                          </div>
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }
    </ng-container>
  `,
})
export class NoticesComponent implements OnInit {
  private api = inject(ApiService);
  private transloco = inject(TranslocoService);

  readonly copId = signal<string | null>(null);
  readonly notices = signal<PaymentNotice[]>([]);
  readonly openId = signal<string | null>(null);
  readonly lines = signal<NoticeLine[]>([]);
  readonly saving = signal(false);
  readonly genResult = signal<number | null>(null);

  readonly genForm = new FormGroup({
    label: new FormControl('Avis de paiement', { nonNullable: true, validators: [Validators.required] }),
    issueDate: new FormControl(todayIso(), { nonNullable: true, validators: [Validators.required] }),
    dueDate: new FormControl(plusDaysIso(30), { nonNullable: true, validators: [Validators.required] }),
  });

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
    this.api.listPaymentNotices(cop).subscribe({ next: (n) => this.notices.set(n) });
  }

  generate(): void {
    const cop = this.copId();
    if (!cop || this.genForm.invalid) return;
    this.saving.set(true);
    this.genResult.set(null);
    this.api.generateNotices(cop, this.genForm.getRawValue()).subscribe({
      next: (r) => {
        this.genResult.set(r.created);
        this.saving.set(false);
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }

  toggle(n: PaymentNotice): void {
    if (this.openId() === n.id) {
      this.openId.set(null);
      return;
    }
    const cop = this.copId();
    if (!cop) return;
    this.openId.set(n.id);
    this.lines.set([]);
    this.api.getNoticeLines(cop, n.id).subscribe({ next: (l) => this.lines.set(l) });
  }

  pay(n: PaymentNotice): void {
    const cop = this.copId();
    if (!cop) return;
    this.saving.set(true);
    this.api.payNotice(cop, n.id, { paymentDate: todayIso() }).subscribe({
      next: () => {
        this.saving.set(false);
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }

  cancel(n: PaymentNotice): void {
    const cop = this.copId();
    if (!cop) return;
    if (!confirm(this.transloco.translate('notices.confirmCancel'))) return;
    this.saving.set(true);
    this.api.cancelNotice(cop, n.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }
}
