'use client';

import { notFound, usePathname, useRouter } from 'next/navigation';
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
import { isLakeAccessUnlocked } from '@/lib/lake/accessGate';
import { lakeNavigate, peekPendingLakeRouteDir, beginLakeRouteEnter } from '@/lib/lake/routeTransition';
import { trpgFontFamily } from '@/lib/trpg/fonts';
import { TrpgScenarioEditDrawer, type TrpgEditTabId } from '@/components/trpg/TrpgScenarioEditDrawer';
import { formatTrpgDateRange, normalizeTrpgScenario } from '@/lib/trpg/normalize';
import { highlightLogPlainText } from '@/lib/trpg/logHighlight';
import type { TrpgScenario, TrpgSessionLog } from '@/lib/types/site-content';

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
  | 'story'
  | 'credits'
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
  const { user, isAdmin } = useAuth();
  const { confirm } = useLakeDialog();
  const { trpg, loaded, saveTrpg } = useSiteContent();
  const { playCharacterTheme, restorePageSnapshot } = useBgm();
  const bgmActionsRef = useRef({ playCharacterTheme, restorePageSnapshot });
  bgmActionsRef.current = { playCharacterTheme, restorePageSnapshot };
  const raw = trpg.find((s) => s.id === id);
  const [authOpen, setAuthOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [activeLogId, setActiveLogId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<TrpgPanel>('overview');
  const [draft, setDraft] = useState<TrpgScenario | null>(null);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [editInitialTab, setEditInitialTab] = useState<TrpgEditTabId>('basic');
  const [invUploading, setInvUploading] = useState(false);
  const pathname = usePathname();

  const openScenarioEdit = useCallback((tab: TrpgEditTabId = 'basic') => {
    setEditInitialTab(tab);
    setEditDrawerOpen(true);
  }, []);
  const [revealedHandouts, setRevealedHandouts] = useState<Set<string>>(() => new Set());

  const routeGuard = useMemo(() => ({ guardPath: `/trpg/${id}`, router }), [id, router]);

  const goBack = useCallback(() => {
    lakeNavigate(router, '/?p=trpg', `/trpg/${id}`);
  }, [id, router]);

  const requestLogin = useCallback(() => {
    setAuthOpen(true);
  }, []);

  useLakeBackNavigation(loaded && !!raw && unlocked, goBack, `trpg-${id}`, routeGuard);

  useEffect(() => {
    const dir = peekPendingLakeRouteDir();
    if (dir !== 'forward') return;
    const timer = window.setTimeout(() => {
      if (document.body.classList.contains('lh-route-trpg-enter')) return;
      beginLakeRouteEnter(pathname, dir);
    }, 48);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!loaded) return;
    const ok = isAdmin || isLakeAccessUnlocked('trpg');
    setUnlocked(ok);
    if (!ok) {
      router.replace(`/?p=trpg&trpg=${encodeURIComponent(id)}`, { scroll: false });
    }
  }, [id, isAdmin, loaded, router]);

  const item = useMemo(() => (raw ? normalizeTrpgScenario(raw) : null), [raw]);
  const dates = item ? formatTrpgDateRange(item) : '';

  useEffect(() => {
    if (item && !activeLogId && item.logs?.length) setActiveLogId(item.logs[0].id);
  }, [activeLogId, item]);

  useEffect(() => {
    if (!item || !unlocked) return;
    const bgm = item.pageBgm;
    const fileUrl = bgm?.fileUrl?.trim();
    const extUrl = bgm?.url?.trim();
    const ytId = extUrl ? parseYoutubeId(extUrl) : null;
    if (!fileUrl && !extUrl) return;

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
      bgmActionsRef.current.restorePageSnapshot(true);
    };
  }, [item?.id, item?.pageBgm?.fileUrl, item?.pageBgm?.url, unlocked]);

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

  if (!unlocked) {
    return (
      <>
        <TrpgTopbar />
        <main className="trpg-scenario-shell trpg-scenario-layout trpg-scenario-layout--loading">
          <p className="trpg-scenario-loading">불러오는 중…</p>
        </main>
      </>
    );
  }

  const scenario = item;
  const canEdit = unlocked && isAdmin;
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
  }

  function startEditLog(log: TrpgSessionLog) {
    const base = editing && draft ? draft : scenario;
    setDraft({ ...base, logs: base.logs ?? [] });
    setActiveLogId(log.id);
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
      <TrpgTopbar />

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
          {activePanel === 'overview' && (
            <>
              {view.system ? <p className="trpg-scenario-page__system">{view.system}</p> : null}

              <div className="trpg-scenario-page__hero-wrap">
                <span className="trpg-scenario-page__glow trpg-scenario-page__glow--left" aria-hidden="true" />
                <div className="trpg-scenario-page__hero">
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
              </div>

              <header className="trpg-scenario-page__head">
                <h1 className="trpg-scenario-page__title" style={titleStyle}>
                  {view.title}
                </h1>
                {view.subtitle ? (
                  <p className="trpg-scenario-page__subtitle" style={subtitleStyle}>
                    {view.subtitle}
                  </p>
                ) : null}
                <div className="trpg-scenario-page__meta">
                  {dates ? (
                    <p className="trpg-scenario-page__meta-row">
                      <span className="trpg-scenario-page__meta-icon" aria-hidden="true">
                        📅
                      </span>
                      {dates}
                    </p>
                  ) : null}
                  {(view.kp || view.players) && (
                    <p className="trpg-scenario-page__meta-row">
                      <span className="trpg-scenario-page__meta-icon" aria-hidden="true">
                        👥
                      </span>
                      {[view.kp ? `KP ${view.kp}` : null, view.players].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {view.author ? <p className="trpg-scenario-page__author">w. {view.author}</p> : null}
                </div>
              </header>

              <section className="trpg-scenario-page__section trpg-scenario-page__section--overview">
                {view.sessionUrl ? (
                  <div className="trpg-scenario-session-link">
                    <a href={view.sessionUrl} target="_blank" rel="noreferrer" className="trpg-scenario-session-link__btn">
                      세션 바로가기 ↗
                    </a>
                  </div>
                ) : null}
                <h2 className="trpg-scenario-page__section-title">후기</h2>
                <div className="trpg-scenario-page__prose">
                  {view.review || view.summary || '플레이 후기가 아직 등록되지 않았습니다.'}
                </div>
              </section>
            </>
          )}

          {activePanel === 'story' && (view.body || view.summary) && (
            <section className="trpg-scenario-page__section">
              <h2 className="trpg-scenario-page__section-title">Story</h2>
              <div className="trpg-scenario-page__prose trpg-scenario-page__prose--story">
                {view.body || view.summary}
              </div>
            </section>
          )}

          {activePanel === 'credits' && (
            <section className="trpg-scenario-page__section">
              <h2 className="trpg-scenario-page__section-title">Credits</h2>
              <dl className="trpg-credits-list">
                {view.system ? (
                  <>
                    <dt>System</dt>
                    <dd>{view.system}</dd>
                  </>
                ) : null}
                {view.author ? (
                  <>
                    <dt>Writer</dt>
                    <dd>w. {view.author}</dd>
                  </>
                ) : null}
                {view.kp ? (
                  <>
                    <dt>KP</dt>
                    <dd>{view.kp}</dd>
                  </>
                ) : null}
                {dates ? (
                  <>
                    <dt>Play period</dt>
                    <dd>{dates}</dd>
                  </>
                ) : null}
                {view.players ? (
                  <>
                    <dt>Players</dt>
                    <dd>{view.players}</dd>
                  </>
                ) : null}
              </dl>
            </section>
          )}

          {activePanel === 'players' && ((view.playerProfiles?.length ?? 0) > 0 || canEdit) && (
            <section className="trpg-scenario-page__section">
              <h2 className="trpg-scenario-page__section-title trpg-scenario-page__section-title--players">탐사자</h2>
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
                {view.gallery.map((g) => (
                  <figure key={g.id} className="trpg-gallery-card">
                    <img src={g.img} alt={g.title || ''} />
                    {(g.title || g.caption || g.artist) && (
                      <figcaption>
                        {g.title ? <strong>{g.title}</strong> : null}
                        {g.caption ? <span>{g.caption}</span> : null}
                        {g.artist ? <em>{g.artist}</em> : null}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            </section>
          )}

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
              <SecretItemGate
                scope="trpg"
                item={activeLog}
                isAdmin={isAdmin}
                loggedIn={!!user}
                onRequestLogin={requestLogin}
                lockedLabel={activeLog.title}
              >
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
                </article>
              </SecretItemGate>
            </section>
          ) : null}
        </div>

        <aside className="trpg-scenario-rail lh-scroll" aria-label="섹션 이동" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="trpg-scenario-rail__btn trpg-scenario-rail__btn--back" onClick={goBack}>
            ← TRPG 목록
          </button>
          <div className="trpg-scenario-rail__group">
            <span className="trpg-scenario-rail__label">Scenario</span>
            <button
              type="button"
              className={`trpg-scenario-rail__btn${activePanel === 'overview' ? ' is-active' : ''}`}
              onClick={() => goPanel('overview')}
            >
              개요
            </button>
            {(view.body || view.summary) && (
              <button
                type="button"
                className={`trpg-scenario-rail__btn${activePanel === 'story' ? ' is-active' : ''}`}
                onClick={() => goPanel('story')}
              >
                스토리
              </button>
            )}
            <button
              type="button"
              className={`trpg-scenario-rail__btn${activePanel === 'credits' ? ' is-active' : ''}`}
              onClick={() => goPanel('credits')}
            >
              크레딧
            </button>
          </div>
          <div className="trpg-scenario-rail__group">
            <span className="trpg-scenario-rail__label">Archive</span>
          {(view.playerProfiles?.length ?? 0) > 0 && (
            <button
              type="button"
              className={`trpg-scenario-rail__btn${activePanel === 'players' ? ' is-active' : ''}`}
              onClick={() => goPanel('players')}
            >
              탐사자
            </button>
          )}
          {(view.gallery?.length ?? 0) > 0 && (
            <button
              type="button"
              className={`trpg-scenario-rail__btn${activePanel === 'gallery' ? ' is-active' : ''}`}
              onClick={() => goPanel('gallery')}
            >
              Gallery
            </button>
          )}
          {(view.diceHighlights?.length ?? 0) > 0 && (
            <button
              type="button"
              className={`trpg-scenario-rail__btn${activePanel === 'dice' ? ' is-active' : ''}`}
              onClick={() => goPanel('dice')}
            >
              Key Rolls
            </button>
          )}
          {(view.handouts?.length ?? 0) > 0 && (
            <button
              type="button"
              className={`trpg-scenario-rail__btn${activePanel === 'handouts' ? ' is-active' : ''}`}
              onClick={() => goPanel('handouts')}
            >
              Handouts
            </button>
          )}
          </div>
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
                  lockedLabel={log.title}
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
          {isAdmin ? (
            <button
              type="button"
              className="trpg-scenario-rail__btn trpg-scenario-rail__btn--admin"
              onClick={() => openScenarioEdit(activePanel.startsWith('log:') ? 'logs' : 'basic')}
            >
              ✎ 시나리오 수정
            </button>
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
