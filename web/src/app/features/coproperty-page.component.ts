import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService, type Coproperty, type CopropertyOverview, type LotOverviewRow } from '../core/api.service';
import { AuthService } from '../core/auth.service';

const COP_STORAGE_KEY = 'syndic.copId';

@Component({
  selector: 'app-coproperty-page',
  imports: [TranslocoModule, ReactiveFormsModule, DecimalPipe],
  templateUrl: './coproperty-page.component.html',
})
export class CopropertyPageComponent implements OnInit {
  private api = inject(ApiService);
  private transloco = inject(TranslocoService);
  readonly auth = inject(AuthService);

  readonly coproperties = signal<Coproperty[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly overview = signal<CopropertyOverview | null>(null);

  readonly loadingList = signal(true);
  readonly loadingOverview = signal(false);
  readonly saving = signal(false);

  readonly showCopForm = signal(false);
  readonly showLotForm = signal(false);
  readonly editingLotId = signal<string | null>(null);

  readonly copForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    address: new FormControl('', { nonNullable: true }),
    city: new FormControl('', { nonNullable: true }),
  });

  readonly lotForm = new FormGroup({
    lotNumber: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    tantiemes: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(0.0001)] }),
    owner: new FormControl('', { nonNullable: true }),
  });

  readonly editForm = new FormGroup({
    tantiemes: new FormControl<number | null>(null, { validators: [Validators.min(0.0001)] }),
    owner: new FormControl('', { nonNullable: true }),
  });

  readonly accessLotId = signal<string | null>(null);
  readonly accessDone = signal<string | null>(null);
  readonly accessForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
  });

  ngOnInit(): void {
    this.loadCoproperties();
  }

  private loadCoproperties(): void {
    this.loadingList.set(true);
    this.api.listCoproperties().subscribe({
      next: (rows) => {
        this.coproperties.set(rows);
        this.loadingList.set(false);
        const stored = this.readStoredCop();
        const initial = rows.find((c) => c.id === stored) ?? rows[0];
        if (initial) this.selectCop(initial.id);
      },
      error: () => this.loadingList.set(false),
    });
  }

  selectCop(id: string): void {
    this.selectedId.set(id);
    this.editingLotId.set(null);
    this.showLotForm.set(false);
    try {
      localStorage.setItem(COP_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
    this.loadOverview();
  }

  private loadOverview(): void {
    const id = this.selectedId();
    if (!id) return;
    this.loadingOverview.set(true);
    this.api.getOverview(id).subscribe({
      next: (ov) => {
        this.overview.set(ov);
        this.loadingOverview.set(false);
      },
      error: () => this.loadingOverview.set(false),
    });
  }

  submitCop(): void {
    if (this.copForm.invalid) return;
    this.saving.set(true);
    const v = this.copForm.getRawValue();
    this.api.createCoproperty({ name: v.name, address: v.address || null, city: v.city || null }).subscribe({
      next: (created) => {
        this.coproperties.update((list) => [...list, created]);
        this.copForm.reset();
        this.showCopForm.set(false);
        this.saving.set(false);
        this.selectCop(created.id);
      },
      error: () => this.saving.set(false),
    });
  }

  submitLot(): void {
    const cop = this.selectedId();
    if (!cop || this.lotForm.invalid) return;
    this.saving.set(true);
    const v = this.lotForm.getRawValue();
    this.api
      .createLot(cop, { lotNumber: v.lotNumber, tantiemes: Number(v.tantiemes), ownerName: v.owner || null })
      .subscribe({
        next: (ov) => {
          this.overview.set(ov);
          this.lotForm.reset({ lotNumber: '', tantiemes: null, owner: '' });
          this.saving.set(false);
        },
        error: () => this.saving.set(false),
      });
  }

  startEdit(lot: LotOverviewRow): void {
    this.editingLotId.set(lot.id);
    this.editForm.reset({ tantiemes: Number(lot.tantiemes), owner: lot.ownerLabel });
  }

  cancelEdit(): void {
    this.editingLotId.set(null);
  }

  async saveEdit(lot: LotOverviewRow): Promise<void> {
    const cop = this.selectedId();
    if (!cop) return;
    this.saving.set(true);
    try {
      let ov: CopropertyOverview | null = null;
      const t = Number(this.editForm.controls.tantiemes.value);
      if (t > 0 && t !== Number(lot.tantiemes)) {
        ov = await firstValueFrom(this.api.updateLotTantiemes(cop, lot.id, t));
      }
      const newOwner = (this.editForm.controls.owner.value || '').trim();
      if (newOwner && newOwner !== lot.ownerLabel) {
        ov = await firstValueFrom(this.api.setLotOwner(cop, lot.id, newOwner));
      }
      if (ov) this.overview.set(ov);
      this.editingLotId.set(null);
    } finally {
      this.saving.set(false);
    }
  }

  removeLot(lot: LotOverviewRow): void {
    const cop = this.selectedId();
    if (!cop) return;
    if (!confirm(this.transloco.translate('lots.confirmDelete'))) return;
    this.saving.set(true);
    this.api.deleteLot(cop, lot.id).subscribe({
      next: (ov) => {
        this.overview.set(ov);
        this.saving.set(false);
      },
      error: () => this.saving.set(false),
    });
  }

  startAccess(lot: LotOverviewRow): void {
    this.accessDone.set(null);
    this.accessLotId.set(this.accessLotId() === lot.id ? null : lot.id);
    this.accessForm.reset({ email: '', password: '' });
  }

  submitAccess(lot: LotOverviewRow): void {
    const cop = this.selectedId();
    const personId = lot.owners[0]?.personId;
    if (!cop || !personId || this.accessForm.invalid) return;
    this.saving.set(true);
    const v = this.accessForm.getRawValue();
    this.api.createOwnerAccess({ email: v.email, password: v.password, personId, copropertyId: cop }).subscribe({
      next: () => {
        this.saving.set(false);
        this.accessDone.set(lot.id);
        this.accessLotId.set(null);
      },
      error: () => this.saving.set(false),
    });
  }

  fmt(n: string | number): string {
    return String(Number(n));
  }

  private readStoredCop(): string | null {
    try {
      return localStorage.getItem(COP_STORAGE_KEY);
    } catch {
      return null;
    }
  }
}
