'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { BgmPlayer } from '@/components/bgm/BgmPlayer';
import { LakeDialogProvider } from '@/components/ui/LakeDialog';
import { SaveToastProvider } from '@/components/ui/SaveToast';
import { SiteEffects } from '@/components/ui/SiteEffects';
import { LakeRouteTransition } from '@/components/layout/LakeRouteTransition';
import { BgmProvider } from '@/lib/contexts/BgmContext';
import { MainBgmVisibilityProvider } from '@/lib/contexts/MainBgmVisibilityContext';
import { SiteContentProvider } from '@/lib/contexts/SiteContentContext';
import { R2UploadConfigSync } from '@/components/ui/R2UploadConfigSync';

import { isLakeRouteEnterLocked } from '@/lib/lake/routeTransition';

function RouteBodyReset() {
  const pathname = usePathname();

  useEffect(() => {
    if (isLakeRouteEnterLocked()) return;
    document.body.classList.remove('lh-leaving', 'lh-route-leaving');
    document.body.style.removeProperty('opacity');
    document.body.style.removeProperty('transform');
    document.body.style.removeProperty('filter');
  }, [pathname]);

  return null;
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
              <SiteEffects />
              <BgmPlayer />
            </BgmProvider>
          </MainBgmVisibilityProvider>
        </SiteContentProvider>
      </SaveToastProvider>
    </LakeDialogProvider>
  );
}
