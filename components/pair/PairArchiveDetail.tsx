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
import { usePathname, useRouter } from 'next/navigation';
import {
  PairVnDialogue,
  usePairVnDialogue,
} from '@/components/pair/PairVnDialogue';
import { useBgm } from '@/lib/contexts/BgmContext';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { characterHasBgmTheme } from '@/lib/oc/characterTheme';
import { creepyFxClass, creepyFxStyle } from '@/lib/oc/creepyFx';
import { DustAtmosphere } from '@/components/shared/DustAtmosphere';
import { useCreepyGlyphScramble } from '@/lib/hooks/useCreepyGlyphScramble';
import { pairSideHasDialogue, type PairVnSide } from '@/lib/pair/dialogue';
import { usePairSlotLayoutDrag } from '@/components/pair/usePairSlotLayoutDrag';
import { PairPanelStage, PairReveal } from '@/components/pair/PairPanelStage';
import { pairCardTitle } from '@/lib/oc/pairCover';
import {
  getPanelView,
  normalizePanelView,
  patchPanelView,
} from '@/lib/pair/panelView';
import { PairAnchoredQuotes } from '@/components/pair/PairAnchoredQuotes';
import { CursorFollowTipHost, CursorTipZone } from '@/components/shared/CursorFollowTip';
import { RiskBadges } from '@/components/shared/RiskBadges';
import { StoryEntryList } from '@/components/shared/StoryEntryList';
import { StoryReader } from '@/components/shared/StoryReader';
import { PairIntroPanel } from '@/components/pair/PairIntroPanel';
import { HandwritingNoteFlap } from '@/components/pair/HandwritingNoteFlap';
import { RelationQuestionFlicker } from '@/components/pair/RelationQuestionFlicker';
import { hasIntroFirstNow } from '@/lib/pair/introViewpoint';
import { isEveIzumiPair } from '@/lib/pair/isEveIzumiPair';
import {
  isDarkPairPersonalColor,
  resolvePairUiAccentColor,
} from '@/lib/pair/personalNameGlow';
import { LakeAccessGateModal } from '@/components/lake/LakeAccessGateModal';
import { AuthModal } from '@/components/auth/AuthModal';
import { useAuth } from '@/lib/hooks/useAuth';
import { visibleRiskStages } from '@/lib/oc/riskStages';
import { useLakeBackNavigation } from '@/lib/hooks/useLakeBackNavigation';
import { lakeNavigate } from '@/lib/lake/routeTransition';
import {
  resolveScopePassword,
  unlockLakeItem,
} from '@/lib/lake/accessGate';
import { OcRichText } from '@/lib/oc/richText';
import { hydratePairStories, storySecretItemId } from '@/lib/oc/storyEntries';
import { clampPairQuoteScale, hydratePairFloatingQuotes, normalizePairFloatingQuotes, PAIR_QUOTE_SLOTS } from '@/lib/oc/floatingQuotes';
import { framedImageStyle, type ImageFrame } from '@/lib/shared/imageFrame';
import type { SiteAccessSettings } from '@/lib/types/secret-content';
import type {
  PairFloatingQuote,
  PairGalleryItem,
  PairItem,
  PairPanelLayout,
  PairPanelSectionKey,
  PairQuoteSlot,
  PairTimelineEvent,
  PairVnStandPose,
  ProfileField,
  StoryEntry,
} from '@/lib/types/character';
import { pairGalleryUrls } from '@/lib/types/character';

/** 섹션 진입 스크롤 정렬 보정 — 상단 캐릭터 일러 잘림 방지 */
const PANEL_SCROLL_OFFSET = 64;

type Props = {
  pair: PairItem;
  /** 관리자: 전신 드래그/휠 위치 조정 */
  layoutEditable?: boolean;
  /** 관리자: 플로팅 대사 위치·크기 */
  quoteEditable?: boolean;
  /** 관리자: 대사창에서 스탠딩 위치 조절(버튼으로 모드 ON) */
  standEditable?: boolean;
  onLayoutChange?: (next: PairItem) => void;
  /** 페어 캐릭터가 내 OC와 일치할 때 해당 OC 프로필로 이동하는 링크 [A, B] */
  ocProfileLinks?: [string | undefined, string | undefined];
  isAdmin?: boolean;
  accessSettings?: Partial<SiteAccessSettings>;
  /** 수정 모달 열기 (시리즈/포스트) */
  onRequestEdit?: (opts?: { storyFocusId?: string; openStoryTab?: boolean }) => void;
};

