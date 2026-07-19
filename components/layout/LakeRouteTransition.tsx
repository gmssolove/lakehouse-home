'use client';

import { usePathname } from 'next/navigation';
import { useLayoutEffect } from 'react';
import {
  beginLakeRouteEnter,
  clearLakeRouteClasses,
  consumeNavInstant,
  consumePendingLakeRouteDir,
  consumeStashedRouteEnter,
  isLakeRouteLeaveGuarded,
} from '@/lib/lake/routeTransition';

export function LakeRouteTransition() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    document.body.style.setProperty('opacity', '1');
    consumeNavInstant();

    let dir: 'forward' | 'back' | 'neutral' | 'skip' = consumePendingLakeRouteDir();
    if (dir === 'neutral') {
      dir = consumeStashedRouteEnter(pathname) ?? 'neutral';
    }
    if (dir === 'skip') {
      clearLakeRouteClasses();
      return;
    }
    if (dir === 'neutral') {
      if (!isLakeRouteLeaveGuarded()) clearLakeRouteClasses();
      return;
    }
    beginLakeRouteEnter(pathname, dir);
  }, [pathname]);

  return null;
}
