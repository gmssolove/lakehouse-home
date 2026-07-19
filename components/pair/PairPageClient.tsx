'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBgm } from '@/lib/contexts/BgmContext';
import { LakeArchiveTopbar } from '@/components/layout/LakeArchiveTopbar';
import { PairRevolveStage } from '@/components/pair/PairRevolveStage';
import { PairArchiveDetail } from '@/components/pair/PairArchiveDetail';
import { PairEditForm } from '@/components/pair/PairEditForm';
import { EntrySplash } from '@/components/shared/EntrySplash';
import { PageTipToast } from '@/components/shared/PageTipToast';
import { LakeEditModal } from '@/components/ui/LakeEditModal';
import { LakeSearchField } from '@/components/ui/LakeSearchField';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import { pairCardSub, pairCardTitle } from '@/lib/oc/pairCover';
import { movePairInList, pairOrderMeta } from '@/lib/oc/pairOrder';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLakeBackGesture, useLakeBackNavigation } from '@/lib/hooks/useLakeBackNavigation';
import { useOcData } from '@/lib/hooks/useOcData';
import { usePairData } from '@/lib/hooks/usePairData';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { AuthModal } from '@/components/auth/AuthModal';
import { LakeAccessGateModal } from '@/components/lake/LakeAccessGateModal';
import { normalizeEntrySplash } from '@/lib/shared/entrySplash';
import { normalizeTipToastSettings } from '@/lib/shared/tipToastQueue';
import {
  isLakeItemUnlocked,
  resolveItemPassword,
  unlockLakeItem,
  verifyLakeAccessPassword,
} from '@/lib/lake/accessGate';
import { clearLakeRouteClasses, isLakeRouteEnterLocked, lakeNavigate } from '@/lib/lake/routeTransition';
import type { OcCharacter, PairItem } from '@/lib/types/character';

type SortMode = 'order' | 'name';

