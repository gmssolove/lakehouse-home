'use client';

import Link from 'next/link';
import { HOME_RECORDS_LABELS, HOME_RECORDS_TABS } from '@/lib/records/sections';

/** 레거시 탑바 — /records 리다이렉트 전 짧은 깜빡임용 */
export function RecordsSectionTopbar() {
  return (
    <nav className="oc-topbar lh-archive-topbar lh-records-topbar">
      <Link href="/" replace className="nav-back">
        ← back
      </Link>
      <div className="nav-title">Records</div>
      <ul className="nav-links">
        {HOME_RECORDS_TABS.map((id) => (
          <li key={id}>
            <Link href={`/?p=${id}`}>{HOME_RECORDS_LABELS[id]}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
