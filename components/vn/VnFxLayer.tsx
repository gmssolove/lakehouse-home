'use client';

import { useEffect, useRef, useState } from 'react';
import type { VNLineEffect } from './types';
import styles from './vn-engine.module.css';

type Props = {
  caption?: string;
  lineKey: string;
  narrationOnly?: boolean;
  narrationText?: string;
  effect?: VNLineEffect | null;
  titleText?: string;
  onTitlecardComplete?: () => void;
};

/**
 * titlecard: 페이드인 → 2초 유지 → 페이드아웃 → complete
 */
export function VnFxLayer({
  caption,
  lineKey,
  narrationOnly,
  narrationText,
  effect,
  titleText,
  onTitlecardComplete,
}: Props) {
  const [captionVisible, setCaptionVisible] = useState(false);
  const [titleVisible, setTitleVisible] = useState(false);
  const [titleMounted, setTitleMounted] = useState(false);
  const completeRef = useRef(onTitlecardComplete);
  completeRef.current = onTitlecardComplete;

  useEffect(() => {
    if (!caption?.trim()) {
      setCaptionVisible(false);
      return;
    }
    setCaptionVisible(true);
    const t = window.setTimeout(() => setCaptionVisible(false), 1500);
    return () => window.clearTimeout(t);
  }, [lineKey, caption]);

  useEffect(() => {
    if (effect !== 'titlecard') {
      setTitleMounted(false);
      setTitleVisible(false);
      return;
    }
    setTitleMounted(true);
    setTitleVisible(false);
    const tIn = window.setTimeout(() => setTitleVisible(true), 40);
    const tOut = window.setTimeout(() => setTitleVisible(false), 40 + 800 + 2000);
    const tDone = window.setTimeout(() => {
      completeRef.current?.();
    }, 40 + 800 + 2000 + 800);
    return () => {
      window.clearTimeout(tIn);
      window.clearTimeout(tOut);
      window.clearTimeout(tDone);
    };
  }, [lineKey, effect]);

  return (
    <>
      {caption?.trim() ? (
        <div
          className={`${styles.caption}${captionVisible ? ` ${styles.captionShow}` : ''}`}
          aria-live="polite"
        >
          {caption}
        </div>
      ) : null}

      {narrationOnly ? (
        <div className={styles.narrationOnly} aria-live="polite">
          <div className={styles.narrationShield} aria-hidden />
          <p className={styles.narrationOnlyText}>{narrationText ?? ''}</p>
        </div>
      ) : null}

      {effect === 'blackout' ? <div className={styles.blackout} aria-hidden /> : null}

      {effect === 'titlecard' && titleMounted ? (
        <div className={styles.titlecard} aria-live="polite">
          <p
            className={`${styles.titlecardText}${titleVisible ? ` ${styles.titlecardTextShow}` : ''}`}
          >
            {titleText || ''}
          </p>
        </div>
      ) : null}
    </>
  );
}
