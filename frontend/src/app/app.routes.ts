import { Routes } from '@angular/router';
import { authGuard } from './auth';

export const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shell/shell.component').then((module) => module.ShellComponent),
    children: [
      {
        path: '',
        loadComponent: () => import('./tracker/tracker.component').then((module) => module.TrackerComponent),
      },
      {
        path: 'radio',
        loadComponent: () => import('./radio/radio.component').then((module) => module.RadioComponent),
      },
    ],
  },
  {
    path: 'listen',
    canActivate: [authGuard],
    loadComponent: () => import('./listen/listen.component').then((module) => module.ListenComponent),
  },
];
