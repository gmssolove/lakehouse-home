'use client';

import { useMemo, type CSSProperties } from 'react';
import type { DialogueChoice } from '@/lib/types/character';
import { useVnChoicePick } from '@/components/shared/useVnChoicePick';

type Props = {
  choices: DialogueChoice[];
  onPick: (next: string) => void;
};

/** 화면 중앙 행동 선택지 (대사창 옆 분기 선택지와 별개) */
export function VnActionChoices({ choices, onPick }: Props) {
  const resetKey = useMemo(
    () => choices.map((c) => `${c.label}|${c.next ?? ''}`).join(';'),
    [choices],
  );
  const { pickedIndex, resolving, pick } = useVnChoicePick(onPick, resetKey);

  if (!choices.length) return null;

  return (
    <div
      className={`lh-vn-action-layer${resolving ? ' is-resolving' : ''}`}
      role="group"
      aria-label="행동 선택"
    >
      <div className={`lh-vn-action-choices${resolving ? ' is-resolving' : ''}`}>
        {choices.map((ch, i) => (
          <button
            key={`${ch.label}-${ch.next}-${i}`}
            type="button"
            className={[
              'lh-vn-action-choice',
              pickedIndex === i ? 'is-picked' : '',
              resolving && pickedIndex !== i ? 'is-dismissed' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ '--vn-action-i': i } as CSSProperties}
            disabled={resolving}
            aria-pressed={pickedIndex === i}
            onClick={(e) => {
              e.stopPropagation();
              pick(i, ch.next || '');
            }}
          >
            <span className="lh-vn-action-choice__sheen" aria-hidden="true" />
            <span className="lh-vn-action-choice__label">{ch.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
