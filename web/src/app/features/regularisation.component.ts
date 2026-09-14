import { Component, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { ApiService, type RegularisationResult } from '../core/api.service';
import { CopropertyContextService } from '../core/coproperty-context.service';
import { ExerciseContextService } from '../core/exercise-context.service';

@Component({
  selector: 'app-regularisation',
  imports: [TranslocoModule, ReactiveFormsModule, DecimalPipe],
  templateUrl: './regularisation.component.html',
})
export class RegularisationComponent {
  private api = inject(ApiService);
  private copCtx = inject(CopropertyContextService);
  private exCtx = inject(ExerciseContextService);

  readonly copId = this.copCtx.currentId;
  readonly exercises = this.exCtx.exercises;
  readonly result = signal<RegularisationResult | null>(null);
  readonly loading = signal(true);
  readonly computing = signal(false);
  readonly generating = signal(false);
  readonly genResult = signal<{ receivablesCreated: number } | null>(null);

  readonly form = new FormGroup({
    exerciseN1Id: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    provisionsNextTotal: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(0)] }),
    workFundNextTotal: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(0)] }),
  });

  readonly genForm = new FormGroup({
    label: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    issueDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    dueDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  constructor() {
    // Exercices fournis par l'entête ; on présélectionne l'exercice courant à
    // régulariser (N-1) et on repart à zéro quand la copropriété change.
    effect(() => {
      const cop = this.copCtx.currentId();
      const rows = this.exCtx.exercises();
      this.loading.set(false);
      this.result.set(null);
      this.genResult.set(null);
      if (!cop) return;
      const cur = this.exCtx.currentId();
      const pick = rows.find((e) => e.id === cur) ?? rows[0];
      if (pick) this.form.controls.exerciseN1Id.setValue(pick.id);
    });
  }

  compute(): void {
    const cop = this.copId();
    if (!cop || this.form.invalid) return;
    this.computing.set(true);
    const v = this.form.getRawValue();
    this.api
      .computeRegularisation(cop, {
        exerciseN1Id: v.exerciseN1Id,
        provisionsNextTotal: Number(v.provisionsNextTotal),
        workFundNextTotal: Number(v.workFundNextTotal),
      })
      .subscribe({
        next: (r) => {
          this.result.set(r);
          this.genResult.set(null);
          this.computing.set(false);
        },
        error: () => this.computing.set(false),
      });
  }

  generate(): void {
    const cop = this.copId();
    if (!cop || this.form.invalid || this.genForm.invalid) return;
    this.generating.set(true);
    const v = this.form.getRawValue();
    const g = this.genForm.getRawValue();
    this.api
      .generateRegularisation(cop, {
        exerciseN1Id: v.exerciseN1Id,
        provisionsNextTotal: Number(v.provisionsNextTotal),
        workFundNextTotal: Number(v.workFundNextTotal),
        label: g.label,
        issueDate: g.issueDate,
        dueDate: g.dueDate,
      })
      .subscribe({
        next: (res) => {
          this.genResult.set({ receivablesCreated: res.receivablesCreated });
          this.generating.set(false);
        },
        error: () => this.generating.set(false),
      });
  }
}
