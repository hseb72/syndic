import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService, type Coproperty } from './api.service';

const COP_STORAGE_KEY = 'syndic.copId';

function readStored(): string | null {
  try {
    return localStorage.getItem(COP_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persist(id: string): void {
  try {
    localStorage.setItem(COP_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

/**
 * Copropriété « courante » partagée par toute l'application : le choix fait
 * dans l'onglet Copropriété est ainsi visible dans le bandeau, quel que soit
 * l'onglet actif. Le pont avec les pages existantes reste la clé localStorage
 * `syndic.copId` (chaque page la lit à son initialisation).
 */
@Injectable({ providedIn: 'root' })
export class CopropertyContextService {
  private api = inject(ApiService);

  readonly coproperties = signal<Coproperty[]>([]);
  readonly currentId = signal<string | null>(readStored());
  readonly current = computed(() => this.coproperties().find((c) => c.id === this.currentId()) ?? null);

  private loaded = false;

  /** Charge la liste (une fois) et résout la copropriété courante. */
  init(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.api.listCoproperties().subscribe({
      next: (rows) => {
        this.coproperties.set(rows);
        const stored = readStored();
        const cur = rows.find((c) => c.id === stored) ?? rows[0] ?? null;
        if (cur) this.select(cur.id);
      },
    });
  }

  select(id: string): void {
    this.currentId.set(id);
    persist(id);
  }

  /** Insère/actualise une copropriété (après création ou modification). */
  upsert(cop: Coproperty): void {
    this.coproperties.update((list) => {
      const i = list.findIndex((c) => c.id === cop.id);
      if (i < 0) return [...list, cop];
      const copy = [...list];
      copy[i] = cop;
      return copy;
    });
  }

  reset(): void {
    this.loaded = false;
    this.coproperties.set([]);
    this.currentId.set(null);
  }
}
