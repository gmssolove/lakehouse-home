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
function forceLakeVisible(opts?: { allowDuringRouteLock?: boolean }) {
  const body = document.body;
  body.style.setProperty('opacity', '1');
  body.style.removeProperty('transform');
  body.style.removeProperty('filter');
  body.style.removeProperty('overflow');
  document.documentElement.style.removeProperty('overflow');
  body.classList.remove('lh-leaving', 'lh-route-leaving');

  document.querySelectorAll('.lh-route-panel-leaving').forEach((el) => {
    el.classList.remove('lh-route-panel-leaving');
  });

  if (opts?.allowDuringRouteLock || !isLakeRouteEnterLocked()) {
    clearLakeRouteClasses();
  }
}

function RouteBodyReset() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    document.body.style.setProperty('opacity', '1');
    document.body.classList.remove('lh-leaving');

    /* enter 애니 중에는 클래스를 지우지 않음 — 하이드레이션 리마운트가 슬라이드를 죽임 */
    if (isLakeRouteEnterLocked()) {
      document.querySelectorAll('.lh-route-panel-leaving').forEach((el) => {
        el.classList.remove('lh-route-panel-leaving');
      });
      return;
    }

    forceLakeVisible();
  }, [pathname]);

  useLayoutEffect(() => {
    /* 마운트 시 leaving 잔여만 정리 — enter는 LakeRouteTransition이 적용 */
    document.body.style.setProperty('opacity', '1');
    document.body.classList.remove('lh-leaving');
    document.querySelectorAll('.lh-route-panel-leaving').forEach((el) => {
      el.classList.remove('lh-route-panel-leaving');
    });

    const onShow = () => {
      if (!isLakeRouteEnterLocked()) forceLakeVisible();
      else document.body.style.setProperty('opacity', '1');
    };
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
