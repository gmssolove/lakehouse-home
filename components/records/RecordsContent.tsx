'use client';

import { useSiteContent } from '@/lib/hooks/useSiteContent';
import type { RecordsSectionId } from '@/lib/records/sections';
import { RECORDS_SECTION_LABELS } from '@/lib/records/sections';
import { RecordsDiaryPanel } from '@/components/records/RecordsDiaryPanel';
import { TimelineTab } from '@/components/records/TimelineTab';
import { ScrapTab } from '@/components/records/ScrapTab';
import { ReviewTab } from '@/components/records/ReviewTab';
import { MusicArchiveTab } from '@/components/records/MusicArchiveTab';
import type { User } from 'firebase/auth';

type Props = {
  section: RecordsSectionId;
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
};

export function RecordsContent({ section, user, isAdmin, onOpenAuth }: Props) {
  const site = useSiteContent();
  const meta = RECORDS_SECTION_LABELS[section];

  return (
    <>
      <header className="records-section-head">
        <div className="page-heading">{meta.heading}</div>
        <div className="page-sub">{meta.sub}</div>
      </header>

      {section === 'diary' ? (
        <RecordsDiaryPanel
          items={site.diary}
          user={user}
          isAdmin={isAdmin}
          onOpenAuth={onOpenAuth}
          onSave={site.saveDiary}
          empty="— 준비 중입니다 —"
        />
      ) : null}
      {section === 'timeline' ? (
        <TimelineTab user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} />
      ) : null}
      {section === 'scrap' ? <ScrapTab user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} /> : null}
      {section === 'review' ? (
        <ReviewTab user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} onSave={site.saveReviews} />
      ) : null}
      {section === 'music' ? <MusicArchiveTab user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} /> : null}
    </>
  );
}
