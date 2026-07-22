'use client';

import { useEffect, useRef, useState } from 'react';
import { useVnTypingDisplay, useVnTypingFlag } from '@/lib/vn/vnTypingStore';
import type { VNLineEffect } from './types';
import styles from './vn-engine.module.css';

type Props = {
  caption?: string;
  lineKey: string;
  narrationOnly?: boolean;
  /** 나레이션일 때 스토어 타자 표시 */
  liveTyping?: boolean;
  showNarrationNext?: boolean;
  effect?: VNLineEffect | null;
  titleText?: string;
  titleSubtext?: string;
  onTitlecardComplete?: () => void;
};

/** 나레이션 타자만 구독 — 부모는 글자마다 리렌더하지 않음 */
function NarrationLiveText({ showNext }: { showNext?: boolean }) {
  const display = useVnTypingDisplay();
  const typing = useVnTypingFlag();
  return (
    <>
      <div className={styles.narrationBody}>
        <span className={styles.narrationGlow} aria-hidden />
        <p className={styles.narrationOnlyText}>{display}</p>
      </div>
      {showNext && !typing ? (
        <div className={styles.narrationNextWrap} aria-hidden>
          <span className={styles.narrationNext} />
        </div>
      ) : null}
    </>
  );
}

/**
 * titlecard: 페이드인 → 2초 유지 → 페이드아웃 → complete
 */
export function VnFxLayer({
  caption,
  lineKey,
  narrationOnly,
  liveTyping = false,
  showNarrationNext,
  effect,
  titleText,
  titleSubtext,
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
    let raf1 = 0;
    let raf2 = 0;
    let tOut = 0;
    let tDone = 0;
    /* 한 프레임 이상 대기 — 초기 opacity:0 이 페인트된 뒤 Show 로 전환해야 트랜지션이 먹음 */
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        setTitleVisible(true);
      });
    });
    tOut = window.setTimeout(() => setTitleVisible(false), 80 + 900 + 2000);
    tDone = window.setTimeout(() => {
      completeRef.current?.();
    }, 80 + 900 + 2000 + 900);
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
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
        <div key={lineKey} className={styles.narrationOnly} aria-live="polite">
          <div className={styles.narrationCluster}>
            {liveTyping ? (
              <NarrationLiveText showNext={showNarrationNext} />
            ) : (
              <>
                <div className={styles.narrationBody}>
                  <span className={styles.narrationGlow} aria-hidden />
                  <p className={styles.narrationOnlyText} />
                </div>
                {showNarrationNext ? (
                  <div className={styles.narrationNextWrap} aria-hidden>
                    <span className={styles.narrationNext} />
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}

      {effect === 'blackout' ? <div className={styles.blackout} aria-hidden /> : null}

      {effect === 'titlecard' && titleMounted ? (
        <div className={styles.titlecard} aria-live="polite">
          <div className={styles.titlecardFrame}>
            {titleSubtext?.trim() ? (
              <p
                className={`${styles.titlecardEyebrow}${titleVisible ? ` ${styles.titlecardEyebrowShow}` : ''}`}
              >
                {titleSubtext}
              </p>
            ) : null}
            <div className={styles.titlecardOrnament} aria-hidden>
              <span
                className={`${styles.titlecardRule} ${styles.titlecardRuleL}${
                  titleVisible ? ` ${styles.titlecardRuleShow}` : ''
                }`}
              />
              <span
                className={`${styles.titlecardDiamond}${titleVisible ? ` ${styles.titlecardDiamondShow}` : ''}`}
              />
              <span
                className={`${styles.titlecardRule} ${styles.titlecardRuleR}${
                  titleVisible ? ` ${styles.titlecardRuleShow}` : ''
                }`}
              />
            </div>
            <p
              className={`${styles.titlecardText}${titleVisible ? ` ${styles.titlecardTextShow}` : ''}`}
            >
              {titleText || ''}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
