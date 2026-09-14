import { Component, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService, type Coproperty, type CopropertyOverview, type Exercise, type LotOverviewRow, type LotOwner } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { CopropertyContextService } from '../core/coproperty-context.service';
import { ExerciseContextService } from '../core/exercise-context.service';

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
export class CopropertyPageComponent {
  private api = inject(ApiService);
  private transloco = inject(TranslocoService);
  readonly auth = inject(AuthService);
  private copCtx = inject(CopropertyContextService);
  private exCtx = inject(ExerciseContextService);

  // Liste et sélection partagées avec l'entête (source unique de vérité).
  readonly coproperties = this.copCtx.coproperties;
  readonly selectedId = this.copCtx.currentId;
  readonly overview = signal<CopropertyOverview | null>(null);

  readonly loadingList = signal(true);
  readonly loadingOverview = signal(false);
  readonly saving = signal(false);

  readonly showCopForm = signal(false);
  readonly showEditCop = signal(false);
  readonly showLotForm = signal(false);
  readonly editingLotId = signal<string | null>(null);
  readonly lotError = signal<string | null>(null);
  readonly editError = signal<string | null>(null);

  readonly copForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    address: new FormControl('', { nonNullable: true }),
    city: new FormControl('', { nonNullable: true }),
  });

  /** Copropriété actuellement sélectionnée (détails + édition). */
  get selectedCop(): Coproperty | null {
    return this.coproperties().find((c) => c.id === this.selectedId()) ?? null;
  }

  readonly editCopForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    address: new FormControl('', { nonNullable: true }),
    postalCode: new FormControl('', { nonNullable: true }),
    city: new FormControl('', { nonNullable: true }),
    country: new FormControl('FR', { nonNullable: true }),
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

  // --- Exercices comptables (création ; la sélection se fait dans l'entête) ---
  readonly exercises = this.exCtx.exercises;
  readonly showExForm = signal(false);
  readonly exForm = new FormGroup({
    label: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    startDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    endDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  constructor() {
    // La copropriété courante vient de l'entête : on recharge le détail à chaque
    // changement (et on referme les panneaux d'édition ouverts).
    effect(() => {
      const id = this.copCtx.currentId();
      this.loadingList.set(false);
      this.editingLotId.set(null);
      this.showLotForm.set(false);
      this.showEditCop.set(false);
      this.ownersLotId.set(null);
      this.showExForm.set(false);
      if (!id) {
        this.overview.set(null);
        return;
      }
      this.loadOverview();
    });
  }

  selectCop(id: string): void {
    this.copCtx.select(id); // pilote l'entête ; l'effet ci-dessus recharge le détail.
  }

  startEditCop(): void {
    const cop = this.selectedCop;
    if (!cop) return;
    this.editError.set(null);
    this.editCopForm.reset({
      name: cop.name,
      address: cop.address ?? '',
      postalCode: cop.postal_code ?? '',
      city: cop.city ?? '',
      country: cop.country ?? 'FR',
    });
    this.showEditCop.set(true);
  }

  submitEditCop(): void {
    const cop = this.selectedCop;
    if (!cop || this.editCopForm.invalid) return;
    this.saving.set(true);
    const v = this.editCopForm.getRawValue();
    this.api
      .updateCoproperty(cop.id, {
        name: v.name.trim(),
        address: v.address.trim() || null,
        postalCode: v.postalCode.trim() || null,
        city: v.city.trim() || null,
        country: v.country.trim() || 'FR',
      })
      .subscribe({
        next: (updated) => {
          this.copCtx.upsert(updated);
          this.showEditCop.set(false);
          this.saving.set(false);
        },
        error: () => this.saving.set(false),
      });
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
        this.copCtx.upsert(created);
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
      if (p === null || p < 0 || p > 100) {
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
    if (p === null || p < 0 || p > 100) {
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

  equalizeOwners(lot: LotOverviewRow): void {
    const cop = this.selectedId();
    this.ownerError.set(null);
    if (!cop) return;
    this.saving.set(true);
    this.api.equalizeOwners(cop, lot.id).subscribe({
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

  // --- Sauvegarde / restauration des comptes ---
  readonly backupBusy = signal(false);
  readonly backupError = signal<string | null>(null);
  readonly backupInfo = signal<string | null>(null);

  /** Exporte tous les comptes de la copropriété courante en fichier JSON. */
  async exportBackup(): Promise<void> {
    const cop = this.selectedCop;
    if (!cop) return;
    this.backupBusy.set(true);
    this.backupError.set(null);
    this.backupInfo.set(null);
    try {
      const data = await firstValueFrom(this.api.exportCoproperty(cop.id));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      const slug = cop.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'copro';
      a.href = url;
      a.download = `syndic-${slug}-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      this.backupError.set(apiErrorMessage(err, this.transloco.translate('backup.exportError')));
    } finally {
      this.backupBusy.set(false);
    }
  }

  /** Importe un fichier de sauvegarde ; `mode` = 'NEW' (nouvelle copro) ou 'RESTORE'. */
  async importBackup(event: Event, mode: 'NEW' | 'RESTORE'): Promise<void> {
    const input = event.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    if (mode === 'RESTORE' && !confirm(this.transloco.translate('backup.restoreConfirm'))) return;
    this.backupBusy.set(true);
    this.backupError.set(null);
    this.backupInfo.set(null);
    try {
      const text = await f.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        this.backupError.set(this.transloco.translate('backup.parseError'));
        return;
      }
      const res = await firstValueFrom(this.api.importCoproperty(parsed as never, mode));
      const total = Object.values(res.inserted).reduce((a, n) => a + n, 0);
      this.backupInfo.set(this.transloco.translate('backup.importOk', { count: total }));
      // Recharge la liste et sélectionne la copropriété reconstruite.
      await new Promise<void>((resolve) => {
        this.api.listCoproperties().subscribe({
          next: (rows) => {
            this.coproperties.set(rows);
            if (rows.some((c) => c.id === res.copropertyId)) this.selectCop(res.copropertyId);
            resolve();
          },
          error: () => resolve(),
        });
      });
    } catch (err) {
      this.backupError.set(apiErrorMessage(err, this.transloco.translate('backup.importError')));
    } finally {
      this.backupBusy.set(false);
    }
  }

  /** Crée un exercice comptable pour la copropriété courante et le sélectionne. */
  submitExercise(): void {
    const cop = this.copCtx.currentId();
    if (!cop || this.exForm.invalid) return;
    this.saving.set(true);
    const v = this.exForm.getRawValue();
    this.api.createExercise(cop, { label: v.label, startDate: v.startDate, endDate: v.endDate }).subscribe({
      next: (ex: Exercise) => {
        this.exCtx.addLocal(ex); // ajoute et sélectionne dans l'entête
        this.exForm.reset();
        this.showExForm.set(false);
        this.saving.set(false);
      },
      error: () => this.saving.set(false),
    });
  }

  /** Clôture un exercice (report à nouveau) ou le rouvre. */
  toggleExerciseClosed(ex: Exercise): void {
    const cop = this.copCtx.currentId();
    if (!cop) return;
    this.saving.set(true);
    const call = ex.status === 'CLOSED' ? this.api.reopenExercise(cop, ex.id) : this.api.closeExercise(cop, ex.id);
    call.subscribe({
      next: (updated: Exercise) => {
        this.exCtx.updateLocal(updated);
        this.saving.set(false);
      },
      error: () => this.saving.set(false),
    });
  }
}
