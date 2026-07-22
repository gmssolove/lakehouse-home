'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { AuthModal } from '@/components/auth/AuthModal';
import { AdminOverlay } from '@/components/admin/AdminOverlay';
import { HomeContent } from '@/components/home/HomeContent';
import { ClickerWidget } from '@/components/home/ClickerWidget';
import { BackgroundDecor } from '@/components/layout/BackgroundDecor';
import { LeftNav, type HomePageId } from '@/components/layout/LeftNav';
import { LakeAccessGateModal } from '@/components/lake/LakeAccessGateModal';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLakeBackGesture, useLakeBackNavigation } from '@/lib/hooks/useLakeBackNavigation';
import { lakeBackClearAll, lakeBackConfigureGuard, lakeHistoryReplaceQuiet } from '@/lib/hooks/lakeBackStack';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { isLakeAccessUnlocked } from '@/lib/lake/accessGate';
import { lakeNavigate, clearLakeRouteClasses } from '@/lib/lake/routeTransition';
import { auth } from '@/lib/firebase/client';
import { HOME_RECORDS_TABS, isHomeRecordsTabId } from '@/lib/records/sections';
import type { TrpgScenario } from '@/lib/types/site-content';

type AdminPhase = 'idle' | 'open' | 'closing';

const TAB_PARAMS: HomePageId[] = ['trpg', 'charArchive', 'universe', 'notice', 'guest', 'banner', ...HOME_RECORDS_TABS];

