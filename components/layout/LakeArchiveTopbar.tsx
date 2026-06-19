'use client';

import Link from 'next/link';
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
        <Link href="/" replace className="nav-back">
          ← back
        </Link>
      )}
      <div className="nav-title">{title}</div>
      <ul className="nav-links">
        <li className={active === 'oc' ? 'active' : undefined}>
          <Link href="/oc">OC</Link>
        </li>
        <li className={active === 'pair' ? 'active' : undefined}>
          <Link href="/pair">Pair</Link>
        </li>
      </ul>
    </nav>
  );
}
