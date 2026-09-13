import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { ApiService, type Annex, type Assembly, type Exercise, type Resolution } from '../core/api.service';

const COP_STORAGE_KEY = 'syndic.copId';

const MAJORITIES = ['ART_24', 'ART_25', 'ART_26', 'UNANIMITE', 'INFORMATION'];
const REPORT_TYPES = ['BUDGET', 'COMPARATIF', 'REGULARISATION', 'IMPAYES', 'TRESORERIE', 'LIBRE'];

@Component({
  selector: 'app-assemblies',
  imports: [TranslocoModule, FormsModule, RouterLink],
  templateUrl: './assemblies.component.html',
})
export class AssembliesComponent implements OnInit {
  private api = inject(ApiService);
  private transloco = inject(TranslocoService);

  readonly majorities = MAJORITIES;
  readonly reportTypes = REPORT_TYPES;

  readonly copId = signal<string | null>(null);
  readonly assemblies = signal<Assembly[]>([]);
  readonly exercises = signal<Exercise[]>([]);
  readonly selected = signal<Assembly | null>(null);
  readonly resolutions = signal<Resolution[]>([]);
  readonly annexes = signal<Annex[]>([]);
  readonly saving = signal(false);
  readonly showCreate = signal(false);

  // formulaire création AG
  newKind = 'ORDINAIRE';
  newDate = '';
  newTime = '18:30';
  newLocation = '';
  newConvocationDate = '';

  // formulaire résolution
  resTitle = '';
  resMajority = 'ART_24';
  resExercise = '';

  // formulaire annexe
  anType = 'BUDGET';
  anExercise = '';
  anNote = '';

  ngOnInit(): void {
    let cop: string | null = null;
    try {
      cop = localStorage.getItem(COP_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.copId.set(cop);
    if (!cop) return;
    this.api.listAssemblies(cop).subscribe({ next: (a) => this.assemblies.set(a) });
    this.api.listExercises(cop).subscribe({ next: (e) => this.exercises.set(e) });
  }

  createAssembly(): void {
    const cop = this.copId();
    if (!cop || !this.newDate) return;
    this.saving.set(true);
    this.api
      .createAssembly(cop, {
        kind: this.newKind,
        meetingDate: this.newDate,
        meeting_time: this.newTime || null,
        location: this.newLocation || null,
        convocation_date: this.newConvocationDate || null,
      } as never)
      .subscribe({
        next: (a) => {
          this.assemblies.update((list) => [a, ...list]);
          this.showCreate.set(false);
          this.saving.set(false);
          this.open(a);
        },
        error: () => this.saving.set(false),
      });
  }

  open(a: Assembly): void {
    const cop = this.copId();
    if (!cop) return;
    this.selected.set(a);
    this.api.getAssembly(cop, a.id).subscribe({
      next: (d) => {
        this.selected.set(d.assembly);
        this.resolutions.set(d.resolutions);
        this.annexes.set(d.annexes);
      },
    });
  }

  private reload(): void {
    const a = this.selected();
    if (a) this.open(a);
  }

  addResolution(preset?: { title: string; majority: string }): void {
    const cop = this.copId();
    const a = this.selected();
    if (!cop || !a) return;
    const title = preset?.title ?? this.resTitle.trim();
    if (!title) return;
    this.saving.set(true);
    this.api
      .addResolution(cop, a.id, {
        title,
        majority: preset?.majority ?? this.resMajority,
        exerciseId: this.resExercise || null,
      })
      .subscribe({
        next: () => {
          this.resTitle = '';
          this.saving.set(false);
          this.reload();
        },
        error: () => this.saving.set(false),
      });
  }

  removeResolution(r: Resolution): void {
    const cop = this.copId();
    const a = this.selected();
    if (!cop || !a) return;
    this.api.deleteResolution(cop, a.id, r.id).subscribe({ next: () => this.reload() });
  }

  addAnnex(): void {
    const cop = this.copId();
    const a = this.selected();
    if (!cop || !a) return;
    this.saving.set(true);
    this.api
      .addAnnex(cop, a.id, {
        reportType: this.anType,
        exerciseId: this.anType === 'LIBRE' ? null : this.anExercise || null,
        note: this.anType === 'LIBRE' ? this.anNote || null : null,
        label: this.anType === 'LIBRE' ? this.anNote || null : null,
      })
      .subscribe({
        next: () => {
          this.anNote = '';
          this.saving.set(false);
          this.reload();
        },
        error: () => this.saving.set(false),
      });
  }

  removeAnnex(an: Annex): void {
    const cop = this.copId();
    const a = this.selected();
    if (!cop || !a) return;
    this.api.deleteAnnex(cop, a.id, an.id).subscribe({ next: () => this.reload() });
  }

  removeAssembly(a: Assembly): void {
    const cop = this.copId();
    if (!cop) return;
    if (!confirm(this.transloco.translate('asm.confirmDelete'))) return;
    this.api.deleteAssembly(cop, a.id).subscribe({
      next: () => {
        this.assemblies.update((list) => list.filter((x) => x.id !== a.id));
        if (this.selected()?.id === a.id) this.selected.set(null);
      },
    });
  }

  exLabel(id: string | null): string {
    if (!id) return '';
    const e = this.exercises().find((x) => x.id === id);
    return e ? e.label || `${e.start_date} → ${e.end_date}` : '';
  }

  presets(): { title: string; majority: string }[] {
    const t = (k: string) => this.transloco.translate(k);
    return [
      { title: t('asm.presetApproval'), majority: 'ART_24' },
      { title: t('asm.presetQuitus'), majority: 'ART_24' },
      { title: t('asm.presetBudget'), majority: 'ART_24' },
      { title: t('asm.presetCouncil'), majority: 'ART_25' },
    ];
  }
}
