import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService, type Coproperty, type CopropertyOverview, type LotOverviewRow, type LotOwner } from '../core/api.service';
import { AuthService } from '../core/auth.service';

const COP_STORAGE_KEY = 'syndic.copId';

/** Parse un nombre décimal saisi avec virgule (FR) ou point. `null` si invalide. */
function parseDecimal(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Extrait un message lisible d'une erreur HTTP de l'API. */
function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { error?: { message?: string; issues?: { path: string; message: string }[] } };
  const body = e?.error;
  if (body?.issues?.length) return body.issues.map((i) => `${i.path} : ${i.message}`).join(' · ');
  if (body?.message) return body.message;
  return fallback;
}

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
  readonly lotError = signal<string | null>(null);
  readonly editError = signal<string | null>(null);

  readonly copForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    address: new FormControl('', { nonNullable: true }),
    city: new FormControl('', { nonNullable: true }),
  });

  // tantiemes en texte : on parse nous-mêmes (virgule FR acceptée), plutôt que
  // de dépendre d'un <input type="number"> qui rejette la virgule sans un mot.
  readonly lotForm = new FormGroup({
    lotNumber: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    tantiemes: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    owner: new FormControl('', { nonNullable: true }),
  });

  readonly editForm = new FormGroup({
    tantiemes: new FormControl('', { nonNullable: true }),
    owner: new FormControl('', { nonNullable: true }),
  });

  // --- Indivision : gestion des copropriétaires d'un lot ---
  readonly ownersLotId = signal<string | null>(null); // lot dont le panneau est ouvert
  readonly ownerError = signal<string | null>(null);
  readonly addOwnerForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    sharePct: new FormControl('', { nonNullable: true }),
  });

  // --- Création d'un accès pour un copropriétaire précis ---
  readonly accessPersonId = signal<string | null>(null);
  readonly accessDonePerson = signal<string | null>(null);
  readonly accessError = signal<string | null>(null);
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
    this.ownersLotId.set(null);
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
    this.lotError.set(null);
    if (!cop) return;
    const v = this.lotForm.getRawValue();
    if (!v.lotNumber.trim()) {
      this.lotForm.markAllAsTouched();
      this.lotError.set(this.transloco.translate('lots.errLotNumber'));
      return;
    }
    const tantiemes = parseDecimal(v.tantiemes);
    if (tantiemes === null || tantiemes <= 0) {
      this.lotForm.markAllAsTouched();
      this.lotError.set(this.transloco.translate('lots.errTantiemes'));
      return;
    }
    this.saving.set(true);
    this.api
      .createLot(cop, { lotNumber: v.lotNumber.trim(), tantiemes, ownerName: v.owner.trim() || null })
      .subscribe({
        next: (ov) => {
          this.overview.set(ov);
          this.lotForm.reset({ lotNumber: '', tantiemes: '', owner: '' });
          this.saving.set(false);
        },
        error: (err) => {
          this.saving.set(false);
          this.lotError.set(apiErrorMessage(err, this.transloco.translate('lots.errGeneric')));
        },
      });
  }

  startEdit(lot: LotOverviewRow): void {
    this.editError.set(null);
    this.editingLotId.set(lot.id);
    this.editForm.reset({ tantiemes: String(Number(lot.tantiemes)), owner: lot.ownerLabel });
  }

  cancelEdit(): void {
    this.editingLotId.set(null);
    this.editError.set(null);
  }

  async saveEdit(lot: LotOverviewRow): Promise<void> {
    const cop = this.selectedId();
    if (!cop) return;
    this.editError.set(null);
    const t = parseDecimal(this.editForm.controls.tantiemes.value);
    if (t !== null && t <= 0) {
      this.editError.set(this.transloco.translate('lots.errTantiemes'));
      return;
    }
    this.saving.set(true);
    try {
      let ov: CopropertyOverview | null = null;
      if (t !== null && t !== Number(lot.tantiemes)) {
        ov = await firstValueFrom(this.api.updateLotTantiemes(cop, lot.id, t));
      }
      const newOwner = (this.editForm.controls.owner.value || '').trim();
      if (newOwner && newOwner !== lot.ownerLabel) {
        ov = await firstValueFrom(this.api.setLotOwner(cop, lot.id, newOwner));
      }
      if (ov) this.overview.set(ov);
      this.editingLotId.set(null);
    } catch (err) {
      this.editError.set(apiErrorMessage(err, this.transloco.translate('lots.errGeneric')));
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

  // --- Indivision ---
  toggleOwners(lot: LotOverviewRow): void {
    this.ownerError.set(null);
    this.accessPersonId.set(null);
    this.accessDonePerson.set(null);
    this.addOwnerForm.reset({ name: '', sharePct: '' });
    this.ownersLotId.set(this.ownersLotId() === lot.id ? null : lot.id);
  }

  submitAddOwner(lot: LotOverviewRow): void {
    const cop = this.selectedId();
    this.ownerError.set(null);
    if (!cop) return;
    const v = this.addOwnerForm.getRawValue();
    if (!v.name.trim()) {
      this.addOwnerForm.markAllAsTouched();
      this.ownerError.set(this.transloco.translate('owners.errName'));
      return;
    }
    let sharePct: number | undefined;
    if (v.sharePct.trim()) {
      const p = parseDecimal(v.sharePct);
      if (p === null || p <= 0 || p > 100) {
        this.ownerError.set(this.transloco.translate('owners.errShare'));
        return;
      }
      sharePct = p;
    }
    this.saving.set(true);
    this.api.addLotOwner(cop, lot.id, { name: v.name.trim(), sharePct }).subscribe({
      next: (ov) => {
        this.overview.set(ov);
        this.addOwnerForm.reset({ name: '', sharePct: '' });
        this.saving.set(false);
      },
      error: (err) => {
        this.saving.set(false);
        this.ownerError.set(apiErrorMessage(err, this.transloco.translate('lots.errGeneric')));
      },
    });
  }

  changeShare(lot: LotOverviewRow, owner: LotOwner, raw: string): void {
    const cop = this.selectedId();
    this.ownerError.set(null);
    if (!cop) return;
    const p = parseDecimal(raw);
    if (p === null || p <= 0 || p > 100) {
      this.ownerError.set(this.transloco.translate('owners.errShare'));
      return;
    }
    this.saving.set(true);
    this.api.setOwnerShare(cop, lot.id, owner.personId, p).subscribe({
      next: (ov) => {
        this.overview.set(ov);
        this.saving.set(false);
      },
      error: (err) => {
        this.saving.set(false);
        this.ownerError.set(apiErrorMessage(err, this.transloco.translate('lots.errGeneric')));
      },
    });
  }

  removeOwner(lot: LotOverviewRow, owner: LotOwner): void {
    const cop = this.selectedId();
    if (!cop) return;
    if (!confirm(this.transloco.translate('owners.confirmRemove', { name: owner.name }))) return;
    this.saving.set(true);
    this.api.removeLotOwner(cop, lot.id, owner.personId).subscribe({
      next: (ov) => {
        this.overview.set(ov);
        this.saving.set(false);
      },
      error: () => this.saving.set(false),
    });
  }

  // --- Accès copropriétaire (par personne) ---
  startAccess(owner: LotOwner): void {
    this.accessError.set(null);
    this.accessDonePerson.set(null);
    this.accessPersonId.set(this.accessPersonId() === owner.personId ? null : owner.personId);
    this.accessForm.reset({ email: '', password: '' });
  }

  submitAccess(owner: LotOwner): void {
    const cop = this.selectedId();
    this.accessError.set(null);
    if (!cop) return;
    if (this.accessForm.invalid) {
      this.accessForm.markAllAsTouched();
      this.accessError.set(this.transloco.translate('access.errForm'));
      return;
    }
    this.saving.set(true);
    const v = this.accessForm.getRawValue();
    this.api.createOwnerAccess({ email: v.email, password: v.password, personId: owner.personId, copropertyId: cop }).subscribe({
      next: () => {
        this.saving.set(false);
        this.accessDonePerson.set(owner.personId);
        this.accessPersonId.set(null);
      },
      error: (err) => {
        this.saving.set(false);
        this.accessError.set(apiErrorMessage(err, this.transloco.translate('access.errGeneric')));
      },
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
