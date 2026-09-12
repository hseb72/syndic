import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { ApiService, type Exercise, type RegularisationResult } from '../core/api.service';

const COP_STORAGE_KEY = 'syndic.copId';

@Component({
  selector: 'app-regularisation',
  imports: [TranslocoModule, ReactiveFormsModule, DecimalPipe],
  templateUrl: './regularisation.component.html',
})
export class RegularisationComponent implements OnInit {
  private api = inject(ApiService);

  readonly copId = signal<string | null>(null);
  readonly exercises = signal<Exercise[]>([]);
  readonly result = signal<RegularisationResult | null>(null);
  readonly loading = signal(true);
  readonly computing = signal(false);

  readonly form = new FormGroup({
    exerciseN1Id: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    provisionsNextTotal: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(0)] }),
    workFundNextTotal: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(0)] }),
  });

  ngOnInit(): void {
    let cop: string | null = null;
    try {
      cop = localStorage.getItem(COP_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.copId.set(cop);
    if (!cop) {
      this.loading.set(false);
      return;
    }
    this.api.listExercises(cop).subscribe({
      next: (rows) => {
        this.exercises.set(rows);
        if (rows[0]) this.form.controls.exerciseN1Id.setValue(rows[0].id);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
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
          this.computing.set(false);
        },
        error: () => this.computing.set(false),
      });
  }
}
