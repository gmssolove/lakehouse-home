'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { StoryPostBody, resolveStoryViewMode } from '@/components/shared/StoryPostBody';
import { storyCategoryTagStyle } from '@/lib/oc/storyEntries';
import type { StoryEntry } from '@/lib/types/character';

type Props = {
  entry: StoryEntry | null;
  open: boolean;
  onClose: () => void;
  /** 캐릭터/페어 퍼스널 컬러 — character 모드 accent */
  accentColor?: string;
  /** 분류별 태그 색 */
  categoryColors?: Record<string, string>;
  /** 서사 글 단위 이전/다음 이동 (#3) */
  onPrevEntry?: () => void;
  onNextEntry?: () => void;
  hasPrevEntry?: boolean;
  hasNextEntry?: boolean;
  /** 포스트 열릴 때 BGM 로드 (없으면 호출 안 함) */
  onEntryTheme?: (entry: StoryEntry) => void;
};

const LEAVE_MS = 900;
const BASE_BG = '#0a0908';
const FALLBACK_ACCENT = '#d7a982';
const ENTRY_SLIDE_MS = 480;

function formatAuthor(raw?: string) {
  const t = (raw || '').trim();
  if (!t) return '';
  return t.startsWith('©') ? t : `© ${t.replace(/^©+\s*/, '')}`;
}

function resolveAccent(view: StoryEntry, accentColor?: string) {
  const custom = (view.bgColor || '').trim();
  if (view.bgAccentMode === 'custom' && custom) return custom;
  const char = (accentColor || '').trim();
  return char || FALLBACK_ACCENT;
}