function formatDday(iso?: string) {
  if (!iso?.trim()) return null;
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return null;
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - start.getTime()) / 86400000);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const d = String(start.getDate()).padStart(2, '0');
  return {
    label: `D${diff >= 0 ? '+' : ''}${diff}`,
    since: `since ${y}.${m}.${d} ~`,
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
  quote,
  emoji,
  keywords,
  flatLore,
  fields,
  body,
  bodyFrame,
  bodyLayout,
  ghostLayout,
  color,
  profileLink,
  ocProfileLink,
  bodyCredit,
  handwritingNotes,
  onOpenHandwriting,
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
  quote?: string;
  emoji?: string;
  keywords?: string[];
  flatLore?: string;
  fields?: ProfileField[];
  body?: string;
  bodyFrame?: ImageFrame;
  bodyLayout?: ImageFrame;
  ghostLayout?: ImageFrame;
  color?: string;
  profileLink?: string;
  ocProfileLink?: string;
  bodyCredit?: string;
  handwritingNotes?: string[];
  onOpenHandwriting?: () => void;
  canStartVn?: boolean;
  onStartVn?: () => void;
  layoutEditable?: boolean;
  quoteEditable?: boolean;
  floatingQuotes?: PairFloatingQuote[];
  selectedQuoteId?: string | null;
  onSelectQuoteId?: (id: string | null) => void;
  onQuoteScaleChange?: (id: string, scale: number) => void;
  quotesPaused?: boolean;
  quoteStagger?: number;
  onBodyLayoutChange?: (next: ImageFrame) => void;
  onGhostLayoutChange?: (next: ImageFrame) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const hasBody = Boolean(body?.trim());
  const resolvedGhost = ghostLayout ?? defaultPairGhostLayout(side);
  const bodyDrag = usePairSlotLayoutDrag(bodyLayout, onBodyLayoutChange, Boolean(layoutEditable && hasBody && !quoteEditable));
  const ghostDrag = usePairSlotLayoutDrag(resolvedGhost, onGhostLayoutChange, Boolean(layoutEditable && hasBody && !quoteEditable));

  const bodyImgStyle = framedImageStyle(bodyFrame, {
    fit: 'contain',
    pos: 'center top',
  });
  /* #13 이미지 프레임 변형을 wrapper(히트 영역)로 옮겨, 호버·클릭 반응 영역이 실제
     일러스트 위치와 어긋나지 않게 한다. img에는 object-fit/position만 남긴다. */
  const { transform: bodyFrameTransform, ...bodyImgStyleBase } = bodyImgStyle;
  const bodyBlur = Math.max(0, Math.min(100, bodyFrame?.bottomBlur ?? 22));
  const bodyLayoutStyle = bodyDrag.layoutStyle(
    typeof bodyFrameTransform === 'string' ? bodyFrameTransform : undefined,
  );
  const ghostLayoutStyle = ghostDrag.layoutStyle();

  const hasHandNotes = (handwritingNotes || []).some((u) => u.trim());
  const noteBtn =
    hasHandNotes && onOpenHandwriting ? (
      <button
        type="button"
        className="chara-note-btn"
        aria-label={`${name} 손글씨 쪽지`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenHandwriting();
        }}
      >
        {/* 접힌 쪽지 — 제공 PNG (검정 배경은 screen으로 제거) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="chara-note-btn__icon"
          src="/icons/note-folded.png?v=3"
          alt=""
          draggable={false}
          width={48}
          height={72}
        />
      </button>
    ) : null;

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
          style={bodyImgStyleBase}
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
        <div
          className={`chara-footer chara-${side}${
            color && isDarkPairPersonalColor(color) ? ' is-dark-personal' : ''
          }`}
          style={
            color
              ? ({
                  ['--chara-personal' as string]: color,
                  ['--chara-personal-ui' as string]: resolvePairUiAccentColor(color),
                } as CSSProperties)
              : undefined
          }
        >
          <div className="chara-id">
            {quote?.trim() ? <p className="chara-quote">{quote.trim()}</p> : null}
            {sub?.trim() ? <p className="chara-sub">{sub.trim()}</p> : null}
            <div className="chara-name-block">
              <div className="chara-name-row">
                {side === 'right' ? noteBtn : null}
                <p className="chara-name">{name}</p>
                {side === 'left' ? noteBtn : null}
              </div>
              <div className="chara-accent-line" aria-hidden />
            </div>
            {color ? (
              <div className="chara-swatch" title={color.toUpperCase()}>
                <span className="chara-color" style={{ backgroundColor: color }} aria-hidden />
                <span className="chara-color-hex">{color.toUpperCase()}</span>
              </div>
            ) : null}
            {ocProfileLink && !layoutEditable && !quoteEditable ? (
              <a
                className="pair-oc-link"
                href={ocProfileLink}
                style={color ? ({ ['--oc-link-accent' as string]: color }) : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  lakeNavigate(router, ocProfileLink, pathname || '/pair');
                }}
              >
                <span className="pair-oc-link__kicker">OC Profile</span>
                <span className="pair-oc-link__title">프로필 보기</span>
                <span className="pair-oc-link__arrow" aria-hidden>→</span>
              </a>
            ) : null}
            {(() => {
              const extraFields = (fields || []).filter((f) => f.k?.trim() && f.v?.trim());
              const chips = (keywords || []).filter(Boolean);
              const emojiTokens = (emoji || '')
                .trim()
                .split(/\s+/)
                .filter(Boolean);
              const hasMeta =
                role?.trim() ||
                extraFields.length ||
                chips.length ||
                flatLore?.trim() ||
                emojiTokens.length;
              if (!hasMeta) return null;
              const hasRows = role?.trim() || extraFields.length;
              return (
                <div className="chara-meta">
                  {hasRows ? (
                    <div className="chara-meta-rows">
                      {role?.trim() ? (
                        <div className="pair-attr-row">
                          <span className="pair-attr-label">역할</span>
                          <span className="pair-attr-value">{role.trim()}</span>
                        </div>
                      ) : null}
                      {extraFields.map((f, i) => (
                        <div className="pair-attr-row" key={`${f.k}-${i}`}>
                          <span className="pair-attr-label">{f.k.trim()}</span>
                          <span className="pair-attr-value">{f.v.trim()}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {chips.length ? (
                    <div className="chara-keywords">
                      {chips.map((k, i) => (
                        <span className="chara-keyword-chip" key={`${k}-${i}`}>
                          {k}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {emojiTokens.length ? (
                    <>
                      <div className="chara-divider" aria-hidden />
                      <div className="chara-flatlore chara-emoji-list">
                        <span className="chara-flatlore-label">대표 이모지</span>
                        <div className="chara-emoji-tokens">
                          {emojiTokens.map((em, i) => (
                            <span className="chara-emoji-chip" key={`${em}-${i}`}>
                              {em}
                            </span>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : null}
                  {flatLore?.trim() ? (
                    <>
                      <div className="chara-divider" aria-hidden />
                      <div className="chara-flatlore">
                        <span className="chara-flatlore-label">납작 캐해</span>
                        <p className="chara-flatlore-text">{flatLore.trim()}</p>
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })()}
          </div>
          {bodyCredit?.trim() ? <p className="chara-body-source">{withCopyright(bodyCredit)}</p> : null}
        </div>
      </div>
    </div>
  );
}

type PairSectionId = 'story' | 'relation' | 'flat' | 'gallery';

function TimelineRevealItem({
  event: ev,
  index,
  onOpenImage,
}: {
  event: PairTimelineEvent;
  index: number;
  onOpenImage?: (src: string, title?: string) => void;
}) {
  const ref = useRef<HTMLLIElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const img = ev.image?.trim();

  return (
    <li
      ref={ref}
      className={`pair-timeline__item${inView ? ' is-in' : ''}`}
      style={{ ['--tl-i' as string]: index }}
    >
      <span className="pair-timeline__dot" aria-hidden />
      <div className="pair-timeline__copy">
        {ev.date?.trim() ? <span className="pair-timeline__date">{ev.date.trim()}</span> : null}
        {ev.title?.trim() ? <h4 className="pair-timeline__title">{ev.title.trim()}</h4> : null}
        {ev.body?.trim() ? <OcRichText text={ev.body ?? ''} className="pair-timeline__body" /> : null}
      </div>
      {img ? (
        <div className="pair-timeline__media">
          <button
            type="button"
            className="pair-timeline__media-btn"
            aria-label={ev.title?.trim() ? `${ev.title.trim()} 이미지 보기` : '타임라인 이미지 보기'}
            onClick={() => onOpenImage?.(img, ev.title?.trim() || ev.date?.trim() || undefined)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="pair-timeline__img"
              src={img}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          </button>
        </div>
      ) : null}
    </li>
  );
}

function isPanelSection(id: PairSectionId | null): id is PairSectionId {
  return id === 'relation' || id === 'flat' || id === 'gallery' || id === 'story';
}

export function PairArchiveDetail({
  pair,
  layoutEditable,
  quoteEditable,
  standEditable,
  onLayoutChange,
  ocProfileLinks,
  isAdmin = false,
  accessSettings,
  onRequestEdit,
}: Props) {
  const { playCharacterTheme, playing, restorePageSnapshot } = useBgm();
  const { ocSettings } = useSiteContent();
  const { user } = useAuth();
  const bgmApi = useRef({ playCharacterTheme, playing, restorePageSnapshot });
  bgmApi.current = { playCharacterTheme, playing, restorePageSnapshot };
  const [storyGate, setStoryGate] = useState<StoryEntry | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

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
  const relationQFlicker = isEveIzumiPair(pair.chars);
  const tags = (pair.keywords || []).filter(Boolean);
  const hydratedPair = useMemo(
    () => hydratePairStories(pair),
    [pair, pair.storyEntries, pair.storyCategories],
  );
  const storyEntries = hydratedPair.storyEntries || [];
  const timeline = useMemo(
    () =>
      [...(pair.timeline ?? [])]
        .map((t, i) => ({ ...t, order: t.order ?? i }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [pair.timeline],
  );
  const overview = pair.desc?.trim() || '';
  const aToB = pair.honorifics?.aToB?.trim() || '';
  const bToA = pair.honorifics?.bToA?.trim() || '';
  const colorA = pair.charColors?.[0]?.trim() || pair.color?.trim() || '';
  const colorB = pair.charColors?.[1]?.trim() || pair.color?.trim() || '';
  const dday = useMemo(() => formatDday(pair.dday), [pair.dday]);
  const gallery = (pair.gallery ?? []).filter((g) => g.src?.trim());
  const flatLore = pair.flatLore?.trim() || '';
  const flatTags = (pair.flatLoreKeywords || []).filter(Boolean);
  const catchphrase = pair.catchphrase?.trim() || '';
  const nameA = pair.chars[0] || 'A';
  const nameB = pair.chars[1] || 'B';
  const introInterview = (pair.intro?.interview ?? []).filter(
    (q) => q.question?.trim() || q.answerA?.trim() || q.answerB?.trim(),
  );
  const hasIntro =
    !!overview ||
    hasIntroFirstNow(pair.intro) ||
    introInterview.length > 0 ||
    (pair.chemistry ?? []).filter((r) => r.label?.trim()).length >= 3;
  const bgmLabel = (() => {
    const t = pair.theme?.title?.trim() || '';
    const a = pair.theme?.artist?.trim() || '';
    if (!t) return '';
    return a ? `${t} — ${a}` : t;
  })();

  const rootRef = useRef<HTMLDivElement>(null);
  useCreepyGlyphScramble(rootRef, {
    glyph: Boolean(pair.creepyFx?.enabled && pair.creepyFx.kinds?.includes('glyphScramble')),
    glitch: Boolean(pair.creepyFx?.enabled && pair.creepyFx.kinds?.includes('textGlitch')),
    intensity: (pair.creepyFx?.intensity ?? 40) / 100,
  });
  const pageRef = useRef<HTMLElement>(null);
  const scrollGenRef = useRef(0);
  /** 메뉴 열기 직전 히어로 스크롤 (복귀 목표 — sticky 네비 오차 방지) */
  const homeScrollRef = useRef(0);
  const [enterKey, setEnterKey] = useState(pair.id);
  const [introPlay, setIntroPlay] = useState(true);
  const [activeSection, setActiveSection] = useState<PairSectionId | null>(null);
  /** 스토리 서브탭 — 로그 / 타임라인 */
  const [storyTab, setStoryTab] = useState<'log' | 'timeline'>('log');
  const [readerEntry, setReaderEntry] = useState<StoryEntry | null>(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const [galleryLightbox, setGalleryLightbox] = useState<PairGalleryItem | null>(null);
  const [galleryLbIndex, setGalleryLbIndex] = useState(0);
  const [galleryHasMore, setGalleryHasMore] = useState(false);
  const [timelineHasMore, setTimelineHasMore] = useState(false);
  const [timelineLightbox, setTimelineLightbox] = useState<{ src: string; title?: string } | null>(
    null,
  );
  const [handNoteLb, setHandNoteLb] = useState<{
    urls: string[];
    title: string;
    index: number;
    sfxUrl?: string;
    closeSfxUrl?: string;
  } | null>(null);
  const galleryScrollRef = useRef<HTMLDivElement | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  /** 페이지네이션 — 타임라인 / 갤러리 */
  const [timelinePage, setTimelinePage] = useState(0);
  const [galleryPage, setGalleryPage] = useState(0);
  const [panelReveal, setPanelReveal] = useState(false);
  const [textReveal, setTextReveal] = useState(false);
  const [pageLeaving, setPageLeaving] = useState(false);
  /** idle | diving | landed | returning */
  const [transit, setTransit] = useState<'idle' | 'diving' | 'landed' | 'returning'>('idle');
  const hasVnA = pairSideHasDialogue(pair, 'A');
  const hasVnB = pairSideHasDialogue(pair, 'B');
  const vn = usePairVnDialogue();

  const vignetteColor = pair.bgVignetteColor?.trim() || pair.color?.trim() || '#d7a982';
  const vignetteSplit = !!pair.bgVignetteSplit;
  const vignetteColorA =
    pair.bgVignetteColorA?.trim() || pair.charColors?.[0]?.trim() || vignetteColor;
  const vignetteColorB =
    pair.bgVignetteColorB?.trim() || pair.charColors?.[1]?.trim() || vignetteColor;
  const vignetteStrength = typeof pair.bgVignette === 'number' ? pair.bgVignette : 16;
  const bgDim = typeof pair.bgDim === 'number' ? pair.bgDim : 0;

  type PairMenuItem = { id: PairSectionId; en: string; ko: string };

  const menuItems = useMemo<PairMenuItem[]>(() => {
    const items: PairMenuItem[] = [];
    if (dday || tags.length || hasIntro) {
      items.push({ id: 'relation', en: 'Intro', ko: '소개' });
    }
    if (flatLore || flatTags.length > 0) {
      items.push({ id: 'flat', en: 'Flat Lore', ko: '납작캐해' });
    }
    if (
      storyEntries.length ||
      (pair.timeline ?? []).length ||
      pair.storySeries ||
      isAdmin
    ) {
      items.push({ id: 'story', en: 'Story', ko: '스토리' });
    }
    if (gallery.length > 0) {
      items.push({ id: 'gallery', en: 'Gallery', ko: '갤러리' });
    }
    return items;
  }, [
    dday,
    tags.length,
    hasIntro,
    flatLore,
    flatTags.length,
    storyEntries.length,
    (pair.timeline ?? []).length,
    pair.storySeries,
    isAdmin,
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

      /* +offset: 상단에 캐릭터 일러 윗부분이 삐져나오지 않도록 조금 더 내려 정렬 */
      const target =
        screen.scrollTop +
        (page.getBoundingClientRect().top - screen.getBoundingClientRect().top) +
        PANEL_SCROLL_OFFSET;
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
          /* reveal만 중반 — landed는 스크롤 완주 후(freeze가 중간에서 잠그지 않게) */
          if (!revealed && p >= 0.55) {
            revealed = true;
            setPanelReveal(true);
          }
          if (p < 1) {
            scrollRaf = window.requestAnimationFrame(step);
            return;
          }
          screen.scrollTop = target;
          if (!revealed) setPanelReveal(true);
          setTransit('landed');
          landClearT = window.setTimeout(() => {
            if (scrollGenRef.current === gen) setTransit('idle');
          }, 640);
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

    /* 히어로·메뉴 모두 수동 스크롤 금지 — 돌아가기는 ascend/Esc만 */
    const userLocked = true;
    const cssLock = vn.present || !activeSection || Boolean(activeSection);

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
        '.pair-vn-stand.is-stand-editable, .lh-vn-box, .lh-vn-choice, .lh-vn-action-choice, .btn-edit, .pair-vn-stand-pose-btn, .pair-panel-stage__media, .pair-panel-stage__edit, .pair-panel-stage__toolbar, .pair-page, .pair-panel, .pair-intro-scroll, .pair-intro-v2, .lh-story-list, .lh-story-reader',
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
    /* 콘텐츠를 먼저 숨기지 않음 — 보이는 채로 위로 스크롤한 뒤 닫기 */
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
      setPanelReveal(false);
      setTextReveal(false);
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
    const target = home;
    const start = screen.scrollTop;
    const delta = target - start;

    if (reduce || Math.abs(delta) < 2) {
      screen.scrollTop = target;
      finish();
      return;
    }

    const duration = 1100;
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
      finish();
    };
    window.requestAnimationFrame(step);
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

  /* 섹션 전환 시 서브탭·페이지 초기화 */
  useEffect(() => {
    if (activeSection === 'story') {
      setStoryTab(storyEntries.length || pair.storySeries || isAdmin || !timeline.length ? 'log' : 'timeline');
      setTimelinePage(0);
    }
    if (activeSection === 'gallery') setGalleryPage(0);
  }, [activeSection, storyEntries.length, pair.storySeries, isAdmin, timeline.length]);

  /* Esc만 복귀 (스크롤로는 못 올라감) */
  useEffect(() => {
    if (!activeSection || pageLeaving) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeSection, closeSection, pageLeaving]);

  const closeStoryReader = useCallback(() => {
    setReaderOpen(false);
    setReaderEntry(null);
  }, []);
  useLakeBackNavigation(readerOpen, closeStoryReader, 'pair-story-reader');
  useLakeBackNavigation(!!galleryLightbox, () => setGalleryLightbox(null), 'pair-gallery');
  useEffect(() => {
    if (!galleryLightbox) return;
    setGalleryLbIndex(0);
    const urls = pairGalleryUrls(galleryLightbox);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGalleryLightbox(null);
      if (e.key === 'ArrowRight' && urls.length > 1) {
        setGalleryLbIndex((i) => Math.min(urls.length - 1, i + 1));
      }
      if (e.key === 'ArrowLeft' && urls.length > 1) {
        setGalleryLbIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [galleryLightbox]);

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
  const activePanelImgValue = activePanelKey
    ? pair.panelViews?.[activePanelKey]?.img?.trim() || ''
    : '';

  const openStory = useCallback((entry: StoryEntry) => {
    setReaderEntry(entry);
    setReaderOpen(true);
  }, []);

  const playStoryTheme = useCallback(
    (entry: StoryEntry) => {
      const th = entry.theme?.fileData || entry.theme?.youtubeId ? entry.theme : pair.theme;
      if (!th?.fileData && !th?.youtubeId) return;
      bgmApi.current.playCharacterTheme(
        {
          fileData: th.fileData,
          youtubeId: th.youtubeId,
          title: th.title?.trim() || entry.title || `${pairCardTitle(pair)} Theme`,
          artist: th.artist || '',
        },
        bgmApi.current.playing,
      );
    },
    [pair],
  );

  const TIMELINE_PAGE_SIZE = 6;
  /** 갤러리 1페이지 = 5열 × 3행 */
  const GALLERY_PAGE_SIZE = 15;
  const timelinePages = Math.max(1, Math.ceil(timeline.length / TIMELINE_PAGE_SIZE));
  const timelineSlice = timeline.slice(
    timelinePage * TIMELINE_PAGE_SIZE,
    timelinePage * TIMELINE_PAGE_SIZE + TIMELINE_PAGE_SIZE,
  );
  const galleryPages = Math.max(1, Math.ceil(gallery.length / GALLERY_PAGE_SIZE));
  const gallerySlice = gallery.slice(
    galleryPage * GALLERY_PAGE_SIZE,
    galleryPage * GALLERY_PAGE_SIZE + GALLERY_PAGE_SIZE,
  );

  useEffect(() => {
    if (activeSection !== 'gallery') {
      setGalleryHasMore(false);
      return;
    }
    const el = galleryScrollRef.current;
    if (!el) return;
    const update = () => {
      const remain = el.scrollHeight - el.scrollTop - el.clientHeight;
      setGalleryHasMore(remain > 28);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, [activeSection, galleryPage, gallerySlice.length]);

  useEffect(() => {
    if (activeSection !== 'story' || storyTab !== 'timeline') {
      setTimelineHasMore(false);
      return;
    }
    const el = timelineScrollRef.current;
    if (!el) return;
    const update = () => {
      const remain = el.scrollHeight - el.scrollTop - el.clientHeight;
      setTimelineHasMore(remain > 28);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, [activeSection, storyTab, timelinePage, timelineSlice.length]);

  const renderPager = (page: number, pages: number, setPage: (n: number) => void) =>
    pages > 1 ? (
      <div className="pair-pager" role="navigation" aria-label="페이지">
        <button
          type="button"
          className="pair-pager__nav"
          disabled={page <= 0}
          onClick={() => setPage(Math.max(0, page - 1))}
          aria-label="이전"
        >
          ‹
        </button>
        {Array.from({ length: pages }).map((_, i) => (
          <button
            key={i}
            type="button"
            className={`pair-pager__dot${i === page ? ' is-active' : ''}`}
            onClick={() => setPage(i)}
            aria-label={`${i + 1}페이지`}
            aria-current={i === page ? 'page' : undefined}
          >
            {i + 1}
          </button>
        ))}
        <button
          type="button"
          className="pair-pager__nav"
          disabled={page >= pages - 1}
          onClick={() => setPage(Math.min(pages - 1, page + 1))}
          aria-label="다음"
        >
          ›
        </button>
      </div>
    ) : null;

  let panelChildren: ReactNode = null;
  if (activePanelKey === 'relation') {
    panelChildren = (
      <PairIntroPanel
        overview={overview}
        introInterview={introInterview}
        nameA={nameA}
        nameB={nameB}
        imgA={pair.charBodyImgs?.[0] || pair.charImgs?.[0]}
        imgB={pair.charBodyImgs?.[1] || pair.charImgs?.[1]}
        intro={pair.intro}
        chemistry={pair.chemistry}
        accent={
          pair.radarColor?.trim() || pair.color?.trim() || colorA || '#d7a982'
        }
      />
    );
  } else if (activePanelKey === 'flat') {
    panelChildren = (
      <div className="pair-panel__flat">
        {flatLore ? (
          <div className="pair-rel-callout">
            <OcRichText text={flatLore} />
          </div>
        ) : null}
        {flatTags.length ? (
          <div className="pair-extra__tags">
            {flatTags.map((t, i) => (
              <span className="pair-plate__tag" key={`${t}-${i}`}>
                {t}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  } else if (activePanelKey === 'story') {
    panelChildren = (
      <div className="pair-panel__story-list">
        <div className="pair-menu pair-menu--story-sub" role="tablist" aria-label="스토리 보기">
          <span className="pair-menu__arrow" aria-hidden>
            ‹
          </span>
          <span className="pair-menu__slot">
            <button
              type="button"
              role="tab"
              aria-selected={storyTab === 'log'}
              className={`pair-menu__item${storyTab === 'log' ? ' is-active' : ''}`}
              style={{ ['--menu-i' as string]: 0 }}
              onClick={() => setStoryTab('log')}
            >
              <span className="pair-menu__glow" aria-hidden />
              <span className="pair-menu__ko">로그</span>
            </button>
          </span>
          <span className="pair-menu__sep" aria-hidden>
            |
          </span>
          <span className="pair-menu__slot">
            <button
              type="button"
              role="tab"
              aria-selected={storyTab === 'timeline'}
              className={`pair-menu__item${storyTab === 'timeline' ? ' is-active' : ''}`}
              style={{ ['--menu-i' as string]: 1 }}
              onClick={() => setStoryTab('timeline')}
            >
              <span className="pair-menu__glow" aria-hidden />
              <span className="pair-menu__ko">타임라인</span>
            </button>
          </span>
          <span className="pair-menu__arrow" aria-hidden>
            ›
          </span>
        </div>

        <div key={storyTab} className={`pair-story-pane pair-story-pane--${storyTab}`}>
        {storyTab === 'log' ? (
          storyEntries.length ? (
            <StoryEntryList
              entries={storyEntries}
              categories={hydratedPair.storyCategories}
              categoryColors={hydratedPair.storyCategoryColors}
              mode="accordion"
              heading="로그 목록"
              totalUnit="로그"
              onOpen={openStory}
              resetKey={pair.id}
              pairId={pair.id}
              accessSettings={accessSettings}
              isAdmin={isAdmin}
              onEditEntry={
                isAdmin
                  ? (e) => onRequestEdit?.({ storyFocusId: e.id, openStoryTab: true })
                  : undefined
              }
              onDeleteEntry={
                isAdmin
                  ? (e) => onRequestEdit?.({ storyFocusId: e.id, openStoryTab: true })
                  : undefined
              }
              confirmDelete={false}
              onUnlockEntry={(e) => setStoryGate(e)}
            />
          ) : (
            <p className="lh-story-list__empty">아직 등록된 로그가 없습니다.</p>
          )
        ) : null}

        {storyTab === 'timeline' ? (
          timeline.length ? (
            <div className="pair-panel__timeline-shell">
              <div
                className={`pair-panel__timeline-wrap${timelineHasMore ? ' has-more' : ''}`}
                ref={timelineScrollRef}
              >
                <ol
                  className="pair-timeline"
                  style={
                    {
                      ['--pair-timeline-rail' as string]:
                        pair.timelineRailColor?.trim() ||
                        pair.color?.trim() ||
                        colorA ||
                        '#d7a982',
                    } as CSSProperties
                  }
                >
                  {timelineSlice.map((ev, i) => (
                    <TimelineRevealItem
                      key={ev.id}
                      index={i}
                      event={ev}
                      onOpenImage={(src, title) => setTimelineLightbox({ src, title })}
                    />
                  ))}
                </ol>
                {renderPager(timelinePage, timelinePages, setTimelinePage)}
              </div>
              <div className="pair-gallery-more" aria-hidden={!timelineHasMore}>
                <div className="pair-gallery-more__fade" />
                <div className="pair-gallery-more__cue">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M12 5v14" strokeLinecap="round" />
                    <path d="M6 13l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            </div>
          ) : (
            <p className="lh-story-list__empty">아직 등록된 타임라인이 없습니다.</p>
          )
        ) : null}
        </div>
      </div>
    );
  } else if (activePanelKey === 'gallery') {
    panelChildren = (
      <div className="pair-panel__gallery-shell">
        <div
          className={`pair-panel__gallery-wrap${galleryHasMore ? ' has-more' : ''}`}
          ref={galleryScrollRef}
        >
          <div className="pair-extra__gallery">
            {gallerySlice.map((g) => {
              const urls = pairGalleryUrls(g);
              const cover = urls[0] || g.src;
              return (
                <figure className="pair-extra__gal-item" key={g.id}>
                  <button
                    type="button"
                    className="pair-extra__gal-btn"
                    onClick={() => {
                      setGalleryLightbox(g);
                      setGalleryLbIndex(0);
                    }}
                    aria-label={g.title?.trim() || '이미지 보기'}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cover.trim()} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    {urls.length > 1 ? (
                      <span className="pair-extra__gal-count">{urls.length}</span>
                    ) : null}
                  </button>
                </figure>
              );
            })}
          </div>
          {renderPager(galleryPage, galleryPages, setGalleryPage)}
        </div>
        <div className="pair-gallery-more" aria-hidden={!galleryHasMore}>
          <div className="pair-gallery-more__fade" />
          <div className="pair-gallery-more__cue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M12 5v14" strokeLinecap="round" />
              <path d="M6 13l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

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
    ['--pair-vignette-color-a' as string]: vignetteColorA,
    ['--pair-vignette-color-b' as string]: vignetteColorB,
    ['--pair-vignette' as string]: `${Math.max(0, Math.min(100, vignetteStrength))}%`,
    ['--pair-bg-dim' as string]: `${Math.max(0, Math.min(100, bgDim))}%`,
  } as CSSProperties;

  const activeMeta = menuItems.find((m) => m.id === activeSection);

  return (
    <div
      className={`pair-cherry-root${introPlay ? ' is-enter' : ''}${vn.present ? ' vn-active' : ''}${
        layoutEditable ? ' is-layout-edit' : ''
      }${quoteEditable ? ' is-quote-edit' : ''}${transit === 'diving' ? ' is-diving' : ''}${transit === 'returning' ? ' is-returning' : ''}${
        transit === 'landed' || panelReveal ? ' is-landed' : ''
      }${creepyFxClass(pair.creepyFx)}`}
      ref={rootRef}
      key={enterKey}
      style={creepyFxStyle(pair.creepyFx)}
    >
      <section
        id="pair_background"
        className={`pair-bg${vignetteSplit ? ' is-split' : ''}`}
        style={bgStyle}
        aria-hidden
      >
        <div className="pair-bg__dim" />
        <div className="pair-bg__vignette" />
        <div className="pair-bg__vsplit pair-bg__vsplit--left" />
        <div className="pair-bg__vsplit pair-bg__vsplit--right" />
        <div className="pair-bg__haze">
          <span className="pair-bg__haze-orb pair-bg__haze-orb--a" />
          <span className="pair-bg__haze-orb pair-bg__haze-orb--b" />
          <span className="pair-bg__haze-orb pair-bg__haze-orb--c" />
          <span className="pair-bg__haze-shimmer" />
        </div>
        <DustAtmosphere fx={pair.dustFx} />
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
            quote={pair.charNotes?.[0]?.quote}
            emoji={pair.charNotes?.[0]?.emoji}
            keywords={pair.charNotes?.[0]?.keywords}
            flatLore={pair.charNotes?.[0]?.flatLore}
            fields={pair.charNotes?.[0]?.fields}
            body={pair.charBodyImgs?.[0]}
            bodyFrame={pair.charBodyImgFrames?.[0]}
            bodyLayout={pair.charBodyLayout?.[0]}
            ghostLayout={pair.charGhostLayout?.[0]}
            color={colorA}
            profileLink={pair.charNotes?.[0]?.profileLink}
            ocProfileLink={ocProfileLinks?.[0]}
            bodyCredit={pair.charNotes?.[0]?.bodyCredit}
            handwritingNotes={pair.charNotes?.[0]?.handwritingNotes}
            onOpenHandwriting={() => {
              const urls = (pair.charNotes?.[0]?.handwritingNotes || []).map((u) => u.trim()).filter(Boolean);
              if (!urls.length) return;
              const sfxUrl = pair.charNotes?.[0]?.handwritingNoteSfx?.trim() || undefined;
              const closeSfxUrl =
                pair.charNotes?.[0]?.handwritingNoteCloseSfx?.trim() || undefined;
              setHandNoteLb({ urls, title: nameA, index: 0, sfxUrl, closeSfxUrl });
            }}
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
                <CursorTipZone tip={pair.infoTips?.title} as="div">
                  {pairHero ? (
                    <h2 className="pair-plate__hero">{pairHero}</h2>
                  ) : null}
                  {pairHeroSub ? <p className="pair-plate__sub">{pairHeroSub}</p> : null}
                </CursorTipZone>
                {relationLine ? (
                  <CursorTipZone
                    tip={pair.infoTips?.relation}
                    as="span"
                    className="pair-plate__relation-badge"
                  >
                    관계 ·{' '}
                    <RelationQuestionFlicker
                      text={relationLine}
                      enabled={relationQFlicker}
                    />
                  </CursorTipZone>
                ) : null}
                {visibleRiskStages(pair).length ? (
                  <div className="pair-plate__badges">
                    <RiskBadges riskStages={pair.riskStages} riskLevel={pair.riskLevel} />
                  </div>
                ) : null}
                {catchphrase ? (
                  <p className="pair-plate__catchphrase">{catchphrase}</p>
                ) : null}
              </div>
              {tags.length ? (
                <div className="pair-plate__tags">
                  {tags.map((t, i) => {
                    const raw = t.trim();
                    const label = raw.startsWith('#') ? raw : `#${raw}`;
                    return (
                      <span className="pair-plate__tag" key={`${t}-${i}`}>
                        {label}
                      </span>
                    );
                  })}
                </div>
              ) : null}
              {aToB || bToA ? (
                <>
                  <span className="pair-plate__divider" aria-hidden />
                  <CursorTipZone tip={pair.infoTips?.honorifics} as="section" className="pair-calls">
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
                  </CursorTipZone>
                </>
              ) : null}
              {dday || bgmLabel ? (
                <div className="pair-plate__meta">
                  {dday ? (
                    <div className="pair-plate__dday">
                      <span className="pair-plate__dday-label">{dday.label}</span>
                      <span className="pair-plate__dday-sep" aria-hidden>·</span>
                      <span className="pair-plate__dday-since">{dday.since}</span>
                    </div>
                  ) : null}
                  {bgmLabel ? (
                    <p className="pair-plate__bgm">
                      <svg
                        className="pair-plate__bgm-note"
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M9 18V6l10-2v10" />
                        <circle cx="6" cy="18" r="3" />
                        <circle cx="16" cy="16" r="3" />
                      </svg>
                      <span className="pair-plate__bgm-text">{bgmLabel}</span>
                    </p>
                  ) : null}
                </div>
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
                      className={`pair-menu__item${
                        activeSection === item.id ? ' is-active' : ''
                      }`}
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
            quote={pair.charNotes?.[1]?.quote}
            emoji={pair.charNotes?.[1]?.emoji}
            keywords={pair.charNotes?.[1]?.keywords}
            flatLore={pair.charNotes?.[1]?.flatLore}
            fields={pair.charNotes?.[1]?.fields}
            body={pair.charBodyImgs?.[1]}
            bodyFrame={pair.charBodyImgFrames?.[1]}
            bodyLayout={pair.charBodyLayout?.[1]}
            ghostLayout={pair.charGhostLayout?.[1]}
            color={colorB}
            profileLink={pair.charNotes?.[1]?.profileLink}
            ocProfileLink={ocProfileLinks?.[1]}
            bodyCredit={pair.charNotes?.[1]?.bodyCredit}
            handwritingNotes={pair.charNotes?.[1]?.handwritingNotes}
            onOpenHandwriting={() => {
              const urls = (pair.charNotes?.[1]?.handwritingNotes || []).map((u) => u.trim()).filter(Boolean);
              if (!urls.length) return;
              const sfxUrl = pair.charNotes?.[1]?.handwritingNoteSfx?.trim() || undefined;
              const closeSfxUrl =
                pair.charNotes?.[1]?.handwritingNoteCloseSfx?.trim() || undefined;
              setHandNoteLb({ urls, title: nameB, index: 0, sfxUrl, closeSfxUrl });
            }}
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
      <CursorFollowTipHost />

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
            {activePanelKey === 'story' && isAdmin ? (
              <button
                type="button"
                className="pair-panel__story-write"
                onClick={() => onRequestEdit?.({ openStoryTab: true })}
              >
                로그 작성
              </button>
            ) : null}
            <PairReveal index={2} className="pair-panel__div">
              <span />
              <i />
              <span />
            </PairReveal>
          </header>

          <div className={`pair-panel__body${textReveal ? ' is-text-reveal' : ''}`}>
            {activePanelKey && activePanelView ? (
              <PairPanelStage
                layout={activePanelView.layout}
                echo={activePanelView.echo}
                imgSrc=""
                imgValue={activePanelImgValue}
                imgUploadFolder={`pair/panel/${activePanelKey}`}
                frame={activePanelView.frame}
                mediaSize={activePanelView.mediaSize}
                editable={Boolean(layoutEditable && onLayoutChange)}
                textReveal={textReveal}
                onLayoutChange={(layout: PairPanelLayout) =>
                  patchPanelField(activePanelKey, { layout })
                }
                onEchoChange={(echo) => patchPanelField(activePanelKey, { echo })}
                onFrameChange={(frame) => patchPanelField(activePanelKey, { frame })}
                onMediaSizeChange={(mediaSize) => patchPanelField(activePanelKey, { mediaSize })}
                onImgChange={(img) => patchPanelField(activePanelKey, { img })}
              >
                {panelChildren}
              </PairPanelStage>
            ) : null}
          </div>

          <button
            type="button"
            className="pair-panel__ascend"
            onClick={closeSection}
            aria-label="클릭해서 돌아가기"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M12 19V5" strokeLinecap="round" />
              <path d="M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>클릭해서 돌아가기</span>
          </button>
          </article>
        </section>
      ) : null}

      {(() => {
        const idx = readerEntry
          ? [...storyEntries].sort((a, b) => a.order - b.order).findIndex((e) => e.id === readerEntry.id)
          : -1;
        const ordered = [...storyEntries].sort((a, b) => a.order - b.order);
        const prev = idx > 0 ? ordered[idx - 1] : null;
        const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;
        return (
          <StoryReader
            entry={readerEntry}
            open={readerOpen}
            accentColor={colorA || pair.color}
            categoryColors={hydratedPair.storyCategoryColors}
            hasPrevEntry={!!prev}
            hasNextEntry={!!next}
            onPrevEntry={prev ? () => setReaderEntry(prev) : undefined}
            onNextEntry={next ? () => setReaderEntry(next) : undefined}
            onClose={closeStoryReader}
            onEntryTheme={playStoryTheme}
          />
        );
      })()}

      <LakeAccessGateModal
        open={!!storyGate}
        scope="pair"
        title="비밀 로그"
        description="이 로그를 보려면 비밀번호가 필요합니다."
        loggedIn={!!user}
        accessSettings={accessSettings}
        onClose={() => setStoryGate(null)}
        onRequestLogin={() => {
          setStoryGate(null);
          setAuthOpen(true);
        }}
        onSuccess={() => {
          const e = storyGate;
          setStoryGate(null);
          if (e) openStory(e);
        }}
        verifyOverride={(input) => {
          if (!storyGate) return false;
          const expected =
            storyGate.secretPassword?.trim() ||
            resolveScopePassword('pair', accessSettings);
          if (input.trim() !== expected) return false;
          unlockLakeItem('pair', storySecretItemId(pair.id, storyGate.id), expected);
          return true;
        }}
      />
      <AuthModal backdrop="popup" open={authOpen} onClose={() => setAuthOpen(false)} />

      {galleryLightbox ? (
        <div
          className="oc-gallery-lightbox pair-gallery-lightbox"
          role="dialog"
          aria-modal="true"
          onClick={() => setGalleryLightbox(null)}
        >
          <button
            type="button"
            className="oc-gallery-lightbox-close"
            onClick={() => setGalleryLightbox(null)}
            aria-label="닫기"
          >
            ✕
          </button>
          {(() => {
            const urls = pairGalleryUrls(galleryLightbox);
            const cur = urls[galleryLbIndex] || urls[0] || galleryLightbox.src;
            return (
              <div className="oc-gallery-lightbox-stage is-slider" onClick={(e) => e.stopPropagation()}>
                {urls.length > 1 ? (
                  <button
                    type="button"
                    className="pair-gallery-lightbox__nav is-prev"
                    disabled={galleryLbIndex <= 0}
                    onClick={() => setGalleryLbIndex((i) => Math.max(0, i - 1))}
                    aria-label="이전"
                  >
                    ‹
                  </button>
                ) : null}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cur} alt="" referrerPolicy="no-referrer" />
                {urls.length > 1 ? (
                  <button
                    type="button"
                    className="pair-gallery-lightbox__nav is-next"
                    disabled={galleryLbIndex >= urls.length - 1}
                    onClick={() => setGalleryLbIndex((i) => Math.min(urls.length - 1, i + 1))}
                    aria-label="다음"
                  >
                    ›
                  </button>
                ) : null}
                {urls.length > 1 ? (
                  <p className="pair-gallery-lightbox__pager">
                    {galleryLbIndex + 1} / {urls.length}
                  </p>
                ) : null}
                {galleryLightbox.title?.trim() ? (
                  <p className="oc-gallery-lightbox-credit">{galleryLightbox.title.trim()}</p>
                ) : galleryLightbox.credit?.trim() ? (
                  <p className="oc-gallery-lightbox-credit">{galleryLightbox.credit.trim()}</p>
                ) : null}
              </div>
            );
          })()}
        </div>
      ) : null}

      {timelineLightbox ? (
        <div
          className="oc-gallery-lightbox pair-gallery-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={timelineLightbox.title || '타임라인 이미지'}
          onClick={() => setTimelineLightbox(null)}
        >
          <button
            type="button"
            className="oc-gallery-lightbox-close"
            onClick={() => setTimelineLightbox(null)}
            aria-label="닫기"
          >
            ✕
          </button>
          <div className="oc-gallery-lightbox-stage" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={timelineLightbox.src} alt="" referrerPolicy="no-referrer" />
          </div>
        </div>
      ) : null}

      {handNoteLb ? (
        <HandwritingNoteFlap
          open={!!handNoteLb}
          urls={handNoteLb.urls}
          title={handNoteLb.title}
          sfxUrl={handNoteLb.sfxUrl}
          closeSfxUrl={handNoteLb.closeSfxUrl}
          onClose={() => setHandNoteLb(null)}
        />
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
