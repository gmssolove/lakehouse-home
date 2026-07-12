'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isHomeRecordsTabId, type RecordsSectionId } from '@/lib/records/sections';

type Props = {
  section: RecordsSectionId;
};

/** 레거시 /records/* → 홈 인라인 탭으로 리다이렉트 */
export function RecordsPageClient({ section }: Props) {
  const router = useRouter();

  useEffect(() => {
    const tab = isHomeRecordsTabId(section) ? section : 'diary';
    router.replace(`/?p=${tab}`, { scroll: false });
  }, [router, section]);

  return null;
}
