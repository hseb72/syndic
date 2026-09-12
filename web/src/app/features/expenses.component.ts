import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import {
  ApiService,
  type ChargesResult,
  type Exercise,
  type InvoiceRow,
  type Supplier,
} from '../core/api.service';

const COP_STORAGE_KEY = 'syndic.copId';
const EX_STORAGE_KEY = 'syndic.exId';

@Component({
  selector: 'app-expenses',
  imports: [TranslocoModule, ReactiveFormsModule, DecimalPipe],
  templateUrl: './expenses.component.html',
})
export class ExpensesComponent implements OnInit {
  private api = inject(ApiService);

  readonly copId = signal<string | null>(null);
  readonly exercises = signal<Exercise[]>([]);
  readonly selectedExId = signal<string | null>(null);
  readonly suppliers = signal<Supplier[]>([]);
  readonly invoices = signal<InvoiceRow[]>([]);
  readonly charges = signal<ChargesResult | null>(null);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly showExForm = signal(false);
  readonly showInvoiceForm = signal(false);

  readonly selectedExercise = computed(() => this.exercises().find((e) => e.id === this.selectedExId()) ?? null);

  readonly exForm = new FormGroup({
    label: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    startDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    endDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  readonly invoiceForm = new FormGroup({
    supplierName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    invoiceDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    category: new FormControl('', { nonNullable: true }),
    isWater: new FormControl(false, { nonNullable: true }),
    amount: new FormControl<number | null>(null),
    subscription: new FormControl<number | null>(null),
    consumption: new FormControl<number | null>(null),
  });

  ngOnInit(): void {
    let cop: string | null = null;
    try {
      cop = localStorage.getItem(COP_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.copId.set(cop);
    if (cop) this.loadExercises(cop);
    else this.loading.set(false);
  }

  private loadExercises(cop: string): void {
    this.loading.set(true);
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
    this.api.listSuppliers(cop).subscribe({ next: (s) => this.suppliers.set(s) });
  }

  selectExercise(id: string): void {
    this.selectedExId.set(id);
    this.charges.set(null);
    try {
      localStorage.setItem(EX_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
    this.loadInvoices();
  }

  private loadInvoices(): void {
    const cop = this.copId();
    const ex = this.selectedExId();
    if (!cop || !ex) return;
    this.api.listInvoices(cop, ex).subscribe({ next: (rows) => this.invoices.set(rows) });
  }

  submitExercise(): void {
    const cop = this.copId();
    if (!cop || this.exForm.invalid) return;
    this.saving.set(true);
    const v = this.exForm.getRawValue();
    this.api.createExercise(cop, { label: v.label, startDate: v.startDate, endDate: v.endDate }).subscribe({
      next: (ex) => {
        this.exercises.update((list) => [...list, ex]);
        this.exForm.reset();
        this.showExForm.set(false);
        this.saving.set(false);
        this.selectExercise(ex.id);
      },
      error: () => this.saving.set(false),
    });
  }

  async submitInvoice(): Promise<void> {
    const cop = this.copId();
    const ex = this.selectedExId();
    if (!cop || !ex || this.invoiceForm.invalid) return;
    this.saving.set(true);
    try {
      const v = this.invoiceForm.getRawValue();

      // Fournisseur : réutilise l'existant (par nom) ou le crée.
      const existing = this.suppliers().find((s) => s.name.toLowerCase() === v.supplierName.trim().toLowerCase());
      const supplier = existing ?? (await firstValueFrom(this.api.createSupplier(cop, v.supplierName.trim())));
      if (!existing) this.suppliers.update((list) => [...list, supplier]);

      const period = this.selectedExercise()?.label ?? undefined;
      let amount: number;
      let distributions;
      if (v.isWater) {
        const sub = Number(v.subscription ?? 0);
        const cons = Number(v.consumption ?? 0);
        amount = Math.round((sub + cons) * 100) / 100;
        distributions = [
          { keyCode: 'GENERAL' as const, label: 'Abonnement', amount: sub },
          { keyCode: 'EAU' as const, label: 'Consommation', amount: cons, periodLabel: period },
        ];
      } else {
        amount = Number(v.amount ?? 0);
      }

      await firstValueFrom(
        this.api.createInvoice(cop, {
          supplierId: supplier.id,
          exerciseId: ex,
          invoiceDate: v.invoiceDate,
          amount,
          category: v.category || null,
          distributions,
        }),
      );
      this.invoiceForm.reset({ isWater: false });
      this.showInvoiceForm.set(false);
      this.loadInvoices();
      this.charges.set(null);
    } finally {
      this.saving.set(false);
    }
  }

  computeCharges(): void {
    const cop = this.copId();
    const ex = this.selectedExId();
    if (!cop || !ex) return;
    this.saving.set(true);
    this.api.getCharges(cop, ex).subscribe({
      next: (c) => {
        this.charges.set(c);
        this.saving.set(false);
      },
      error: () => this.saving.set(false),
    });
  }

  num(n: string | number): number {
    return Number(n);
  }
}
