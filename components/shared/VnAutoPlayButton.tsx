'use client';

type Props = {
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
};

/** 대사창 자동 재생 토글 — X 버튼 왼쪽 */
export function VnAutoPlayButton({ on, disabled, onToggle }: Props) {
  return (
    <button
      type="button"
      className={`lh-vn-auto${on ? ' is-on' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={on}
      aria-label={on ? '자동 재생 끄기' : '자동 재생 켜기'}
      title={on ? '자동 재생 ON' : '자동 재생 OFF'}
      disabled={disabled}
    >
      AUTO
    </button>
  );
}
