'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './vn-location-banner.module.css';

/** 중앙 등장 애니 종료 후 유지 시간 */
export const LOCATION_HOLD_AFTER_MS = 2500;
/** 선·텍스트 등장 애니 전체 길이 (CSS와 동기) */
export const LOCATION_INTRO_MS = 1700;
/** center → corner 전환 시각 = 애니 + 유지 */
export const LOCATION_HOLD_MS = LOCATION_INTRO_MS + LOCATION_HOLD_AFTER_MS;

type Props = {
  location?: string | null;
  /** 장소가 바뀌어 중앙 연출이 끝날 때 / 같은 장소·빈 장소면 즉시 */
  onIntroComplete?: () => void;
};

/**
 * VN 스테이지 오버레이 — 원본 연출 복구
 * 중앙: 양옆 선+도트 애니 → 유지 → 좌상단 코너(동일 구분선·애니)
 */
export function VnLocationBanner({ location, onIntroComplete }: Props) {
  const next = typeof location === 'string' ? location.trim() : '';
  const [text, setText] = useState(next);
  const [phase, setPhase] = useState<'idle' | 'center' | 'corner'>('idle');
  const [playKey, setPlayKey] = useState(0);
  const prevRef = useRef<string | null>(null);
  const cornerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const onIntroRef = useRef(onIntroComplete);
  onIntroRef.current = onIntroComplete;

  useEffect(() => {
    if (!next) {
      prevRef.current = null;
      setPhase('idle');
      onIntroRef.current?.();
      return;
    }
    if (prevRef.current === next) {
      onIntroRef.current?.();
      return;
    }
    prevRef.current = next;

    setText(next);
    setPhase('idle');
    setPlayKey((k) => k + 1);
    if (cornerTimerRef.current) clearTimeout(cornerTimerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    rafRef.current = requestAnimationFrame(() => setPhase('center'));
    cornerTimerRef.current = setTimeout(() => {
      setPhase('corner');
      onIntroRef.current?.();
    }, LOCATION_HOLD_MS);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [next]);

  useEffect(
    () => () => {
      if (cornerTimerRef.current) clearTimeout(cornerTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  if (!next || phase === 'idle') return null;

  return (
    <div className={styles.root} aria-label={`장소 ${text}`} key={playKey}>
      <div
        className={`${styles.center}${phase === 'center' ? ` ${styles.centerShow}` : ''}${
          phase === 'corner' ? ` ${styles.centerHide}` : ''
        }`}
      >
        <span className={styles.glow} aria-hidden />
        <span className={`${styles.line} ${styles.lineLeft}`}>
          <span className={styles.dot} />
        </span>
        <span className={styles.tag}>장소</span>
        <span className={styles.name}>{text}</span>
        <span className={`${styles.line} ${styles.lineRight}`}>
          <span className={styles.dot} />
        </span>
      </div>

      <div className={`${styles.corner}${phase === 'corner' ? ` ${styles.cornerShow}` : ''}`}>
        <span className={styles.glowSm} aria-hidden />
        <span className={`${styles.lineSm} ${styles.lineLeft}`}>
          <span className={styles.dotSm} />
        </span>
        <span className={styles.tagSm}>장소</span>
        <span className={styles.nameSm}>{text}</span>
        <span className={`${styles.lineSm} ${styles.lineRight}`}>
          <span className={styles.dotSm} />
        </span>
      </div>
    </div>
  );
}
