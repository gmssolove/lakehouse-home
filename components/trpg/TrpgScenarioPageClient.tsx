'use client';

import { notFound, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AuthModal } from '@/components/auth/AuthModal';
import { TrpgInvestigatorBoard } from '@/components/trpg/TrpgInvestigatorBoard';
import { TrpgLogSpeakerBody } from '@/components/trpg/TrpgLogSpeakerBody';
import { SecretItemGate } from '@/components/lake/SecretItemGate';
import { TrpgTopbar } from '@/components/layout/TrpgTopbar';
import { SecretLockBadge } from '@/components/ui/SecretLockBadge';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import {
  LakeEditIcon,
  LakeIconToolButton,
  LakeSaveIcon,
  LakeCancelIcon,
  LakeTrashIcon,
} from '@/components/ui/LakeActionIcons';
import { ImageFrameView } from '@/components/ui/ImageFrameView';
import { useAuth } from '@/lib/hooks/useAuth';
import { useBgm } from '@/lib/contexts/BgmContext';
import { parseYoutubeId } from '@/lib/bgm/playlist';
import { useLakeBackNavigation } from '@/lib/hooks/useLakeBackNavigation';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { isLakeAccessUnlocked, isLakeItemUnlocked, resolveItemPassword, resolveScopePassword, unlockLakeItem, verifyLakeAccessPassword } from '@/lib/lake/accessGate';
import { LakeAccessGateModal } from '@/components/lake/LakeAccessGateModal';
import { lakeNavigate } from '@/lib/lake/routeTransition';
import { consumeTrpgReturnPath, consumeTrpgSkipBgmRestore, markTrpgSkipBgmRestore } from '@/lib/lake/trpgReturn';
import { trpgFontFamily } from '@/lib/trpg/fonts';
import { TrpgScenarioEditDrawer, type TrpgEditTabId } from '@/components/trpg/TrpgScenarioEditDrawer';
import { ScenarioVnPlayButton } from '@/components/shared/ScenarioVnPlayButton';
import { formatTrpgDateRange, formatTrpgGalleryCredit, normalizeTrpgScenario, trpgGalleryImages } from '@/lib/trpg/normalize';
import { highlightLogPlainText } from '@/lib/trpg/logHighlight';
import type { TrpgGalleryItem, TrpgScenario, TrpgSessionLog } from '@/lib/types/site-content';

type Props = {
  id: string;
};

function LogBody({
  log,
  style,
}: {
  log: TrpgSessionLog;
  style?: CSSProperties;
}) {
  if (log.html) {
    return (
      <div
        className="trpg-log__html lh-scroll"
        style={style}
        dangerouslySetInnerHTML={{ __html: log.html }}
      />
    );
  }
  return (
    <div
      className="trpg-log__text lh-scroll"
      style={style}
      dangerouslySetInnerHTML={{ __html: highlightLogPlainText(log.body || '') }}
    />
  );
}

type TrpgPanel =
  | 'overview'
  | 'review'
  | 'players'
  | 'gallery'
  | 'dice'
  | 'handouts'
  | `log:${string}`;

function panelFromLogId(logId: string): TrpgPanel {
  return `log:${logId}`;
}

function logIdFromPanel(panel: TrpgPanel): string | null {
  return panel.startsWith('log:') ? panel.slice(4) : null;
}

