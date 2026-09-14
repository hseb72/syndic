import { Component, effect, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { AVAILABLE_LANGS, type Lang } from './app.config';
import { ThemeService } from './core/theme.service';
import { AuthService } from './core/auth.service';
import { CopropertyContextService } from './core/coproperty-context.service';
import { ExerciseContextService } from './core/exercise-context.service';

const LANG_NAMES: Record<Lang, string> = {
  fr: 'Français',
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  it: 'Italiano',
};
const LANG_STORAGE_KEY = 'syndic.lang';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  readonly theme = inject(ThemeService);
  readonly auth = inject(AuthService);
  readonly copCtx = inject(CopropertyContextService);
  readonly exCtx = inject(ExerciseContextService);
  private readonly transloco = inject(TranslocoService);

  readonly langs = AVAILABLE_LANGS;
  readonly langNames = LANG_NAMES;
  readonly activeLang = signal<Lang>('fr');

  // Suit le changement de copropriété pour recharger les exercices : au premier
  // chargement on honore l'exercice mémorisé, ensuite tout changement de copro
  // présélectionne l'exercice le plus récent.
  private lastCop: string | null = null;
  private firstResolve = true;

  constructor() {
    // Charge la copropriété courante dès que l'utilisateur est authentifié ;
    // la réinitialise à la déconnexion.
    effect(() => {
      if (this.auth.isAuthenticated()) this.copCtx.init();
      else {
        this.copCtx.reset();
        this.exCtx.reset();
        this.lastCop = null;
        this.firstResolve = true;
      }
    });

    // Recharge les exercices dès que la copropriété courante change.
    effect(() => {
      const cop = this.copCtx.currentId();
      if (cop === this.lastCop) return;
      this.lastCop = cop;
      const honorStored = this.firstResolve;
      this.firstResolve = false;
      this.exCtx.loadFor(cop, !honorStored);
    });

    let initial = this.transloco.getActiveLang() as Lang;
    try {
      const stored = localStorage.getItem(LANG_STORAGE_KEY);
      if (stored && (AVAILABLE_LANGS as readonly string[]).includes(stored)) {
        initial = stored as Lang;
        this.transloco.setActiveLang(initial);
      }
    } catch {
      /* ignore */
    }
    this.activeLang.set(initial);
  }

  selectCop(id: string): void {
    this.copCtx.select(id);
  }

  selectExercise(id: string): void {
    this.exCtx.select(id);
  }

  setLang(lang: string): void {
    this.transloco.setActiveLang(lang);
    this.activeLang.set(lang as Lang);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
  }
}
