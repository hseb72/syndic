import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { bureauGuard } from './core/bureau.guard';

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
    path: 'mes-charges',
    canActivate: [authGuard],
    loadComponent: () => import('./features/mycharges.component').then((m) => m.MyChargesComponent),
  },
  {
    path: 'rapports',
    canActivate: [authGuard],
    loadComponent: () => import('./features/reports.component').then((m) => m.ReportsComponent),
  },
  {
    path: 'depenses',
    canActivate: [bureauGuard],
    loadComponent: () => import('./features/expenses.component').then((m) => m.ExpensesComponent),
  },
  {
    path: 'tresorerie',
    canActivate: [bureauGuard],
    loadComponent: () => import('./features/cash.component').then((m) => m.CashComponent),
  },
  {
    path: 'banque',
    canActivate: [bureauGuard],
    loadComponent: () => import('./features/bank.component').then((m) => m.BankComponent),
  },
  {
    path: 'regularisation',
    canActivate: [bureauGuard],
    loadComponent: () => import('./features/regularisation.component').then((m) => m.RegularisationComponent),
  },
  {
    path: 'comptabilite',
    canActivate: [bureauGuard],
    loadComponent: () => import('./features/accounting.component').then((m) => m.AccountingComponent),
  },
  { path: '**', redirectTo: 'tableau-de-bord' },
];
