import { notFound } from 'next/navigation';
import { RecordsPageClient } from '@/components/records/RecordsPageClient';
import { isRecordsSectionId } from '@/lib/records/sections';

type Props = {
  params: Promise<{ section: string }>;
};

export default async function RecordsSectionPage({ params }: Props) {
  const { section } = await params;
  if (!isRecordsSectionId(section)) notFound();
  return <RecordsPageClient section={section} />;
}
