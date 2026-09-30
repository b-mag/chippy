import { Injectable, inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';

/** Ready for a real sign-in later. Phase 1 allows every route. */
export abstract class AuthService {
  abstract canActivate(): boolean;
  /** Donors later skip ads. Anonymous users never have the perk. */
  abstract hasSupportPerk(): boolean;
}

@Injectable({ providedIn: 'root' })
export class AnonymousAuthService extends AuthService {
  canActivate(): boolean {
    return true;
  }

  hasSupportPerk(): boolean {
    return false;
  }
}

export const authGuard: CanActivateFn = () => inject(AuthService).canActivate();

/** Future bearer tokens are attached here. Today the request is unchanged. */
export function authInterceptor(req: import('@angular/common/http').HttpRequest<unknown>, next: import('@angular/common/http').HttpHandlerFn) {
  return next(req);
}
