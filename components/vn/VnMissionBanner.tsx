'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './vn-mission-banner.module.css';

export type VnMissionBannerData = {
  id: string;
  title: string;
  status: 'start' | 'complete';
};

type Props = {
  mission: VnMissionBannerData | null;
  onDone: () => void;
};

/** CSS의 missionFade 키프레임 총 길이와 반드시 같아야 함 (아래 CSS의 .wrapShow 참고) */
const TOTAL_MS = 3800;

/**
 * 박스 없이 뜨는 미션 알림 — 장소 배너와 같은 시각 언어(텍스트 + 선/빛).
 * 등장부터 소멸까지 하나의 CSS 애니메이션(missionFade)이 통째로 재생되고,
 * JS 타이머는 그 총 길이(TOTAL_MS)가 끝난 뒤 onDone만 호출한다 — 중간에 끊기지 않음.
 */
export function VnMissionBanner({ mission, onDone }: Props) {
  const [current, setCurrent] = useState<VnMissionBannerData | null>(null);
  const [playKey, setPlayKey] = useState(0);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (doneTimer.current) clearTimeout(doneTimer.current);

    if (!mission) {
      setCurrent(null);
      return;
    }

    setCurrent(mission);
    setPlayKey((k) => k + 1);
    doneTimer.current = setTimeout(() => onDoneRef.current(), TOTAL_MS);

    return () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
    };
  }, [mission]);

  if (!current) return null;

  const isComplete = current.status === 'complete';

  return (
    <div className={styles.root} aria-hidden={false} key={playKey}>
      <span className={styles.flash} />
      <div className={styles.wrapShow} role="status" aria-live="polite">
        <span className={styles.glow} aria-hidden />
        <span className={`${styles.eyebrow}${isComplete ? ` ${styles.eyebrowComplete}` : ''}`}>
          {isComplete ? '✓ 미션 완료' : '✦ 새 미션'}
        </span>
        <span className={styles.title}>{current.title}</span>
        <span className={styles.ruleShow}>
          <span className={styles.sweep} />
        </span>
      </div>
    </div>
  );
}
