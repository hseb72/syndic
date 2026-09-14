import { Component, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService, type BudgetResult, type Exercise, type FundCall, type ReceivableRow } from '../core/api.service';
import { CopropertyContextService } from '../core/coproperty-context.service';
import { ExerciseContextService } from '../core/exercise-context.service';

interface CarryForwardRow {
  id: string;
  lotNumber: string;
  kind: string;
  amount: string;
}

@Component({
  selector: 'app-cash',
  imports: [TranslocoModule, ReactiveFormsModule, DecimalPipe],
  templateUrl: './cash.component.html',
})
export class CashComponent {
  private api = inject(ApiService);
  private copCtx = inject(CopropertyContextService);
  private exCtx = inject(ExerciseContextService);

  readonly copId = this.copCtx.currentId;
  readonly exercises = this.exCtx.exercises;
  readonly selectedExId = this.exCtx.currentId;
  readonly fundCalls = signal<FundCall[]>([]);
  readonly receivables = signal<ReceivableRow[]>([]);
  readonly carryForward = signal<CarryForwardRow[]>([]);
  readonly budget = signal<BudgetResult | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly showCallForm = signal(false);
  readonly showBudget = signal(false);

  readonly budgetForm = new FormGroup({
    category: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    keyCode: new FormControl<'GENERAL' | 'EAU'>('GENERAL', { nonNullable: true }),
    plannedAmount: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(0)] }),
  });

  readonly selectedExercise = this.exCtx.current;

  readonly callForm = new FormGroup({
    label: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    issueDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    dueDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    totalAmount: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(0.01)] }),
  });

  constructor() {
    // Copropriété + exercice pilotés par l'entête : on recharge à chaque changement.
    effect(() => {
      const cop = this.copCtx.currentId();
      const ex = this.exCtx.currentId();
      this.loading.set(false);
      if (!cop || !ex) {
        this.fundCalls.set([]);
        this.receivables.set([]);
        this.carryForward.set([]);
        this.budget.set(null);
        return;
      }
      this.api.listFundCalls(cop, ex).subscribe({ next: (c) => this.fundCalls.set(c) });
      this.api.listReceivables(cop, ex).subscribe({ next: (r) => this.receivables.set(r) });
      this.api.listCarryForward(cop, ex).subscribe({ next: (cf) => this.carryForward.set(cf) });
      this.api.getBudget(cop, ex).subscribe({ next: (b) => this.budget.set(b) });
    });
  }

  private reload(): void {
    // Force un rechargement (après une écriture) en re-sélectionnant l'exercice courant.
    const cop = this.copCtx.currentId();
    const ex = this.exCtx.currentId();
    if (!cop || !ex) return;
    this.api.listFundCalls(cop, ex).subscribe({ next: (c) => this.fundCalls.set(c) });
    this.api.listReceivables(cop, ex).subscribe({ next: (r) => this.receivables.set(r) });
    this.api.listCarryForward(cop, ex).subscribe({ next: (cf) => this.carryForward.set(cf) });
    this.api.getBudget(cop, ex).subscribe({ next: (b) => this.budget.set(b) });
  }

  submitBudgetLine(): void {
    const cop = this.copId();
    const ex = this.selectedExId();
    if (!cop || !ex || this.budgetForm.invalid) return;
    this.saving.set(true);
    const v = this.budgetForm.getRawValue();
    this.api
      .addBudgetLine(cop, ex, { category: v.category, keyCode: v.keyCode, plannedAmount: Number(v.plannedAmount) })
      .subscribe({
        next: (b) => {
          this.budget.set(b);
          this.budgetForm.reset({ category: '', keyCode: 'GENERAL', plannedAmount: null });
          this.saving.set(false);
        },
        error: () => this.saving.set(false),
      });
  }

  voteBudget(): void {
    const cop = this.copId();
    const ex = this.selectedExId();
    if (!cop || !ex) return;
    this.saving.set(true);
    this.api.voteBudget(cop, ex).subscribe({
      next: (b) => {
        this.budget.set(b);
        this.saving.set(false);
      },
      error: () => this.saving.set(false),
    });
  }

  private updateExercise(updated: Exercise): void {
    this.exCtx.updateLocal(updated);
  }

  closeExercise(): void {
    const cop = this.copId();
    const ex = this.selectedExId();
    if (!cop || !ex) return;
    this.saving.set(true);
    this.api.closeExercise(cop, ex).subscribe({
      next: (updated) => {
        this.updateExercise(updated);
        this.saving.set(false);
        this.reload();
      },
      error: () => this.saving.set(false),
    });
  }

  reopenExercise(): void {
    const cop = this.copId();
    const ex = this.selectedExId();
    if (!cop || !ex) return;
    this.saving.set(true);
    this.api.reopenExercise(cop, ex).subscribe({
      next: (updated) => {
        this.updateExercise(updated);
        this.saving.set(false);
        this.reload();
      },
      error: () => this.saving.set(false),
    });
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

  /** Fixe le montant définitif d'une créance (situation de départ). */
  saveReceivableAmount(row: ReceivableRow, value: string): void {
    const cop = this.copId();
    const n = Number(String(value).replace(/[\s ]/g, '').replace(',', '.'));
    if (!cop || !Number.isFinite(n) || n <= 0 || Math.abs(n - Number(row.amount)) < 0.005) return;
    this.saving.set(true);
    this.api.updateReceivableAmount(cop, row.id, Math.round(n * 100) / 100).subscribe({
      next: () => {
        this.saving.set(false);
        this.reload();
      },
      error: () => {
        this.saving.set(false);
        this.reload(); // rétablit la valeur serveur si rejet
      },
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
