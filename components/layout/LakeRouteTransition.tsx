'use client';

import { usePathname } from 'next/navigation';
import { useLayoutEffect } from 'react';
import {
  beginLakeRouteEnter,
  consumeNavInstant,
  consumePendingLakeRouteDir,
  consumeStashedRouteEnter,
  isLakeRouteLeaveGuarded,
} from '@/lib/lake/routeTransition';

export function LakeRouteTransition() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    document.body.style.setProperty('opacity', '1');
    document.getElementById('lh-route-veil')?.remove();
    consumeNavInstant();
    consumePendingLakeRouteDir();
    const enter = consumeStashedRouteEnter(pathname);
    if (enter === 'skip') {
      /* deep-link 도착 — enter 애니 없이 커버/상세가 바로 붙음 */
      document.body.classList.remove(
        'lh-route-leaving',
        'lh-leaving',
        'lh-route-enter',
        'lh-route-forward',
        'lh-route-back',
        'lh-route-trpg-enter',
      );
      document.querySelectorAll('.lh-route-panel-leaving').forEach((el) => {
        el.classList.remove('lh-route-panel-leaving');
      });
      return;
    }
    if (enter === 'forward' || enter === 'back') {
      beginLakeRouteEnter(pathname, enter);
      return;
    }
    if (!isLakeRouteLeaveGuarded()) {
      document.body.classList.remove(
        'lh-route-leaving',
        'lh-leaving',
      );
      document.querySelectorAll('.lh-route-panel-leaving').forEach((el) => {
        el.classList.remove('lh-route-panel-leaving');
      });
    }
  }, [pathname]);

  return null;
}
