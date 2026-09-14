import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService, type Exercise } from './api.service';

const EX_STORAGE_KEY = 'syndic.exId';

function readStored(): string | null {
  try {
    return localStorage.getItem(EX_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persist(id: string | null): void {
  try {
    if (id) localStorage.setItem(EX_STORAGE_KEY, id);
    else localStorage.removeItem(EX_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Exercice à la date de fin la plus récente (défaut fonctionnel). */
function latest(rows: Exercise[]): Exercise | null {
  return rows.reduce<Exercise | null>((acc, e) => (!acc || e.end_date > acc.end_date ? e : acc), null);
}

/**
 * Exercice « courant » partagé par toute l'application, sélectionné dans
 * l'entête. La liste dépend de la copropriété courante ; à chaque changement de
 * copropriété on présélectionne l'exercice le plus récent (date de fin la plus
 * grande). Le pont avec les pages reste la clé localStorage `syndic.exId`.
 */
@Injectable({ providedIn: 'root' })
export class ExerciseContextService {
  private api = inject(ApiService);

  readonly exercises = signal<Exercise[]>([]);
  readonly currentId = signal<string | null>(readStored());
  readonly current = computed(() => this.exercises().find((e) => e.id === this.currentId()) ?? null);

  /**
   * Recharge les exercices d'une copropriété.
   * @param resetToLatest true → présélectionne l'exercice le plus récent
   *   (utilisé quand la copropriété change) ; false → conserve l'exercice
   *   mémorisé s'il appartient à cette copropriété (rechargement de page).
   */
  loadFor(copId: string | null, resetToLatest: boolean): void {
    if (!copId) {
      this.exercises.set([]);
      this.setCurrent(null);
      return;
    }
    this.api.listExercises(copId).subscribe({
      next: (rows) => {
        this.exercises.set(rows);
        const fallback = latest(rows)?.id ?? null;
        if (resetToLatest) {
          this.setCurrent(fallback);
          return;
        }
        const stored = readStored();
        this.setCurrent(rows.some((e) => e.id === stored) ? stored : fallback);
      },
      error: () => {
        this.exercises.set([]);
        this.setCurrent(null);
      },
    });
  }

  select(id: string): void {
    this.setCurrent(id);
  }

  /** Après création d'un exercice : l'ajoute et le sélectionne. */
  addLocal(ex: Exercise): void {
    this.exercises.update((list) => [...list, ex]);
    this.setCurrent(ex.id);
  }

  /** Après modification (clôture/réouverture) : actualise la ligne. */
  updateLocal(ex: Exercise): void {
    this.exercises.update((list) => list.map((e) => (e.id === ex.id ? ex : e)));
  }

  reset(): void {
    this.exercises.set([]);
    this.setCurrent(null);
  }

  private setCurrent(id: string | null): void {
    this.currentId.set(id);
    persist(id);
  }
}
