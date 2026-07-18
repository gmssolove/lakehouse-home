'use client';

import { useEffect, useState } from 'react';

type Props = {
  /** 관계 문구 — 예: 동급생 */
  text: string;
  enabled?: boolean;
};

/**
 * 이브·이즈미 전용 — 관계 문구 뒤에 ? 가 기호 잠식처럼 가끔 깜빡임.
 */
export function RelationQuestionFlicker({ text, enabled = false }: Props) {
  const base = text.trim();
  const [suffix, setSuffix] = useState('');

  useEffect(() => {
    if (!enabled || !base) {
      setSuffix('');
      return;
    }
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let cancelled = false;
    const timers = new Set<number>();
    let loopTimer = 0;

    const clearAll = () => {
      window.clearTimeout(loopTimer);
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
    };

    const flickerOnce = () => {
      if (cancelled) return;
      const marks = ['?', '？', '?', '?'];
      const flickers = 2 + Math.floor(Math.random() * 3);
      let step = 0;

      const run = () => {
        if (cancelled) return;
        if (step >= flickers) {
          setSuffix('');
          return;
        }
        setSuffix(marks[Math.floor(Math.random() * marks.length)]);
        step += 1;
        const t = window.setTimeout(run, 50 + Math.random() * 80);
        timers.add(t);
      };
      run();
    };

    const schedule = () => {
      if (cancelled) return;
      loopTimer = window.setTimeout(() => {
        flickerOnce();
        schedule();
      }, 1800 + Math.random() * 4200);
    };

    loopTimer = window.setTimeout(() => {
      flickerOnce();
      schedule();
    }, 1200 + Math.random() * 1800);

    return () => {
      cancelled = true;
      clearAll();
      setSuffix('');
    };
  }, [enabled, base]);

  if (!base) return null;

  return (
    <>
      {base}
      {suffix ? (
        <span className="pair-relation-q" aria-hidden>
          {suffix}
        </span>
      ) : null}
    </>
  );
}
