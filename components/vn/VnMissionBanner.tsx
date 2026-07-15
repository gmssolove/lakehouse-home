'use client';

import { useEffect, useState } from 'react';
import { getMission } from '@/data/vn/missions';
import { playSafe } from '@/lib/vn/safeAudio';
import styles from './vn-engine.module.css';

type Props = {
  missionId: string | null;
  onDone: () => void;
};

/**
 * complete 배너: 0.3s 인 → 1.5s 유지 → 아웃. 클릭 차단 없음.
 */
export function VnMissionBanner({ missionId, onDone }: Props) {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out' | 'gone'>('gone');
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!missionId) {
      setPhase('gone');
      return;
    }
    const m = getMission(missionId);
    setTitle(m?.title ?? missionId);
    setPhase('in');

    try {
      const el = new Audio('/vn/sfx/mission_chime.mp3');
      el.volume = 0.55;
      playSafe(el, 'sfx', '/vn/sfx/mission_chime.mp3');
    } catch {
      /* 파일 없으면 생략 */
    }

    const tHold = window.setTimeout(() => setPhase('hold'), 300);
    const tOut = window.setTimeout(() => setPhase('out'), 300 + 1500);
    const tDone = window.setTimeout(() => {
      setPhase('gone');
      onDone();
    }, 300 + 1500 + 300);

    return () => {
      window.clearTimeout(tHold);
      window.clearTimeout(tOut);
      window.clearTimeout(tDone);
    };
  }, [missionId, onDone]);

  if (!missionId || phase === 'gone') return null;

  return (
    <div
      className={`${styles.missionBanner}${
        phase === 'in' || phase === 'hold' ? ` ${styles.missionBannerShow}` : ''
      }${phase === 'out' ? ` ${styles.missionBannerHide}` : ''}`}
      aria-live="polite"
    >
      <p className={styles.missionBannerEn}>MISSION COMPLETE</p>
      <p className={styles.missionBannerKo}>{title}</p>
    </div>
  );
}
