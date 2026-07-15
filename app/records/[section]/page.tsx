import { notFound } from 'next/navigation';
import { RecordsPageClient } from '@/components/records/RecordsPageClient';
import { isRecordsSectionId, RECORDS_SECTIONS } from '@/lib/records/sections';

type Props = {
  params: Promise<{ section: string }>;
};

export function generateStaticParams() {
  return RECORDS_SECTIONS.map((section) => ({ section }));
}

export default async function RecordsSectionPage({ params }: Props) {
  const { section } = await params;
  if (!isRecordsSectionId(section)) notFound();
  return <RecordsPageClient section={section} />;
}
