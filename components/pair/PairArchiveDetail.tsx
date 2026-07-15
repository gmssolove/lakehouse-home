'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  PairVnDialogue,
  usePairVnDialogue,
} from '@/components/pair/PairVnDialogue';
import { useBgm } from '@/lib/contexts/BgmContext';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { characterHasBgmTheme } from '@/lib/oc/characterTheme';
import { pairSideHasDialogue, type PairVnSide } from '@/lib/pair/dialogue';
import { usePairSlotLayoutDrag } from '@/components/pair/usePairSlotLayoutDrag';
import { PairPanelStage, PairReveal } from '@/components/pair/PairPanelStage';
import { pairCardTitle } from '@/lib/oc/pairCover';
import {
  getPanelView,
  normalizePanelView,
  patchPanelView,
  resolvePanelImageSrc,
} from '@/lib/pair/panelView';
import { PairAnchoredQuotes } from '@/components/pair/PairAnchoredQuotes';
import { clampPairQuoteScale, hydratePairFloatingQuotes, normalizePairFloatingQuotes, PAIR_QUOTE_SLOTS } from '@/lib/oc/floatingQuotes';
import { framedImageStyle, type ImageFrame } from '@/lib/shared/imageFrame';
import type {
  PairFloatingQuote,
  PairItem,
  PairPanelLayout,
  PairPanelSectionKey,
  PairQuoteSlot,
  PairVnStandPose,
} from '@/lib/types/character';

type Props = {
  pair: PairItem;
  /** 관리자: 전신 드래그/휠 위치 조정 */
  layoutEditable?: boolean;
  /** 관리자: 플로팅 대사 위치·크기 */
  quoteEditable?: boolean;
  /** 관리자: 대사창에서 스탠딩 위치 조절(버튼으로 모드 ON) */
  standEditable?: boolean;
  onLayoutChange?: (next: PairItem) => void;
};

function formatDday(iso?: string) {
  if (!iso?.trim()) return null;
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return null;
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - start.getTime()) / 86400000);
  return {
    label: `D${diff >= 0 ? '+' : ''}${diff}`,
    since: `Since ${iso}`,
  };
}

