import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';

export interface AuthUser {
  id?: string;
  email: string;
  display_name?: string | null;
  role: string;
  coproperty_id?: string | null;
}

const TOKEN_KEY = 'syndic.token';
const USER_KEY = 'syndic.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  readonly token = signal<string | null>(null);
  readonly user = signal<AuthUser | null>(null);
  readonly forbiddenFlash = signal(false);

  readonly isAuthenticated = computed(() => !!this.token());
  readonly isBureau = computed(() => this.user()?.role === 'BUREAU');

  constructor() {
    try {
      const t = localStorage.getItem(TOKEN_KEY);
      const u = localStorage.getItem(USER_KEY);
      if (t) this.token.set(t);
      if (u) this.user.set(JSON.parse(u) as AuthUser);
    } catch {
      /* ignore */
    }
  }

  login(email: string, password: string) {
    return this.http
      .post<{ token: string; user: AuthUser }>('/api/auth/login', { email, password })
      .pipe(tap((res) => this.setSession(res.token, res.user)));
  }

  registerFirst(email: string, password: string, displayName: string) {
    return this.http.post<{ user: AuthUser }>('/api/auth/register', { email, password, displayName });
  }

  private setSession(token: string, user: AuthUser): void {
    this.token.set(token);
    this.user.set(user);
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      /* ignore */
    }
  }

  logout(): void {
    this.token.set(null);
    this.user.set(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
    void this.router.navigate(['/login']);
  }

  clearAndRedirect(): void {
    this.logout();
  }

  flashForbidden(): void {
    this.forbiddenFlash.set(true);
    setTimeout(() => this.forbiddenFlash.set(false), 3500);
  }
}
