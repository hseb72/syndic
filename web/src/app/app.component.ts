import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { AVAILABLE_LANGS, type Lang } from './app.config';
import { ThemeService } from './core/theme.service';
import { AuthService } from './core/auth.service';

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
  private readonly transloco = inject(TranslocoService);

  readonly langs = AVAILABLE_LANGS;
  readonly langNames = LANG_NAMES;
  readonly activeLang = signal<Lang>('fr');

  constructor() {
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
