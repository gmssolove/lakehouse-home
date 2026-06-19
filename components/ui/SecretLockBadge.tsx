type Props = {
  className?: string;
  /** 제목 옆 등 — 아이콘만 */
  compact?: boolean;
};

export function SecretLockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M4.5 7V5a3.5 3.5 0 1 1 7 0v2h.5A1.5 1.5 0 0 1 13 8.5v6A1.5 1.5 0 0 1 11.5 16h-7A1.5 1.5 0 0 1 3 14.5v-6A1.5 1.5 0 0 1 4.5 7Zm1.5 0h4V5a2 2 0 1 0-4 0v2Z"
      />
    </svg>
  );
}

export function SecretLockBadge({ className, compact }: Props) {
  return (
    <span
      className={`lh-secret-badge${compact ? ' lh-secret-badge--compact' : ''}${className ? ` ${className}` : ''}`}
      title="비밀글"
    >
      <SecretLockIcon className="lh-secret-badge__icon" />
      {!compact ? <span className="lh-secret-badge__label">비밀글</span> : null}
    </span>
  );
}
