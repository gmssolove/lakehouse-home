'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { clampPairQuoteScale } from '@/lib/oc/floatingQuotes';
import type { PairFloatingQuote, PairQuoteSlot } from '@/lib/types/character';

const SWEEP_MS = 720;
const STAGGER_MS = 420;

type Props = {
  quotes: PairFloatingQuote[];
  /** left = A, right = B */
  side: 'left' | 'right';
  editing?: boolean;
  selectedId?: string | null;
  onSelectId?: (id: string) => void;
  onScaleChange?: (id: string, scale: number) => void;
  paused?: boolean;
  staggerIndex?: number;
};

export function PairAnchoredQuotes({
  quotes,
  side,
  editing = false,
  selectedId = null,
  onSelectId,
  onScaleChange,
  paused = false,
  staggerIndex = 0,
}: Props) {
  const list = useMemo(
    () => quotes.filter((q) => (side === 'left' ? q.side === 'A' : q.side === 'B')),
    [quotes, side],
  );
  const [phase, setPhase] = useState<'in' | 'hold'>('in');
  const key = list.map((q) => q.id).join('|');

  useEffect(() => {
    setPhase('in');
  }, [key]);

  useEffect(() => {
    if (editing || paused || !list.length || phase !== 'in') return;
    const delay = staggerIndex * STAGGER_MS;
    const t = window.setTimeout(() => setPhase('hold'), SWEEP_MS + 280 + delay);
    return () => window.clearTimeout(t);
  }, [editing, paused, list.length, phase, staggerIndex, key]);

  if (!list.length) return null;
  if (!editing && paused) return null;

  return (
    <div className={`pair-anchored-quotes pair-anchored-quotes--${side}`} aria-hidden={!editing}>
      {list.map((q, i) => {
        const slot: PairQuoteSlot = q.slot || 'chest';
        const isActive = q.id === selectedId || (!selectedId && i === 0);
        const scale = clampPairQuoteScale(q.scale ?? 1);
        const boxPhase = editing || phase === 'hold' ? 'is-revealed is-ambient-live' : 'is-sweeping';
        const style = {
          '--oc-fq-scale': String(scale),
          '--oc-fq-delay': editing ? '0s' : `${0.2 + staggerIndex * 0.42 + i * 0.2}s`,
        } as CSSProperties;

        return (
          <div
            key={q.id}
            data-quote-id={q.id}
            className={`pair-anchored-quote is-slot-${slot}${editing ? ' is-editable' : ''}${
              editing && isActive ? ' is-selected' : ''
            }`}
            style={style}
            onClick={
              editing
                ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectId?.(q.id);
                  }
                : undefined
            }
            onWheel={
              editing && onScaleChange
                ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectId?.(q.id);
                    const next = clampPairQuoteScale((q.scale ?? 1) + (e.deltaY > 0 ? -0.05 : 0.05));
                    onScaleChange(q.id, next);
                  }
                : undefined
            }
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
              <span className="oc-float-quote__hint">휠 · 크기</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
