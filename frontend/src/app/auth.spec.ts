import { describe, expect, it } from 'vitest';
import { AnonymousAuthService, authInterceptor } from './auth';
import { of } from 'rxjs';

describe('AnonymousAuthService', () => {
  it('allows every route and has no support perk', () => {
    const auth = new AnonymousAuthService();
    expect(auth.canActivate()).toBe(true);
    expect(auth.hasSupportPerk()).toBe(false);
  });
});

describe('authInterceptor', () => {
  it('passes the request through unchanged', async () => {
    const req = { url: '/api/health' } as import('@angular/common/http').HttpRequest<unknown>;
    const result = await new Promise((resolve) => {
      authInterceptor(req, () => of('ok')).subscribe(resolve);
    });
    expect(result).toBe('ok');
  });
});
