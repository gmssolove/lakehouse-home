'use client';

import Link from 'next/link';
import { notFound, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthModal } from '@/components/auth/AuthModal';
import { LakeAccessGateModal } from '@/components/lake/LakeAccessGateModal';
import { SecretItemGate } from '@/components/lake/SecretItemGate';
import { TrpgTopbar } from '@/components/layout/TrpgTopbar';
import { TrpgLogFilmBoard } from '@/components/trpg/TrpgLogFilmBoard';
import { SecretLockBadge } from '@/components/ui/SecretLockBadge';
import { ImageFrameView } from '@/components/ui/ImageFrameView';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLakeBackNavigation } from '@/lib/hooks/useLakeBackNavigation';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { isLakeAccessUnlocked } from '@/lib/lake/accessGate';
import { trpgFontFamily } from '@/lib/trpg/fonts';
import { highlightLogPlainText } from '@/lib/trpg/logHighlight';
import { formatTrpgDateRange, normalizeTrpgScenario, playerNameMap } from '@/lib/trpg/normalize';
import type { TrpgScenario, TrpgSessionLog } from '@/lib/types/site-content';

type Props = {
  id: string;
};

function LogBody({ log }: { log: TrpgSessionLog }) {
  if (log.html) {
    return <div className="trpg-log__html" dangerouslySetInnerHTML={{ __html: log.html }} />;
  }
  return (
    <div
      className="trpg-log__text"
      dangerouslySetInnerHTML={{ __html: highlightLogPlainText(log.body || '') }}
    />
  );
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function TrpgScenarioPageClient({ id }: Props) {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { trpg, loaded, saveTrpg, accessSettings } = useSiteContent();
  const raw = trpg.find((s) => s.id === id);
  const [gateOpen, setGateOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [activeLogId, setActiveLogId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TrpgScenario | null>(null);
  const [revealedHandouts, setRevealedHandouts] = useState<Set<string>>(() => new Set());

  const routeGuard = useMemo(() => ({ guardPath: `/trpg/${id}`, router }), [id, router]);

  const goBack = useCallback(() => {
    router.replace('/?p=trpg', { scroll: false });
  }, [router]);

  useLakeBackNavigation(loaded && !!raw && unlocked, goBack, `trpg-${id}`, routeGuard);

  useEffect(() => {
    if (!loaded) return;
    if (isAdmin || isLakeAccessUnlocked('trpg')) {
      setUnlocked(true);
      setGateOpen(false);
      return;
    }
    setUnlocked(false);
    setGateOpen(true);
  }, [isAdmin, loaded]);

  const item = useMemo(() => (raw ? normalizeTrpgScenario(raw) : null), [raw]);
  const dates = item ? formatTrpgDateRange(item) : '';
  const names = useMemo(() => playerNameMap(item?.playerProfiles ?? []), [item?.playerProfiles]);

  useEffect(() => {
    if (item && !activeLogId && item.logs?.length) setActiveLogId(item.logs[0].id);
  }, [activeLogId, item]);

  const editing = isAdmin && draft?.id === id;

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

  const scenario = item;

  async function persistScenario(next: TrpgScenario) {
    await saveTrpg(trpg.map((s) => (s.id === next.id ? next : s)));
    setDraft(null);
  }

  function startEditLog(log: TrpgSessionLog) {
    setDraft({ ...scenario, logs: scenario.logs ?? [] });
    setActiveLogId(log.id);
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

  if (!unlocked) {
    return (
      <>
        <TrpgTopbar />
        <LakeAccessGateModal
          open={gateOpen}
          scope="trpg"
          accessSettings={accessSettings}
          title="TRPG Archive"
          description={`${scenario.title} — 로그인 후 비밀번호를 입력해야 열람할 수 있습니다.`}
          loggedIn={!!user}
          onClose={goBack}
          onSuccess={() => {
            setUnlocked(true);
            setGateOpen(false);
          }}
          onRequestLogin={() => setAuthOpen(true)}
        />
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      </>
    );
  }

  const view = editing && draft ? draft : scenario;

  const activeLog = (view.logs ?? []).find((l) => l.id === activeLogId) ?? view.logs?.[0] ?? null;
  const titleStyle = { fontFamily: trpgFontFamily(view.titleFont) };
  const subtitleStyle = { fontFamily: trpgFontFamily(view.subtitleFont) };
  const adminHref = `/?p=trpg&admin=1&section=trpg&edit=${encodeURIComponent(id)}`;

  function revealHandout(handoutId: string) {
    setRevealedHandouts((prev) => new Set(prev).add(handoutId));
  }

  return (
    <>
      <TrpgTopbar
        actions={
          isAdmin ? (
            <Link href={adminHref} className="trpg-topbar__edit">
              수정
            </Link>
          ) : null
        }
      />

      <main className="trpg-scenario-shell trpg-scenario-layout">
        <div className="trpg-scenario-page">
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
                  {[view.kp ? `KPC ${view.kp}` : null, view.players].filter(Boolean).join(' · ')}
                </p>
              )}
              {view.author ? <p className="trpg-scenario-page__author">w. {view.author}</p> : null}
            </div>
          </header>

          <section className="trpg-scenario-page__section">
            <h2 className="trpg-scenario-page__section-title">Overview</h2>
            <div className="trpg-scenario-page__prose">
              {view.summary || view.body || '시나리오 개요가 아직 등록되지 않았습니다.'}
            </div>
          </section>

          {view.playerProfiles && view.playerProfiles.length > 0 && (
            <section className="trpg-scenario-page__section" id="trpg-players">
              <h2 className="trpg-scenario-page__section-title">Investigators</h2>
              <div className="trpg-scenario-page__players">
                {view.playerProfiles.map((p) => (
                  <article key={p.id} className="trpg-player-card">
                    {p.img ? (
                      <img src={p.img} alt="" className="trpg-player-card__img" />
                    ) : (
                      <span className="trpg-player-card__ph">{p.name[0]}</span>
                    )}
                    <div className="trpg-player-card__body">
                      {p.role ? <span className="trpg-player-card__role">{p.role}</span> : null}
                      <h3>{p.name}</h3>
                      {p.bio ? <p>{p.bio}</p> : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {view.relationships && view.relationships.length > 0 && (
            <section className="trpg-scenario-page__section" id="trpg-relations">
              <h2 className="trpg-scenario-page__section-title">Relations</h2>
              <div className="trpg-relation-map">
                {view.relationships.map((rel) => (
                  <div key={rel.id} className="trpg-relation-map__edge">
                    <span>{names.get(rel.fromId) ?? rel.fromId}</span>
                    <span className="trpg-relation-map__line">{rel.label || '—'}</span>
                    <span>{names.get(rel.toId) ?? rel.toId}</span>
                  </div>
                ))}
              </div>
              {view.relationshipNotes ? (
                <p className="trpg-scenario-page__prose trpg-scenario-page__prose--muted">{view.relationshipNotes}</p>
              ) : null}
            </section>
          )}

          {view.gallery && view.gallery.length > 0 && (
            <section className="trpg-scenario-page__section" id="trpg-gallery">
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

          {view.diceHighlights && view.diceHighlights.length > 0 && (
            <section className="trpg-scenario-page__section" id="trpg-dice">
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

          {view.handouts && view.handouts.length > 0 && (
            <section className="trpg-scenario-page__section" id="trpg-handouts">
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

          {(view.logs?.length ?? 0) > 0 && (
            <section className="trpg-scenario-page__section" id="trpg-logs">
              <h2 className="trpg-scenario-page__section-title">Session Logs</h2>
              <TrpgLogFilmBoard
                logs={view.logs ?? []}
                players={view.playerProfiles ?? []}
                activeLogId={activeLog?.id ?? null}
                onSelect={setActiveLogId}
                user={user}
                isAdmin={isAdmin}
                onOpenAuth={() => setAuthOpen(true)}
              />
              <div className="trpg-log-layout">
                <aside className="trpg-log-list">
                  {(view.logs ?? []).map((log) => (
                    <SecretItemGate
                      key={log.id}
                      scope="trpg"
                      item={log}
                      isAdmin={isAdmin}
                      loggedIn={!!user}
                      onRequestLogin={() => setAuthOpen(true)}
                      lockedLabel={log.title}
                    >
                      <button
                        type="button"
                        className={`trpg-log-list__item${activeLog?.id === log.id ? ' is-active' : ''}`}
                        onClick={() => setActiveLogId(log.id)}
                      >
                        <span>
                          {log.title}
                          {log.secret ? <SecretLockBadge compact /> : null}
                        </span>
                        {log.date ? <time>{log.date}</time> : null}
                      </button>
                    </SecretItemGate>
                  ))}
                </aside>
                {activeLog ? (
                  <SecretItemGate
                    scope="trpg"
                    item={activeLog}
                    isAdmin={isAdmin}
                    loggedIn={!!user}
                    onRequestLogin={() => setAuthOpen(true)}
                    lockedLabel={activeLog.title}
                  >
                    <article className="trpg-log-view">
                      <header className="trpg-log-view__head">
                        <div>
                          <h3>
                            {activeLog.title}
                            {activeLog.secret ? <SecretLockBadge compact /> : null}
                          </h3>
                          {activeLog.date ? <time>{activeLog.date}</time> : null}
                        </div>
                      {isAdmin ? (
                        <div className="trpg-log-view__admin">
                          {editing ? (
                            <>
                              <button
                                type="button"
                                className="btn-edit"
                                onClick={() => void persistScenario(draft!)}
                              >
                                저장
                              </button>
                              <button type="button" className="btn-edit" onClick={() => setDraft(null)}>
                                취소
                              </button>
                            </>
                          ) : (
                            <button type="button" className="btn-edit" onClick={() => startEditLog(activeLog)}>
                              수정
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-del"
                            onClick={() => {
                              const next = {
                                ...scenario,
                                logs: (scenario.logs ?? []).filter((l) => l.id !== activeLog.id),
                              };
                              void persistScenario(next);
                            }}
                          >
                            삭제
                          </button>
                        </div>
                      ) : null}
                    </header>
                    {editing ? (
                      <>
                        <input
                          className="form-input"
                          value={draft?.logs?.find((l) => l.id === activeLog.id)?.title ?? ''}
                          onChange={(e) => updateDraftLog(activeLog.id, { title: e.target.value })}
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
                      <LogBody log={activeLog} />
                    )}
                    </article>
                  </SecretItemGate>
                ) : null}
              </div>
            </section>
          )}
        </div>

        <aside className="trpg-scenario-dock" aria-label="빠른 이동">
          {(view.logs?.length ?? 0) > 0 && (
            <button
              type="button"
              className="trpg-scenario-dock__btn"
              title="로그"
              onClick={() => scrollToSection('trpg-logs')}
            >
              📖
            </button>
          )}
          {(view.diceHighlights?.length ?? 0) > 0 && (
            <button
              type="button"
              className="trpg-scenario-dock__btn"
              title="주요 판정"
              onClick={() => scrollToSection('trpg-dice')}
            >
              🎲
            </button>
          )}
          {(view.handouts?.length ?? 0) > 0 && (
            <button
              type="button"
              className="trpg-scenario-dock__btn"
              title="핸드아웃"
              onClick={() => scrollToSection('trpg-handouts')}
            >
              📄
            </button>
          )}
          {isAdmin && (
            <Link href={adminHref} className="trpg-scenario-dock__btn" title="수정">
              ✎
            </Link>
          )}
          {(view.gallery?.length ?? 0) > 0 && (
            <button
              type="button"
              className="trpg-scenario-dock__btn"
              title="갤러리"
              onClick={() => scrollToSection('trpg-gallery')}
            >
              🖼
            </button>
          )}
          <button
            type="button"
            className="trpg-scenario-dock__btn"
            title="맨 위"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            ↑
          </button>
        </aside>
      </main>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