export function PairPageClient() {
  const router = useRouter();
  const { pairs, loaded, savePairs } = usePairData();
  const { characters } = useOcData();
  const { ocSettings, accessSettings } = useSiteContent();
  const { resumePageBgmIfNeeded } = useBgm();
  const { user, isAdmin } = useAuth();
  const { confirm } = useLakeDialog();
  const [detail, setDetail] = useState<PairItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [storyEditFocusId, setStoryEditFocusId] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState(false);
  const [quoteMode, setQuoteMode] = useState(false);
  const [entrySplash, setEntrySplash] = useState<PairItem | null>(null);
  const splashPendingRef = useRef<PairItem | null>(null);
  const [passwordGate, setPasswordGate] = useState<PairItem | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('order');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const layoutSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLayoutRef = useRef<PairItem | null>(null);

  /* 상세가 열려 있으면 테마곡이 character scope — 여기서 resume 하면 테마가 즉시 끊김 */
  useEffect(() => {
    if (detail) return;
    resumePageBgmIfNeeded();
  }, [detail, resumePageBgmIfNeeded]);

  useEffect(() => {
    document.body.style.opacity = '1';
    document.body.classList.remove('lh-leaving');
    if (!isLakeRouteEnterLocked()) {
      clearLakeRouteClasses();
      document.body.classList.remove('lh-route-leaving', 'lh-route-enter');
      document.querySelectorAll('.lh-route-panel-leaving').forEach((el) => {
        el.classList.remove('lh-route-panel-leaving');
      });
    }
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen]);

  const pairsRef = useRef(pairs);
  pairsRef.current = pairs;

  useEffect(() => {
    return () => {
      if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
      const pending = pendingLayoutRef.current;
      if (pending) {
        pendingLayoutRef.current = null;
        const merged = pairsRef.current.map((p) => {
          if (p.id !== pending.id) return p;
          return {
            ...p,
            charBodyLayout: pending.charBodyLayout,
            charGhostLayout: pending.charGhostLayout,
            charHeadLayout: pending.charHeadLayout,
            vnStandPos: pending.vnStandPos ?? p.vnStandPos,
          };
        });
        void savePairs(merged);
      }
    };
  }, [savePairs]);

  const leavePair = useCallback(() => {
    lakeNavigate(router, '/', '/pair');
  }, [router]);

  const routeGuard = useMemo(() => ({ guardPath: '/pair', router }), [router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = pairs;
    if (q) {
      list = pairs.filter((p) => {
        const title = pairCardTitle(p).toLowerCase();
        const sub = pairCardSub(p).toLowerCase();
        const chars = `${p.chars[0]} ${p.chars[1]}`.toLowerCase();
        return title.includes(q) || sub.includes(q) || chars.includes(q);
      });
    }
    if (sortMode === 'name') {
      list = [...list].sort((a, b) =>
        pairCardTitle(a).localeCompare(pairCardTitle(b), 'ko'),
      );
    }
    return list;
  }, [pairs, search, sortMode]);

  async function persistPairs(next: PairItem[]) {
    const saved = await savePairs(next);
    if (detail) {
      const updated = saved.find((p) => p.id === detail.id);
      if (updated) setDetail(updated);
    }
  }

  function mergeLayoutOnly(pending: PairItem): PairItem[] {
    return pairsRef.current.map((p) => {
      if (p.id !== pending.id) return p;
      return {
        ...p,
        charBodyLayout: pending.charBodyLayout,
        charGhostLayout: pending.charGhostLayout,
        charHeadLayout: pending.charHeadLayout,
        vnStandPos: pending.vnStandPos ?? p.vnStandPos,
        panelViews: pending.panelViews ?? p.panelViews,
        floatingQuotes: pending.floatingQuotes ?? p.floatingQuotes,
        floatingQuotesBySide: pending.floatingQuotesBySide,
      };
    });
  }

  function clearPendingLayout() {
    if (layoutSaveTimer.current) {
      clearTimeout(layoutSaveTimer.current);
      layoutSaveTimer.current = null;
    }
    pendingLayoutRef.current = null;
  }

  async function persistPair(next: PairItem) {
    /* 폼 저장이 위치 드래그 스냅샷에 덮어쓰이지 않게 */
    clearPendingLayout();
    await persistPairs(pairsRef.current.map((p) => (p.id === next.id ? next : p)));
  }

  const persistLayoutLive = useCallback(
    (next: PairItem) => {
      setDetail((prev) => {
        if (!prev || prev.id !== next.id) return next;
        return {
          ...prev,
          charBodyLayout: next.charBodyLayout,
          charGhostLayout: next.charGhostLayout,
          charHeadLayout: next.charHeadLayout,
          vnStandPos: next.vnStandPos ?? prev.vnStandPos,
          panelViews: next.panelViews ?? prev.panelViews,
          floatingQuotes: next.floatingQuotes ?? prev.floatingQuotes,
          floatingQuotesBySide: next.floatingQuotesBySide,
        };
      });
      pendingLayoutRef.current = next;
      if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
      layoutSaveTimer.current = setTimeout(() => {
        layoutSaveTimer.current = null;
        const pending = pendingLayoutRef.current;
        pendingLayoutRef.current = null;
        if (!pending) return;
        const merged = mergeLayoutOnly(pending);
        void savePairs(merged).then(() => {
          setDetail((prev) => {
            if (!prev || prev.id !== pending.id) return prev;
            return {
              ...prev,
              charBodyLayout: pending.charBodyLayout,
              charGhostLayout: pending.charGhostLayout,
              charHeadLayout: pending.charHeadLayout,
              vnStandPos: pending.vnStandPos ?? prev.vnStandPos,
              panelViews: pending.panelViews ?? prev.panelViews,
              floatingQuotes: pending.floatingQuotes ?? prev.floatingQuotes,
              floatingQuotesBySide: pending.floatingQuotesBySide,
            };
          });
        });
      }, 420);
    },
    // mergeLayoutOnly closes over pairsRef — stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savePairs],
  );

  const flushLayoutSave = useCallback(() => {
    if (layoutSaveTimer.current) {
      clearTimeout(layoutSaveTimer.current);
      layoutSaveTimer.current = null;
    }
    const pending = pendingLayoutRef.current;
    pendingLayoutRef.current = null;
    if (!pending) return;
    const merged = mergeLayoutOnly(pending);
    void savePairs(merged).then(() => {
      setDetail((prev) => {
        if (!prev || prev.id !== pending.id) return prev;
        return {
          ...prev,
          charBodyLayout: pending.charBodyLayout,
          charGhostLayout: pending.charGhostLayout,
          charHeadLayout: pending.charHeadLayout,
          vnStandPos: pending.vnStandPos ?? prev.vnStandPos,
          panelViews: pending.panelViews ?? prev.panelViews,
          floatingQuotes: pending.floatingQuotes ?? prev.floatingQuotes,
          floatingQuotesBySide: pending.floatingQuotesBySide,
        };
      });
    });
  }, [savePairs]);

  const toggleLayoutMode = useCallback(() => {
    setLayoutMode((on) => {
      if (on) flushLayoutSave();
      return !on;
    });
    setQuoteMode(false);
    setEditOpen(false);
  }, [flushLayoutSave]);

  const toggleQuoteMode = useCallback(() => {
    setQuoteMode((on) => {
      if (on) flushLayoutSave();
      return !on;
    });
    setLayoutMode(false);
    setEditOpen(false);
  }, [flushLayoutSave]);

  const [detailLeaving, setDetailLeaving] = useState(false);
  const leaveTimerRef = useRef(0);
  const listEnterTimerRef = useRef(0);

  const playArchiveListEnter = useCallback(() => {
    const layout = document.querySelector('.layout.oc-archive-layout');
    if (!layout) return;
    layout.classList.remove('is-list-enter');
    void (layout as HTMLElement).offsetWidth;
    layout.classList.add('is-list-enter');
    window.clearTimeout(listEnterTimerRef.current);
    listEnterTimerRef.current = window.setTimeout(() => {
      layout.classList.remove('is-list-enter');
    }, 900);
  }, []);

  const handleDetailBack = useCallback(() => {
    if (detailLeaving) return;
    flushLayoutSave();
    setEditOpen(false);
    setLayoutMode(false);
    setQuoteMode(false);
    splashPendingRef.current = null;
    setEntrySplash(null);
    if (!detail) {
      setDetail(null);
      return;
    }
    setDetailLeaving(true);
    window.clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = window.setTimeout(() => {
      setDetail(null);
      setDetailLeaving(false);
      requestAnimationFrame(() => playArchiveListEnter());
    }, 720);
  }, [detail, detailLeaving, flushLayoutSave, playArchiveListEnter]);

  useEffect(() => {
    return () => {
      window.clearTimeout(leaveTimerRef.current);
      window.clearTimeout(listEnterTimerRef.current);
    };
  }, []);

  useLakeBackNavigation(!!detail || !!entrySplash, handleDetailBack, 'pair-detail', routeGuard);
  useLakeBackNavigation(editOpen, () => setEditOpen(false), 'pair-edit', routeGuard);
  useLakeBackGesture(leavePair, !detail && !editOpen && !entrySplash);

  async function deletePair(id: string) {
    await persistPairs(pairs.filter((p) => p.id !== id));
    setEditOpen(false);
    setDetail(null);
  }

  async function movePair(id: string, direction: -1 | 1) {
    const next = movePairInList(pairs, id, direction);
    if (next === pairs) return;
    await persistPairs(next);
  }

  function proceedOpenPair(p: PairItem) {
    setSidebarOpen(false);
    setLayoutMode(false);
    setQuoteMode(false);
    if (normalizeEntrySplash(p.entrySplash).enabled) {
      splashPendingRef.current = p;
      setEntrySplash(p);
      setDetail(null);
      return;
    }
    splashPendingRef.current = null;
    setEntrySplash(null);
    setDetail(p);
  }

  function openPair(p: PairItem) {
    if (isAdmin || !p.secret || isLakeItemUnlocked('pair', p.id, resolveItemPassword('pair', p, accessSettings))) {
      proceedOpenPair(p);
      return;
    }
    setPasswordGate(p);
  }

  const finishEntrySplash = useCallback(() => {
    const pending = splashPendingRef.current;
    splashPendingRef.current = null;
    setEntrySplash(null);
    if (pending) setDetail(pending);
  }, []);

  const liveDetail = useMemo(() => {
    if (!detail) return null;
    return pairs.find((p) => p.id === detail.id) ?? detail;
  }, [detail, pairs]);

  const detailTitle = liveDetail ? pairCardTitle(liveDetail) : '';
  const detailOrder = liveDetail ? pairOrderMeta(pairs, liveDetail.id) : null;

  /** 페어 캐릭터 이름이 내 OC와 일치하면 해당 OC 프로필로 이동하는 링크를 만든다 (#16) */
  const ocProfileLinks = useMemo<[string | undefined, string | undefined]>(() => {
    const linkFor = (oc?: OcCharacter): string | undefined =>
      oc ? `/oc?c=${encodeURIComponent(String(oc.id))}&view=detail` : undefined;
    // 편집에서 명시 지정한 OC만 — 미선택이면 버튼도 표시하지 않는다.
    const resolve = (explicitId?: string): string | undefined => {
      if (explicitId == null || explicitId === '') return undefined;
      const picked = characters.find((c) => String(c.id) === explicitId);
      return picked ? linkFor(picked) : undefined;
    };
    return [
      resolve(liveDetail?.charNotes?.[0]?.ocProfileId),
      resolve(liveDetail?.charNotes?.[1]?.ocProfileId),
    ];
  }, [characters, liveDetail]);
  const tipToastPair = useMemo(
    () => normalizeTipToastSettings(ocSettings.tipToastPair),
    [ocSettings.tipToastPair],
  );
  const showArchiveTip = !detail && !entrySplash;

  return (
    <>
      <LakeArchiveTopbar
        title="Pair — Relationships"
        active="pair"
        back={
          detail || entrySplash ? (
            <button type="button" className="nav-back" onClick={handleDetailBack}>
              ← back
            </button>
          ) : (
            <button type="button" className="nav-back" onClick={leavePair}>
              ← back
            </button>
          )
        }
      />

      <div className={`layout oc-archive-layout${sidebarOpen ? ' is-sidebar-open' : ''}`}>
        <button
          type="button"
          className="oc-mobile-burger"
          aria-label="필터 메뉴"
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(true)}
        >
          ☰
        </button>
        <button
          type="button"
          className="oc-mobile-backdrop"
          aria-label="필터 닫기"
          onClick={() => setSidebarOpen(false)}
        />
        <div className="sidebar">
          <button
            type="button"
            className="oc-mobile-burger"
            style={{ position: 'absolute', top: 10, right: 10, left: 'auto' }}
            aria-label="필터 닫기"
            onClick={() => setSidebarOpen(false)}
          >
            ×
          </button>
          <div>
            <div className="s-title">Search</div>
            <LakeSearchField
              variant="line"
              placeholder="이름으로 검색..."
              value={search}
              onChange={setSearch}
            />
            <div className="oc-filter-bar oc-filter-bar--sidebar" role="group" aria-label="Pair 정렬">
              <select
                id="pair-filter-sort"
                className="oc-filter-select"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                aria-label="정렬"
              >
                <option value="order">정렬 · 등록순</option>
                <option value="name">정렬 · 이름</option>
              </select>
            </div>
          </div>
          <div>
            <div className="s-title">Category</div>
            <div className="filter-group" id="category-filters">
              <button type="button" className="filter-btn active">
                All
              </button>
            </div>
          </div>
          <div className="sidebar-count">{loaded ? `${filtered.length}개` : '\u00A0'}</div>
        </div>

        <div className="main-content">
          <h2 className="oc-archive-heading">Pair Archive</h2>
          <PairRevolveStage pairs={filtered} onOpen={openPair} />
        </div>
      </div>

      <div
        id="detail-screen"
        className={`pair-detail-screen${detail || entrySplash || detailLeaving ? ' active' : ''}${
          detailLeaving ? ' is-ui-leaving' : ''
        }${editOpen ? ' is-pair-edit-open' : ''}`}
      >
        {liveDetail ? (
          <>
            <div className="detail-nav">
              <button type="button" className="detail-back-btn" onClick={handleDetailBack}>
                ← 목록
              </button>
              <div className="detail-nav-title">{detailTitle}</div>
              {isAdmin ? (
                <>
                  <button
                    type="button"
                    className={`btn-edit${layoutMode ? ' is-active' : ''}`}
                    onClick={toggleLayoutMode}
                    title="전신·정보탭 이미지 위치/레이아웃 조정"
                  >
                    {layoutMode ? '✓ 위치' : '위치'}
                  </button>
                  {layoutMode ? (
                    <button
                      type="button"
                      className={`btn-edit${liveDetail.charGhostBlur !== false ? ' is-active' : ''}`}
                      onClick={() => {
                        const nextOn = liveDetail.charGhostBlur === false;
                        persistLayoutLive({ ...liveDetail, charGhostBlur: nextOn });
                      }}
                      title="양옆 고스트 soft blur"
                    >
                      {liveDetail.charGhostBlur === false ? '고스트 블러 OFF' : '고스트 블러'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`btn-edit${quoteMode ? ' is-active' : ''}`}
                    onClick={toggleQuoteMode}
                    title="플로팅 대사 위치·크기"
                  >
                    {quoteMode ? '✓ 대사' : '대사'}
                  </button>
                  <button
                    type="button"
                    className="btn-edit"
                    onClick={() => {
                      setLayoutMode(false);
                      setQuoteMode(false);
                      flushLayoutSave();
                      setEditOpen(true);
                    }}
                  >
                    ✎ 수정
                  </button>
                </>
              ) : null}
            </div>
            <div className="pair-detail-layout pair-detail-layout--archive">
              <PairArchiveDetail
                pair={liveDetail}
                ocProfileLinks={ocProfileLinks}
                layoutEditable={layoutMode}
                quoteEditable={quoteMode}
                standEditable={isAdmin}
                onLayoutChange={persistLayoutLive}
                isAdmin={isAdmin}
                accessSettings={accessSettings}
                onRequestEdit={(opts) => {
                  setLayoutMode(false);
                  setQuoteMode(false);
                  flushLayoutSave();
                  setStoryEditFocusId(opts?.storyFocusId ?? null);
                  if (opts?.storyFocusId) {
                    try {
                      sessionStorage.setItem('lh_pair_story_focus', opts.storyFocusId);
                    } catch {
                      /* ignore */
                    }
                  }
                  if (opts?.openStoryTab || opts?.storyFocusId) {
                    try {
                      sessionStorage.setItem('lh_pair_open_story_tab', '1');
                    } catch {
                      /* ignore */
                    }
                  }
                  setEditOpen(true);
                }}
              />
            </div>
          </>
        ) : null}
      </div>

      {entrySplash ? (
        <EntrySplash
          config={entrySplash.entrySplash}
          imageSrc=""
          eyebrow="Pair"
          title={pairCardTitle(entrySplash)}
          tipStorageKey={`lh_entry_tip_pair_${entrySplash.id}`}
          onDone={finishEntrySplash}
        />
      ) : null}

      <PageTipToast active={showArchiveTip} settings={tipToastPair} storageKey="lh_tip_toast_pair" />

      {liveDetail ? (
        <LakeEditModal
          open={editOpen}
          className="lake-edit-modal--pair"
          eyebrow="ADMIN · PAIR"
          title="페어 수정"
          onClose={() => {
            setEditOpen(false);
            setStoryEditFocusId(null);
          }}
        >
          <PairEditForm
            key={editOpen ? liveDetail.id : 'closed'}
            pair={liveDetail}
            characters={characters}
            initialStoryFocusId={storyEditFocusId}
            onSave={persistPair}
            order={
              detailOrder && detailOrder.index >= 0
                ? {
                    canUp: detailOrder.canUp,
                    canDown: detailOrder.canDown,
                    position: detailOrder.index + 1,
                    total: detailOrder.total,
                  }
                : undefined
            }
            onMove={(dir) => void movePair(liveDetail.id, dir)}
            onDelete={async () => {
              if (!(await confirm('이 페어 항목을 삭제할까요?'))) return;
              await deletePair(liveDetail.id);
            }}
          />
        </LakeEditModal>
      ) : null}

      <LakeAccessGateModal
        open={!!passwordGate}
        scope="pair"
        item={passwordGate ?? undefined}
        accessSettings={accessSettings}
        title="Pair Access"
        description={
          passwordGate
            ? `${pairCardTitle(passwordGate)} — 로그인 후 비밀번호를 입력하세요.`
            : '페어 — 로그인 후 비밀번호를 입력하세요.'
        }
        loggedIn={!!user}
        onClose={() => setPasswordGate(null)}
        onRequestLogin={() => {
          setPasswordGate(null);
          setAuthOpen(true);
        }}
        onSuccess={() => {
          const pending = passwordGate;
          setPasswordGate(null);
          if (pending) proceedOpenPair(pending);
        }}
        verifyOverride={(input) => {
          const p = passwordGate;
          if (!p) return false;
          if (!verifyLakeAccessPassword('pair', input, accessSettings, p)) return false;
          unlockLakeItem('pair', p.id, resolveItemPassword('pair', p, accessSettings));
          return true;
        }}
      />
      <AuthModal backdrop="popup" open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
