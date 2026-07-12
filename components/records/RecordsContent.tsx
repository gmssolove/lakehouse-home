'use client';

import type { RecordsSectionId } from '@/lib/records/sections';
import { RecordsDiaryPanel } from '@/components/records/RecordsDiaryPanel';
import { ScrapTab } from '@/components/records/ScrapTab';
import { ReviewTab } from '@/components/records/ReviewTab';
import { GalleryTab } from '@/components/records/GalleryTab';
import { QuoteTab } from '@/components/records/QuoteTab';
import { MusicArchiveTab } from '@/components/records/MusicArchiveTab';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import type { User } from 'firebase/auth';

type Props = {
  section: RecordsSectionId;
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
};

/** 레거시 /records 렌더 — 보통 리다이렉트되므로 거의 쓰이지 않음 */
export function RecordsContent({ section, user, isAdmin, onOpenAuth }: Props) {
  const site = useSiteContent();

  if (section === 'diary') {
    return (
      <RecordsDiaryPanel
        items={site.diary}
        user={user}
        isAdmin={isAdmin}
        onOpenAuth={onOpenAuth}
        onSave={site.saveDiary}
      />
    );
  }
  if (section === 'scrap') return <ScrapTab user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} />;
  if (section === 'review') {
    return <ReviewTab user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} active />;
  }
  if (section === 'gallery') return <GalleryTab user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} />;
  if (section === 'quote') return <QuoteTab user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} />;
  if (section === 'music') {
    return <MusicArchiveTab user={user} isAdmin={isAdmin} onOpenAuth={onOpenAuth} />;
  }
  return null;
}
