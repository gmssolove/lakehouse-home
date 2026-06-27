'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthModal } from '@/components/auth/AuthModal';
import { RecordsSectionTopbar } from '@/components/layout/RecordsSectionTopbar';
import { RecordsContent } from '@/components/records/RecordsContent';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLakeBackGesture, useLakeBackNavigation } from '@/lib/hooks/useLakeBackNavigation';
import { lakeBackConfigureGuard } from '@/lib/hooks/lakeBackStack';
import { useMainBgmVisibility } from '@/lib/contexts/MainBgmVisibilityContext';
import type { RecordsSectionId } from '@/lib/records/sections';

type Props = {
  section: RecordsSectionId;
};

export function RecordsPageClient({ section }: Props) {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { setHidden: setMainBgmHidden } = useMainBgmVisibility();
  const [authOpen, setAuthOpen] = useState(false);

  const routeGuard = { guardPath: `/records/${section}`, router };

  useEffect(() => {
    lakeBackConfigureGuard(`/records/${section}`, router);
  }, [router, section]);

  useEffect(() => {
    setMainBgmHidden(section === 'music');
    return () => setMainBgmHidden(false);
  }, [section, setMainBgmHidden]);

  useLakeBackNavigation(true, () => router.push('/'), `records-${section}`, routeGuard);
  useLakeBackGesture(() => router.push('/'), true);

  return (
    <>
      <RecordsSectionTopbar section={section} />
      <main className="records-section-main">
        <RecordsContent
          section={section}
          user={user}
          isAdmin={isAdmin}
          onOpenAuth={() => setAuthOpen(true)}
        />
      </main>
      <AuthModal backdrop="popup" open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
