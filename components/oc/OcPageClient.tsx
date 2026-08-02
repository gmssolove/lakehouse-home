'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LakeArchiveTopbar } from '@/components/layout/LakeArchiveTopbar';
import { OcCharacterDetail } from '@/components/oc/OcCharacterDetail';
import { OcChatAlertHost } from '@/components/oc/OcChatAlertHost';
import { OcChatPanel } from '@/components/oc/OcChatPanel';
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
  canAccessSecretItem,
  resolveItemPassword,
  unlockLakeItem,
  verifyLakeAccessPassword,
} from '@/lib/lake/accessGate';
import {
  clearLakeRouteClasses,
  consumePendingOcCharId,
  isLakeRouteEnterLocked,
  lakeNavigate,
  peekPendingOcCharId,
} from '@/lib/lake/routeTransition';
import { lakeHistoryReplaceQuiet } from '@/lib/hooks/lakeBackStack';
import {
  clearOcReturnPath,
  consumeOcReturnPath,
  resolveOcReturnHref,
} from '@/lib/lake/ocReturn';
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
  const { characters, categories, loaded, saveCharacters } = useOcData();
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
  /** 채팅 오버레이 — 상세 remount와 분리해 OC 전환 시에도 유지 */
  const [chatOpen, setChatOpen] = useState(false);
  const [chatCharacterId, setChatCharacterId] = useState<string | null>(null);
  const [chatPhoneView, setChatPhoneView] = useState<'list' | 'thread'>('thread');

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

  /**
   * ?c= 제거. history에는 replace만 (엔트리 추가 금지).
   * Next searchParams 반영 전에 동기 quiet replace로 재오픈 레이스를 막는다.
   */
  const scrubOcDeepLink = useCallback(() => {
    try {
      const url = new URL(window.location.href);
      if (
        url.searchParams.has('c') ||
        url.searchParams.has('view') ||
        url.searchParams.has('direct') ||
        url.searchParams.has('from') ||
        url.searchParams.has('pair') ||
        url.searchParams.has('trpg')
      ) {
        url.searchParams.delete('c');
        url.searchParams.delete('view');
        url.searchParams.delete('direct');
        url.searchParams.delete('from');
        url.searchParams.delete('pair');
        url.searchParams.delete('trpg');
        const next = `${url.pathname}${url.search}${url.hash}`;
        lakeHistoryReplaceQuiet(next);
        router.replace(next, { scroll: false });
      }
    } catch {
      /* ignore */
    }
  }, [router]);

  const detailBackHandlerRef = useRef<(() => void) | null>(null);
  /** leave 직후 URL effect가 같은 ?c=로 상세를 다시 열지 않게 */
  const suppressUrlDetailOpenRef = useRef(false);

  const bindDetailBack = useCallback((handler: (() => void) | null) => {
    detailBackHandlerRef.current = handler;
  }, []);

  const leaveTimerRef = useRef(0);
  const leavingRef = useRef(false);
  const [detailLeaving, setDetailLeaving] = useState(false);

  const leaveDetail = useCallback(() => {
    if (leavingRef.current) return;
    const returnHref = resolveOcReturnHref(searchParams) || consumeOcReturnPath();
    const screen = document.getElementById('detail-screen');
    const playLeave = !!(detail || intro) && !!screen?.classList.contains('active');

    const finish = () => {
      leavingRef.current = false;
      setDetailLeaving(false);
      setChatOpen(false);
      setChatCharacterId(null);
      if (detailUsedThemeRef.current) {
        restorePageSnapshot(ocSettings.autoResumeMainBgm);
      }
      detailUsedThemeRef.current = false;
      /* 페어 복귀: 상세를 먼저 닫으면 목록이 한 프레임 보임 — soft nav 후 unmount에 맡김 */
      if (returnHref) {
        suppressUrlDetailOpenRef.current = true;
        clearOcReturnPath();
        lakeNavigate(router, returnHref, '/oc');
        window.setTimeout(() => {
          suppressUrlDetailOpenRef.current = false;
        }, 400);
        return;
      }
      /*
       * 순서 중요: URL ?c= 를 먼저 지운 뒤 detail을 비움.
       * 반대로 하면 detail=null + 남은 ?c= 로 boot effect가 상세를 다시 연다 → 뒤로가기 2번 필요.
       */
      suppressUrlDetailOpenRef.current = true;
      scrubOcDeepLink();
      clearDetailView();
      window.setTimeout(() => {
        suppressUrlDetailOpenRef.current = false;
      }, 400);
    };

    /* 페어/TRPG 복귀: 상세 leave 애니 생략 → 즉시 soft/hard 이동 */
    if (returnHref) {
      finish();
      return;
    }

    if (!playLeave || !screen) {
      finish();
      return;
    }
    leavingRef.current = true;
    setDetailLeaving(true);
    window.clearTimeout(leaveTimerRef.current);
    screen.classList.remove('is-ui-enter');
    screen.classList.add('is-ui-leaving');
    leaveTimerRef.current = window.setTimeout(finish, 720);
  }, [
    clearDetailView,
    detail,
    intro,
    ocSettings.autoResumeMainBgm,
    restorePageSnapshot,
    router,
    scrubOcDeepLink,
    searchParams,
  ]);

  useEffect(() => {
    return () => {
      window.clearTimeout(leaveTimerRef.current);
    };
  }, []);

  const closeChat = useCallback(() => {
    setChatOpen(false);
    setChatPhoneView('thread');
  }, []);

  /** 목록으로/브라우저 뒤로 — 채팅이 열려 있으면 먼저 닫고, 그다음 상세 레이어 */
  const requestOcBack = useCallback(() => {
    if (chatOpen) {
      closeChat();
      return;
    }
    if (detailBackHandlerRef.current) {
      detailBackHandlerRef.current();
      return;
    }
    leaveDetail();
  }, [chatOpen, closeChat, leaveDetail]);

  const handleDetailBack = requestOcBack;

  const leaveOc = useCallback(() => {
    const returnHref = resolveOcReturnHref(searchParams) || consumeOcReturnPath();
    if (returnHref) {
      clearOcReturnPath();
      lakeNavigate(router, returnHref, '/oc');
      return;
    }
    lakeNavigate(router, '/', '/oc');
  }, [router, searchParams]);

  useEffect(() => {
    const href = resolveOcReturnHref(searchParams);
    if (href) router.prefetch(href);
  }, [router, searchParams]);

  const routeGuard = useMemo(() => ({ guardPath: '/oc', router }), [router]);

  /* 채팅 모달 = lake-back 한 겹 (history.push 없이). 뒤로가기 1회 = 채팅 닫기 */
  useLakeBackNavigation(chatOpen, closeChat, 'oc-chat', routeGuard);
  useLakeBackNavigation(
    !!detail || !!intro || !!entrySplash || detailLeaving,
    requestOcBack,
    'oc-detail',
    routeGuard,
  );
  useLakeBackGesture(leaveOc, !detail && !intro && !entrySplash && !chatOpen);

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

  function openDetail(
    c: OcCharacter,
    au: number,
    opts?: { skipIntro?: boolean; instant?: boolean; skipSplash?: boolean },
  ) {
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
    if (!opts?.skipSplash && normalizeEntrySplash(c.entrySplash).enabled) {
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

  const chatSwitchTimerRef = useRef(0);
  const chatSwitchDebounceRef = useRef(0);
  const chatSwitchGenRef = useRef(0);
  /** 페이드 중 URL sync가 openDetail을 덮어쓰지 않게 */
  const chatSwitchPendingIdRef = useRef<string | null>(null);
  const chatSwitchSuppressUrlRef = useRef(false);
  const detailRef = useRef(detail);
  detailRef.current = detail;

  const openChatForCharacter = useCallback((c: OcCharacter) => {
    if (!c.chatbot?.enabled) return;
    setChatCharacterId(String(c.id));
    setChatPhoneView('thread');
    setChatOpen(true);
  }, []);

  const commitChatSwitch = useCallback(
    (next: OcCharacter) => {
      const id = String(next.id);
      const gen = ++chatSwitchGenRef.current;
      chatSwitchPendingIdRef.current = id;
      setChatCharacterId(id);
      setChatOpen(true);

      /*
       * 인박스 OC 전환은 같은 /oc 상세 세션 안 UI 교체 — push로 히스토리를 쌓지 않음.
       * replace만으로 ?c= 동기화 (브라우저 뒤로가기가 상세에 남지 않게).
       */
      chatSwitchSuppressUrlRef.current = true;
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('c') !== id) {
          url.searchParams.set('c', id);
          url.searchParams.set('direct', '1');
          const nextUrl = `${url.pathname}${url.search}${url.hash}`;
          lakeHistoryReplaceQuiet(nextUrl);
          router.replace(nextUrl, { scroll: false });
        }
      } catch {
        const fallback = `/oc?c=${encodeURIComponent(id)}&direct=1`;
        lakeHistoryReplaceQuiet(fallback);
        router.replace(fallback, { scroll: false });
      }
      window.setTimeout(() => {
        if (chatSwitchGenRef.current === gen) chatSwitchSuppressUrlRef.current = false;
      }, 280);

      const screen = document.getElementById('detail-screen');
      const needsSwap = String(detailRef.current?.id) !== id;
      window.clearTimeout(chatSwitchTimerRef.current);

      if (!needsSwap) {
        chatSwitchPendingIdRef.current = null;
        return;
      }

      /* 상세는 즉시 교체 — 페이드는 교체와 동시에 짧게만 */
      openDetail(next, -1, { skipIntro: true, instant: true, skipSplash: true });
      chatSwitchPendingIdRef.current = null;

      if (!screen) return;
      screen.classList.remove('is-chat-switch-fade');
      void screen.offsetWidth;
      screen.classList.add('is-chat-switch-fade');
      chatSwitchTimerRef.current = window.setTimeout(() => {
        if (chatSwitchGenRef.current !== gen) return;
        screen.classList.remove('is-chat-switch-fade');
      }, 280);
    },
    [router],
  );

  const switchChatToCharacter = useCallback(
    (next: OcCharacter) => {
      if (!next.chatbot?.enabled) return;
      const id = String(next.id);
      const canOpen = canAccessSecretItem('oc', id, {
        secret: next.secret,
        expectedPassword: resolveItemPassword('oc', next, accessSettings),
        isAdmin,
        loggedIn: !!user,
      });
      if (!canOpen) {
        setPasswordGate({ character: next, au: -1, skipIntro: true });
        return;
      }
      window.clearTimeout(chatSwitchDebounceRef.current);
      commitChatSwitch(next);
    },
    [accessSettings, commitChatSwitch, isAdmin, user],
  );

  const chatCharacter = useMemo(() => {
    if (!chatCharacterId) return null;
    return (
      characters.find((c) => String(c.id) === String(chatCharacterId)) ||
      (liveDetail && String(liveDetail.id) === String(chatCharacterId) ? liveDetail : null)
    );
  }, [characters, chatCharacterId, liveDetail]);

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
    if (
      canAccessSecretItem('oc', id, {
        secret: c.secret,
        expectedPassword: resolveItemPassword('oc', c, accessSettings),
        isAdmin,
        loggedIn: !!user,
      })
    ) {
      openDetail(c, au, opts);
      return;
    }
    setPasswordGate({ character: c, au, skipIntro: opts?.skipIntro });
  }

  /* 비밀글 상세를 연 뒤 로그아웃되면 닫고 게이트로 */
  useEffect(() => {
    if (!authReady || isAdmin || user) return;
    if (!detail?.secret) return;
    const pending = { character: detail, au: auIdx, skipIntro: true as const };
    setIntro(null);
    setEntrySplash(null);
    setDetail(null);
    setPasswordGate(pending);
  }, [authReady, isAdmin, user, detail, auIdx]);

  const bootCharRef = useRef<string | null>(peekPendingOcCharId());
  const [bootCharCover, setBootCharCover] = useState(() => Boolean(bootCharRef.current));
  const autoOpenedCharRef = useRef<string | null>(null);

  useEffect(() => {
    // 인증 상태가 확정되기 전엔 열지 않는다 — 관리자가 로딩 중 isAdmin=false로
    // 오판돼 비밀번호 게이트가 뜨는 것을 방지.
    if (!authReady) return;
    if (suppressUrlDetailOpenRef.current || leavingRef.current) return;
    const fromUrl = searchParams.get('c')?.trim();
    const fromStore = consumePendingOcCharId();
    const charId = fromUrl || fromStore || bootCharRef.current;
    if (!charId || !characters.length) return;

    if (autoOpenedCharRef.current === charId && !detail && !intro && !entrySplash) {
      bootCharRef.current = null;
      setBootCharCover(false);
      return;
    }
    if (detail || intro || entrySplash) return;

    const c = characters.find((ch) => String(ch.id) === String(charId));
    if (!c) {
      bootCharRef.current = null;
      setBootCharCover(false);
      return;
    }
    autoOpenedCharRef.current = charId;
    bootCharRef.current = null;
    setBootCharCover(false);
    const skipIntro = searchParams.get('direct') === '1';
    /* view=detail / from=trpg 여도 PV는 재생 — 관련 프로필 이동 시 대사 필요 */
    requestOpenDetail(c, -1, { skipIntro, instant: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once from URL
  }, [characters, searchParams, detail, intro, entrySplash, authReady]);

  /* 브라우저 back/forward로 ?c= 가 바뀌면 상세·채팅 대상을 soft 동기화 */
  useEffect(() => {
    if (!authReady || !characters.length) return;
    if (suppressUrlDetailOpenRef.current || leavingRef.current) return;
    if (!detail && !intro && !entrySplash) return;
    const fromUrl = searchParams.get('c')?.trim();
    if (!fromUrl) return;
    /* 목록에서 고른 soft push 처리 중이면 URL sync가 끼어들어 깜빡이지 않게 */
    if (chatSwitchSuppressUrlRef.current) return;
    if (
      chatSwitchPendingIdRef.current &&
      String(chatSwitchPendingIdRef.current) === String(fromUrl)
    ) {
      return;
    }
    if (String(detail?.id) === String(fromUrl)) {
      if (chatOpen) setChatCharacterId(String(fromUrl));
      return;
    }
    const c = characters.find((ch) => String(ch.id) === String(fromUrl));
    if (!c) return;
    /* back 등 외부 URL 변화 — 진행 중 페이드 취소 후 맞춤 */
    window.clearTimeout(chatSwitchTimerRef.current);
    window.clearTimeout(chatSwitchDebounceRef.current);
    chatSwitchPendingIdRef.current = null;
    document.getElementById('detail-screen')?.classList.remove('is-chat-switch-fade');
    openDetail(c, -1, { skipIntro: true, instant: true, skipSplash: true });
    if (chatOpen) setChatCharacterId(String(c.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync from URL only
  }, [searchParams, characters, authReady, detail?.id, chatOpen, intro, entrySplash]);

  const detailImg = liveDetail ? charImg(liveDetail, auIdx) : null;
  const tipToastOc = useMemo(
    () => normalizeTipToastSettings(ocSettings.tipToastOc),
    [ocSettings.tipToastOc],
  );
  const showArchiveTip = !detail && !intro && !entrySplash;
  /* URL/ soft-nav pending — 목록 깜빡임 방지 */
  const urlCharPending =
    (Boolean(searchParams.get('c')) || bootCharCover) && !detail && !intro && !entrySplash;

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
            <button type="button" className="nav-back" onClick={leaveOc}>
              ← back
            </button>
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
          <div className="sidebar-count">{loaded ? `${filtered.length}개` : '\u00A0'}</div>
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
            chatOpen={chatOpen}
            chatMuteAlerts={chatOpen}
            onOpenChat={() => {
              if (liveDetail) openChatForCharacter(liveDetail);
            }}
          />
        )}
      </div>

      <OcChatAlertHost
        characters={characters}
        chatOpen={chatOpen}
        phoneView={chatPhoneView}
        mutedCharacterId={
          chatOpen && chatPhoneView === 'thread' ? chatCharacterId : null
        }
        onOpenCharacter={(c) => {
          openChatForCharacter(c);
        }}
      />

      {chatCharacter?.chatbot?.enabled ? (
        <OcChatPanel
          open={chatOpen}
          character={chatCharacter}
          characters={characters}
          onClose={closeChat}
          onSelectCharacter={switchChatToCharacter}
          onPhoneViewChange={setChatPhoneView}
        />
      ) : null}

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
