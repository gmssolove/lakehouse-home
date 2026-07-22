'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './vn-engine.module.css';

type Props = {
  /** 표시 중 */
  active: boolean;
  /** 페이드아웃 시작 — 챕터 배너·효과음 시작 시점 */
  onReveal: () => void;
  /** 페이드아웃 완전 종료 */
  onDone?: () => void;
  /** 유지 시간 ms (인 애니메이션 제외, 기본 4000) */
  holdMs?: number;
  /**
   * true면 페이드아웃하지 않고 검정을 유지한 채 onReveal→onDone.
   * 엔딩 직전 등 아래 스테이지가 비치면 안 될 때.
   */
  holdExit?: boolean;
};

const FADE_MS = 1200;

/**
 * 챕터 전환 로딩 — 검정 + 중앙 밝은 비네트 + 우하단 스피너.
 * 페이드아웃이 시작될 때 onReveal → 챕터카드와 크로스페이드.
 */
export function VnChapterLoading({
  active,
  onReveal,
  onDone,
  holdMs = 4000,
  holdExit = false,
}: Props) {
  const [phase, setPhase] = useState<'in' | 'show' | 'out' | 'gone'>('gone');
  const onRevealRef = useRef(onReveal);
  const onDoneRef = useRef(onDone);
  onRevealRef.current = onReveal;
  onDoneRef.current = onDone;
  const revealedRef = useRef(false);

  useEffect(() => {
    if (!active) {
      setPhase('gone');
      revealedRef.current = false;
      return;
    }

    revealedRef.current = false;
    setPhase('in');
    const tShow = window.setTimeout(() => setPhase('show'), 40);
    const tOut = window.setTimeout(() => {
      if (!revealedRef.current) {
        revealedRef.current = true;
        onRevealRef.current();
      }
      if (holdExit) {
        /* 검정 유지 — 부모가 active=false 로 걷어냄 */
        onDoneRef.current?.();
        return;
      }
      setPhase('out');
    }, 40 + FADE_MS + holdMs);
    const tDone = holdExit
      ? null
      : window.setTimeout(() => {
          setPhase('gone');
          onDoneRef.current?.();
        }, 40 + FADE_MS + holdMs + FADE_MS);

    return () => {
      window.clearTimeout(tShow);
      window.clearTimeout(tOut);
      if (tDone != null) window.clearTimeout(tDone);
    };
  }, [active, holdMs, holdExit]);

  if (phase === 'gone' && !active) return null;
  if (phase === 'gone') return null;

  const visible = phase === 'in' || phase === 'show';
  const leaving = phase === 'out';

  return (
    <div
      className={`${styles.chapterLoad}${visible ? ` ${styles.chapterLoadShow}` : ''}${
        leaving ? ` ${styles.chapterLoadOut}` : ''
      }`}
      aria-busy={phase !== 'out'}
      aria-live="polite"
    >
      <div className={styles.chapterLoadVignette} aria-hidden />
      <div className={styles.chapterLoadSpinner} aria-hidden>
        <span className={styles.chapterLoadRing} />
      </div>
    </div>
  );
}
