'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { AuthModal } from '@/components/auth/AuthModal';
import { AdminOverlay } from '@/components/admin/AdminOverlay';
import { HomeContent } from '@/components/home/HomeContent';
import { BackgroundDecor } from '@/components/layout/BackgroundDecor';
import { LeftNav, type HomePageId } from '@/components/layout/LeftNav';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLakeBackGesture, useLakeBackNavigation } from '@/lib/hooks/useLakeBackNavigation';
import { lakeBackClearAll, lakeBackConfigureGuard } from '@/lib/hooks/lakeBackStack';
import { useMainBgmVisibility } from '@/lib/contexts/MainBgmVisibilityContext';
import { auth } from '@/lib/firebase/client';

type AdminPhase = 'idle' | 'open' | 'closing';

const TAB_PARAMS: HomePageId[] = ['trpg', 'diary', 'scrap', 'review', 'music', 'charArchive'];

export function HomePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAdmin } = useAuth();
  const { setHidden: setMainBgmHidden } = useMainBgmVisibility();
  const [page, setPage] = useState<HomePageId>('main');
  const [authOpen, setAuthOpen] = useState(false);
  const [adminPhase, setAdminPhase] = useState<AdminPhase>('idle');

  const requestCloseAdmin = useCallback(() => {
    setAdminPhase((p) => (p === 'open' ? 'closing' : p));
  }, []);

  const finishCloseAdmin = useCallback(() => {
    setAdminPhase('idle');
    router.replace('/', { scroll: false });
  }, [router]);

  const handlePageBack = useCallback(() => setPage('main'), []);

  const routeGuard = { guardPath: '/', router };

  useEffect(() => {
    lakeBackConfigureGuard('/', router);
  }, [router]);

  useEffect(() => {
    const tab = searchParams.get('p') as HomePageId | null;
    if (tab && TAB_PARAMS.includes(tab)) setPage(tab);
    if (searchParams.get('admin') === '1' && isAdmin && adminPhase === 'idle') {
      setAdminPhase('open');
    }
  }, [adminPhase, isAdmin, searchParams]);

  useEffect(() => {
    setMainBgmHidden(page === 'music');
    return () => setMainBgmHidden(false);
  }, [page, setMainBgmHidden]);

  useLakeBackNavigation(
    page !== 'main' && adminPhase === 'idle',
    handlePageBack,
    `page-${page}`,
    routeGuard,
  );

  useLakeBackGesture(() => {
    if (adminPhase === 'idle' && page !== 'main') setPage('main');
  }, adminPhase === 'idle' && page !== 'main');

  function changePage(next: HomePageId) {
    if (next === 'admin') {
      if (adminPhase === 'open') return;
      if (adminPhase === 'closing') {
        setAdminPhase('open');
        return;
      }
      lakeBackClearAll();
      setAdminPhase('open');
      return;
    }
    setPage(next);
    if (adminPhase !== 'idle') setAdminPhase('idle');
  }

  return (
    <>
      <BackgroundDecor />
      <div className="layout layout--home">
        <LeftNav
          user={user}
          isAdmin={isAdmin}
          activePage={adminPhase === 'open' ? 'admin' : page}
          onPageChange={changePage}
          onOpenAuth={() => setAuthOpen(true)}
          onLogout={() => signOut(auth)}
        />
        <div className="right-panel">
          <HomeContent
            page={page}
            user={user}
            isAdmin={isAdmin}
            onOpenAuth={() => setAuthOpen(true)}
          />
        </div>
      </div>
      {adminPhase !== 'idle' && (
        <Suspense fallback={null}>
          <AdminOverlay
            phase={adminPhase === 'closing' ? 'closing' : 'open'}
            onRequestClose={requestCloseAdmin}
            onClosed={finishCloseAdmin}
          />
        </Suspense>
      )}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
