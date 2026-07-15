'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect } from 'react';
import { BgmPlayer } from '@/components/bgm/BgmPlayer';
import { LakeDialogProvider } from '@/components/ui/LakeDialog';
import { SaveToastProvider } from '@/components/ui/SaveToast';
import { SiteEffects } from '@/components/ui/SiteEffects';
import { LakeRouteTransition } from '@/components/layout/LakeRouteTransition';
import { BgmProvider } from '@/lib/contexts/BgmContext';
import { MainBgmVisibilityProvider, useMainBgmVisibility } from '@/lib/contexts/MainBgmVisibilityContext';
import { SiteContentProvider } from '@/lib/contexts/SiteContentContext';
import { R2UploadConfigSync } from '@/components/ui/R2UploadConfigSync';
import { LiveDevHud } from '@/components/dev/LiveDevHud';

import { clearLakeRouteClasses, isLakeRouteEnterLocked } from '@/lib/lake/routeTransition';

/** 하드 리프레시·이탈 중단 시 opacity:0 고착("무한 로딩") 방지 */
function forceLakeVisible() {
  const body = document.body;
  body.style.setProperty('opacity', '1');
  body.style.removeProperty('transform');
  body.style.removeProperty('filter');
  body.style.removeProperty('overflow');
  document.documentElement.style.removeProperty('overflow');
  body.classList.remove('lh-leaving');

  document.querySelectorAll('.lh-route-panel-leaving').forEach((el) => {
    el.classList.remove('lh-route-panel-leaving');
  });

  if (!isLakeRouteEnterLocked()) {
    clearLakeRouteClasses();
  }
}

function RouteBodyReset() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    forceLakeVisible();

    if (!isLakeRouteEnterLocked()) return;

    const t = window.setTimeout(() => {
      forceLakeVisible();
      clearLakeRouteClasses();
    }, 1000);
    return () => window.clearTimeout(t);
  }, [pathname]);

  useLayoutEffect(() => {
    forceLakeVisible();
    const onShow = () => forceLakeVisible();
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  return null;
}

/** /vn 게임 내에서는 사이트 BGM 플레이어 숨김 — 사이트(/ · /oc · /pair 등)는 유지 */
function SiteBgmPlayerGate() {
  const pathname = usePathname();
  const { setHidden } = useMainBgmVisibility();

  useEffect(() => {
    const onVn = pathname === '/vn' || pathname.startsWith('/vn/');
    setHidden(onVn);
    return () => setHidden(false);
  }, [pathname, setHidden]);

  return <BgmPlayer />;
}

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <LakeDialogProvider>
      <SaveToastProvider>
        <SiteContentProvider>
          <R2UploadConfigSync />
          <MainBgmVisibilityProvider>
            <BgmProvider>
              <RouteBodyReset />
              <LakeRouteTransition />
              {children}
              <LiveDevHud />
              <SiteEffects />
              <SiteBgmPlayerGate />
            </BgmProvider>
          </MainBgmVisibilityProvider>
        </SiteContentProvider>
      </SaveToastProvider>
    </LakeDialogProvider>
  );
}
