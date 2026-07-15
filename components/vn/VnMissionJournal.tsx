'use client';

import { getMission } from '@/data/vn/missions';
import styles from './vn-engine.module.css';

type Props = {
  open: boolean;
  activeIds: string[];
  completedIds: string[];
  onClose: () => void;
};

export function VnMissionJournal({ open, activeIds, completedIds, onClose }: Props) {
  if (!open) return null;

  const active = activeIds
    .map((id) => getMission(id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));
  const completed = completedIds
    .map((id) => getMission(id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));

  return (
    <div
      className={styles.missionJournal}
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
        {active.length === 0 ? (
          <p className={styles.missionJournalEmpty}>진행 중인 미션이 없습니다.</p>
        ) : (
          <ul className={styles.missionJournalList}>
            {active.map((m) => (
              <li key={m.id} className={styles.missionJournalItemActive}>
                <span className={styles.missionJournalItemTitle}>{m.title}</span>
                <span className={styles.missionJournalItemDesc}>{m.description}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.missionJournalSection}>
        <h3 className={styles.missionJournalSecTitle}>완료</h3>
        {completed.length === 0 ? (
          <p className={styles.missionJournalEmpty}>완료한 미션이 없습니다.</p>
        ) : (
          <ul className={styles.missionJournalList}>
            {completed.map((m) => (
              <li key={m.id} className={styles.missionJournalItemDone}>
                <span className={styles.missionJournalCheck} aria-hidden>
                  ✓
                </span>
                <span className={styles.missionJournalItemTitle}>{m.title}</span>
                <span className={styles.missionJournalItemDesc}>{m.description}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
