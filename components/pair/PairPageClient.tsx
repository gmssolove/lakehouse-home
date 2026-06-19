'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBgm } from '@/lib/contexts/BgmContext';
import { LakeArchiveTopbar } from '@/components/layout/LakeArchiveTopbar';
import { PairRevolveStage } from '@/components/pair/PairRevolveStage';
import { PairEditForm } from '@/components/pair/PairEditForm';
import { PairSlantHero } from '@/components/pair/PairSlantHero';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import { createEmptyPair } from '@/lib/oc/pairDefaults';
import { pairCardTitle } from '@/lib/oc/pairCover';
import { movePairInList, pairOrderMeta } from '@/lib/oc/pairOrder';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLakeBackGesture, useLakeBackNavigation } from '@/lib/hooks/useLakeBackNavigation';
import { usePairData } from '@/lib/hooks/usePairData';
import type { PairItem } from '@/lib/types/character';

export function PairPageClient() {
  const router = useRouter();
  const { pairs, savePairs } = usePairData();
  const { resumePageBgmIfNeeded } = useBgm();
  const { isAdmin } = useAuth();
  const { confirm } = useLakeDialog();
  const [detail, setDetail] = useState<PairItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    resumePageBgmIfNeeded();
  }, [resumePageBgmIfNeeded]);

  const handleDetailBack = useCallback(() => {
    setEditOpen(false);
    setDetail(null);
  }, []);

  const leavePair = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.replace('/');
  }, [router]);

  const routeGuard = useMemo(() => ({ guardPath: '/pair', router }), [router]);

  useLakeBackNavigation(!!detail, handleDetailBack, 'pair-detail', routeGuard);
  useLakeBackNavigation(editOpen, () => setEditOpen(false), 'pair-edit', routeGuard);
  useLakeBackGesture(() => {
    if (editOpen) setEditOpen(false);
    else if (detail) handleDetailBack();
    else leavePair();
  });

  async function persistPairs(next: PairItem[]) {
    await savePairs(next);
    if (detail) {
      const updated = next.find((p) => p.id === detail.id);
      if (updated) setDetail(updated);
    }
  }

  async function persistPair(next: PairItem) {
    await persistPairs(pairs.map((p) => (p.id === next.id ? next : p)));
  }

  async function deletePair(id: string) {
    await persistPairs(pairs.filter((p) => p.id !== id));
    setEditOpen(false);
    setDetail(null);
  }

  async function addPair() {
    if (!isAdmin) return;
    const item = createEmptyPair();
    await persistPairs([...pairs, item]);
    setDetail(item);
    setEditOpen(true);
  }

  async function movePair(id: string, direction: -1 | 1) {
    const next = movePairInList(pairs, id, direction);
    if (next === pairs) return;
    await persistPairs(next);
  }

  function openPair(p: PairItem) {
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

      <div className="main-content pair-main">
        <header className="pair-archive-head">
          <div className="pair-archive-head__row">
            <h1 className="pair-archive-title">Pair — Relationships</h1>
            {pairs.length > 0 && <span className="pair-archive-count">{pairs.length}</span>}
          </div>
          <p className="pair-archive-lead">드래그로 돌려보기 · 등록 순</p>
        </header>

        <div className="pair-stage">
          <PairRevolveStage
            pairs={pairs}
            isAdmin={isAdmin}
            onOpen={openPair}
            onAdd={() => void addPair()}
          />
        </div>
      </div>

      <div id="detail-screen" className={`pair-detail-screen${detail ? ' active' : ''}`}>
        {detail && (
          <>
            <div className="detail-nav">
              <button type="button" className="detail-back-btn" onClick={handleDetailBack}>
                ← 목록
              </button>
              <div className="detail-nav-title">{detailTitle}</div>
              {isAdmin && (
                <button type="button" className="btn-edit" onClick={() => setEditOpen(true)}>
                  ✎ 수정
                </button>
              )}
            </div>

            <div className="pair-detail-layout">
              <aside className="pair-detail-aside">
                <PairSlantHero pair={detail} variant="detail" showMeta />
              </aside>

              <div className="pair-detail-sheet">
                {detail.relation && <div className="pair-detail-rel-badge">{detail.relation}</div>}

                <div className="pair-detail-grid">
                  <section className="pair-detail-block">
                    <h3 className="pair-detail-section">About</h3>
                    <p className="pair-detail-copy">{detail.desc || '—'}</p>
                  </section>

                  {(detail.keywords?.length ?? 0) > 0 && (
                    <section className="pair-detail-block">
                      <h3 className="pair-detail-section">Keywords</h3>
                      <div className="pair-detail-keywords">
                        {detail.keywords!.map((k) => (
                          <span key={k} className="pair-detail-keyword">
                            {k}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}

                  <section className="pair-detail-block pair-detail-block--wide">
                    <h3 className="pair-detail-section">Story</h3>
                    <p className="pair-detail-copy pair-detail-copy--story">{detail.story || '—'}</p>
                  </section>
                </div>
              </div>
            </div>

            <aside id="edit-panel" className={`pair-edit-panel${editOpen ? ' active' : ''}`}>
              <div className="ep-header">
                <div className="ep-title">페어 수정</div>
                <button type="button" className="ep-close" onClick={() => setEditOpen(false)}>
                  ✕
                </button>
              </div>
              <PairEditForm
                pair={detail}
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
            </aside>
          </>
        )}
      </div>
    </>
  );
}
