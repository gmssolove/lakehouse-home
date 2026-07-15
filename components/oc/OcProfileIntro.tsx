'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { buildPvIntroPlan, estimatePvIntroMs } from '@/lib/oc/pvIntroTiming';
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

export function OcProfileIntro({ character, durationMs, onComplete, onCancel }: Props) {
  const lines = useMemo(() => pickQuoteLines(character).slice(0, 2), [character]);
  const linesKey = lines.join('\n');
  const plan = useMemo(() => buildPvIntroPlan(lines, durationMs), [durationMs, lines]);
  const [lineIndex, setLineIndex] = useState(0);
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

  const onLineSwept = useCallback(() => setSweeping(false), []);

  const skipSweep = useCallback(() => {
    if (sweeping) setSweeping(false);
  }, [sweeping]);

  useEffect(() => {
    setLineIndex(0);
    setSweeping(true);
    setFadeOut(false);
    setExiting(false);
    doneRef.current = false;
  }, [linesKey, durationMs]);

  useEffect(() => {
    if (!lines.length) {
      onCompleteRef.current(false);
      return;
    }

    const totalMs = estimatePvIntroMs(lines, durationMs) + EXIT_MS + 120;
    const hardCap = window.setTimeout(() => finish(false), totalMs);
    return () => window.clearTimeout(hardCap);
  }, [durationMs, finish, lines.length, linesKey]);

  useEffect(() => {
    if (!lines.length || sweeping) return;

    const step = plan[lineIndex];
    if (!step) {
      finish(false);
      return;
    }

    const t = window.setTimeout(() => {
      if (lineIndex < lines.length - 1) {
        setLineIndex((i) => i + 1);
        setSweeping(true);
        return;
      }
      finish(false);
    }, step.pauseAfterMs);

    return () => window.clearTimeout(t);
  }, [finish, lineIndex, lines.length, plan, sweeping]);

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
        if (sweeping) {
          skipSweep();
          return;
        }
        if (lineIndex < lines.length - 1) {
          setLineIndex((i) => i + 1);
          setSweeping(true);
        } else {
          finish(false);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancel, finish, lineIndex, lines.length, skipSweep, sweeping]);

  if (!lines.length) return null;

  const currentSweepMs = plan[lineIndex]?.sweepMs ?? 500;

  return (
    <div className={`oc-pv-intro oc-pv-intro--cinema${exiting ? ' is-exiting' : ''}`} role="presentation">
      <div className="oc-pv-intro-backdrop" aria-hidden="true" />

      <div className={`oc-pv-intro-stage${fadeOut ? ' is-fading' : ''}`}>
        {lines.map((line, i) => {
          if (i > lineIndex) return null;
          const isCurrent = i === lineIndex;
          return (
            <div
              key={i}
              className={`oc-pv-intro-quote-wrap oc-pv-intro-quote-wrap-${i + 1} visible`}
            >
              {isCurrent && sweeping ? (
                <SweepQuote text={line} sweepMs={currentSweepMs} active onDone={onLineSwept} />
              ) : (
                <p className="oc-pv-intro-quote is-revealed">
                  <span className="oc-pv-intro-quote-inner">{line}</span>
                </p>
              )}
              {isCurrent ? (
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
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
