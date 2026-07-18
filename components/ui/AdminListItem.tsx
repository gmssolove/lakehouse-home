'use client';

import type { ReactNode } from 'react';

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  children?: ReactNode;
};

/** Admin 좌측 리스트 항목 통일 */
export function AdminListItem({
  title,
  subtitle,
  selected = false,
  onClick,
  className = '',
  children,
}: Props) {
  return (
    <button
      type="button"
      className={`lh-admin-list-item${selected ? ' is-selected' : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
    >
      <span className="lh-admin-list-item__title">{title}</span>
      {subtitle ? <span className="lh-admin-list-item__sub">{subtitle}</span> : null}
      {children}
    </button>
  );
}
