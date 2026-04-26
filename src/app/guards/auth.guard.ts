import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';

import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};

export const guestOnlyGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return router.createUrlTree(['/doctor-panel']);
  }

  return true;
};

export const clinicalRoleGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  const roles = auth.getCurrentUser()?.roles ?? [];
  const hasClinicalRole = roles.some((role) =>
    ['ROLE_DOCTOR', 'ROLE_STAFF', 'ROLE_ADMIN'].includes(String(role))
  );

  if (hasClinicalRole) {
    return true;
  }

  return router.createUrlTree(['/settings'], {
    queryParams: { forbidden: 'clinical' },
  });
};

