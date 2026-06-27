'use client';

import Link from 'next/link';
import { RECORDS_SECTIONS, RECORDS_SECTION_LABELS, type RecordsSectionId } from '@/lib/records/sections';

const NAV_LABELS: Record<RecordsSectionId, string> = {
  diary: 'Diary',
  timeline: 'Timeline',
  scrap: 'Scrap',
  review: 'Review',
  music: 'Music',
};

type Props = {
  section: RecordsSectionId;
};

export function RecordsSectionTopbar({ section }: Props) {
  const meta = RECORDS_SECTION_LABELS[section];

  return (
    <nav className="oc-topbar lh-archive-topbar lh-records-topbar">
      <Link href="/" replace className="nav-back">
        ← back
      </Link>
      <div className="nav-title">{meta.heading}</div>
      <ul className="nav-links">
        {RECORDS_SECTIONS.map((id) => (
          <li key={id} className={section === id ? 'active' : undefined}>
            <Link href={`/records/${id}`}>{NAV_LABELS[id]}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
