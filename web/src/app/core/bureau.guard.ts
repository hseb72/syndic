import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Réserve une route au bureau ; un copropriétaire est renvoyé au tableau de bord. */
export const bureauGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return router.parseUrl('/login');
  return auth.isBureau() ? true : router.parseUrl('/tableau-de-bord');
};
