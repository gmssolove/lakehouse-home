'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LakeArchiveTopbar } from '@/components/layout/LakeArchiveTopbar';
import { OcCharacterDetail } from '@/components/oc/OcCharacterDetail';
import { OcProfileIntro } from '@/components/oc/OcProfileIntro';
import { EntrySplash } from '@/components/shared/EntrySplash';
import { PageTipToast } from '@/components/shared/PageTipToast';
import { useBgm } from '@/lib/contexts/BgmContext';
import { normalizeTipToastSettings } from '@/lib/shared/tipToastQueue';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLakeBackGesture, useLakeBackNavigation } from '@/lib/hooks/useLakeBackNavigation';
import { useOcData } from '@/lib/hooks/useOcData';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { shouldShowPvIntro } from '@/lib/oc/profileQuotes';
import { displayCategory, isTrpgCategory, isUniverseCategory, normalizeCategory } from '@/lib/oc/categories';
import { characterHasBgmTheme } from '@/lib/oc/characterTheme';
import {
  isLakeItemUnlocked,
  resolveItemPassword,
  unlockLakeItem,
  verifyLakeAccessPassword,
} from '@/lib/lake/accessGate';
import {
  clearLakeRouteClasses,
  isLakeRouteEnterLocked,
  lakeNavigate,
} from '@/lib/lake/routeTransition';
import { LakeAccessGateModal } from '@/components/lake/LakeAccessGateModal';
import { AuthModal } from '@/components/auth/AuthModal';
import { buildCharacterNumberMap } from '@/lib/oc/characterOrder';
import { formatCardTag } from '@/lib/oc/profile';
import { normalizeEntrySplash } from '@/lib/shared/entrySplash';
import type { OcCharacter } from '@/lib/types/character';
import { ImageFrameView } from '@/components/ui/ImageFrameView';
import { LakeSearchField } from '@/components/ui/LakeSearchField';

const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

type SortMode = 'name' | 'stars' | 'no';

type IntroState = { character: OcCharacter; auIdx: number };
type SplashState = { character: OcCharacter; auIdx: number; skipIntro?: boolean };

function charImg(c: OcCharacter, auIdx: number) {
  if (auIdx >= 0 && c.auVersions?.[auIdx]) {
    const au = c.auVersions[auIdx];
    return {
      src: au.img || c.img || '',
      fit: au.imgFit || c.imgFit || 'contain',
      pos: au.imgPos || c.imgPos || 'center top',
      frame: au.imgFrame || c.imgFrame,
    };
  }
  return {
    src: c.img || '',
    fit: c.imgFit || 'contain',
    pos: c.imgPos || 'center top',
    frame: c.imgFrame,
  };
}

