import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [TranslocoModule, ReactiveFormsModule],
  template: `
    <ng-container *transloco="let t">
      <div style="max-width:380px; margin:56px auto; padding:0 16px;">
        <div style="text-align:center; margin-bottom:20px;">
          <svg width="44" height="44" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect width="34" height="34" rx="8" fill="var(--accent)" />
            <path d="M9 24V13.5L17 8l8 5.5V24" stroke="var(--gold)" stroke-width="1.8" stroke-linejoin="round" fill="none" />
            <rect x="14.5" y="17.5" width="5" height="6.5" fill="var(--gold)" />
          </svg>
          <h1 style="font-family:'Fraunces',serif; margin:12px 0 0;">{{ t('app.name') }}</h1>
        </div>
        <div class="card">
          <h2 style="margin-top:0;">{{ firstUse() ? t('auth.create') : t('auth.title') }}</h2>
          <form [formGroup]="form" (ngSubmit)="submit()">
            @if (firstUse()) {
              <div class="field" style="margin-bottom:10px;">
                <label for="dn">{{ t('auth.displayName') }}</label>
                <input id="dn" type="text" formControlName="displayName" />
              </div>
            }
            <div class="field" style="margin-bottom:10px;">
              <label for="email">{{ t('auth.email') }}</label>
              <input id="email" type="email" formControlName="email" autocomplete="username" />
            </div>
            <div class="field" style="margin-bottom:10px;">
              <label for="pw">{{ t('auth.password') }}</label>
              <input id="pw" type="password" formControlName="password" autocomplete="current-password" />
            </div>
            @if (error()) { <div class="gate-error" style="color:var(--critical); font-size:13px; margin-bottom:8px;">{{ error() }}</div> }
            <button class="btn primary" type="submit" style="width:100%;" [disabled]="form.invalid || busy()">
              {{ firstUse() ? t('auth.create') : t('auth.login') }}
            </button>
          </form>
          <button class="btn ghost sm" type="button" style="margin-top:10px; width:100%;" (click)="toggleFirstUse()">
            {{ firstUse() ? t('auth.haveAccount') : t('auth.firstUse') }}
          </button>
        </div>
      </div>
    </ng-container>
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly firstUse = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = new FormGroup({
    displayName: new FormControl('', { nonNullable: true }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(1)] }),
  });

  toggleFirstUse(): void {
    this.firstUse.update((v) => !v);
    this.error.set(null);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.firstUse()) {
        await firstValueFrom(this.auth.registerFirst(v.email, v.password, v.displayName));
      }
      await firstValueFrom(this.auth.login(v.email, v.password));
      void this.router.navigate(['/']);
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      this.error.set(status === 401 ? 'Identifiants invalides.' : 'Une erreur est survenue.');
    } finally {
      this.busy.set(false);
    }
  }
}
