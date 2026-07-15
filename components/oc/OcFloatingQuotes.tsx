'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  clampQuotePos,
  clampQuoteScale,
  normalizeFloatingQuotes,
} from '@/lib/oc/floatingQuotes';
import { countPvChars, holdMsForLine } from '@/lib/oc/pvIntroTiming';
import type { OcFloatingQuote } from '@/lib/types/character';

const SWEEP_MS = 720;
const EXIT_MS = 380;
const QUOTE_SNAP = 2.2;
const AMBIENT_STAGGER_MS = 480;

type Props = {
  quotes?: OcFloatingQuote[] | null;
  /**
   * ambient — 1~2줄 고정, 진입 스윕 후 유지
   * sequence — 한 줄씩 순서 재생 후 종료 (레거시)
   */
  mode?: 'ambient' | 'sequence';
  editing?: boolean;
  selectedId?: string | null;
  onSelectId?: (id: string) => void;
  onChange?: (next: OcFloatingQuote[]) => void;
  paused?: boolean;
};

function snapNear(v: number, target: number, threshold: number) {
  return Math.abs(v - target) <= threshold ? target : v;
}

type SeqPhase = 'in' | 'hold' | 'out' | 'done';
type AmbientPhase = 'in' | 'hold';

export function OcFloatingQuotes({
  quotes: rawQuotes,
  mode = 'ambient',
  editing = false,
  selectedId = null,
  onSelectId,
  onChange,
  paused = false,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const quotes = useMemo(() => {
    const list = normalizeFloatingQuotes(rawQuotes);
    return mode === 'ambient' ? list.slice(0, 2) : list;
  }, [rawQuotes, mode]);
  const [playIdx, setPlayIdx] = useState(0);
  const [seqPhase, setSeqPhase] = useState<SeqPhase>('in');
  const [ambientPhase, setAmbientPhase] = useState<AmbientPhase>('in');
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ ox: number; oy: number; x: number; y: number; id: string } | null>(null);
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);
  const quotesRef = useRef(quotes);
  quotesRef.current = quotes;

  const quoteKey = useMemo(() => quotes.map((q) => q.id).join('|'), [quotes]);
  const ambient = mode === 'ambient';

  useEffect(() => {
    setPlayIdx(0);
    setSeqPhase('in');
    setAmbientPhase('in');
  }, [quoteKey, mode]);

  /* ambient: 전 줄 스윕 → 고정 유지 */
  useEffect(() => {
    if (!ambient || editing || paused || !quotes.length) return;
    if (ambientPhase !== 'in') return;
    const lastDelay = (quotes.length - 1) * AMBIENT_STAGGER_MS;
    const t = window.setTimeout(() => setAmbientPhase('hold'), SWEEP_MS + 280 + lastDelay);
    return () => window.clearTimeout(t);
  }, [ambient, editing, paused, quotes.length, ambientPhase, quoteKey]);

  /* sequence: 한 줄씩 */
  useEffect(() => {
    if (ambient || editing || paused || !quotes.length || seqPhase === 'done') return;
    const active = quotes[Math.min(playIdx, quotes.length - 1)];
    if (!active) return;
    const chars = countPvChars(active.text);
    const hold = holdMsForLine(chars, playIdx >= quotes.length - 1);
    let t: number;
    if (seqPhase === 'in') {
      t = window.setTimeout(() => setSeqPhase('hold'), SWEEP_MS + 280);
    } else if (seqPhase === 'hold') {
      t = window.setTimeout(() => setSeqPhase('out'), hold);
    } else if (seqPhase === 'out') {
      t = window.setTimeout(() => {
        if (playIdx >= quotes.length - 1) setSeqPhase('done');
        else {
          setPlayIdx((i) => i + 1);
          setSeqPhase('in');
        }
      }, EXIT_MS);
    }
    return () => window.clearTimeout(t);
  }, [ambient, editing, paused, quotes, seqPhase, playIdx]);

  const selectedOrFirst = useMemo(() => {
    if (!quotes.length) return null;
    if (selectedId && quotes.some((q) => q.id === selectedId)) return selectedId;
    return quotes[0].id;
  }, [quotes, selectedId]);

  const persistPatch = useCallback(
    (id: string, patch: Partial<OcFloatingQuote>) => {
      if (!onChange) return;
      onChange(quotesRef.current.map((q) => (q.id === id ? { ...q, ...patch } : q)));
    },
    [onChange],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>, id: string) => {
    if (!editing || !onChange) return;
    e.preventDefault();
    e.stopPropagation();
    onSelectId?.(id);
    e.currentTarget.setPointerCapture(e.pointerId);
    const q = quotesRef.current.find((row) => row.id === id);
    const x = q?.x ?? 50;
    const y = q?.y ?? 72;
    dragRef.current = { ox: e.clientX, oy: e.clientY, x, y, id };
    dragPosRef.current = { x, y };
    setDragPos({ x, y });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    let x = clampQuotePos(((e.clientX - rect.left) / rect.width) * 100);
    let y = clampQuotePos(((e.clientY - rect.top) / rect.height) * 100);
    x = snapNear(x, 50, QUOTE_SNAP);
    y = snapNear(y, 50, QUOTE_SNAP);
    x = Math.round(x * 10) / 10;
    y = Math.round(y * 10) / 10;
    dragPosRef.current = { x, y };
    setDragPos({ x, y });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const id = dragRef.current.id;
    const pos = dragPosRef.current;
    dragRef.current = null;
    dragPosRef.current = null;
    setDragPos(null);
    if (pos) persistPatch(id, { x: pos.x, y: pos.y });
  };

  useEffect(() => {
    const el = stageRef.current;
    if (!el || !editing || !selectedOrFirst || !onChange) return;
    const onWheel = (e: WheelEvent) => {
      const hit = (e.target as HTMLElement).closest('.oc-float-quote');
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      const id = hit.getAttribute('data-quote-id') || selectedOrFirst;
      const q = quotesRef.current.find((row) => row.id === id);
      if (!q) return;
      persistPatch(q.id, { scale: clampQuoteScale((q.scale ?? 1) + (e.deltaY > 0 ? -0.06 : 0.06)) });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [editing, selectedOrFirst, onChange, persistPatch]);

  if (!quotes.length) return null;
  if (!editing && paused) return null;
  if (!ambient && !editing && (seqPhase === 'done' || !quotes[playIdx])) return null;

  const list = editing || ambient ? quotes : [quotes[Math.min(playIdx, quotes.length - 1)]];

  return (
    <div
      ref={stageRef}
      className={`oc-float-quotes${editing ? ' is-editing' : ''}${ambient ? ' is-ambient' : ''}`}
      aria-hidden={!editing}
    >
      {list.map((q, i) => {
        const isActive = q.id === selectedOrFirst;
        const x = isActive && dragPos ? dragPos.x : q.x ?? 50;
        const y = isActive && dragPos ? dragPos.y : q.y ?? 72;
        const scale = q.scale ?? 1;
        const align = q.align || 'center';

        let boxPhase = 'is-revealed';
        if (editing) {
          boxPhase = 'is-revealed';
        } else if (ambient) {
          boxPhase = ambientPhase === 'hold' ? 'is-revealed is-ambient-live' : 'is-sweeping';
        } else if (seqPhase === 'hold') {
          boxPhase = 'is-revealed';
        } else if (seqPhase === 'out') {
          boxPhase = 'is-exiting';
        } else {
          boxPhase = 'is-sweeping';
        }

        const style = {
          left: `${x}%`,
          top: `${y}%`,
          '--oc-fq-scale': String(scale),
          '--oc-fq-delay': ambient && !editing ? `${0.22 + i * (AMBIENT_STAGGER_MS / 1000)}s` : '0.28s',
        } as CSSProperties;

        return (
          <div
            key={q.id}
            data-quote-id={q.id}
            className={`oc-float-quote is-align-${align}${editing ? ' is-draggable is-editable-hit' : ''}${
              editing && isActive ? ' is-selected' : ''
            }${editing && !isActive ? ' is-dimmed' : ''}`}
            style={style}
            onPointerDown={(e) => onPointerDown(e, q.id)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <p className={`oc-float-quote__box ${boxPhase}`}>
              <span className="oc-float-quote__mark" aria-hidden="true">
                “
              </span>
              <span className="oc-float-quote__blur" aria-hidden="true">
                {q.text}
              </span>
              <span className="oc-float-quote__text">
                <span className="oc-float-quote__inner">{q.text}</span>
                {!editing && boxPhase.includes('is-sweeping') ? (
                  <span className="oc-float-quote__shine" aria-hidden="true" />
                ) : null}
              </span>
            </p>
            {editing && isActive ? (
              <span className="oc-float-quote__hint">드래그 · 휠로 크기</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
