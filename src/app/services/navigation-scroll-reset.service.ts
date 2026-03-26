import { DOCUMENT } from '@angular/common';
import { Injectable, NgZone, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class NavigationScrollResetService {
  private readonly router = inject(Router);
  private readonly ngZone = inject(NgZone);
  private readonly document = inject(DOCUMENT);

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.resetAllScrollPositions());
  }

  private resetAllScrollPositions(): void {
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        // Router global scrolling already restores viewport to top.
        // Here we only reset internal scroll containers.
        const candidates = this.document.querySelectorAll<HTMLElement>('body *');
        for (const element of candidates) {
          if (element.scrollTop <= 0) continue;
          const style = getComputedStyle(element);
          const overflowY = style.overflowY;
          if (overflowY === 'auto' || overflowY === 'scroll') {
            element.scrollTop = 0;
          }
        }
      });
    });
  }
}
