'use client';

import { useEffect, useState } from 'react';
import { getMission } from '@/data/vn/missions';
import styles from './vn-engine.module.css';

type Props = {
  open: boolean;
  activeIds: string[];
  completedIds: string[];
  /** 시나리오에서 지정한 미션 제목 (카탈로그에 없을 때) */
  titleById?: Record<string, string>;
  onClose: () => void;
};

function resolveTitle(id: string, titleById?: Record<string, string>) {
  return titleById?.[id]?.trim() || getMission(id)?.title || id;
}

function resolveDesc(id: string) {
  return getMission(id)?.description || '';
}

const OUT_MS = 280;

export function VnMissionJournal({ open, activeIds, completedIds, titleById, onClose }: Props) {
  const [shown, setShown] = useState(false);
  const [phase, setPhase] = useState<'in' | 'out'>('in');

  useEffect(() => {
    if (open) {
      setShown(true);
      setPhase('in');
      return;
    }
    setPhase('out');
    const t = window.setTimeout(() => setShown(false), OUT_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!shown) return null;

  return (
    <div
      className={`${styles.missionJournal} ${
        phase === 'in' ? styles.missionJournalIn : styles.missionJournalOut
      }`}
      role="dialog"
      aria-label="미션 수첩"
      onClick={(e) => e.stopPropagation()}
    >
      <header className={styles.missionJournalHead}>
        <div>
          <p className={styles.missionJournalLatin}>MISSION LOG</p>
          <h2 className={styles.missionJournalTitle}>미션 수첩</h2>
        </div>
        <button type="button" className={styles.missionJournalClose} onClick={onClose}>
          닫기
        </button>
      </header>

      <section className={styles.missionJournalSection}>
        <h3 className={styles.missionJournalSecTitle}>진행 중</h3>
        {activeIds.length === 0 ? (
          <p className={styles.missionJournalEmpty}>진행 중인 미션이 없습니다.</p>
        ) : (
          <ul className={styles.missionJournalList}>
            {activeIds.map((id) => (
              <li key={id} className={styles.missionJournalItemActive}>
                <span className={styles.missionJournalItemTitle}>{resolveTitle(id, titleById)}</span>
                {resolveDesc(id) ? (
                  <span className={styles.missionJournalItemDesc}>{resolveDesc(id)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.missionJournalSection}>
        <h3 className={styles.missionJournalSecTitle}>완료</h3>
        {completedIds.length === 0 ? (
          <p className={styles.missionJournalEmpty}>완료한 미션이 없습니다.</p>
        ) : (
          <ul className={styles.missionJournalList}>
            {completedIds.map((id) => (
              <li key={id} className={styles.missionJournalItemDone}>
                <span className={styles.missionJournalStamp} aria-hidden>
                  Cleared
                </span>
                <span className={styles.missionJournalCheck} aria-hidden>
                  ✓
                </span>
                <span className={styles.missionJournalItemTitle}>{resolveTitle(id, titleById)}</span>
                {resolveDesc(id) ? (
                  <span className={styles.missionJournalItemDesc}>{resolveDesc(id)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
