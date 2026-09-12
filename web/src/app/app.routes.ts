import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tableau-de-bord' },
  {
    path: 'tableau-de-bord',
    loadComponent: () => import('./features/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'coproprietes',
    loadComponent: () => import('./features/coproperty-page.component').then((m) => m.CopropertyPageComponent),
  },
  {
    path: 'depenses',
    loadComponent: () => import('./features/expenses.component').then((m) => m.ExpensesComponent),
  },
  {
    path: 'tresorerie',
    loadComponent: () => import('./features/cash.component').then((m) => m.CashComponent),
  },
  {
    path: 'regularisation',
    loadComponent: () => import('./features/regularisation.component').then((m) => m.RegularisationComponent),
  },
  { path: '**', redirectTo: 'tableau-de-bord' },
];
