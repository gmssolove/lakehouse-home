export const RECORDS_SECTIONS = ['diary', 'timeline', 'scrap', 'review', 'music'] as const;

export type RecordsSectionId = (typeof RECORDS_SECTIONS)[number];

export const RECORDS_SECTION_LABELS: Record<RecordsSectionId, { heading: string; sub: string }> = {
  diary: { heading: 'Records', sub: 'Diary · 일기' },
  timeline: { heading: 'Records', sub: 'Timeline · 타임라인' },
  scrap: { heading: 'Records', sub: 'Scrap · 스크랩' },
  review: { heading: 'Records', sub: 'Review · 리뷰' },
  music: { heading: 'Records', sub: 'Music · 플레이리스트' },
};

export function isRecordsSectionId(value: string): value is RecordsSectionId {
  return (RECORDS_SECTIONS as readonly string[]).includes(value);
}
