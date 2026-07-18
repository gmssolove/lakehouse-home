'use client';

import type { ReactNode } from 'react';

type Props = {
  title: string;
  active: 'oc' | 'pair';
  back?: ReactNode;
};

export function LakeArchiveTopbar({ title, active, back }: Props) {
  return (
    <nav className="oc-topbar lh-archive-topbar">
      {back ?? (
        // plain <a> — Next <Link> soft-nav can desync URL vs page on OpenNext/CF
        <a href="/" className="nav-back">
          ← back
        </a>
      )}
      <div className="nav-title">{title}</div>
      <ul className="nav-links">
        <li className={active === 'oc' ? 'active' : undefined}>
          <a href="/oc">OC</a>
        </li>
        <li className={active === 'pair' ? 'active' : undefined}>
          <a href="/pair">Pair</a>
        </li>
      </ul>
    </nav>
  );
}
