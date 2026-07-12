'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LakeArchiveTopbar } from '@/components/layout/LakeArchiveTopbar';
import { OcCharacterDetail } from '@/components/oc/OcCharacterDetail';
import { OcProfileIntro } from '@/components/oc/OcProfileIntro';
import { useBgm } from '@/lib/contexts/BgmContext';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLakeBackGesture, useLakeBackNavigation } from '@/lib/hooks/useLakeBackNavigation';
import { useOcData } from '@/lib/hooks/useOcData';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { shouldShowPvIntro } from '@/lib/oc/profileQuotes';
import { displayCategory, isTrpgCategory, isUniverseCategory, normalizeCategory } from '@/lib/oc/categories';
import { characterHasBgmTheme } from '@/lib/oc/characterTheme';
import { isLakeAccessUnlocked } from '@/lib/lake/accessGate';
import { lakeNavigate } from '@/lib/lake/routeTransition';
import { LakeAccessGateModal } from '@/components/lake/LakeAccessGateModal';
import { AuthModal } from '@/components/auth/AuthModal';
import { buildCharacterNumberMap } from '@/lib/oc/characterOrder';
import { formatCardTag } from '@/lib/oc/profile';
import type { OcCharacter } from '@/lib/types/character';
import { ImageFrameView } from '@/components/ui/ImageFrameView';
import { LakeSearchField } from '@/components/ui/LakeSearchField';

const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

type SortMode = 'name' | 'stars' | 'no';

type IntroState = { character: OcCharacter; auIdx: number };

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
  const { restorePageSnapshot, pushPageSnapshot, resumePageBgmIfNeeded } = useBgm();
  const { user, isAdmin } = useAuth();
  const wasInDetailRef = useRef(false);
  const detailUsedThemeRef = useRef(false);
  const [activeCat, setActiveCat] = useState('all');
  const [activeSub, setActiveSub] = useState('all');
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('no');
  const [detail, setDetail] = useState<OcCharacter | null>(null);
  const [intro, setIntro] = useState<IntroState | null>(null);
  const [auIdx, setAuIdx] = useState(-1);
  const [passwordGate, setPasswordGate] = useState<{
    character: OcCharacter;
    au: number;
    skipIntro?: boolean;
  } | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  const charNumberMap = useMemo(() => buildCharacterNumberMap(characters), [characters]);
  const activeCharacter = detail ?? intro?.character ?? null;
  const activeCharNo = activeCharacter ? charNumberMap.get(String(activeCharacter.id)) ?? 1 : 1;

  const clearDetailView = useCallback(() => {
    setDetail(null);
    setIntro(null);
  }, []);

  const detailBackHandlerRef = useRef<(() => void) | null>(null);

  const bindDetailBack = useCallback((handler: (() => void) | null) => {
    detailBackHandlerRef.current = handler;
  }, []);

  const leaveDetail = useCallback(() => {
    if (detailUsedThemeRef.current) {
      restorePageSnapshot(ocSettings.autoResumeMainBgm);
    }
    detailUsedThemeRef.current = false;
    clearDetailView();
  }, [clearDetailView, ocSettings.autoResumeMainBgm, restorePageSnapshot]);

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

  useLakeBackNavigation(!!detail || !!intro, requestOcBack, 'oc-detail', routeGuard);
  useLakeBackGesture(leaveOc, !detail && !intro);

  useEffect(() => {
    wasInDetailRef.current = !!(detail || intro);
  }, [detail, intro]);

  const introRef = useRef(intro);
  introRef.current = intro;
  const [detailRevealKey, setDetailRevealKey] = useState(0);

  const finishIntro = useCallback((instant?: boolean) => {
    const payload = introRef.current;
    setIntro(null);
    if (payload) {
      setDetail(payload.character);
      setAuIdx(payload.auIdx);
      setDetailRevealKey((k) => k + 1);
      if (instant) {
        requestAnimationFrame(() => {
          document.querySelector('#detail-screen .oc-detail-right')?.classList.add('is-ready');
        });
      }
    }
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

  function openDetail(c: OcCharacter, au: number, opts?: { skipIntro?: boolean }) {
    const hasTheme = characterHasBgmTheme(c);
    detailUsedThemeRef.current = hasTheme;
    if (hasTheme) {
      pushPageSnapshot();
    } else {
      resumePageBgmIfNeeded();
    }
    if (!opts?.skipIntro && shouldShowPvIntro(c, ocSettings.pvIntroEnabled)) {
      setIntro({ character: c, auIdx: au });
      setDetail(null);
      return;
    }
    setIntro(null);
    setDetail(c);
    setAuIdx(au);
  }

  function requestOpenDetail(c: OcCharacter, au: number, opts?: { skipIntro?: boolean }) {
    if (isAdmin || isLakeAccessUnlocked('oc')) {
      openDetail(c, au, opts);
      return;
    }
    setPasswordGate({ character: c, au, skipIntro: opts?.skipIntro });
  }

  useEffect(() => {
    const charId = searchParams.get('c');
    if (!charId || !characters.length || detail || intro) return;
    const c = characters.find((ch) => String(ch.id) === String(charId));
    if (!c) return;
    const skipIntro =
      searchParams.get('view') === 'detail' ||
      searchParams.get('direct') === '1' ||
      searchParams.get('from') === 'trpg';
    requestOpenDetail(c, -1, { skipIntro });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once from URL
  }, [characters, searchParams, detail, intro]);

  const detailImg = detail ? charImg(detail, auIdx) : null;

  return (
    <>
      <LakeArchiveTopbar
        title="OC — Original Characters"
        active="oc"
        back={
          detail || intro ? (
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

      <div className="layout oc-archive-layout">
        <div className="sidebar">
          <div>
            <div className="s-title">Search</div>
            <LakeSearchField
              variant="oc"
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
            {!filtered.length ? (
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
                        fit={(c.imgFit as React.CSSProperties['objectFit']) || 'cover'}
                        pos={c.imgPos || 'center top'}
                        className="char-card-img-wrap"
                        imgClassName="char-card-img"
                      />
                    ) : (
                      <div className="char-card-placeholder">{ROMANS[i] || ''}</div>
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
      />
      <AuthModal backdrop="popup" open={authOpen} onClose={() => setAuthOpen(false)} />

      <div id="detail-screen" className={detail || intro ? 'active' : ''}>
        {intro && (
          <OcProfileIntro
            character={intro.character}
            durationMs={ocSettings.pvIntroDurationMs}
            onComplete={finishIntro}
            onCancel={leaveDetail}
          />
        )}
        {detail && !intro && (
          <OcCharacterDetail
            key={`${detail.id}-${detailRevealKey}`}
            character={detail}
            charNo={activeCharNo}
            auIdx={auIdx}
            isAdmin={isAdmin}
            categories={categories}
            img={detailImg?.src ? detailImg : null}
            onBack={leaveDetail}
            onBindBack={bindDetailBack}
            onAuChange={(au) => openDetail(detail, au)}
            onSave={
              isAdmin
                ? async (next) => {
                    await saveCharacters(
                      characters.map((c) => (String(c.id) === String(next.id) ? next : c)),
                    );
                    setDetail(next);
                  }
                : undefined
            }
          />
        )}
      </div>
    </>
  );
}
