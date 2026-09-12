import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService, type Exercise, type FundCall, type ReceivableRow } from '../core/api.service';

const COP_STORAGE_KEY = 'syndic.copId';
const EX_STORAGE_KEY = 'syndic.exId';

@Component({
  selector: 'app-cash',
  imports: [TranslocoModule, ReactiveFormsModule, DecimalPipe],
  templateUrl: './cash.component.html',
})
export class CashComponent implements OnInit {
  private api = inject(ApiService);

  readonly copId = signal<string | null>(null);
  readonly exercises = signal<Exercise[]>([]);
  readonly selectedExId = signal<string | null>(null);
  readonly fundCalls = signal<FundCall[]>([]);
  readonly receivables = signal<ReceivableRow[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly showCallForm = signal(false);

  readonly callForm = new FormGroup({
    label: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    issueDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    dueDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    totalAmount: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(0.01)] }),
  });

  ngOnInit(): void {
    let cop: string | null = null;
    try {
      cop = localStorage.getItem(COP_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.copId.set(cop);
    if (cop) {
      this.api.listExercises(cop).subscribe({
        next: (rows) => {
          this.exercises.set(rows);
          this.loading.set(false);
          let stored: string | null = null;
          try {
            stored = localStorage.getItem(EX_STORAGE_KEY);
          } catch {
            /* ignore */
          }
          const initial = rows.find((e) => e.id === stored) ?? rows[0];
          if (initial) this.selectExercise(initial.id);
        },
        error: () => this.loading.set(false),
      });
    } else {
      this.loading.set(false);
    }
  }

  selectExercise(id: string): void {
    this.selectedExId.set(id);
    try {
      localStorage.setItem(EX_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
    this.reload();
  }

  private reload(): void {
    const cop = this.copId();
    const ex = this.selectedExId();
    if (!cop || !ex) return;
    this.api.listFundCalls(cop, ex).subscribe({ next: (c) => this.fundCalls.set(c) });
    this.api.listReceivables(cop, ex).subscribe({ next: (r) => this.receivables.set(r) });
  }

  submitCall(): void {
    const cop = this.copId();
    const ex = this.selectedExId();
    if (!cop || !ex || this.callForm.invalid) return;
    this.saving.set(true);
    const v = this.callForm.getRawValue();
    this.api
      .createProvisionCall(cop, {
        exerciseId: ex,
        label: v.label,
        issueDate: v.issueDate,
        dueDate: v.dueDate,
        totalAmount: Number(v.totalAmount),
      })
      .subscribe({
        next: () => {
          this.callForm.reset();
          this.showCallForm.set(false);
          this.saving.set(false);
          this.reload();
        },
        error: () => this.saving.set(false),
      });
  }

  async payRemaining(row: ReceivableRow): Promise<void> {
    const cop = this.copId();
    if (!cop || row.remaining <= 0) return;
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.api.createPayment(cop, {
          personId: row.personId,
          paymentDate: new Date().toISOString().slice(0, 10),
          amount: row.remaining,
          autoAllocate: true,
        }),
      );
      this.reload();
    } finally {
      this.saving.set(false);
    }
  }

  num(n: string | number): number {
    return Number(n);
  }
}
