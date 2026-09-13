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
  type LotOverviewRow,
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

  readonly lots = signal<LotOverviewRow[]>([]);
  readonly readings = signal<Record<string, number | null>>({});
  readonly readingsSaved = signal(false);
  readonly showReadings = signal(false);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly showExForm = signal(false);
  readonly showInvoiceForm = signal(false);
  readonly editingInv = signal<InvoiceRow | null>(null);

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
    fund: new FormControl<'COURANT' | 'TRAVAUX'>('COURANT', { nonNullable: true }),
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
    this.api.getOverview(cop).subscribe({ next: (o) => this.lots.set(o.lots) });
  }

  selectExercise(id: string): void {
    this.selectedExId.set(id);
    this.charges.set(null);
    this.readingsSaved.set(false);
    try {
      localStorage.setItem(EX_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
    this.loadInvoices();
    this.loadReadings();
  }

  private readingsPeriod(): string {
    return this.selectedExercise()?.label ?? '';
  }

  private loadReadings(): void {
    const cop = this.copId();
    const period = this.readingsPeriod();
    if (!cop || !period) return;
    this.api.getWaterReadings(cop, period).subscribe({
      next: (res) => {
        const map: Record<string, number | null> = {};
        for (const r of res.readings) map[r.lotId] = Number(r.consumption);
        this.readings.set(map);
      },
    });
  }

  setReading(lotId: string, value: string): void {
    const n = value === '' ? null : Number(value);
    this.readings.update((m) => ({ ...m, [lotId]: Number.isFinite(n as number) ? (n as number) : null }));
    this.readingsSaved.set(false);
  }

  saveReadings(): void {
    const cop = this.copId();
    const period = this.readingsPeriod();
    if (!cop || !period) return;
    this.saving.set(true);
    const map = this.readings();
    const rows = this.lots()
      .map((l) => ({ lotId: l.id, consumption: map[l.id] ?? 0 }))
      .filter((r) => r.consumption > 0);
    this.api.setWaterReadings(cop, period, rows).subscribe({
      next: () => {
        this.readingsSaved.set(true);
        this.saving.set(false);
      },
      error: () => this.saving.set(false),
    });
  }

  payInvoice(inv: InvoiceRow): void {
    const cop = this.copId();
    if (!cop) return;
    const remaining = Math.round((Number(inv.amount) - Number(inv.paidAmount)) * 100) / 100;
    if (remaining <= 0) return;
    this.saving.set(true);
    this.api
      .recordInvoicePayment(cop, inv.id, { paymentDate: new Date().toISOString().slice(0, 10), amount: remaining })
      .subscribe({
        next: () => {
          this.loadInvoices();
          this.saving.set(false);
        },
        error: () => this.saving.set(false),
      });
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

  startAdd(): void {
    this.editingInv.set(null);
    this.invoiceForm.reset({ isWater: false, fund: 'COURANT' });
    this.showInvoiceForm.set(true);
  }

  startEdit(inv: InvoiceRow): void {
    const cop = this.copId();
    if (!cop) return;
    this.editingInv.set(inv);
    this.showInvoiceForm.set(true);
    // Valeurs de base (scalaire) ; on complète avec la ventilation eau si besoin.
    this.invoiceForm.reset({
      supplierName: inv.supplierName,
      invoiceDate: inv.invoiceDate,
      category: inv.category ?? '',
      fund: inv.fund === 'TRAVAUX' ? 'TRAVAUX' : 'COURANT',
      isWater: false,
      amount: Number(inv.amount),
      subscription: null,
      consumption: null,
    });
    // Récupère la ventilation : si une portion « eau » existe, on rétablit le
    // mode eau (abonnement / consommation) pour pouvoir le corriger.
    this.api.getInvoice(cop, inv.id).subscribe({
      next: (detail) => {
        if (this.editingInv()?.id !== inv.id) return;
        const water = detail.distributions.find((d) => d.keyCode === 'EAU');
        if (!water) return;
        const general = detail.distributions.find((d) => d.keyCode === 'GENERAL');
        this.invoiceForm.patchValue({
          isWater: true,
          subscription: general ? Number(general.amount) : 0,
          consumption: Number(water.amount),
        });
      },
    });
  }

  cancelInvoiceForm(): void {
    this.showInvoiceForm.set(false);
    this.editingInv.set(null);
    this.invoiceForm.reset({ isWater: false, fund: 'COURANT' });
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

      const editing = this.editingInv();
      if (editing) {
        // Correction d'une facture/dépense existante.
        const period = this.selectedExercise()?.label ?? undefined;
        let amount: number;
        let distributions;
        if (v.isWater) {
          // Redéfinition explicite du partage abonnement / consommation.
          const sub = Number(v.subscription ?? 0);
          const cons = Number(v.consumption ?? 0);
          amount = Math.round((sub + cons) * 100) / 100;
          distributions = [
            { keyCode: 'GENERAL' as const, label: 'Abonnement', amount: sub },
            { keyCode: 'EAU' as const, label: 'Consommation', amount: cons, periodLabel: period },
          ];
        } else {
          // Montant scalaire : la ventilation existante est ré-échelonnée serveur.
          amount = Number(v.amount ?? 0);
        }
        await firstValueFrom(
          this.api.updateInvoice(cop, editing.id, {
            supplierId: supplier.id,
            invoiceDate: v.invoiceDate,
            amount,
            category: v.category || null,
            fund: v.fund,
            distributions,
          }),
        );
      } else {
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
            fund: v.fund,
            distributions,
          }),
        );
      }
      this.cancelInvoiceForm();
      this.loadInvoices();
      this.charges.set(null);
    } finally {
      this.saving.set(false);
    }
  }

  deleteInvoice(inv: InvoiceRow): void {
    const cop = this.copId();
    if (!cop) return;
    if (!confirm(this.confirmDeleteText(inv))) return;
    this.saving.set(true);
    this.api.deleteInvoice(cop, inv.id).subscribe({
      next: () => {
        if (this.editingInv()?.id === inv.id) this.cancelInvoiceForm();
        this.loadInvoices();
        this.charges.set(null);
        this.saving.set(false);
      },
      error: () => this.saving.set(false),
    });
  }

  private confirmDeleteText(inv: InvoiceRow): string {
    return `${inv.supplierName} · ${Number(inv.amount).toFixed(2)} € — supprimer définitivement cette dépense ?`;
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
