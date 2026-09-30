import { Routes } from '@angular/router';
import { authGuard } from './auth';

export const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./tracker/tracker.component').then((module) => module.TrackerComponent),
  },
  {
    path: 'listen',
    canActivate: [authGuard],
    loadComponent: () => import('./listen/listen.component').then((module) => module.ListenComponent),
  },
];
