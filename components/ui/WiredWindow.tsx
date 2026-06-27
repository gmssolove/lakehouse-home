'use client';

import type { CSSProperties, ReactNode } from 'react';

type Props = {
  title: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function WiredWindow({ title, children, className, style }: Props) {
  return (
    <div className={['lh-wired-win', className].filter(Boolean).join(' ')} style={style}>
      <div className="lh-wired-win__titlebar">
        <span className="lh-wired-win__title">{title}</span>
        <span className="lh-wired-win__controls" aria-hidden="true">
          <span>_</span>
          <span>□</span>
          <span>×</span>
        </span>
      </div>
      <div className="lh-wired-win__body lh-scroll">{children}</div>
    </div>
  );
}
