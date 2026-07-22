'use client';

import { useEffect, useState } from 'react';
import styles from './vn-shell.module.css';

type Props = {
  onDone: () => void;
};

/**
 * 튜토리얼 종료(스킵 포함) 직후 · 챕터/플레이 시작 전 —
 * PC 1920×1080 권장 안내. ~3초 표시 후 페이드아웃.
 */
export function VnPcResHint({ onDone }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let fadeOut = 0;
    let done = 0;
    const fadeIn = window.setTimeout(() => setVisible(true), 40);
    /* 페이드인(~1.1s) + 유지 ≈ 3초 시점부터 페이드아웃 */
    fadeOut = window.setTimeout(() => setVisible(false), 3000);
    done = window.setTimeout(() => onDone(), 3000 + 1200);
    return () => {
      window.clearTimeout(fadeIn);
      window.clearTimeout(fadeOut);
      window.clearTimeout(done);
    };
  }, [onDone]);

  return (
    <div
      className={`${styles.resHint}${visible ? ` ${styles.resHintShow}` : ''}`}
      role="status"
      aria-live="polite"
    >
      <p className={styles.resHintBody}>
        PC 환경에서 1920×1080 비율로 플레이하는 것을 권장합니다.
      </p>
    </div>
  );
}
