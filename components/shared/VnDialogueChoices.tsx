'use client';

import { useMemo } from 'react';
import { useVnChoicePick } from '@/components/shared/useVnChoicePick';

type ChoiceItem = { label: string; next?: string };

type Props = {
  choices: ChoiceItem[];
  onPick: (next: string) => void;
};

/** 선택지 앞 말풍선(…) 아이콘 */
function ChoiceBubbleIcon() {
  return (
    <svg
      className="lh-vn-choice__bubble"
      viewBox="0 0 24 22"
      width="15"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4.5 2.4h15a2.6 2.6 0 0 1 2.6 2.6v8.2a2.6 2.6 0 0 1-2.6 2.6H13.2L12 18.6l-1.2-2.8H4.5a2.6 2.6 0 0 1-2.6-2.6V5a2.6 2.6 0 0 1 2.6-2.6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="8.2" cy="9.2" r="1.15" fill="currentColor" />
      <circle cx="12" cy="9.2" r="1.15" fill="currentColor" />
      <circle cx="15.8" cy="9.2" r="1.15" fill="currentColor" />
    </svg>
  );
}

/** 대사창 옆 분기 선택지 — 고른 뒤 확인 연출 */
export function VnDialogueChoices({ choices, onPick }: Props) {
  const resetKey = useMemo(
    () => choices.map((c) => `${c.label}|${c.next ?? ''}`).join(';'),
    [choices],
  );
  const { pickedIndex, resolving, pick } = useVnChoicePick(onPick, resetKey);

  if (!choices.length) return null;

  return (
    <div
      className={`lh-vn-choices${resolving ? ' is-resolving' : ''}`}
      id="lh-vn-choices"
      role="group"
      aria-label="대사 선택"
    >
      {choices.map((ch, i) => (
        <button
          key={`${ch.label}-${ch.next ?? ''}-${i}`}
          type="button"
          className={[
            'lh-vn-choice',
            pickedIndex === i ? 'is-picked' : '',
            resolving && pickedIndex !== i ? 'is-dismissed' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          disabled={resolving}
          aria-pressed={pickedIndex === i}
          onClick={(e) => {
            e.stopPropagation();
            pick(i, ch.next || '');
          }}
        >
          <ChoiceBubbleIcon />
          <span className="lh-vn-choice__label">{ch.label}</span>
        </button>
      ))}
    </div>
  );
}
