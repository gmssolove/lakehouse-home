import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
  inline?: boolean;
  as?: 'p' | 'span';
};

/** 토글/체크 옆 설명 — 11px, #7d7668 */
export function FieldLabel({ children, className = '', inline = false, as }: Props) {
  const Tag = as ?? (inline ? 'span' : 'p');
  return (
    <Tag className={`lh-field-label${inline ? ' lh-field-label--inline' : ''}${className ? ` ${className}` : ''}`}>
      {children}
    </Tag>
  );
}
