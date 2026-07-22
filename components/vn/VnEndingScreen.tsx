'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './vn-shell.module.css';

type Props = {
  onRestart: () => void;
  /** VN 인게임 메인(타이틀) 메뉴로 */
  onMainMenu: () => void;
  /** 기본: SCENE COMPLETE */
  eyebrow?: string;
  /** 기본: END */
  title?: string;
};

const EXIT_MS = 620;

/**
 * 시나리오 엔딩 — 여운용 등장 + VN 메인 복귀.
 */
export function VnEndingScreen({
  onRestart,
  onMainMenu,
  eyebrow = 'SCENE COMPLETE',
  title = 'END',
}: Props) {
  const [visible, setVisible] = useState(false);
  const [actionsOn, setActionsOn] = useState(false);
  const [exiting, setExiting] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const tIn = window.setTimeout(() => setVisible(true), 80);
    /* END 연출(~1.4s) + 짧은 여운 뒤 버튼 */
    const tAct = window.setTimeout(() => setActionsOn(true), 80 + 1400 + 520);
    return () => {
      window.clearTimeout(tIn);
      window.clearTimeout(tAct);
      if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current);
    };
  }, []);

  function leave(next: () => void) {
    if (exiting) return;
    setExiting(true);
    setActionsOn(false);
    exitTimerRef.current = setTimeout(() => {
      exitTimerRef.current = null;
      next();
    }, EXIT_MS);
  }

  return (
    <div
      className={`${styles.ending}${exiting ? ` ${styles.endingOut}` : ''}`}
      role="dialog"
      aria-label="엔딩"
    >
      <div className={styles.endingWash} aria-hidden />
      <div className={styles.endingFrame}>
        <p
          className={`${styles.endingEyebrow}${visible && !exiting ? ` ${styles.endingEyebrowShow}` : ''}`}
        >
          {eyebrow}
        </p>

        <div
          className={`${styles.endingOrnament}${visible && !exiting ? ` ${styles.endingOrnamentShow}` : ''}`}
          aria-hidden
        >
          <span className={`${styles.endingRule} ${styles.endingRuleL}`} />
          <span className={styles.endingDiamond} />
          <span className={`${styles.endingRule} ${styles.endingRuleR}`} />
        </div>

        <p
          className={`${styles.endingTitle}${visible && !exiting ? ` ${styles.endingTitleShow}` : ''}`}
        >
          {title}
        </p>

        <div
          className={`${styles.endingActions}${actionsOn && !exiting ? ` ${styles.endingActionsShow}` : ''}`}
        >
          <button
            type="button"
            className={styles.endingBtn}
            disabled={exiting}
            onClick={() => leave(onRestart)}
          >
            다시하기
          </button>
          <span className={styles.endingBtnSep} aria-hidden>
            ·
          </span>
          <button
            type="button"
            className={styles.endingBtn}
            disabled={exiting}
            onClick={() => leave(onMainMenu)}
          >
            메인으로
          </button>
        </div>
      </div>
    </div>
  );
}
