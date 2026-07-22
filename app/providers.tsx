'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect } from 'react';
import { BgmPlayer } from '@/components/bgm/BgmPlayer';
import { LakeDialogProvider } from '@/components/ui/LakeDialog';
import { SaveToastProvider } from '@/components/ui/SaveToast';
import { SiteEffects } from '@/components/ui/SiteEffects';
import { LakeRouteTransition } from '@/components/layout/LakeRouteTransition';
import { BgmProvider, useBgm } from '@/lib/contexts/BgmContext';
import { MainBgmVisibilityProvider, useMainBgmVisibility } from '@/lib/contexts/MainBgmVisibilityContext';
import { SiteContentProvider } from '@/lib/contexts/SiteContentContext';
import { R2UploadConfigSync } from '@/components/ui/R2UploadConfigSync';
import { LiveDevHud } from '@/components/dev/LiveDevHud';

import { clearLakeRouteClasses, isLakeRouteEnterLocked, recoverStuckLakeRoute } from '@/lib/lake/routeTransition';
import { installDomRemoveChildGuard } from '@/lib/lake/domRemoveChildGuard';

installDomRemoveChildGuard();

/** 하드 리프레시·이탈 중단 시 opacity:0 / leave 베일 고착("무한 로딩") 방지 */
function forceLakeVisible() {
  const body = document.body;
  body.style.setProperty('opacity', '1', 'important');
  body.style.removeProperty('transform');
  body.style.removeProperty('filter');
  body.style.removeProperty('overflow');
  document.documentElement.style.removeProperty('overflow');
  document.getElementById('lh-route-veil')?.remove();

  /* enter 연출 중이면 클래스 유지 — 400ms 폴링이 애니는 끊지 않게 */
  if (isLakeRouteEnterLocked()) {
    body.classList.remove('lh-leaving', 'lh-route-leaving');
    return;
  }

  body.classList.remove(
    'lh-leaving',
    'lh-route-leaving',
    'lh-route-enter',
    'lh-route-forward',
    'lh-route-back',
    'lh-route-trpg-enter',
    'lh-nav-instant',
  );
  document.documentElement.classList.remove('lh-nav-instant');
  document.querySelectorAll('.lh-route-panel-leaving').forEach((el) => {
    el.classList.remove('lh-route-panel-leaving');
  });
  clearLakeRouteClasses();
}

function RouteBodyReset() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    forceLakeVisible();
    recoverStuckLakeRoute();
  }, [pathname]);

  useLayoutEffect(() => {
    forceLakeVisible();
    recoverStuckLakeRoute();

    const onShow = () => {
      forceLakeVisible();
      recoverStuckLakeRoute();
    };
    window.addEventListener('pageshow', onShow);

    /* 짧은 폴링 — JS 크래시 직후 잔여 클래스 복구 */
    const t1 = window.setTimeout(forceLakeVisible, 400);
    const t2 = window.setTimeout(forceLakeVisible, 1500);

    return () => {
      window.removeEventListener('pageshow', onShow);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  return null;
}

/** /vn 게임 내에서는 사이트 BGM 플레이어 숨김 + 재생 중지 — 사이트(/ · /oc · /pair 등)는 유지 */
function SiteBgmPlayerGate() {
  const pathname = usePathname();
  const { setHidden } = useMainBgmVisibility();
  const { setPlaybackSuppressed } = useBgm();

  useEffect(() => {
    const onVn = pathname === '/vn' || pathname.startsWith('/vn/');
    setHidden(onVn);
    setPlaybackSuppressed(onVn);
    return () => {
      setHidden(false);
      setPlaybackSuppressed(false);
    };
  }, [pathname, setHidden, setPlaybackSuppressed]);

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
