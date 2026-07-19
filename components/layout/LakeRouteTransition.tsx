'use client';

import { usePathname } from 'next/navigation';
import { useLayoutEffect } from 'react';
import {
  beginLakeRouteEnter,
  clearLakeRouteClasses,
  consumePendingLakeRouteDir,
} from '@/lib/lake/routeTransition';

export function LakeRouteTransition() {
  const pathname = usePathname();

  /* paint 전에 enter 클래스를 붙여 새 페이지가 한 프레임 확 뜨는 "뚝" 끊김 방지 */
  useLayoutEffect(() => {
    const dir = consumePendingLakeRouteDir();
    if (dir === 'neutral') {
      clearLakeRouteClasses();
      return;
    }
    beginLakeRouteEnter(pathname, dir);
  }, [pathname]);

  return null;
}
