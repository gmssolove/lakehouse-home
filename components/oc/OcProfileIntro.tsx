'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { buildPvIntroPlan, countPvChars, holdMsForLine } from '@/lib/oc/pvIntroTiming';
import type { OcCharacter } from '@/lib/types/character';
import { pickQuoteLines } from '@/lib/oc/profileQuotes';

type Props = {
  character: OcCharacter;
  durationMs: number;
  onComplete: (instant?: boolean) => void;
  onCancel: () => void;
};

const EXIT_MS = 380;

function SweepQuote({
  text,
  sweepMs,
  active,
  onDone,
}: {
  text: string;
  sweepMs: number;
  active: boolean;
  onDone: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const doneRef = useRef(false);
  const sweepStyle = { '--pv-sweep-ms': `${sweepMs}ms` } as CSSProperties;

  useEffect(() => {
    if (!active) {
      setRevealed(false);
      doneRef.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      setRevealed(true);
      onDone();
    }, sweepMs);
    return () => window.clearTimeout(t);
  }, [active, onDone, sweepMs]);

  if (!active) return null;

  return (
    <p
      className={`oc-pv-intro-quote${revealed ? ' is-revealed' : ' is-sweeping'}`}
      style={sweepStyle}
    >
      <span className="oc-pv-intro-quote-inner">{text}</span>
      <span className="oc-pv-intro-shine" aria-hidden="true" />
    </p>
  );
}

const NOOP = () => {};

export function OcProfileIntro({ character, durationMs, onComplete, onCancel }: Props) {
  const lines = useMemo(() => pickQuoteLines(character).slice(0, 3), [character]);
  const linesKey = lines.join('\n');
  /* 모든 줄을 한 번에 스윕한다 — 줄마다 순차로 늦게 뜨지 않도록. */
  const sweepMs = useMemo(() => {
    const plan = buildPvIntroPlan(lines, durationMs);
    return plan.length ? Math.max(...plan.map((p) => p.sweepMs)) : 700;
  }, [durationMs, lines]);
  const holdMs = useMemo(
    () => holdMsForLine(lines.reduce((sum, l) => sum + countPvChars(l), 0), true),
    [lines],
  );
  const [sweeping, setSweeping] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);
  const [exiting, setExiting] = useState(false);
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onCancelRef = useRef(onCancel);
  onCompleteRef.current = onComplete;
  onCancelRef.current = onCancel;
  /* 테마곡은 OcPageClient.openDetail(카드 클릭)에서만 재생.
     여기서 다시 play하면 silence 후 제스처 없이 재시작해 PV 동안 무음이 됨. */

  const finish = useCallback((instant = false) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (instant) {
      onCompleteRef.current(true);
      return;
    }
    setFadeOut(true);
    setExiting(true);
    window.setTimeout(() => onCompleteRef.current(false), EXIT_MS);
  }, []);

  const cancel = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancelRef.current();
  }, []);

  useEffect(() => {
    setSweeping(true);
    setFadeOut(false);
    setExiting(false);
    doneRef.current = false;
  }, [linesKey, durationMs]);

  // 전 줄 동시 스윕 → 완료
  useEffect(() => {
    if (!lines.length) {
      onCompleteRef.current(false);
      return;
    }
    const t = window.setTimeout(() => setSweeping(false), sweepMs);
    return () => window.clearTimeout(t);
  }, [lines.length, linesKey, sweepMs]);

  // 스윕 후 읽기 대기 → 종료
  useEffect(() => {
    if (!lines.length || sweeping) return;
    const t = window.setTimeout(() => finish(false), holdMs);
    return () => window.clearTimeout(t);
  }, [finish, holdMs, lines.length, sweeping]);

  // 안전 상한 — 타이머가 어긋나도 확실히 종료
  useEffect(() => {
    if (!lines.length) return;
    const cap = window.setTimeout(() => finish(false), sweepMs + holdMs + EXIT_MS + 200);
    return () => window.clearTimeout(cap);
  }, [finish, holdMs, lines.length, linesKey, sweepMs]);

  useEffect(() => {
    if (!lines.length) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (sweeping) setSweeping(false);
        else finish(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancel, finish, lines.length, sweeping]);

  if (!lines.length) return null;

  return (
    <div className={`oc-pv-intro oc-pv-intro--cinema${exiting ? ' is-exiting' : ''}`} role="presentation">
      <div className="oc-pv-intro-backdrop" aria-hidden="true" />

      <div className={`oc-pv-intro-stage${fadeOut ? ' is-fading' : ''}`}>
        {lines.map((line, i) => (
          <div
            key={i}
            className={`oc-pv-intro-quote-wrap oc-pv-intro-quote-wrap-${i + 1} visible`}
          >
            {sweeping ? (
              <SweepQuote text={line} sweepMs={sweepMs} active onDone={NOOP} />
            ) : (
              <p className="oc-pv-intro-quote is-revealed">
                <span className="oc-pv-intro-quote-inner">{line}</span>
              </p>
            )}
          </div>
        ))}
        <button
          type="button"
          className="oc-pv-intro-skip"
          onClick={(e) => {
            e.stopPropagation();
            finish(true);
          }}
        >
          SKIP
        </button>
      </div>
    </div>
  );
}