function looksLikeHtml(s: string) {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

/** 출처 앞에 © 자동 부여 */
function withCopyright(s?: string) {
  const t = s?.trim() || '';
  if (!t) return '';
  return /^©/.test(t) ? t : `© ${t}`;
}

function RichBlock({ html, className, style }: { html: string; className?: string; style?: CSSProperties }) {
  if (looksLikeHtml(html)) {
    return (
      <div className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />
    );
  }
  return (
    <div className={className} style={style}>
      {html}
    </div>
  );
}

function maybeLink(href: string | undefined, children: ReactNode) {
  const url = href?.trim();
  if (!url) return children;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function defaultPairGhostLayout(side: 'left' | 'right'): ImageFrame {
  return side === 'left' ? { x: -4, y: -2, scale: 1.1 } : { x: 4, y: -2, scale: 1.1 };
}

function CharaSide({
  side,
  name,
  sub,
  role,
  body,
  bodyFrame,
  bodyLayout,
  ghostLayout,
  color,
  profileLink,
  bodyCredit,
  canStartVn,
  onStartVn,
  layoutEditable,
  quoteEditable,
  floatingQuotes,
  selectedQuoteId,
  onSelectQuoteId,
  onQuoteScaleChange,
  quotesPaused,
  quoteStagger,
  onBodyLayoutChange,
  onGhostLayoutChange,
}: {
  side: 'left' | 'right';
  name: string;
  sub?: string;
  role?: string;
  body?: string;
  bodyFrame?: ImageFrame;
  bodyLayout?: ImageFrame;
  ghostLayout?: ImageFrame;
  color?: string;
  profileLink?: string;
  bodyCredit?: string;
  canStartVn?: boolean;
  onStartVn?: () => void;
  layoutEditable?: boolean;
  quoteEditable?: boolean;
  floatingQuotes?: PairFloatingQuote[];
  selectedQuoteId?: string | null;
  onSelectQuoteId?: (id: string) => void;
  onQuoteScaleChange?: (id: string, scale: number) => void;
  quotesPaused?: boolean;
  quoteStagger?: number;
  onBodyLayoutChange?: (next: ImageFrame) => void;
  onGhostLayoutChange?: (next: ImageFrame) => void;
}) {
  const hasBody = Boolean(body?.trim());
  const resolvedGhost = ghostLayout ?? defaultPairGhostLayout(side);
  const bodyDrag = usePairSlotLayoutDrag(bodyLayout, onBodyLayoutChange, Boolean(layoutEditable && hasBody && !quoteEditable));
  const ghostDrag = usePairSlotLayoutDrag(resolvedGhost, onGhostLayoutChange, Boolean(layoutEditable && hasBody && !quoteEditable));

  const bodyImgStyle = framedImageStyle(bodyFrame, {
    fit: 'contain',
    pos: 'center top',
  });
  const bodyBlur = Math.max(0, Math.min(100, bodyFrame?.bottomBlur ?? 22));
  const bodyLayoutStyle = bodyDrag.layoutStyle();
  const ghostLayoutStyle = ghostDrag.layoutStyle();

  const ghostEl = hasBody ? (
    <div
      ref={ghostDrag.elRef}
      className={`chara-ghost-wrapper${layoutEditable ? ' is-layout-editable' : ''}${ghostDrag.selected ? ' is-layout-selected' : ''}${ghostDrag.dragging ? ' is-dragging' : ''}`}
      style={ghostLayoutStyle}
      aria-hidden={!layoutEditable}
      {...ghostDrag.handlers}
    >
      {/* soft 분리: transform(wrapper)와 blur를 같이 두면 사각 경계선이 생김 */}
      <div className="chara-ghost-soft" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`chara-billboard chara-billboard--${side}`}
          src={body}
          alt=""
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
        />
      </div>
    </div>
  ) : null;

  const bodyEl = hasBody ? (
    <div
      ref={bodyDrag.elRef}
      className={`chara-body-wrapper${canStartVn && !layoutEditable && !quoteEditable ? ' is-vn-trigger' : ''}${layoutEditable ? ' is-layout-editable' : ''}${bodyDrag.selected ? ' is-layout-selected' : ''}${bodyDrag.dragging ? ' is-dragging' : ''}`}
      role={canStartVn && !layoutEditable && !quoteEditable ? 'button' : undefined}
      tabIndex={canStartVn && !layoutEditable && !quoteEditable ? 0 : undefined}
      style={bodyLayoutStyle}
      {...bodyDrag.handlers}
      onClick={
        canStartVn && !layoutEditable && !quoteEditable
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onStartVn?.();
            }
          : undefined
      }
      onKeyDown={
        canStartVn && !layoutEditable && !quoteEditable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onStartVn?.();
              }
            }
          : undefined
      }
    >
      <div
        className={`chara-body-clip${bodyBlur > 0 ? ' has-bottom-blur' : ''}`}
        style={bodyBlur > 0 ? ({ '--img-bottom-blur': `${bodyBlur}%` } as CSSProperties) : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="chara-body"
          key={body}
          src={body}
          alt=""
          referrerPolicy="no-referrer"
          style={bodyImgStyle}
          draggable={false}
        />
      </div>
    </div>
  ) : null;

  return (
    <div className={`chara-item chara-${side}`}>
      <div className="chara-img">
        {ghostEl}
        {canStartVn && !layoutEditable && !quoteEditable
          ? bodyEl
          : maybeLink(layoutEditable || quoteEditable ? undefined : profileLink, bodyEl)}
        {(floatingQuotes?.length || quoteEditable) ? (
          <PairAnchoredQuotes
            quotes={floatingQuotes || []}
            side={side}
            editing={Boolean(quoteEditable)}
            selectedId={selectedQuoteId}
            onSelectId={onSelectQuoteId}
            onScaleChange={onQuoteScaleChange}
            paused={Boolean(quotesPaused || layoutEditable)}
            staggerIndex={quoteStagger ?? (side === 'left' ? 0 : 1)}
          />
        ) : null}
        <div className={`chara-footer chara-${side}`}>
          <div className="chara-id">
            {sub?.trim() ? <p className="chara-sub">{sub.trim()}</p> : null}
            <div className="chara-name-block">
              <p className="chara-name">{name}</p>
              <div className="chara-accent-line" aria-hidden />
            </div>
            {role?.trim() || color ? (
              <div className="chara-meta">
                {role?.trim() ? (
                  <div className="pair-attr-row">
                    <span className="pair-attr-label">역할</span>
                    <span className="pair-attr-value">{role.trim()}</span>
                  </div>
                ) : null}
                {color ? (
                  <div className="chara-swatch" title={color.toUpperCase()}>
                    <span className="chara-color" style={{ backgroundColor: color }} aria-hidden />
                    <span className="chara-color-hex">{color.toUpperCase()}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          {bodyCredit?.trim() ? <p className="chara-body-source">{withCopyright(bodyCredit)}</p> : null}
        </div>
      </div>
    </div>
  );
}

type PairSectionId = 'story' | 'relation' | 'flat' | 'archive' | 'gallery';

function isPanelSection(id: PairSectionId | null): id is PairPanelSectionKey {
  return id === 'relation' || id === 'flat' || id === 'archive' || id === 'gallery';
}

export function PairArchiveDetail({
  pair,
  layoutEditable,
  quoteEditable,
  standEditable,
  onLayoutChange,
}: Props) {
  const { playCharacterTheme, playing, restorePageSnapshot } = useBgm();
  const { ocSettings } = useSiteContent();
  const bgmApi = useRef({ playCharacterTheme, playing, restorePageSnapshot });
  bgmApi.current = { playCharacterTheme, playing, restorePageSnapshot };

  const title = pairCardTitle(pair);
  const pairHero = pair.pairTitle?.trim() || pair.pairSub?.trim() || '';
  const pairHeroSub =
    pair.pairTitle?.trim() &&
    pair.pairSub?.trim() &&
    pair.pairSub.trim() !== pair.pairTitle.trim()
      ? pair.pairSub.trim()
      : '';
  const relationLine = (() => {
    const r = pair.relation?.trim() || '';
    if (!r) return '';
    if (r === pairHero || r === title || r === pairHeroSub) return '';
    return r;
  })();
  const tags = (pair.keywords || []).filter(Boolean);
  const storyA = pair.charNotes?.[0]?.story?.trim() || '';
  const storyB = pair.charNotes?.[1]?.story?.trim() || '';
  const pairStory = pair.story?.trim() || '';
  const overview = pair.desc?.trim() || '';
  const aToB = pair.honorifics?.aToB?.trim() || '';
  const bToA = pair.honorifics?.bToA?.trim() || '';
  const colorA = pair.charColors?.[0]?.trim() || pair.color?.trim() || '';
  const colorB = pair.charColors?.[1]?.trim() || pair.color?.trim() || '';
  const hasCharStories = Boolean(storyA || storyB);
  const dday = useMemo(() => formatDday(pair.dday), [pair.dday]);
  const chemistry = pair.chemistry?.filter((c) => c.label?.trim()) ?? [];
  const commissions = (pair.commissions ?? []).filter(
    (c) => c.title.trim() || c.body?.trim() || c.url?.trim(),
  );
  const gallery = (pair.gallery ?? []).filter((g) => g.src?.trim());
  const flatLore = pair.flatLore?.trim() || '';
  const flatTags = (pair.flatLoreKeywords || []).filter(Boolean);
  const rootRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const scrollGenRef = useRef(0);
  /** 메뉴 열기 직전 히어로 스크롤 (복귀 목표 — sticky 네비 오차 방지) */
  const homeScrollRef = useRef(0);
  const [enterKey, setEnterKey] = useState(pair.id);
  const [introPlay, setIntroPlay] = useState(true);
  const [activeSection, setActiveSection] = useState<PairSectionId | null>(null);
  const [panelReveal, setPanelReveal] = useState(false);
  const [textReveal, setTextReveal] = useState(false);
  const [pageLeaving, setPageLeaving] = useState(false);
  /** idle | diving | landed | returning */
  const [transit, setTransit] = useState<'idle' | 'diving' | 'landed' | 'returning'>('idle');
  const hasVnA = pairSideHasDialogue(pair, 'A');
  const hasVnB = pairSideHasDialogue(pair, 'B');
  const vn = usePairVnDialogue();

  const vignetteColor = pair.bgVignetteColor?.trim() || pair.color?.trim() || '#d7a982';
  const vignetteStrength = typeof pair.bgVignette === 'number' ? pair.bgVignette : 16;
  const bgDim = typeof pair.bgDim === 'number' ? pair.bgDim : 0;

  const menuItems = useMemo(() => {
    const items: { id: PairSectionId; en: string; ko: string }[] = [];
    if (hasCharStories || pairStory) items.push({ id: 'story', en: 'Story', ko: '서사' });
    if (dday || chemistry.length > 0 || overview) items.push({ id: 'relation', en: 'Relation', ko: '관계' });
    if (flatLore || flatTags.length > 0) items.push({ id: 'flat', en: 'Flat Lore', ko: '납작캐해' });
    if (commissions.length > 0) items.push({ id: 'archive', en: 'Archive', ko: '자료' });
    if (gallery.length > 0) items.push({ id: 'gallery', en: 'Gallery', ko: '갤러리' });
    return items;
  }, [
    hasCharStories,
    pairStory,
    dday,
    chemistry.length,
    overview,
    flatLore,
    flatTags.length,
    commissions.length,
    gallery.length,
  ]);

  useEffect(() => {
    setEnterKey(pair.id + '-' + Date.now());
    setIntroPlay(true);
    setActiveSection(null);
    setPanelReveal(false);
    setTextReveal(false);
    setPageLeaving(false);
    setTransit('idle');
    homeScrollRef.current = 0;
    vn.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on pair change only
  }, [pair.id]);

  useEffect(() => {
    if (!characterHasBgmTheme(pair)) return;
    const th = pair.theme;
    const title = th?.title?.trim() || `${pairCardTitle(pair)} Theme`;
    let cancelled = false;
    const play = () => {
      if (cancelled) return;
      bgmApi.current.playCharacterTheme(
        {
          fileData: th?.fileData,
          youtubeId: th?.youtubeId,
          title,
          artist: th?.artist || '',
        },
        bgmApi.current.playing,
      );
    };
    /* resumePageBgm 등이 한 틱 뒤에 도는 경우에도 테마가 이기도록 */
    const t0 = window.setTimeout(play, 0);
    const t1 = window.setTimeout(play, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      /* restore는 pair.id effect에서만 — 레이아웃 저장으로 deps가 흔들려도 테마 유지 */
    };
  }, [
    pair.id,
    pair.theme?.fileData,
    pair.theme?.youtubeId,
    pair.theme?.title,
    pair.theme?.artist,
    pair.pairTitle,
    pair.chars?.[0],
    pair.chars?.[1],
  ]);

  /* 상세 떠날 때(또는 다른 페어로 전환)만 페이지 BGM 복원 */
  useEffect(() => {
    const autoResume = ocSettings.autoResumeMainBgm;
    return () => {
      bgmApi.current.restorePageSnapshot(autoResume);
    };
  }, [pair.id, ocSettings.autoResumeMainBgm]);

  /* 등장 애니 끝나면 is-enter 제거 — VN 열 때 재트리거·오버헤드 방지 */
  useEffect(() => {
    if (!introPlay) return;
    const t = window.setTimeout(() => setIntroPlay(false), 1400);
    return () => window.clearTimeout(t);
  }, [introPlay, enterKey]);

  /* 메뉴 → 호흡(홀드) → 실크 스크롤 → 정보 박스 등장 */
  useEffect(() => {
    if (!activeSection) {
      setPanelReveal(false);
      setTextReveal(false);
      return;
    }
    if (transit === 'returning') return;

    setTextReveal(false);

    const gen = ++scrollGenRef.current;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let scrollRaf = 0;
    let holdT = 0;
    let landClearT = 0;

    const easeSilk = (t: number) => {
      const x = Math.min(1, Math.max(0, t));
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    };

    const kick = window.requestAnimationFrame(() => {
      if (scrollGenRef.current !== gen) return;
      const screen = document.getElementById('detail-screen');
      const page = pageRef.current;
      if (!screen || !page) {
        setPanelReveal(true);
        setTransit('landed');
        return;
      }

      const target =
        screen.scrollTop +
        (page.getBoundingClientRect().top - screen.getBoundingClientRect().top);
      const start = screen.scrollTop;
      const delta = target - start;
      const needsTravel = !reduce && Math.abs(delta) >= 48;

      if (!needsTravel) {
        if (Math.abs(delta) >= 1) screen.scrollTop = target;
        setTransit('landed');
        setPanelReveal(true);
        return;
      }

      setPanelReveal(false);
      setTransit('diving');

      holdT = window.setTimeout(() => {
        if (scrollGenRef.current !== gen) return;
        const duration = 1320;
        const t0 = performance.now();
        let revealed = false;

        const step = (now: number) => {
          if (scrollGenRef.current !== gen) return;
          const p = Math.min(1, (now - t0) / duration);
          screen.scrollTop = start + delta * easeSilk(p);
          if (!revealed && p >= 0.55) {
            revealed = true;
            setTransit('landed');
            setPanelReveal(true);
          }
          if (p < 1) scrollRaf = window.requestAnimationFrame(step);
          else {
            if (!revealed) {
              setTransit('landed');
              setPanelReveal(true);
            }
            landClearT = window.setTimeout(() => {
              if (scrollGenRef.current === gen) setTransit('idle');
            }, 640);
          }
        };
        scrollRaf = window.requestAnimationFrame(step);
      }, 260);
    });

    return () => {
      window.cancelAnimationFrame(kick);
      window.clearTimeout(holdT);
      window.clearTimeout(landClearT);
      window.cancelAnimationFrame(scrollRaf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open when section changes; skip during return
  }, [activeSection]);

  /* 히어로만 / 대사창: 수동 스크롤 잠금. diving·returning은 프로그램 스크롤만 허용 */
  useEffect(() => {
    const screen = document.getElementById('detail-screen');
    if (!screen) return;

    const userLocked =
      vn.present || !activeSection || transit === 'diving' || transit === 'returning';
    const cssLock = vn.present || !activeSection;

    screen.classList.toggle('pair-vn-playing', vn.present);
    screen.classList.toggle('pair-scroll-locked', cssLock);

    /* 복귀·닫기 직후엔 scrollTop 강제하지 않음 (마지막 뚝 끊김 원인) */
    const lockedTop = screen.scrollTop;

    const freeze = () => {
      if (transit === 'diving' || transit === 'returning') return;
      if (!userLocked) return;
      if (!activeSection && Math.abs(screen.scrollTop) > 0.5) {
        /* 히어로 고정: 이미 거의 0이면 건드리지 않음 */
        return;
      }
      if (activeSection && screen.scrollTop !== lockedTop) screen.scrollTop = lockedTop;
    };
    const allowTarget = (t: EventTarget | null) =>
      (t as HTMLElement | null)?.closest?.(
        '.pair-vn-stand.is-stand-editable, .lh-vn-box, .lh-vn-choice, .lh-vn-action-choice, .btn-edit, .pair-vn-stand-pose-btn, .pair-panel-stage__media, .pair-panel-stage__toolbar',
      );
    const blockWheel = (e: WheelEvent) => {
      if (allowTarget(e.target)) return;
      if (!userLocked) return;
      e.preventDefault();
      if (!activeSection) {
        if (screen.scrollTop !== 0) screen.scrollTop = 0;
        return;
      }
      freeze();
    };
    const blockTouch = (e: TouchEvent) => {
      if (allowTarget(e.target)) return;
      if (!userLocked) return;
      e.preventDefault();
      if (!activeSection) {
        if (screen.scrollTop !== 0) screen.scrollTop = 0;
        return;
      }
      freeze();
    };

    screen.addEventListener('scroll', freeze, { passive: true });
    screen.addEventListener('wheel', blockWheel, { passive: false });
    screen.addEventListener('touchmove', blockTouch, { passive: false });
    return () => {
      screen.classList.remove('pair-vn-playing');
      screen.classList.remove('pair-scroll-locked');
      screen.removeEventListener('scroll', freeze);
      screen.removeEventListener('wheel', blockWheel);
      screen.removeEventListener('touchmove', blockTouch);
    };
  }, [activeSection, vn.present, transit]);

  /* pair-page 슬라이드(is-revealed) 전환이 끝난 뒤 텍스트 스태거 시작 */
  useEffect(() => {
    if (!panelReveal || !activeSection) {
      setTextReveal(false);
      return;
    }
    const el = pageRef.current;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !el) {
      setTextReveal(true);
      return;
    }

    setTextReveal(false);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setTextReveal(true);
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target !== el) return;
      if (e.propertyName !== 'opacity' && e.propertyName !== 'transform') return;
      finish();
    };
    el.addEventListener('transitionend', onEnd);
    const fallback = window.setTimeout(finish, 1100);
    return () => {
      el.removeEventListener('transitionend', onEnd);
      window.clearTimeout(fallback);
    };
  }, [panelReveal, activeSection]);

  const closeSection = useCallback(() => {
    const gen = ++scrollGenRef.current;
    setPanelReveal(false);
    setTextReveal(false);
    setPageLeaving(true);
    setTransit('returning');

    const screen = document.getElementById('detail-screen');
    const home = Math.max(0, homeScrollRef.current);

    const easeOutCubic = (t: number) => {
      const x = Math.min(1, Math.max(0, t));
      return 1 - Math.pow(1 - x, 3);
    };

    const finish = () => {
      if (scrollGenRef.current !== gen) return;
      if (screen) screen.scrollTop = home;
      setActiveSection(null);
      setPageLeaving(false);
      window.requestAnimationFrame(() => {
        if (scrollGenRef.current !== gen) return;
        if (screen) screen.scrollTop = home;
        setTransit('idle');
      });
    };

    if (!screen) {
      finish();
      return;
    }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const runScroll = () => {
      if (scrollGenRef.current !== gen) return;
      /* sticky 네비 보정된 '히어로 정렬'이 아니라, 열기 전 홈으로 복귀 */
      const target = home;
      const start = screen.scrollTop;
      const delta = target - start;

      if (reduce || Math.abs(delta) < 2) {
        screen.scrollTop = target;
        finish();
        return;
      }

      const duration = 1260;
      const t0 = performance.now();

      const step = (now: number) => {
        if (scrollGenRef.current !== gen) return;
        const p = Math.min(1, (now - t0) / duration);
        screen.scrollTop = start + delta * easeOutCubic(p);
        if (p < 1) {
          window.requestAnimationFrame(step);
          return;
        }
        screen.scrollTop = target;
        window.requestAnimationFrame(() => {
          if (scrollGenRef.current !== gen) return;
          finish();
        });
      };
      window.requestAnimationFrame(step);
    };

    window.setTimeout(() => {
      window.requestAnimationFrame(runScroll);
    }, 320);
  }, []);

  const openSection = useCallback(
    (id: PairSectionId) => {
      if (transit === 'returning' || transit === 'diving') return;
      if (activeSection === id) {
        closeSection();
        return;
      }
      if (!activeSection) {
        const screen = document.getElementById('detail-screen');
        homeScrollRef.current = screen ? Math.max(0, screen.scrollTop) : 0;
      }
      setActiveSection(id);
    },
    [activeSection, closeSection, transit],
  );
  const startVn = useCallback(
    (side: PairVnSide) => {
      const ok = side === 'A' ? hasVnA : hasVnB;
      if (!ok || layoutEditable || quoteEditable || vn.present) return;
      /* 호버 글로우 필터 전환과 VN 등장이 겹치면 버벅임 → 한 프레임 미룸 */
      window.requestAnimationFrame(() => {
        vn.open(side);
      });
    },
    [hasVnA, hasVnB, layoutEditable, quoteEditable, vn],
  );

  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);

  const floatingQuotes = useMemo(() => hydratePairFloatingQuotes(pair), [pair]);

  useEffect(() => {
    if (!quoteEditable) return;
    if (selectedQuoteId && floatingQuotes.some((q) => q.id === selectedQuoteId)) return;
    setSelectedQuoteId(floatingQuotes[0]?.id ?? null);
  }, [quoteEditable, floatingQuotes, selectedQuoteId]);

  const patchFloatingQuotes = useCallback(
    (next: PairFloatingQuote[]) => {
      if (!onLayoutChange) return;
      onLayoutChange({
        ...pair,
        floatingQuotes: normalizePairFloatingQuotes(next),
        floatingQuotesBySide: undefined,
      });
    },
    [onLayoutChange, pair],
  );

  const patchQuoteField = useCallback(
    (id: string, patch: Partial<PairFloatingQuote>) => {
      patchFloatingQuotes(
        floatingQuotes.map((q) => (q.id === id ? { ...q, ...patch } : q)),
      );
    },
    [floatingQuotes, patchFloatingQuotes],
  );

  const onQuoteScaleChange = useCallback(
    (id: string, scale: number) => {
      patchQuoteField(id, { scale: clampPairQuoteScale(scale) });
    },
    [patchQuoteField],
  );

  const selectedQuote = floatingQuotes.find((q) => q.id === selectedQuoteId) || floatingQuotes[0];

  const patchSlotLayout = useCallback(
    (slot: 0 | 1, next: ImageFrame) => {
      if (!onLayoutChange) return;
      const cur = pair.charBodyLayout ?? [{}, {}];
      const layouts: [ImageFrame, ImageFrame] = [{ ...(cur[0] ?? {}) }, { ...(cur[1] ?? {}) }];
      layouts[slot] = next;
      onLayoutChange({ ...pair, charBodyLayout: layouts });
    },
    [onLayoutChange, pair],
  );

  const patchGhostLayout = useCallback(
    (slot: 0 | 1, next: ImageFrame) => {
      if (!onLayoutChange) return;
      const layouts: [ImageFrame, ImageFrame] = [
        { ...(pair.charGhostLayout?.[0] ?? defaultPairGhostLayout('left')) },
        { ...(pair.charGhostLayout?.[1] ?? defaultPairGhostLayout('right')) },
      ];
      layouts[slot] = next;
      onLayoutChange({ ...pair, charGhostLayout: layouts });
    },
    [onLayoutChange, pair],
  );

  const patchPanelField = useCallback(
    (key: PairPanelSectionKey, patch: Parameters<typeof patchPanelView>[2]) => {
      if (!onLayoutChange) return;
      onLayoutChange(patchPanelView(pair, key, patch));
    },
    [onLayoutChange, pair],
  );

  const activePanelKey = isPanelSection(activeSection) ? activeSection : null;
  const activePanelView = activePanelKey
    ? normalizePanelView(getPanelView(pair.panelViews, activePanelKey))
    : null;
  const activePanelImg = activePanelKey ? resolvePanelImageSrc(pair, activePanelKey) : '';
  const activePanelImgValue = activePanelKey
    ? pair.panelViews?.[activePanelKey]?.img?.trim() || ''
    : '';

  const patchStandPose = useCallback(
    (slot: 0 | 1, pose: PairVnStandPose) => {
      if (!onLayoutChange) return;
      const cur = pair.vnStandPos ?? [{}, {}];
      const poses: [PairVnStandPose, PairVnStandPose] = [{ ...(cur[0] ?? {}) }, { ...(cur[1] ?? {}) }];
      poses[slot] = pose;
      onLayoutChange({ ...pair, vnStandPos: poses });
    },
    [onLayoutChange, pair],
  );

  const bgUrl = pair.bg?.trim();
  const bgStyle = {
    ...(bgUrl
      ? {
          backgroundImage: `url("${bgUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`,
        }
      : {}),
    ['--pair-vignette-color' as string]: vignetteColor,
    ['--pair-vignette' as string]: `${Math.max(0, Math.min(100, vignetteStrength))}%`,
    ['--pair-bg-dim' as string]: `${Math.max(0, Math.min(100, bgDim))}%`,
  } as CSSProperties;

  const nameA = pair.chars[0] || 'A';
  const nameB = pair.chars[1] || 'B';
  const boxTitleA = pair.charNotes?.[0]?.role?.trim() || nameA;
  const boxTitleB = pair.charNotes?.[1]?.role?.trim() || nameB;
  const activeMeta = menuItems.find((m) => m.id === activeSection);

  return (
    <div
      className={`pair-cherry-root${introPlay ? ' is-enter' : ''}${vn.present ? ' vn-active' : ''}${
        layoutEditable ? ' is-layout-edit' : ''
      }${quoteEditable ? ' is-quote-edit' : ''}${transit === 'diving' ? ' is-diving' : ''}${transit === 'returning' ? ' is-returning' : ''}${
        transit === 'landed' || panelReveal ? ' is-landed' : ''
      }`}
      ref={rootRef}
      key={enterKey}
    >
      <section id="pair_background" className="pair-bg" style={bgStyle} aria-hidden>
        <div className="pair-bg__dim" />
        <div className="pair-bg__vignette" />
        <div className="pair-bg__haze">
          <span className="pair-bg__haze-orb pair-bg__haze-orb--a" />
          <span className="pair-bg__haze-orb pair-bg__haze-orb--b" />
          <span className="pair-bg__haze-orb pair-bg__haze-orb--c" />
          <span className="pair-bg__haze-shimmer" />
        </div>
      </section>
      <div className="pair-glide" aria-hidden>
        <span className="pair-glide__mist" />
        <span className="pair-glide__spark" />
      </div>
      <div className="pair-hero">
        {quoteEditable ? (
          <div className="pair-float-quote-tools" role="toolbar" aria-label="대표 대사 조절">
            {floatingQuotes.map((q, i) => (
              <button
                key={q.id}
                type="button"
                className={`pair-float-quote-tools__side${selectedQuoteId === q.id ? ' is-active' : ''}`}
                onClick={() => setSelectedQuoteId(q.id)}
                title={q.text}
              >
                {i + 1}·{q.side === 'A' ? nameA : nameB}
              </button>
            ))}
            {selectedQuote ? (
              <select
                className="pair-float-quote-tools__slot"
                value={selectedQuote.slot || 'chest'}
                onChange={(e) =>
                  patchQuoteField(selectedQuote.id, {
                    slot: e.target.value as PairQuoteSlot,
                  })
                }
                aria-label="슬롯"
              >
                {PAIR_QUOTE_SLOTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            ) : null}
            <span className="pair-float-quote-tools__hint">캐릭터에 고정 · 슬롯 · 휠로 크기</span>
          </div>
        ) : null}
        <div className="pair-container">
          <CharaSide
            side="left"
            name={nameA}
            sub={pair.charSubs?.[0]}
            role={pair.charNotes?.[0]?.role}
            body={pair.charBodyImgs?.[0]}
            bodyFrame={pair.charBodyImgFrames?.[0]}
            bodyLayout={pair.charBodyLayout?.[0]}
            ghostLayout={pair.charGhostLayout?.[0]}
            color={colorA}
            profileLink={pair.charNotes?.[0]?.profileLink}
            bodyCredit={pair.charNotes?.[0]?.bodyCredit}
            canStartVn={hasVnA}
            onStartVn={() => startVn('A')}
            layoutEditable={layoutEditable}
            quoteEditable={quoteEditable}
            floatingQuotes={floatingQuotes}
            selectedQuoteId={selectedQuoteId}
            onSelectQuoteId={setSelectedQuoteId}
            onQuoteScaleChange={onQuoteScaleChange}
            quotesPaused={vn.present}
            quoteStagger={0}
            onBodyLayoutChange={(next) => patchSlotLayout(0, next)}
            onGhostLayoutChange={(next) => patchGhostLayout(0, next)}
          />

          <div className="pair-info">
            <header className="pair-plate">
              {pair.logo?.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="pair-plate__logo"
                  src={pair.logo.trim()}
                  alt=""
                  referrerPolicy="no-referrer"
                />
              ) : null}
              <div className="pair-plate__title-block">
                {pairHero ? (
                  <h2 className="pair-plate__hero">{pairHero}</h2>
                ) : null}
                {pairHeroSub ? <p className="pair-plate__sub">{pairHeroSub}</p> : null}
                {relationLine ? <p className="pair-plate__relation-line">{relationLine}</p> : null}
                <div className="pair-plate__accent" aria-hidden />
              </div>
              {aToB || bToA ? (
                <section className="pair-calls" aria-label="호칭">
                  <span className="pair-calls__cap">호칭</span>
                  <div className="pair-calls__list">
                    {aToB ? (
                      <>
                        <span className="pair-calls__who">{nameA}</span>
                        <span className="pair-calls__to" aria-hidden>
                          →
                        </span>
                        <span className="pair-calls__what">{aToB}</span>
                      </>
                    ) : null}
                    {bToA ? (
                      <>
                        <span className="pair-calls__who">{nameB}</span>
                        <span className="pair-calls__to" aria-hidden>
                          →
                        </span>
                        <span className="pair-calls__what">{bToA}</span>
                      </>
                    ) : null}
                  </div>
                </section>
              ) : null}
            </header>

            {menuItems.length > 0 ? (
              <nav className="pair-menu" aria-label="페어 정보">
                <span className="pair-menu__arrow" aria-hidden>
                  ‹
                </span>
                {menuItems.map((item, i) => (
                  <span key={item.id} className="pair-menu__slot">
                    {i > 0 ? (
                      <span className="pair-menu__sep" aria-hidden>
                        |
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className={`pair-menu__item${activeSection === item.id ? ' is-active' : ''}`}
                      style={{ ['--menu-i' as string]: i }}
                      onClick={() => openSection(item.id)}
                    >
                      <span className="pair-menu__ko">{item.ko}</span>
                    </button>
                  </span>
                ))}
                <span className="pair-menu__arrow" aria-hidden>
                  ›
                </span>
              </nav>
            ) : null}
          </div>

          <CharaSide
            side="right"
            name={nameB}
            sub={pair.charSubs?.[1]}
            role={pair.charNotes?.[1]?.role}
            body={pair.charBodyImgs?.[1]}
            bodyFrame={pair.charBodyImgFrames?.[1]}
            bodyLayout={pair.charBodyLayout?.[1]}
            ghostLayout={pair.charGhostLayout?.[1]}
            color={colorB}
            profileLink={pair.charNotes?.[1]?.profileLink}
            bodyCredit={pair.charNotes?.[1]?.bodyCredit}
            canStartVn={hasVnB}
            onStartVn={() => startVn('B')}
            layoutEditable={layoutEditable}
            quoteEditable={quoteEditable}
            floatingQuotes={floatingQuotes}
            selectedQuoteId={selectedQuoteId}
            onSelectQuoteId={setSelectedQuoteId}
            onQuoteScaleChange={onQuoteScaleChange}
            quotesPaused={vn.present}
            quoteStagger={1}
            onBodyLayoutChange={(next) => patchSlotLayout(1, next)}
            onGhostLayoutChange={(next) => patchGhostLayout(1, next)}
          />
        </div>
      </div>

      {activeSection && activeMeta ? (
        <section
          className={`pair-page${panelReveal ? ' is-revealed' : ''}${pageLeaving ? ' is-leaving' : ''}`}
          ref={pageRef}
          aria-labelledby="pair-panel-title"
        >
          <article className={`pair-panel${textReveal ? ' is-text-reveal' : ''}`}>
          <header className="pair-panel__head">
            <div className="pair-panel__titles">
              <PairReveal index={0}>
                <span className="pair-panel__en">{activeMeta.en}</span>
              </PairReveal>
              <PairReveal index={1}>
                <h3 className="pair-panel__title" id="pair-panel-title">
                  {activeMeta.ko}
                </h3>
              </PairReveal>
            </div>
            <button type="button" className="pair-panel__close" onClick={closeSection} aria-label="닫기">
              ×
            </button>
          </header>

          <div className={`pair-panel__body${textReveal ? ' is-text-reveal' : ''}`}>
            {activeSection === 'story' ? (
              <div className="pair-panel__story">
                {hasCharStories ? (
                  <div className="pair-chara-wrapper">
                    {storyA ? (
                      <PairReveal index={2} className="pair-chara-desc">
                        <div className="pair-chara-desc__head">
                          <span className="pair-chara-desc__en">Character A</span>
                          <div className="pair-chara-desc__title">{boxTitleA}</div>
                        </div>
                        <RichBlock html={storyA} className="pair-chara-desc__body" />
                      </PairReveal>
                    ) : null}
                    {storyB ? (
                      <PairReveal index={3} className="pair-chara-desc">
                        <div className="pair-chara-desc__head">
                          <span className="pair-chara-desc__en">Character B</span>
                          <div className="pair-chara-desc__title">{boxTitleB}</div>
                        </div>
                        <RichBlock html={storyB} className="pair-chara-desc__body" />
                      </PairReveal>
                    ) : null}
                  </div>
                ) : null}
                {pairStory ? (
                  <PairReveal index={4}>
                    <RichBlock html={pairStory} className="pair-desc" />
                  </PairReveal>
                ) : null}
              </div>
            ) : null}

            {activePanelKey && activePanelView ? (
              <PairPanelStage
                layout={activePanelView.layout}
                echo={activePanelView.echo}
                imgSrc={activePanelImg}
                imgValue={activePanelImgValue}
                frame={activePanelView.frame}
                editable={Boolean(layoutEditable && onLayoutChange)}
                textReveal={textReveal}
                onLayoutChange={(layout: PairPanelLayout) =>
                  patchPanelField(activePanelKey, { layout })
                }
                onEchoChange={(echo) => patchPanelField(activePanelKey, { echo })}
                onFrameChange={(frame) => patchPanelField(activePanelKey, { frame })}
                onImgChange={(img) => patchPanelField(activePanelKey, { img })}
              >
                {activeSection === 'relation' ? (
                  <div className="pair-panel__relation">
                    <PairReveal index={2} className="pair-panel__rule" />
                    <div className="pair-extra__grid">
                      {dday ? (
                        <PairReveal index={3} className="pair-extra__dday">
                          <span className="pair-extra__lbl">D-DAY</span>
                          <strong className="pair-extra__dday-num">{dday.label}</strong>
                          <span className="pair-extra__muted">{dday.since}</span>
                        </PairReveal>
                      ) : null}
                      {chemistry.length > 0 ? (
                        <PairReveal index={4} className="pair-extra__chem">
                          {chemistry.map((row, i) => (
                            <div key={`${row.label}-${i}`} className="pair-extra__chem-row">
                              <span>{row.label}</span>
                              <div className="pair-extra__chem-track">
                                <div
                                  className="pair-extra__chem-fill"
                                  style={{
                                    width: `${Math.min(100, Math.max(0, row.value))}%`,
                                    background: vignetteColor,
                                  }}
                                />
                              </div>
                              <span>{row.value}</span>
                            </div>
                          ))}
                        </PairReveal>
                      ) : null}
                    </div>
                    {overview ? (
                      <PairReveal index={5}>
                        <p className="pair-extra__copy">{overview}</p>
                      </PairReveal>
                    ) : null}
                  </div>
                ) : null}

                {activeSection === 'flat' ? (
                  <div className="pair-panel__flat">
                    <PairReveal index={2} className="pair-panel__rule" />
                    {flatTags.length ? (
                      <PairReveal index={3} className="pair-extra__tags">
                        {flatTags.map((t, i) => (
                          <span key={`${t}-${i}`} className="pair-extra__tag">
                            {t}
                          </span>
                        ))}
                      </PairReveal>
                    ) : null}
                    {flatLore ? (
                      <PairReveal index={4}>
                        <p className="pair-extra__copy">{flatLore}</p>
                      </PairReveal>
                    ) : null}
                  </div>
                ) : null}

                {activeSection === 'archive' ? (
                  <div className="pair-extra__works">
                    <PairReveal index={2} className="pair-panel__rule" />
                    {commissions.map((c, i) => (
                      <PairReveal key={c.id} index={3 + i} className="pair-extra__work">
                        <article>
                          <div className="pair-extra__work-head">
                            <span className="pair-extra__kind">{c.kind}</span>
                            <strong>{c.title || '(제목 없음)'}</strong>
                          </div>
                          {c.body?.trim() ? <p className="pair-extra__copy">{c.body.trim()}</p> : null}
                          {c.note?.trim() ? <p className="pair-extra__muted">{c.note.trim()}</p> : null}
                          {c.url?.trim() ? (
                            <a
                              className="pair-extra__link"
                              href={c.url.trim()}
                              target="_blank"
                              rel="noreferrer"
                            >
                              링크 열기
                            </a>
                          ) : null}
                        </article>
                      </PairReveal>
                    ))}
                  </div>
                ) : null}

                {activeSection === 'gallery' ? (
                  <div className="pair-extra__gallery">
                    <PairReveal index={2} className="pair-panel__rule" />
                    {gallery.map((g, i) => (
                      <PairReveal key={g.id} index={3 + i} className="pair-extra__gal-item">
                        <figure>
                          <img src={g.src} alt={g.title || ''} referrerPolicy="no-referrer" />
                          {(g.title || g.credit) && (
                            <figcaption>
                              {g.title ? <span>{g.title}</span> : null}
                              {g.credit ? (
                                <span className="pair-extra__muted">{withCopyright(g.credit)}</span>
                              ) : null}
                            </figcaption>
                          )}
                        </figure>
                      </PairReveal>
                    ))}
                  </div>
                ) : null}
              </PairPanelStage>
            ) : null}
          </div>
          </article>
        </section>
      ) : null}

      <PairVnDialogue
        pair={pair}
        active={vn.active}
        present={vn.present}
        leaving={vn.leaving}
        openSide={vn.openSide}
        session={vn.session}
        onClose={vn.close}
        standEditable={standEditable}
        onStandPoseChange={standEditable ? patchStandPose : undefined}
      />
    </div>
  );
}
