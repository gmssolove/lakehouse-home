'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBgm } from '@/lib/contexts/BgmContext';
import { LakeArchiveTopbar } from '@/components/layout/LakeArchiveTopbar';
import { PairRevolveStage } from '@/components/pair/PairRevolveStage';
import { PairArchiveDetail } from '@/components/pair/PairArchiveDetail';
import { PairEditForm } from '@/components/pair/PairEditForm';
import { LakeEditModal } from '@/components/ui/LakeEditModal';
import { LakeSearchField } from '@/components/ui/LakeSearchField';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import { pairCardSub, pairCardTitle } from '@/lib/oc/pairCover';
import { movePairInList, pairOrderMeta } from '@/lib/oc/pairOrder';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLakeBackGesture, useLakeBackNavigation } from '@/lib/hooks/useLakeBackNavigation';
import { useOcData } from '@/lib/hooks/useOcData';
import { usePairData } from '@/lib/hooks/usePairData';
import { clearLakeRouteClasses } from '@/lib/lake/routeTransition';
import type { PairItem } from '@/lib/types/character';

type SortMode = 'order' | 'name';

export function PairPageClient() {
  const router = useRouter();
  const { pairs, savePairs } = usePairData();
  const { characters } = useOcData();
  const { resumePageBgmIfNeeded } = useBgm();
  const { isAdmin } = useAuth();
  const { confirm } = useLakeDialog();
  const [detail, setDetail] = useState<PairItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState(false);
  const [quoteMode, setQuoteMode] = useState(false);
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
    clearLakeRouteClasses();
    document.body.style.opacity = '1';
    document.body.classList.remove('lh-leaving', 'lh-route-leaving', 'lh-route-enter');
    document.querySelectorAll('.lh-route-panel-leaving').forEach((el) => {
      el.classList.remove('lh-route-panel-leaving');
    });
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
    if (window.history.length > 1) router.back();
    else router.replace('/');
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
    await savePairs(next);
    if (detail) {
      const updated = next.find((p) => p.id === detail.id);
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

  const handleDetailBack = useCallback(() => {
    flushLayoutSave();
    setEditOpen(false);
    setLayoutMode(false);
    setQuoteMode(false);
    setDetail(null);
  }, [flushLayoutSave]);

  useLakeBackNavigation(!!detail, handleDetailBack, 'pair-detail', routeGuard);
  useLakeBackNavigation(editOpen, () => setEditOpen(false), 'pair-edit', routeGuard);
  useLakeBackGesture(leavePair, !detail && !editOpen);

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

  function openPair(p: PairItem) {
    setSidebarOpen(false);
    setLayoutMode(false);
    setQuoteMode(false);
    setDetail(p);
  }

  const detailTitle = detail ? pairCardTitle(detail) : '';
  const detailOrder = detail ? pairOrderMeta(pairs, detail.id) : null;

  return (
    <>
      <LakeArchiveTopbar
        title="Pair — Relationships"
        active="pair"
        back={
          detail ? (
            <button type="button" className="nav-back" onClick={handleDetailBack}>
              ← back
            </button>
          ) : (
            <Link href="/" replace className="nav-back">
              ← back
            </Link>
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
          <div className="sidebar-count">{filtered.length}개</div>
        </div>

        <div className="main-content">
          <h2 className="oc-archive-heading">Pair Archive</h2>
          <PairRevolveStage pairs={filtered} onOpen={openPair} />
        </div>
      </div>

      <div id="detail-screen" className={`pair-detail-screen${detail ? ' active' : ''}`}>
        {detail ? (
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
                pair={detail}
                layoutEditable={layoutMode}
                quoteEditable={quoteMode}
                standEditable={isAdmin}
                onLayoutChange={persistLayoutLive}
              />
            </div>
          </>
        ) : null}
      </div>

      {detail ? (
        <LakeEditModal
          open={editOpen}
          className="lake-edit-modal--pair"
          eyebrow="ADMIN · PAIR"
          title="페어 수정"
          onClose={() => setEditOpen(false)}
        >
          <PairEditForm
            pair={detail}
            characters={characters}
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
            onMove={(dir) => void movePair(detail.id, dir)}
            onDelete={async () => {
              if (!(await confirm('이 페어 항목을 삭제할까요?'))) return;
              await deletePair(detail.id);
            }}
          />
        </LakeEditModal>
      ) : null}
    </>
  );
}