export function StoryReader({
  entry,
  open,
  onClose,
  accentColor,
  categoryColors,
  onPrevEntry,
  onNextEntry,
  hasPrevEntry,
  hasNextEntry,
  onEntryTheme,
}: Props) {
  const [leaving, setLeaving] = useState(false);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [canScrollMore, setCanScrollMore] = useState(false);
  const [cached, setCached] = useState<StoryEntry | null>(null);
  const [chapPhase, setChapPhase] = useState<'idle' | 'out' | 'in'>('idle');
  const [slidePhase, setSlidePhase] = useState<'idle' | 'slide'>('idle');
  const [slideDir, setSlideDir] = useState<'prev' | 'next'>('next');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const leaveTimer = useRef(0);
  const chapTimer = useRef(0);
  const revealTimer = useRef(0);
  const entryTimer = useRef(0);
  const closingRef = useRef(false);
  const entryAnimLock = useRef(false);

  useEffect(() => {
    if (entry) setCached(entry);
  }, [entry]);

  useEffect(() => {
    if (open && entry) onEntryTheme?.(entry);
  }, [open, entry, onEntryTheme]);

  const finishClose = useCallback(() => {
    setLeaving(false);
    setMounted(false);
    setRevealed(false);
    closingRef.current = false;
    onClose();
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setLeaving(true);
    setRevealed(false);
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(finishClose, LEAVE_MS);
  }, [finishClose]);

  useEffect(() => {
    if (open && entry) {
      window.clearTimeout(leaveTimer.current);
      closingRef.current = false;
      setLeaving(false);
      /* 이미 열려 있으면 글만 교체 — 전체 닫힘/열림 리셋 금지 */
      if (!mounted) {
        setMounted(true);
        setRevealed(false);
        setChapterIndex(0);
        setChapPhase('idle');
        window.clearTimeout(revealTimer.current);
        revealTimer.current = window.setTimeout(() => setRevealed(true), 32);
      }
      return;
    }
    if (!open && mounted && !closingRef.current) {
      closingRef.current = true;
      setLeaving(true);
      setRevealed(false);
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = window.setTimeout(() => {
        setLeaving(false);
        setMounted(false);
        setRevealed(false);
        closingRef.current = false;
      }, LEAVE_MS);
    }
  }, [open, entry, mounted]);

  useEffect(() => {
    return () => {
      window.clearTimeout(leaveTimer.current);
      window.clearTimeout(chapTimer.current);
      window.clearTimeout(revealTimer.current);
      window.clearTimeout(entryTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!open || !mounted || leaving) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        requestClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, mounted, leaving, requestClose]);

  const goChapter = useCallback(
    (next: number) => {
      if (chapPhase === 'out' || entryAnimLock.current) return;
      setChapPhase('out');
      window.clearTimeout(chapTimer.current);
      chapTimer.current = window.setTimeout(() => {
        setChapterIndex(next);
        setChapPhase('in');
        chapTimer.current = window.setTimeout(() => setChapPhase('idle'), 700);
      }, 280);
    },
    [chapPhase],
  );

  const goEntry = useCallback(
    (dir: 'prev' | 'next') => {
      if (entryAnimLock.current || slidePhase !== 'idle') return;
      const fn = dir === 'prev' ? onPrevEntry : onNextEntry;
      if (!fn) return;
      entryAnimLock.current = true;
      setSlideDir(dir);
      /* 닫힘→열림 없이 즉시 교체 + 한 번만 슬라이드 */
      fn();
      setChapterIndex(0);
      setChapPhase('idle');
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      setSlidePhase('slide');
      window.clearTimeout(entryTimer.current);
      entryTimer.current = window.setTimeout(() => {
        setSlidePhase('idle');
        entryAnimLock.current = false;
      }, ENTRY_SLIDE_MS);
    },
    [onNextEntry, onPrevEntry, slidePhase],
  );

  const updateScrollCue = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      setCanScrollMore(false);
      return;
    }
    const more =
      el.scrollHeight > el.clientHeight + 8 &&
      el.scrollTop + el.clientHeight < el.scrollHeight - 24;
    setCanScrollMore(more);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const el = scrollRef.current;
    if (!el) return;
    updateScrollCue();
    el.addEventListener('scroll', updateScrollCue, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateScrollCue) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollCue);
      ro?.disconnect();
    };
  }, [mounted, chapterIndex, cached?.id, updateScrollCue]);

  const view = entry || cached;
  const style = useMemo(() => {
    if (!view) return undefined;
    const accent = resolveAccent(view, accentColor);
    const op =
      typeof view.bgEffectOpacity === 'number' && Number.isFinite(view.bgEffectOpacity)
        ? Math.min(100, Math.max(0, view.bgEffectOpacity))
        : 55;
    return {
      ['--story-accent' as string]: accent,
      ['--story-bg' as string]: BASE_BG,
      ['--story-atmo-opacity' as string]: String(op / 100),
    } as CSSProperties;
  }, [view, accentColor]);

  if (!mounted || !view) return null;

  const chapters = view.chapters?.length ? view.chapters : [];
  const chapter = chapters[chapterIndex];
  const author = formatAuthor(view.author);
  const viewMode = resolveStoryViewMode(view);
  const effect = view.bgEffect === 'vignette' ? 'vignette' : 'bottom-gradient';
  const openClass = revealed && !leaving ? ' is-open' : '';
  const slideClass = slidePhase === 'slide' ? ` is-slide is-slide-${slideDir}` : '';
  const novelClass = viewMode === 'text' ? ' is-novel' : '';

  return (
    <div
      className={`lh-story-reader${openClass}${leaving ? ' is-leaving' : ''} effect-${effect}${
        canScrollMore ? ' has-more' : ''
      }${novelClass} is-mode-${viewMode}`}
      style={style}
      role="dialog"
      aria-modal="true"
      aria-label={view.title || '서사'}
    >
      <div className="lh-story-reader__atmosphere" aria-hidden />
      <div className="lh-story-reader__scroll" ref={scrollRef}>
        <div className={`lh-story-reader__inner is-chap-${chapPhase}${slideClass}`}>
          {onPrevEntry || onNextEntry ? (
            <div className="lh-story-reader__entry-nav">
              <button
                type="button"
                className="lh-story-reader__entry-btn"
                onClick={() => goEntry('prev')}
                disabled={!hasPrevEntry || slidePhase !== 'idle'}
                aria-label="이전 서사"
              >
                ‹ 이전 글
              </button>
              <button
                type="button"
                className="lh-story-reader__entry-btn"
                onClick={() => goEntry('next')}
                disabled={!hasNextEntry || slidePhase !== 'idle'}
                aria-label="다음 서사"
              >
                다음 글 ›
              </button>
            </div>
          ) : null}
          <span
            className="lh-story-tag lh-story-reader__tag"
            data-cat={view.category}
            style={storyCategoryTagStyle(view.category, categoryColors)}
          >
            {view.category || '기타'}
          </span>
          {view.adult ? <span className="lh-story-badge lh-story-badge--adult">19</span> : null}
          <h2 className="lh-story-reader__title">
            {view.title.trim() || '(제목 없음)'}
          </h2>
          {author ? <p className="lh-story-reader__author">{author}</p> : null}
          {viewMode === 'text' && (chapter?.title?.trim() || chapters.length > 1) ? (
            <p className="lh-story-reader__chapter">
              {chapter?.title?.trim() || `${chapterIndex + 1} / ${chapters.length}장`}
            </p>
          ) : null}

          <StoryPostBody entry={view} chapterIndex={chapterIndex} />

          {viewMode === 'text' && chapters.length > 1 ? (
            <div className="lh-story-reader__nav">
              <button
                type="button"
                disabled={chapterIndex <= 0 || chapPhase === 'out'}
                onClick={() => goChapter(Math.max(0, chapterIndex - 1))}
              >
                ← 이전 장
              </button>
              <button
                type="button"
                disabled={chapterIndex >= chapters.length - 1 || chapPhase === 'out'}
                onClick={() => goChapter(Math.min(chapters.length - 1, chapterIndex + 1))}
              >
                다음 장 →
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="lh-story-reader__more" aria-hidden={!canScrollMore}>
        <div className="lh-story-reader__fade" />
        <div className="lh-story-reader__more-cue">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 5v14" strokeLinecap="round" />
            <path d="M6 13l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
