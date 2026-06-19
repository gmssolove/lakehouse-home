'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

type Props = {
  back?: ReactNode;
  actions?: ReactNode;
};

export function TrpgTopbar({ back, actions }: Props) {
  return (
    <nav className="oc-topbar lh-archive-topbar trpg-topbar">
      {back ?? (
        <Link href="/?p=trpg" replace className="nav-back">
          ← back
        </Link>
      )}
      <div className="nav-title trpg-topbar__spacer" aria-hidden="true" />
      {actions ? <div className="trpg-topbar__actions">{actions}</div> : null}
    </nav>
  );
}
