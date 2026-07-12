'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

type Props = {
  title?: string;
  back?: ReactNode;
  actions?: ReactNode;
};

export function TrpgTopbar({ title = 'SCENARIO', back, actions }: Props) {
  return (
    <nav className="oc-topbar lh-archive-topbar trpg-topbar">
      {back ?? (
        <Link href="/?p=trpg" replace className="nav-back">
          ← back
        </Link>
      )}
      <div className="nav-title">{title}</div>
      {actions ? <div className="trpg-topbar__actions">{actions}</div> : null}
    </nav>
  );
}
