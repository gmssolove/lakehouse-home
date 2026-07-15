'use client';

import styles from './vn-engine.module.css';

export type VnChoiceItem = {
  text: string;
  nextSceneId: string;
};

type Props = {
  choices: VnChoiceItem[];
  onPick: (nextSceneId: string) => void;
};

/**
 * 라인에 choices가 있을 때 중앙 골드 테두리 선택지
 */
export function VnChoicePanel({ choices, onPick }: Props) {
  if (!choices.length) return null;

  return (
    <div
      className={styles.choiceOverlay}
      role="group"
      aria-label="선택지"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className={styles.choiceStack}>
        {choices.map((ch, i) => (
          <button
            key={`${ch.nextSceneId}-${ch.text}`}
            type="button"
            className={styles.choiceBtn}
            style={{ animationDelay: `${80 + i * 90}ms` }}
            onClick={() => onPick(ch.nextSceneId)}
          >
            {ch.text}
          </button>
        ))}
      </div>
    </div>
  );
}