export function HomePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, isAdmin, refreshAuth } = useAuth();
  const { trpg, accessSettings, uiSettings, loaded: siteLoaded } = useSiteContent();
  const [page, setPage] = useState<HomePageId>('main');
  const [leavingPage, setLeavingPage] = useState<HomePageId | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [trpgGate, setTrpgGate] = useState<TrpgScenario | null>(null);
  const [adminPhase, setAdminPhase] = useState<AdminPhase>('idle');

  // 메뉴 전환/뒤로가기 시 이전 콘텐츠를 잠깐 남겨 아웃 애니메이션을 재생
  const startPageTransition = useCallback((from: HomePageId, to: HomePageId) => {
    if (from === to || from === 'main') return;
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setLeavingPage(from);
    leaveTimer.current = setTimeout(() => setLeavingPage(null), 360);
  }, []);

  useEffect(() => () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
  }, []);

  useEffect(() => {
    const on = adminPhase !== 'idle';
    document.body.classList.toggle('lh-admin-open', on);
    return () => document.body.classList.remove('lh-admin-open');
  }, [adminPhase]);

  const requestCloseAdmin = useCallback(() => {
    setAdminPhase((p) => (p === 'open' ? 'closing' : p));
  }, []);

  const finishCloseAdmin = useCallback(() => {
    setAdminPhase('idle');
    /* admin=1 쿼리만 네이티브 history 로 정리 — router.replace / 패치된 replaceState 금지 */
    if (searchParams.get('admin') === '1') {
      const next = new URLSearchParams(searchParams.toString());
      next.delete('admin');
      const q = next.toString();
      lakeHistoryReplaceQuiet(q ? `/?${q}` : '/');
    }
  }, [searchParams]);

  const handlePageBack = useCallback(() => {
    setPage((prev) => {
      startPageTransition(prev, 'main');
      return 'main';
    });
    lakeHistoryReplaceQuiet('/');
  }, [startPageTransition]);

  const routeGuard = { guardPath: '/', router };

  useEffect(() => {
    lakeBackConfigureGuard('/', router);
  }, [router]);

  useEffect(() => {
    clearLakeRouteClasses();
  }, []);

  useEffect(() => {
    const tab = searchParams.get('p');
    if (tab === 'timeline' || tab === 'sadam') {
      setPage('diary');
      router.replace('/?p=diary', { scroll: false });
      return;
    }
    if (tab === 'music') {
      router.replace('/?p=diary', { scroll: false });
      return;
    }
    const pageTab = tab as HomePageId | null;
    if (pageTab && TAB_PARAMS.includes(pageTab)) setPage(pageTab);
    if (searchParams.get('admin') === '1' && isAdmin && adminPhase === 'idle') {
      setAdminPhase('open');
    }
  }, [adminPhase, isAdmin, router, searchParams]);

  useLakeBackNavigation(
    page !== 'main' && adminPhase === 'idle',
    handlePageBack,
    `page-${page}`,
    routeGuard,
  );

  useLakeBackGesture(() => {
    if (adminPhase === 'idle' && page !== 'main') {
      startPageTransition(page, 'main');
      setPage('main');
    }
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
    setPage((prev) => {
      startPageTransition(prev, next);
      return next;
    });
    if (adminPhase !== 'idle') setAdminPhase('idle');
    if (
      next === 'trpg' ||
      next === 'charArchive' ||
      next === 'universe' ||
      next === 'notice' ||
      next === 'guest' ||
      next === 'banner' ||
      isHomeRecordsTabId(next)
    ) {
      router.replace(`/?p=${next}`, { scroll: false });
    } else if (searchParams.get('p')) {
      router.replace('/', { scroll: false });
    }
  }

  const trpgUnlocked = isAdmin || isLakeAccessUnlocked('trpg');

  const closeTrpgGate = useCallback(() => {
    setTrpgGate(null);
    if (searchParams.get('trpg')) {
      router.replace('/?p=trpg', { scroll: false });
    }
  }, [router, searchParams]);

  useEffect(() => {
    if (!siteLoaded || trpgUnlocked) return;
    const gateId = searchParams.get('trpg');
    if (!gateId) return;
    const item = trpg.find((s) => s.id === gateId);
    if (!item) return;
    setPage('trpg');
    setTrpgGate(item);
  }, [searchParams, siteLoaded, trpg, trpgUnlocked]);

  const openTrpgScenario = useCallback(
    (item: TrpgScenario) => {
      if (!trpgUnlocked) {
        setPage('trpg');
        setTrpgGate(item);
        return;
      }
      lakeNavigate(router, `/trpg/${encodeURIComponent(item.id)}`, '/');
    },
    [router, trpgUnlocked],
  );

  return (
    <>
      <BackgroundDecor />
      {/* Outside .layout so route slide transforms don't break fixed menu placement */}
      <LeftNav
        user={user}
        profile={profile}
        isAdmin={isAdmin}
        activePage={adminPhase === 'open' ? 'admin' : page}
        onPageChange={changePage}
        onOpenAuth={() => setAuthOpen(true)}
        onLogout={() => signOut(auth)}
        onNicknameUpdated={refreshAuth}
      />
      <div className="layout layout--home">
        <div className="right-panel">
          <HomeContent
            page={page}
            leavingPage={leavingPage}
            user={user}
            isAdmin={isAdmin}
            onOpenAuth={() => setAuthOpen(true)}
            onTicketClick={openTrpgScenario}
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
      <LakeAccessGateModal
        open={!!trpgGate}
        scope="trpg"
        accessSettings={accessSettings}
        title="TRPG Archive"
        description={
          trpgGate?.title
            ? `${trpgGate.title} — 로그인 후 비밀번호를 입력하세요.`
            : '로그인 후 비밀번호를 입력해야 열람할 수 있습니다.'
        }
        loggedIn={!!user}
        onClose={closeTrpgGate}
        onRequestLogin={() => {
          setTrpgGate(null);
          setAuthOpen(true);
        }}
        onSuccess={() => {
          const pending = trpgGate;
          setTrpgGate(null);
          if (!pending) return;
          lakeNavigate(router, `/trpg/${encodeURIComponent(pending.id)}`, '/');
        }}
      />
      <AuthModal backdrop="popup" open={authOpen} onClose={() => setAuthOpen(false)} />
      {page === 'main' && adminPhase === 'idle' ? (
        <ClickerWidget
          enabled={uiSettings.clickerEnabled}
          title={uiSettings.clickerTitle}
          hint={uiSettings.clickerHint}
          defaultVolume={uiSettings.clickerDefaultVolume}
          soundPreset={uiSettings.clickerSoundPreset}
          soundCustom={uiSettings.clickerSoundCustom}
          buttons={uiSettings.clickerButtons}
        />
      ) : null}
    </>
  );
}