export function OcPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { characters, categories, saveCharacters } = useOcData();
  const { ocSettings, accessSettings } = useSiteContent();
  const { restorePageSnapshot, resumePageBgmIfNeeded, playCharacterTheme } = useBgm();
  const { user, isAdmin, ready: authReady } = useAuth();
  const wasInDetailRef = useRef(false);
  const detailUsedThemeRef = useRef(false);
  const [activeCat, setActiveCat] = useState('all');
  const [activeSub, setActiveSub] = useState('all');
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('no');
  const [detail, setDetail] = useState<OcCharacter | null>(null);
  const [detailInstant, setDetailInstant] = useState(false);
  const [intro, setIntro] = useState<IntroState | null>(null);
  const [entrySplash, setEntrySplash] = useState<SplashState | null>(null);
  const splashPendingRef = useRef<SplashState | null>(null);
  const [auIdx, setAuIdx] = useState(-1);
  const [passwordGate, setPasswordGate] = useState<{
    character: OcCharacter;
    au: number;
    skipIntro?: boolean;
  } | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /** OC 페이지 마운트당 1회 — 영역 클릭 후 TOUCH! 숨김(새로고침/재진입 시 초기화) */
  const [touchHintDismissed, setTouchHintDismissed] = useState(false);

  useEffect(() => {
    document.body.style.opacity = '1';
    document.body.classList.remove('lh-leaving');
    /* OC↔Pair enter 애니가 마운트 직후 끊기지 않게 */
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

  const charNumberMap = useMemo(() => buildCharacterNumberMap(characters), [characters]);
  const activeCharacter = detail ?? intro?.character ?? entrySplash?.character ?? null;
  const activeCharNo = activeCharacter ? charNumberMap.get(String(activeCharacter.id)) ?? 1 : 1;

  /** 저장/RTDB 반영 후 detail 스냅샷이 뒤처지지 않게 목록에서 라이브로 조회 */
  const liveDetail = useMemo(() => {
    if (!detail) return null;
    return characters.find((c) => String(c.id) === String(detail.id)) ?? detail;
  }, [characters, detail]);

  const clearDetailView = useCallback(() => {
    splashPendingRef.current = null;
    setEntrySplash(null);
    setDetail(null);
    setIntro(null);
    const screen = document.getElementById('detail-screen');
    if (screen) {
      screen.classList.remove('is-pv-done', 'is-ui-enter', 'is-ui-leaving');
      screen.style.removeProperty('opacity');
      screen.style.removeProperty('filter');
      screen.style.removeProperty('transform');
    }
  }, []);

  const detailBackHandlerRef = useRef<(() => void) | null>(null);

  const bindDetailBack = useCallback((handler: (() => void) | null) => {
    detailBackHandlerRef.current = handler;
  }, []);

  const leaveTimerRef = useRef(0);
  const leavingRef = useRef(false);

  const leaveDetail = useCallback(() => {
    if (leavingRef.current) return;
    const screen = document.getElementById('detail-screen');
    const playLeave = !!(detail || intro) && !!screen?.classList.contains('active');
    const finish = () => {
      leavingRef.current = false;
      if (detailUsedThemeRef.current) {
        restorePageSnapshot(ocSettings.autoResumeMainBgm);
      }
      detailUsedThemeRef.current = false;
      /* 목록은 상세 아래에 그대로 있음 — settle/강제 리플로우하면 퇴장 직후 뚝 끊김 */
      clearDetailView();
    };
    if (!playLeave || !screen) {
      finish();
      return;
    }
    leavingRef.current = true;
    window.clearTimeout(leaveTimerRef.current);
    screen.classList.remove('is-ui-enter');
    screen.classList.add('is-ui-leaving');
    leaveTimerRef.current = window.setTimeout(finish, 720);
  }, [clearDetailView, detail, intro, ocSettings.autoResumeMainBgm, restorePageSnapshot]);

  useEffect(() => {
    return () => {
      window.clearTimeout(leaveTimerRef.current);
    };
  }, []);

  const requestOcBack = useCallback(() => {
    if (detailBackHandlerRef.current) {
      detailBackHandlerRef.current();
      return;
    }
    leaveDetail();
  }, [leaveDetail]);

  const handleDetailBack = requestOcBack;

  const leaveOc = useCallback(() => {
    lakeNavigate(router, '/', '/oc');
  }, [router]);

  const routeGuard = useMemo(() => ({ guardPath: '/oc', router }), [router]);

  useLakeBackNavigation(!!detail || !!intro || !!entrySplash, requestOcBack, 'oc-detail', routeGuard);
  useLakeBackGesture(leaveOc, !detail && !intro && !entrySplash);

  useEffect(() => {
    wasInDetailRef.current = !!(detail || intro || entrySplash);
  }, [detail, intro, entrySplash]);

  const introRef = useRef(intro);
  introRef.current = intro;
  const [detailRevealKey, setDetailRevealKey] = useState(0);

  const finishIntro = useCallback((_instant?: boolean) => {
    const payload = introRef.current;
    setIntro(null);
    if (!payload) return;
    setDetail(payload.character);
    setAuIdx(payload.auIdx);
    setDetailRevealKey((k) => k + 1);
    /* PV 스킵/종료 직후 lhDetailOpen(both)이 opacity:0에 묶이면 정보창이 영구히 안 보임 */
    requestAnimationFrame(() => {
      const screen = document.getElementById('detail-screen');
      if (screen) {
        screen.classList.add('is-pv-done');
        screen.style.setProperty('opacity', '1');
        screen.style.setProperty('filter', 'none');
        screen.style.setProperty('transform', 'none');
      }
      document.querySelector('#detail-screen .oc-detail-right')?.classList.add('is-ready');
    });
  }, []);

  const subs = useMemo(() => {
    if (activeCat === 'all' || isTrpgCategory(activeCat)) return [];
    return [
      ...new Set(
        characters.filter((c) => normalizeCategory(c.category) === activeCat).map((c) => c.subcat).filter(Boolean),
      ),
    ] as string[];
  }, [characters, activeCat]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = characters.filter((c) => {
      const cat = normalizeCategory(c.category);
      if (activeCat !== 'all' && cat !== activeCat) return false;
      if (activeSub !== 'all' && c.subcat !== activeSub) return false;
      if (q && !c.name.toLowerCase().includes(q) && !(c.nameSub || '').toLowerCase().includes(q)) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name, 'ko');
      if (sortMode === 'stars') return (b.stars ?? 5) - (a.stars ?? 5);
      return String(a.id).localeCompare(String(b.id));
    });
    return list;
  }, [characters, activeCat, activeSub, search, sortMode]);

  function proceedAfterSplash(c: OcCharacter, au: number, opts?: { skipIntro?: boolean }) {
    if (!opts?.skipIntro && shouldShowPvIntro(c, ocSettings.pvIntroEnabled)) {
      setIntro({ character: c, auIdx: au });
      setDetail(null);
      return;
    }
    setIntro(null);
    setDetail(c);
    setAuIdx(au);
  }

  function openDetail(c: OcCharacter, au: number, opts?: { skipIntro?: boolean; instant?: boolean }) {
    setDetailInstant(!!opts?.instant);
    const hasTheme = characterHasBgmTheme(c);
    detailUsedThemeRef.current = hasTheme;
    if (hasTheme) {
      /* 카드 클릭과 같은 동기 호출 스택에서 재생 — PV 시작 전부터 나와야 함 */
      const th = c.theme;
      playCharacterTheme(
        {
          fileData: th?.fileData,
          youtubeId: th?.youtubeId,
          title: th?.title || `${c.name} Theme`,
          artist: th?.artist || '',
        },
        true,
      );
    } else {
      resumePageBgmIfNeeded();
    }
    if (normalizeEntrySplash(c.entrySplash).enabled) {
      const pending = { character: c, auIdx: au, skipIntro: opts?.skipIntro };
      splashPendingRef.current = pending;
      setIntro(null);
      setDetail(null);
      setEntrySplash(pending);
      return;
    }
    splashPendingRef.current = null;
    setEntrySplash(null);
    proceedAfterSplash(c, au, opts);
  }

  const finishEntrySplash = useCallback(() => {
    const pending = splashPendingRef.current;
    splashPendingRef.current = null;
    setEntrySplash(null);
    if (!pending) return;
    if (!pending.skipIntro && shouldShowPvIntro(pending.character, ocSettings.pvIntroEnabled)) {
      setIntro({ character: pending.character, auIdx: pending.auIdx });
      setDetail(null);
      return;
    }
    setIntro(null);
    setDetail(pending.character);
    setAuIdx(pending.auIdx);
  }, [ocSettings.pvIntroEnabled]);

  function requestOpenDetail(c: OcCharacter, au: number, opts?: { skipIntro?: boolean; instant?: boolean }) {
    const id = String(c.id);
    if (isAdmin || !c.secret || isLakeItemUnlocked('oc', id, resolveItemPassword('oc', c, accessSettings))) {
      openDetail(c, au, opts);
      return;
    }
    setPasswordGate({ character: c, au, skipIntro: opts?.skipIntro });
  }

  useEffect(() => {
    // 인증 상태가 확정되기 전엔 열지 않는다 — 관리자가 로딩 중 isAdmin=false로
    // 오판돼 비밀번호 게이트가 뜨는 것을 방지.
    if (!authReady) return;
    const charId = searchParams.get('c');
    if (!charId || !characters.length || detail || intro || entrySplash) return;
    const c = characters.find((ch) => String(ch.id) === String(charId));
    if (!c) return;
    const skipIntro = searchParams.get('direct') === '1';
    /* view=detail / from=trpg 여도 PV는 재생 — 관련 프로필 이동 시 대사 필요 */
    requestOpenDetail(c, -1, { skipIntro, instant: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once from URL
  }, [characters, searchParams, detail, intro, entrySplash, authReady]);

  const detailImg = liveDetail ? charImg(liveDetail, auIdx) : null;
  const tipToastOc = useMemo(
    () => normalizeTipToastSettings(ocSettings.tipToastOc),
    [ocSettings.tipToastOc],
  );
  const showArchiveTip = !detail && !intro && !entrySplash;
  /* URL로 상세 진입 중 — 목록 깜빡임 방지 */
  const urlCharPending = Boolean(searchParams.get('c')) && !detail && !intro && !entrySplash;

  return (
    <>
      <LakeArchiveTopbar
        title="OC — Original Characters"
        active="oc"
        back={
          detail || intro || entrySplash ? (
            <button type="button" className="nav-back" onClick={handleDetailBack}>
              ← back
            </button>
          ) : (
            <a href="/" className="nav-back">
              ← back
            </a>
          )
        }
      />

      <div className={`layout oc-archive-layout${sidebarOpen ? ' is-sidebar-open' : ''}${detail || intro || entrySplash || urlCharPending ? ' is-detail-cover' : ''}`}>
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
            <div className="oc-filter-bar oc-filter-bar--sidebar" role="group" aria-label="OC 정렬">
              <select
                id="oc-filter-sort"
                className="oc-filter-select"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                aria-label="정렬"
              >
                <option value="no">정렬 · 번호</option>
                <option value="name">정렬 · 이름</option>
                <option value="stars">정렬 · 별점</option>
              </select>
            </div>
          </div>
          <div>
            <div className="s-title">Category</div>
            <div className="filter-group" id="category-filters">
              <button
                type="button"
                className={`filter-btn${activeCat === 'all' ? ' active' : ''}`}
                onClick={() => {
                  setActiveCat('all');
                  setActiveSub('all');
                }}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`filter-btn${activeCat === cat ? ' active' : ''}`}
                  onClick={() => {
                    setActiveCat(cat);
                    setActiveSub('all');
                  }}
                >
                  {displayCategory(cat)}
                </button>
              ))}
            </div>
          </div>
          {subs.length > 0 && (
            <div id="sub-filter-wrap">
              <div className="s-title">{isUniverseCategory(activeCat) ? 'Universe' : 'Scenario'}</div>
              <div className="filter-group" id="sub-filters">
                <button
                  type="button"
                  className={`filter-btn${activeSub === 'all' ? ' active' : ''}`}
                  onClick={() => setActiveSub('all')}
                >
                  전체
                </button>
                {subs.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`filter-btn${activeSub === s ? ' active' : ''}`}
                    onClick={() => setActiveSub(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="sidebar-count">{filtered.length}개</div>
        </div>
        <div className="main-content">
          <h2 className="oc-archive-heading">Character Archive</h2>
          <div className="card-grid" id="card-grid">
            {urlCharPending ? (
              <div
                style={{
                  gridColumn: '1/-1',
                  textAlign: 'center',
                  padding: '5rem',
                  fontFamily: 'Playfair Display, serif',
                  fontStyle: 'italic',
                  fontSize: 18,
                  color: 'var(--text-muted)',
                  opacity: 0.55,
                }}
                aria-hidden
              />
            ) : !filtered.length ? (
              <div
                style={{
                  gridColumn: '1/-1',
                  textAlign: 'center',
                  padding: '5rem',
                  fontFamily: 'Playfair Display, serif',
                  fontStyle: 'italic',
                  fontSize: 20,
                  color: 'var(--text-muted)',
                }}
              >
                — 캐릭터가 없습니다 —
              </div>
            ) : (
              filtered.map((c, i) => {
                const stars = '★'.repeat(c.stars || 5) + '☆'.repeat(5 - (c.stars || 5));
                const cardTag = formatCardTag(c.tag);
                return (
                  <div key={c.id} className="char-card" onClick={() => requestOpenDetail(c, -1)}>
                    {c.img ? (
                      <ImageFrameView
                        src={c.img}
                        frame={c.imgFrame}
                        fit="cover"
                        pos={c.imgPos || 'center top'}
                        className="char-card-img-wrap"
                        imgClassName="char-card-img"
                      />
                    ) : (
                      <div className="char-card-placeholder">{ROMANS[i] ?? ''}</div>
                    )}
                    <div className="char-card-hover">
                      {c.nameSub && <div className="hover-sub">{c.nameSub}</div>}
                      <div className="hover-name">{c.name}</div>
                      {cardTag && <div className="hover-tag">{cardTag}</div>}
                    </div>
                    <div className="char-card-bottom">
                      <div className="char-card-stars">{stars}</div>
                      {c.nameSub && <div className="char-card-role">{c.nameSub}</div>}
                      <div className="char-card-name">{c.name}</div>
                      {cardTag && (
                        <div className="char-card-tags">
                          <span className="char-card-tag">{cardTag}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <LakeAccessGateModal
        open={!!passwordGate}
        scope="oc"
        item={passwordGate?.character}
        accessSettings={accessSettings}
        title="Profile Access"
        description={
          passwordGate?.character.name
            ? `${passwordGate.character.name} 프로필 — 로그인 후 비밀번호를 입력하세요.`
            : '프로필 — 로그인 후 비밀번호를 입력하세요.'
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
          if (pending) openDetail(pending.character, pending.au, { skipIntro: pending.skipIntro });
        }}
        verifyOverride={(input) => {
          const c = passwordGate?.character;
          if (!c) return false;
          if (!verifyLakeAccessPassword('oc', input, accessSettings, c)) return false;
          unlockLakeItem('oc', String(c.id), resolveItemPassword('oc', c, accessSettings));
          return true;
        }}
      />
      <AuthModal backdrop="popup" open={authOpen} onClose={() => setAuthOpen(false)} />

      <div id="detail-screen" className={detail || intro || entrySplash || urlCharPending ? 'active' : ''}>
        {intro && (
          <OcProfileIntro
            character={intro.character}
            durationMs={ocSettings.pvIntroDurationMs}
            onComplete={finishIntro}
            onCancel={leaveDetail}
          />
        )}
        {liveDetail && !intro && (
          <OcCharacterDetail
            key={`${liveDetail.id}-${detailRevealKey}`}
            character={liveDetail}
            charNo={activeCharNo}
            auIdx={auIdx}
            enterInstant={detailInstant}
            isAdmin={isAdmin}
            categories={categories}
            img={detailImg?.src ? detailImg : null}
            onBack={leaveDetail}
            onBindBack={bindDetailBack}
            onAuChange={(au) => setAuIdx(au)}
            onSave={
              isAdmin
                ? async (next) => {
                    const saved = await saveCharacters(
                      characters.map((c) => (String(c.id) === String(next.id) ? next : c)),
                    );
                    const fresh = saved.find((c) => String(c.id) === String(next.id)) ?? next;
                    setDetail(fresh);
                  }
                : undefined
            }
            touchHintDismissed={touchHintDismissed}
            onTouchHintDismiss={() => setTouchHintDismissed(true)}
          />
        )}
      </div>

      {entrySplash ? (
        <EntrySplash
          config={entrySplash.character.entrySplash}
          imageSrc={charImg(entrySplash.character, entrySplash.auIdx).src}
          eyebrow="OC"
          title={entrySplash.character.name}
          tipStorageKey={`lh_entry_tip_oc_${entrySplash.character.id}`}
          onDone={finishEntrySplash}
        />
      ) : null}

      <PageTipToast active={showArchiveTip} settings={tipToastOc} storageKey="lh_tip_toast_oc" />
    </>
  );
}
