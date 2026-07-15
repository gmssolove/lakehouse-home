'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { OcRichText } from '@/lib/oc/richText';
import type { StoryEntry } from '@/lib/types/character';

type Props = {
  entry: StoryEntry | null;
  open: boolean;
  onClose: () => void;
  /** 캐릭터/페어 퍼스널 컬러 — character 모드 accent */
  accentColor?: string;
};

const LEAVE_MS = 900;
const BASE_BG = '#0a0908';
const FALLBACK_ACCENT = '#d7a982';

function looksLikeHtml(s: string) {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

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

export function StoryReader({ entry, open, onClose, accentColor }: Props) {
  const [leaving, setLeaving] = useState(false);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [canScrollMore, setCanScrollMore] = useState(false);
  const [cached, setCached] = useState<StoryEntry | null>(null);
  const [chapPhase, setChapPhase] = useState<'idle' | 'out' | 'in'>('idle');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const leaveTimer = useRef(0);
  const chapTimer = useRef(0);
  const revealTimer = useRef(0);
  const closingRef = useRef(false);

  useEffect(() => {
    if (entry) setCached(entry);
  }, [entry]);

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
      window.clearTimeout(revealTimer.current);
      closingRef.current = false;
      setMounted(true);
      setLeaving(false);
      setRevealed(false);
      setChapterIndex(0);
      setChapPhase('idle');
      /* 마운트 직후 is-open이면 transition이 스킵됨 → 한 프레임 뒤 reveal */
      revealTimer.current = window.setTimeout(() => setRevealed(true), 32);
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
      if (chapPhase === 'out') return;
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
  const body = chapter?.body || '';
  const author = formatAuthor(view.author);
  const effect = view.bgEffect === 'vignette' ? 'vignette' : 'bottom-gradient';
  const openClass = revealed && !leaving ? ' is-open' : '';

  return (
    <div
      className={`lh-story-reader${openClass}${leaving ? ' is-leaving' : ''} effect-${effect}${
        canScrollMore ? ' has-more' : ''
      }`}
      style={style}
      role="dialog"
      aria-modal="true"
      aria-label={view.title || '서사'}
    >
      <div className="lh-story-reader__atmosphere" aria-hidden />
      <div className="lh-story-reader__scroll" ref={scrollRef}>
        <div className={`lh-story-reader__inner is-chap-${chapPhase}`}>
          <span className="lh-story-tag lh-story-reader__tag" data-cat={view.category}>
            {view.category || '기타'}
          </span>
          <h2 className="lh-story-reader__title">
            {view.title.trim() || '(제목 없음)'}
          </h2>
          {author ? <p className="lh-story-reader__author">{author}</p> : null}
          {chapter?.title?.trim() || chapters.length > 1 ? (
            <p className="lh-story-reader__chapter">
              {chapter?.title?.trim() || `${chapterIndex + 1} / ${chapters.length}장`}
            </p>
          ) : null}

          {body ? (
            looksLikeHtml(body) ? (
              <div
                className="lh-story-reader__body"
                dangerouslySetInnerHTML={{ __html: body }}
              />
            ) : (
              <OcRichText text={body} className="lh-story-reader__body" />
            )
          ) : null}

          {chapters.length > 1 ? (
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
