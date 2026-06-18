'use client';

import { useEffect, useRef } from 'react';
import {
  lakeBackConfigureGuard,
  lakeBackPush,
  lakeBackRemove,
  lakeBackSetGestureFallback,
} from '@/lib/hooks/lakeBackStack';

/**
 * Page-level back when no in-app back layers are registered (e.g. leave /oc → home).
 */
export function useLakeBackGesture(onBack: () => void, enabled = true) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!enabled) {
      lakeBackSetGestureFallback(null, false);
      return;
    }
    lakeBackSetGestureFallback(() => onBackRef.current(), true);
    return () => lakeBackSetGestureFallback(null, false);
  }, [enabled]);
}

type RouteGuardOptions = {
  guardPath: string;
  router: { replace: (href: string, options?: { scroll?: boolean }) => void };
};

/**
 * Register a back layer while `active`. Browser / mouse back pops one layer at a time.
 */
export function useLakeBackNavigation(
  active: boolean,
  onBack: () => void,
  label = 'lake',
  routeGuard?: RouteGuardOptions,
) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!routeGuard) return;
    lakeBackConfigureGuard(routeGuard.guardPath, routeGuard.router);
  }, [routeGuard?.guardPath, routeGuard?.router]);

  useEffect(() => {
    if (!active) return;
    const id = label;
    lakeBackPush(id, () => onBackRef.current());
    return () => lakeBackRemove(id);
  }, [active, label]);
}
