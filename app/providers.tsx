'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { BgmPlayer } from '@/components/bgm/BgmPlayer';
import { LakeDialogProvider } from '@/components/ui/LakeDialog';
import { SaveToastProvider } from '@/components/ui/SaveToast';
import { SiteEffects } from '@/components/ui/SiteEffects';
import { BgmProvider } from '@/lib/contexts/BgmContext';
import { SiteContentProvider } from '@/lib/contexts/SiteContentContext';

function RouteBodyReset() {
  const pathname = usePathname();

  useEffect(() => {
    document.body.classList.remove('lh-leaving');
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
          <BgmProvider>
            <RouteBodyReset />
            {children}
            <SiteEffects />
            <BgmPlayer />
          </BgmProvider>
        </SiteContentProvider>
      </SaveToastProvider>
    </LakeDialogProvider>
  );
}
