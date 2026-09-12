import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login.component').then((m) => m.LoginComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'tableau-de-bord' },
  {
    path: 'tableau-de-bord',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'coproprietes',
    canActivate: [authGuard],
    loadComponent: () => import('./features/coproperty-page.component').then((m) => m.CopropertyPageComponent),
  },
  {
    path: 'depenses',
    canActivate: [authGuard],
    loadComponent: () => import('./features/expenses.component').then((m) => m.ExpensesComponent),
  },
  {
    path: 'tresorerie',
    canActivate: [authGuard],
    loadComponent: () => import('./features/cash.component').then((m) => m.CashComponent),
  },
  {
    path: 'banque',
    canActivate: [authGuard],
    loadComponent: () => import('./features/bank.component').then((m) => m.BankComponent),
  },
  {
    path: 'regularisation',
    canActivate: [authGuard],
    loadComponent: () => import('./features/regularisation.component').then((m) => m.RegularisationComponent),
  },
  { path: '**', redirectTo: 'tableau-de-bord' },
];