export function TrpgScenarioPageClient({ id }: Props) {
  const router = useRouter();
  const { user, isAdmin, ready: authReady } = useAuth();
  const { confirm } = useLakeDialog();
  const { trpg, loaded, saveTrpg, accessSettings } = useSiteContent();
  const { playCharacterTheme, restorePageSnapshot, silenceMedia } = useBgm();
  const bgmActionsRef = useRef({ playCharacterTheme, restorePageSnapshot, silenceMedia });
  bgmActionsRef.current = { playCharacterTheme, restorePageSnapshot, silenceMedia };
  const raw = trpg.find((s) => s.id === id);
  const [authOpen, setAuthOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [itemGateOpen, setItemGateOpen] = useState(false);
  const [itemUnlocked, setItemUnlocked] = useState(false);
  const [activeLogId, setActiveLogId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<TrpgPanel>('overview');
  const [draft, setDraft] = useState<TrpgScenario | null>(null);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [editInitialTab, setEditInitialTab] = useState<TrpgEditTabId>('basic');
  const [invUploading, setInvUploading] = useState(false);
  const [reviewEditing, setReviewEditing] = useState(false);
  const [reviewDraft, setReviewDraft] = useState('');

  const openScenarioEdit = useCallback((tab: TrpgEditTabId = 'basic') => {
    setEditInitialTab(tab);
    setEditDrawerOpen(true);
  }, []);
  const [revealedHandouts, setRevealedHandouts] = useState<Set<string>>(() => new Set());
  const [galleryLightbox, setGalleryLightbox] = useState<{ item: TrpgGalleryItem; index: number } | null>(
    null,
  );
  const [galleryLeaving, setGalleryLeaving] = useState(false);
  const [gallerySlideDir, setGallerySlideDir] = useState<'next' | 'prev' | 'none'>('none');
  const [gallerySlideTick, setGallerySlideTick] = useState(0);
  const galleryCloseTimerRef = useRef<number | null>(null);

  const stepGallery = useCallback((delta: 1 | -1) => {
    if (!galleryLightbox || galleryLightbox.item.viewMode === 'scroll') return;
    const images = trpgGalleryImages(galleryLightbox.item);
    if (images.length < 2) return;
    const len = images.length;
    const nextIndex = (galleryLightbox.index + delta + len) % len;
    if (nextIndex === galleryLightbox.index) return;
    setGallerySlideDir(delta > 0 ? 'next' : 'prev');
    setGallerySlideTick((t) => t + 1);
    setGalleryLightbox({ item: galleryLightbox.item, index: nextIndex });
  }, [galleryLightbox]);

  /* 인접 장 프리로드 — 넘김 시 네트워크 대기 제거 */
  useEffect(() => {
    if (!galleryLightbox || galleryLightbox.item.viewMode === 'scroll') return;
    const images = trpgGalleryImages(galleryLightbox.item);
    if (images.length < 2) return;
    const len = images.length;
    const idx = galleryLightbox.index;
    [images[(idx + 1) % len], images[(idx - 1 + len) % len]].forEach((src) => {
      if (!src) return;
      const img = new window.Image();
      img.decoding = 'async';
      img.src = src;
    });
  }, [galleryLightbox]);

  const closeGalleryLightbox = useCallback(() => {
    if (!galleryLightbox || galleryLeaving) return;
    setGalleryLeaving(true);
    if (galleryCloseTimerRef.current) window.clearTimeout(galleryCloseTimerRef.current);
    galleryCloseTimerRef.current = window.setTimeout(() => {
      setGalleryLightbox(null);
      setGalleryLeaving(false);
      setGallerySlideDir('none');
      setGallerySlideTick(0);
      galleryCloseTimerRef.current = null;
    }, 220);
  }, [galleryLightbox, galleryLeaving]);

  useEffect(() => {
    return () => {
      if (galleryCloseTimerRef.current) window.clearTimeout(galleryCloseTimerRef.current);
    };
  }, []);

  const routeGuard = useMemo(() => ({ guardPath: `/trpg/${id}`, router }), [id, router]);

  const goBack = useCallback(() => {
    const ret = consumeTrpgReturnPath();
    if (ret) {
      markTrpgSkipBgmRestore();
      lakeNavigate(router, ret, `/trpg/${id}`);
      return;
    }
    lakeNavigate(router, '/?p=trpg', `/trpg/${id}`);
  }, [id, router]);

  const requestLogin = useCallback(() => {
    setAuthOpen(true);
  }, []);

  useEffect(() => {
    // 인증 확정 전엔 판단 보류 — 관리자가 isAdmin=false로 오판돼 목록으로
    // 튕기거나 게이트가 뜨는 것을 방지.
    if (!loaded || !authReady) return;
    const ok = isAdmin || isLakeAccessUnlocked('trpg', resolveScopePassword('trpg', accessSettings));
    setUnlocked(ok);
    if (!ok) {
      router.replace(`/?p=trpg&trpg=${encodeURIComponent(id)}`, { scroll: false });
    }
  }, [id, isAdmin, loaded, router, accessSettings, authReady]);

  const item = useMemo(() => (raw ? normalizeTrpgScenario(raw) : null), [raw]);
  const dates = item ? formatTrpgDateRange(item) : '';

  useEffect(() => {
    if (!authReady) return;
    if (!item) {
      setItemUnlocked(false);
      setItemGateOpen(false);
      return;
    }
    const itemPw = resolveItemPassword('trpg', item, accessSettings);
    const scopePw = resolveScopePassword('trpg', accessSettings);
    // 스코프 잠금을 이미 푼 데다 항목 비번이 스코프 비번과 같으면 다시 묻지 않음 (비번 두 번 방지)
    const sameAsScope = unlocked && itemPw === scopePw;
    const ok =
      isAdmin ||
      !item.secret ||
      sameAsScope ||
      isLakeItemUnlocked('trpg', item.id, itemPw);
    setItemUnlocked(ok);
    setItemGateOpen(unlocked && !ok);
  }, [item, isAdmin, unlocked, accessSettings, authReady]);

  const canView = unlocked && itemUnlocked;

  useLakeBackNavigation(loaded && !!raw && canView, goBack, `trpg-${id}`, routeGuard);

  useEffect(() => {
    if (item && !activeLogId && item.logs?.length) setActiveLogId(item.logs[0].id);
  }, [activeLogId, item]);

  useEffect(() => {
    if (!galleryLightbox || galleryLeaving) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeGalleryLightbox();
        return;
      }
      if (galleryLightbox.item.viewMode === 'scroll') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepGallery(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepGallery(1);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [galleryLightbox, galleryLeaving, closeGalleryLightbox, stepGallery]);

  useEffect(() => {
    setReviewEditing(false);
    setReviewDraft('');
  }, [id]);

  useEffect(() => {
    if (!item || !canView) return;
    const bgm = item.pageBgm;
    const fileUrl = bgm?.fileUrl?.trim();
    const extUrl = bgm?.url?.trim();
    const ytId = extUrl ? parseYoutubeId(extUrl) : null;

    /* 시나리오 BGM 있을 때만 전환 — 없으면 메인 BGM 유지(페이지 전환 끊김 방지) */
    if (!fileUrl && !extUrl) {
      return () => {
        if (consumeTrpgSkipBgmRestore()) return;
        /* 메인 유지 중이었으면 restore 불필요 */
      };
    }

    bgmActionsRef.current.playCharacterTheme(
      {
        fileData: fileUrl || (ytId ? undefined : extUrl),
        youtubeId: ytId || undefined,
        title: bgm?.title || item.title,
        artist: bgm?.artist || '',
      },
      false,
    );

    return () => {
      if (consumeTrpgSkipBgmRestore()) {
        return;
      }
      bgmActionsRef.current.restorePageSnapshot(true);
    };
  }, [item?.id, item?.pageBgm?.fileUrl, item?.pageBgm?.url, canView]);

  if (!loaded) {
    return (
      <>
        <TrpgTopbar />
        <main className="trpg-scenario-shell trpg-scenario-layout trpg-scenario-layout--loading">
          <p className="trpg-scenario-loading">불러오는 중…</p>
        </main>
      </>
    );
  }
  if (!raw || !item) notFound();

  if (!unlocked || !itemUnlocked) {
    return (
      <>
        <TrpgTopbar
          back={
            <button type="button" className="nav-back" onClick={goBack}>
              ← back
            </button>
          }
        />
        <main className="trpg-scenario-shell trpg-scenario-layout trpg-scenario-layout--loading">
          <p className="trpg-scenario-loading">
            {!unlocked ? '불러오는 중…' : '비밀 시나리오 — 비밀번호가 필요합니다.'}
          </p>
        </main>
        <LakeAccessGateModal
          open={itemGateOpen}
          scope="trpg"
          item={item}
          accessSettings={accessSettings}
          title={item.title || 'TRPG Scenario'}
          description={`${item.title || '시나리오'} — 로그인 후 비밀번호를 입력하세요.`}
          loggedIn={!!user}
          onClose={() => {
            setItemGateOpen(false);
            goBack();
          }}
          onRequestLogin={() => {
            setItemGateOpen(false);
            setAuthOpen(true);
          }}
          onSuccess={() => {
            unlockLakeItem('trpg', item.id, resolveItemPassword('trpg', item, accessSettings));
            setItemUnlocked(true);
            setItemGateOpen(false);
          }}
          verifyOverride={(input) => {
            if (!verifyLakeAccessPassword('trpg', input, accessSettings, item)) return false;
            unlockLakeItem('trpg', item.id, resolveItemPassword('trpg', item, accessSettings));
            return true;
          }}
        />
        <AuthModal backdrop="popup" open={authOpen} onClose={() => setAuthOpen(false)} />
      </>
    );
  }

  const scenario = item;
  const canEdit = canView && isAdmin;
  const editing = canEdit && draft?.id === id;
  const view = editing && draft ? draft : scenario;
  const activeLog = (view.logs ?? []).find((l) => l.id === activeLogId) ?? view.logs?.[0] ?? null;
  const logStyle = {
    ['--trpg-log-font-size' as string]: `${activeLog?.logFontSize ?? 12}px`,
    ['--trpg-log-line-height' as string]: String(activeLog?.logLineHeight ?? 1.72),
  } as CSSProperties;
  const titleFont = trpgFontFamily(view.titleFont);
  const subtitleFont = trpgFontFamily(view.subtitleFont);
  const titleStyle = titleFont ? ({ ['--trpg-title-font' as string]: titleFont } as const) : undefined;
  const subtitleStyle = subtitleFont ? ({ ['--trpg-subtitle-font' as string]: subtitleFont } as const) : undefined;

  async function persistScenario(next: TrpgScenario) {
    await saveTrpg(trpg.map((s) => (s.id === next.id ? next : s)));
    setDraft(null);
    setReviewEditing(false);
  }

  function startEditLog(log: TrpgSessionLog) {
    const base = editing && draft ? draft : scenario;
    setDraft({ ...base, logs: base.logs ?? [] });
    setActiveLogId(log.id);
    setReviewEditing(false);
  }

  function startEditReview() {
    if (!canEdit) return;
    setReviewDraft(scenario.review || scenario.summary || '');
    setReviewEditing(true);
    setDraft(null);
  }

  async function saveReview() {
    if (!canEdit) return;
    await persistScenario({ ...scenario, review: reviewDraft });
  }

  function cancelEditReview() {
    setReviewEditing(false);
    setReviewDraft('');
  }

  async function handleDeleteLog() {
    if (!activeLog || !canEdit) return;
    if (!(await confirm('이 세션 로그를 삭제할까요?'))) return;
    const base = editing && draft ? draft : scenario;
    const nextLogs = (base.logs ?? []).filter((l) => l.id !== activeLog.id);
    const next = { ...base, logs: nextLogs };
    await persistScenario(next);
    const nextId = nextLogs[0]?.id ?? null;
    setActiveLogId(nextId);
    setActivePanel(nextId ? panelFromLogId(nextId) : 'overview');
  }

  function goPanel(panel: TrpgPanel) {
    setActivePanel(panel);
    const logId = logIdFromPanel(panel);
    if (logId) setActiveLogId(logId);
    if (panel !== 'review') setReviewEditing(false);
  }

  function updateDraftLog(logId: string, patch: Partial<TrpgSessionLog>) {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        logs: (prev.logs ?? []).map((l) => (l.id === logId ? { ...l, ...patch } : l)),
      };
    });
  }

  function revealHandout(handoutId: string) {
    setRevealedHandouts((prev) => new Set(prev).add(handoutId));
  }

  return (
    <>
      <TrpgTopbar
        back={
          <button type="button" className="nav-back" onClick={goBack}>
            ← back
          </button>
        }
        actions={
          isAdmin ? (
            <button
              type="button"
              className="trpg-topbar__edit"
              onClick={() => openScenarioEdit(activePanel.startsWith('log:') ? 'logs' : 'basic')}
            >
              ✎ 시나리오 수정
            </button>
          ) : undefined
        }
      />

      <main
        className="trpg-scenario-shell trpg-scenario-layout"
        style={
          view.pageBackground
            ? ({
                background: view.pageBackground.includes('url(') || view.pageBackground.includes('gradient')
                  ? view.pageBackground
                  : view.pageBackground.startsWith('#') || view.pageBackground.startsWith('rgb')
                    ? view.pageBackground
                    : `url(${view.pageBackground}) center/cover no-repeat fixed`,
              } as CSSProperties)
            : undefined
        }
      >
        <div className="trpg-scenario-page">
          <div key={activePanel} className="trpg-scenario-page__enter">
          {activePanel === 'overview' ? (
            <>
              <div className="trpg-scenario-page__hero-wrap">
                {view.thumbnail ? (
                  <ImageFrameView
                    src={view.thumbnail}
                    frame={view.thumbnailFrame}
                    fit={view.thumbnailFit || 'cover'}
                    pos={view.thumbnailPos || 'center center'}
                    className="trpg-scenario-page__hero-frame"
                    imgClassName="trpg-scenario-page__hero-img"
                  />
                ) : (
                  <div className="trpg-scenario-page__hero-fallback">{view.title}</div>
                )}
                {view.cleared ? <span className="trpg-scenario-page__stamp">CLEARED</span> : null}
              </div>

              <header className="trpg-scenario-page__head">
                {view.system ? <p className="trpg-scenario-page__system">{view.system}</p> : null}
                <h1 className="trpg-scenario-page__title" style={titleStyle}>
                  {view.title}
                </h1>
                {view.subtitle ? (
                  <p className="trpg-scenario-page__subtitle" style={subtitleStyle}>
                    {view.subtitle}
                  </p>
                ) : null}
                <div className="trpg-scenario-page__meta">
                  {dates ? <p className="trpg-scenario-page__meta-row">{dates}</p> : null}
                  {view.kp ? <p className="trpg-scenario-page__meta-row">KP · {view.kp}</p> : null}
                  {view.players ? <p className="trpg-scenario-page__meta-row">{view.players}</p> : null}
                  {view.author ? <p className="trpg-scenario-page__author">w. {view.author}</p> : null}
                </div>
                {view.sessionUrl ? (
                  <a href={view.sessionUrl} target="_blank" rel="noreferrer" className="trpg-scenario-session-link__btn">
                    세션 바로가기 ↗
                  </a>
                ) : null}
                <div className="trpg-scenario-page__vn-actions">
                  <ScenarioVnPlayButton
                    hasVnScene={Boolean(view.vnScene?.lines?.length || view.vnEditable?.lines?.length)}
                    subtitle={view.title}
                    accentColor={view.vnPlayBtnColor}
                    onClick={() => router.push(`/vn/${encodeURIComponent(view.id)}`)}
                  />
                  {canEdit ? (
                    <button
                      type="button"
                      className="trpg-scenario-session-link__btn"
                      onClick={() => {
                        setEditInitialTab('vn');
                        setEditDrawerOpen(true);
                      }}
                    >
                      VN 편집
                    </button>
                  ) : null}
                </div>
              </header>

              {view.summary || view.body ? (
                <section className="trpg-scenario-page__section">
                  <h2 className="trpg-scenario-page__section-title">개요</h2>
                  <div className="trpg-scenario-page__prose">{view.summary || view.body}</div>
                </section>
              ) : null}
            </>
          ) : null}

          {activePanel === 'review' ? (
            <section className="trpg-scenario-page__section">
              <div className="trpg-scenario-page__section-head">
                <h2 className="trpg-scenario-page__section-title">후기</h2>
                {canEdit ? (
                  <div className="trpg-log-view__admin">
                    {reviewEditing ? (
                      <div className="trpg-log-view__admin-actions">
                        <LakeIconToolButton label="저장" onClick={() => void saveReview()}>
                          <LakeSaveIcon />
                        </LakeIconToolButton>
                        <LakeIconToolButton label="취소" onClick={cancelEditReview}>
                          <LakeCancelIcon />
                        </LakeIconToolButton>
                      </div>
                    ) : (
                      <LakeIconToolButton label="수정" onClick={startEditReview}>
                        <LakeEditIcon />
                      </LakeIconToolButton>
                    )}
                  </div>
                ) : null}
              </div>
              {reviewEditing ? (
                <textarea
                  className="form-input trpg-review-editor"
                  rows={16}
                  value={reviewDraft}
                  placeholder="플레이 후기를 작성하세요"
                  onChange={(e) => setReviewDraft(e.target.value)}
                />
              ) : (
                <div className="trpg-scenario-page__prose">
                  {view.review || view.summary || '플레이 후기가 아직 등록되지 않았습니다.'}
                </div>
              )}
            </section>
          ) : null}

          {activePanel === 'players' && ((view.playerProfiles?.length ?? 0) > 0 || canEdit) && (
            <section className="trpg-scenario-page__section">
              <h2 className="trpg-scenario-page__section-title">탐사자</h2>
              <TrpgInvestigatorBoard
                players={view.playerProfiles ?? []}
                editable={canEdit}
                uploading={invUploading}
                onUploadStart={() => setInvUploading(true)}
                onUploadEnd={() => setInvUploading(false)}
                onChange={(playerProfiles) => void persistScenario({ ...view, playerProfiles })}
              />
            </section>
          )}

          {activePanel === 'gallery' && view.gallery && view.gallery.length > 0 && (
            <section className="trpg-scenario-page__section">
              <h2 className="trpg-scenario-page__section-title">After · Gallery</h2>
              <div className="trpg-scenario-page__gallery">
                {view.gallery.map((g) => {
                  const images = trpgGalleryImages(g);
                  const cover = images[0];
                  if (!cover) return null;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      className="trpg-gallery-card"
                      onClick={() => {
                        setGalleryLeaving(false);
                        setGalleryLightbox({ item: g, index: 0 });
                      }}
                    >
                      <img src={cover} alt={g.title || ''} />
                      {images.length > 1 ? (
                        <span className="trpg-gallery-card__count" aria-label={`${images.length}장`}>
                          {images.length}
                        </span>
                      ) : null}
                      {(g.title || g.caption || g.artist) && (
                        <span className="trpg-gallery-card__caption">
                          {g.title ? <strong>{g.title}</strong> : null}
                          {g.caption ? <span>{g.caption}</span> : null}
                          {g.artist ? <em>{formatTrpgGalleryCredit(g.artist)}</em> : null}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {galleryLightbox ? (
            <div
              className={`trpg-gallery-lightbox${galleryLeaving ? ' is-out' : ' is-in'}`}
              role="dialog"
              aria-modal="true"
              aria-label="갤러리 이미지"
            >
              <button
                type="button"
                className="trpg-gallery-lightbox__bg"
                aria-label="닫기"
                onClick={closeGalleryLightbox}
              />
              {(() => {
                const item = galleryLightbox.item;
                const images = trpgGalleryImages(item);
                const idx = Math.min(Math.max(galleryLightbox.index, 0), Math.max(images.length - 1, 0));
                const isScroll = item.viewMode === 'scroll' && images.length > 1;
                const credit = item.artist ? formatTrpgGalleryCredit(item.artist) : '';
                return (
                  <div className="trpg-gallery-lightbox__frame">
                    {!isScroll && images.length > 1 ? (
                      <button
                        type="button"
                        className="trpg-gallery-lightbox__arrow is-prev"
                        aria-label="이전"
                        onClick={(e) => {
                          e.stopPropagation();
                          stepGallery(-1);
                        }}
                      >
                        ‹
                      </button>
                    ) : null}
                    <div
                      className={`trpg-gallery-lightbox__panel${isScroll ? ' is-scroll' : ' is-slider'}`}
                    >
                      <button
                        type="button"
                        className="trpg-gallery-lightbox__close"
                        aria-label="닫기"
                        onClick={closeGalleryLightbox}
                      >
                        ✕
                      </button>

                      {isScroll ? (
                        <div className="trpg-gallery-lightbox__scroll">
                          <div className="trpg-gallery-lightbox__stack">
                            {images.map((src, i) => (
                              <img key={`${item.id}-${i}`} src={src} alt={item.title ? `${item.title} ${i + 1}` : ''} />
                            ))}
                          </div>
                          {credit ? <p className="trpg-gallery-lightbox__credit">{credit}</p> : null}
                        </div>
                      ) : (
                        <>
                          <div className="trpg-gallery-lightbox__stage">
                            {images[idx] ? (
                              <img
                                key={`${item.id}-${idx}-${gallerySlideTick}`}
                                src={images[idx]}
                                alt={item.title || ''}
                                decoding="async"
                                className={`trpg-gallery-lightbox__img is-slide-${gallerySlideDir === 'none' ? 'in' : gallerySlideDir}`}
                              />
                            ) : null}
                            {credit ? <p className="trpg-gallery-lightbox__credit">{credit}</p> : null}
                          </div>
                          {images.length > 1 ? (
                            <p className="trpg-gallery-lightbox__pager" aria-live="polite">
                              {idx + 1} / {images.length}
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>
                    {!isScroll && images.length > 1 ? (
                      <button
                        type="button"
                        className="trpg-gallery-lightbox__arrow is-next"
                        aria-label="다음"
                        onClick={(e) => {
                          e.stopPropagation();
                          stepGallery(1);
                        }}
                      >
                        ›
                      </button>
                    ) : null}
                  </div>
                );
              })()}
            </div>
          ) : null}

          {activePanel === 'dice' && view.diceHighlights && view.diceHighlights.length > 0 && (
            <section className="trpg-scenario-page__section">
              <h2 className="trpg-scenario-page__section-title">Key Rolls</h2>
              <div className="trpg-dice-grid">
                {view.diceHighlights.map((d) => (
                  <article key={d.id} className="trpg-dice-card">
                    <h3>{d.title}</h3>
                    {d.session ? <span className="trpg-dice-card__session">{d.session}</span> : null}
                    {d.roll ? (
                      <p className="trpg-dice-card__roll">
                        <mark className="trpg-roll-hit">{d.roll}</mark>
                      </p>
                    ) : null}
                    {d.result ? <p className="trpg-dice-card__result">{d.result}</p> : null}
                    {d.note ? <p className="trpg-dice-card__note">{d.note}</p> : null}
                  </article>
                ))}
              </div>
            </section>
          )}

          {activePanel === 'handouts' && view.handouts && view.handouts.length > 0 && (
            <section className="trpg-scenario-page__section">
              <h2 className="trpg-scenario-page__section-title">Handouts</h2>
              <div className="trpg-handout-grid">
                {view.handouts.map((h) => {
                  const hidden = h.spoiler && !revealedHandouts.has(h.id);
                  return (
                    <article
                      key={h.id}
                      className={`trpg-handout-card${hidden ? ' trpg-handout-card--spoiler' : ''}`}
                    >
                      <h3>{h.title}</h3>
                      {hidden ? (
                        <button type="button" className="trpg-handout-card__reveal" onClick={() => revealHandout(h.id)}>
                          스포일러 — 탭하여 공개
                        </button>
                      ) : (
                        <>
                          {h.img ? <img src={h.img} alt="" className="trpg-handout-card__img" /> : null}
                          {h.body ? <div className="trpg-handout-card__body">{h.body}</div> : null}
                        </>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {activePanel.startsWith('log:') && activeLog ? (
            <section className="trpg-scenario-page__section">
              <h2 className="trpg-scenario-page__section-title">Session Log</h2>
              <article className="trpg-log-view" style={logStyle}>
                <header className="trpg-log-view__head">
                  <div className="trpg-log-view__titleblock">
                    <div className="trpg-log-view__title-row">
                      {activeLog.secret ? <SecretLockBadge compact /> : null}
                      <h3>{activeLog.title}</h3>
                    </div>
                    {activeLog.subtitle ? (
                      <p className="trpg-log-view__subtitle">{activeLog.subtitle}</p>
                    ) : null}
                    {activeLog.date ? (
                      <span className="trpg-log-view__date">
                        <time>{activeLog.date}</time>
                      </span>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <div className="trpg-log-view__admin">
                      {editing ? (
                        <div className="trpg-log-view__admin-actions">
                          <LakeIconToolButton label="저장" onClick={() => void persistScenario(draft!)}>
                            <LakeSaveIcon />
                          </LakeIconToolButton>
                          <LakeIconToolButton label="취소" onClick={() => setDraft(null)}>
                            <LakeCancelIcon />
                          </LakeIconToolButton>
                          <LakeIconToolButton label="삭제" onClick={() => void handleDeleteLog()}>
                            <LakeTrashIcon />
                          </LakeIconToolButton>
                        </div>
                      ) : (
                        <LakeIconToolButton label="수정" onClick={() => startEditLog(activeLog)}>
                          <LakeEditIcon />
                        </LakeIconToolButton>
                      )}
                    </div>
                  ) : null}
                </header>
                <SecretItemGate
                  scope="trpg"
                  item={activeLog}
                  isAdmin={isAdmin}
                  loggedIn={!!user}
                  onRequestLogin={requestLogin}
                  lockedLabel="본문 열람"
                >
                  {editing ? (
                    <>
                      <input
                        className="form-input"
                        placeholder="제목"
                        value={draft?.logs?.find((l) => l.id === activeLog.id)?.title ?? ''}
                        onChange={(e) => updateDraftLog(activeLog.id, { title: e.target.value })}
                      />
                      <input
                        className="form-input"
                        placeholder="부제 (캠페인)"
                        value={draft?.logs?.find((l) => l.id === activeLog.id)?.subtitle ?? ''}
                        onChange={(e) => updateDraftLog(activeLog.id, { subtitle: e.target.value })}
                      />
                      <input
                        className="form-input"
                        type="date"
                        value={draft?.logs?.find((l) => l.id === activeLog.id)?.date ?? ''}
                        onChange={(e) => updateDraftLog(activeLog.id, { date: e.target.value })}
                      />
                      <textarea
                        className="form-input"
                        rows={12}
                        value={draft?.logs?.find((l) => l.id === activeLog.id)?.body ?? ''}
                        onChange={(e) => updateDraftLog(activeLog.id, { body: e.target.value })}
                      />
                    </>
                  ) : (
                    <TrpgLogSpeakerBody log={activeLog} players={view.playerProfiles ?? []} style={logStyle} />
                  )}
                </SecretItemGate>
              </article>
            </section>
          ) : null}
          </div>
        </div>

        <aside className="trpg-scenario-rail lh-scroll" aria-label="섹션 이동" onClick={(e) => e.stopPropagation()}>
          <div className="trpg-scenario-rail__group">
            <span className="trpg-scenario-rail__label">Scenario</span>
            <button
              type="button"
              className={`trpg-scenario-rail__btn${activePanel === 'overview' ? ' is-active' : ''}`}
              onClick={() => goPanel('overview')}
            >
              개요
            </button>
            <button
              type="button"
              className={`trpg-scenario-rail__btn${activePanel === 'review' ? ' is-active' : ''}`}
              onClick={() => goPanel('review')}
            >
              후기
            </button>
          </div>
          {((view.playerProfiles?.length ?? 0) > 0 || canEdit ||
            (view.gallery?.length ?? 0) > 0 ||
            (view.diceHighlights?.length ?? 0) > 0 ||
            (view.handouts?.length ?? 0) > 0) ? (
            <div className="trpg-scenario-rail__group">
              <span className="trpg-scenario-rail__label">Archive</span>
              {(view.playerProfiles?.length ?? 0) > 0 || canEdit ? (
                <button
                  type="button"
                  className={`trpg-scenario-rail__btn${activePanel === 'players' ? ' is-active' : ''}`}
                  onClick={() => goPanel('players')}
                >
                  탐사자
                </button>
              ) : null}
              {(view.gallery?.length ?? 0) > 0 ? (
                <button
                  type="button"
                  className={`trpg-scenario-rail__btn${activePanel === 'gallery' ? ' is-active' : ''}`}
                  onClick={() => goPanel('gallery')}
                >
                  갤러리
                </button>
              ) : null}
              {(view.diceHighlights?.length ?? 0) > 0 ? (
                <button
                  type="button"
                  className={`trpg-scenario-rail__btn${activePanel === 'dice' ? ' is-active' : ''}`}
                  onClick={() => goPanel('dice')}
                >
                  Key Rolls
                </button>
              ) : null}
              {(view.handouts?.length ?? 0) > 0 ? (
                <button
                  type="button"
                  className={`trpg-scenario-rail__btn${activePanel === 'handouts' ? ' is-active' : ''}`}
                  onClick={() => goPanel('handouts')}
                >
                  Handouts
                </button>
              ) : null}
            </div>
          ) : null}
          {(view.logs?.length ?? 0) > 0 ? (
            <div className="trpg-scenario-rail__group">
              <span className="trpg-scenario-rail__label">Session Logs</span>
              {(view.logs ?? []).map((log) => (
                <SecretItemGate
                  key={log.id}
                  scope="trpg"
                  item={log}
                  isAdmin={isAdmin}
                  loggedIn={!!user}
                  onRequestLogin={requestLogin}
                  showWhenLocked
                  onUnlocked={() => goPanel(panelFromLogId(log.id))}
                >
                  <button
                    type="button"
                    className={`trpg-scenario-rail__btn trpg-scenario-rail__btn--log${
                      activePanel === panelFromLogId(log.id) ? ' is-active' : ''
                    }`}
                    onClick={() => goPanel(panelFromLogId(log.id))}
                  >
                    <span className="trpg-scenario-rail__log-head">
                      {log.secret ? <SecretLockBadge compact /> : null}
                      <span className="trpg-scenario-rail__log-title">{log.title}</span>
                    </span>
                    {log.subtitle ? (
                      <span className="trpg-scenario-rail__log-sub">{log.subtitle}</span>
                    ) : null}
                    {log.date ? (
                      <span className="trpg-scenario-rail__log-meta">
                        <time>{log.date}</time>
                      </span>
                    ) : null}
                  </button>
                </SecretItemGate>
              ))}
            </div>
          ) : null}
        </aside>
      </main>
      <TrpgScenarioEditDrawer
        open={editDrawerOpen && isAdmin}
        initialTab={editInitialTab}
        scenario={scenario}
        allScenarios={trpg}
        onClose={() => setEditDrawerOpen(false)}
        onSave={saveTrpg}
      />
      <AuthModal backdrop="popup" open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
