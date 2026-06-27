'use client';

import type { ReactNode } from 'react';

type Props = {
  title?: string;
  children: ReactNode;
  className?: string;
  dark?: boolean;
};

export function NeoBox({ title, children, className, dark }: Props) {
  return (
    <section className={['neo-box', dark ? 'neo-box--dark' : '', className].filter(Boolean).join(' ')}>
      {title ? <h2 className="neo-box__title">{title}</h2> : null}
      <div className="neo-box__body">{children}</div>
    </section>
  );
}
