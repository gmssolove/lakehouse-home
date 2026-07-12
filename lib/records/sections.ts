/** 홈에 인라인으로 뜨는 Records 탭 (별도 /records 페이지 없음) */
export const HOME_RECORDS_TABS = ['diary', 'scrap', 'review', 'gallery', 'quote'] as const;

export type HomeRecordsTabId = (typeof HOME_RECORDS_TABS)[number];

export const HOME_RECORDS_LABELS: Record<HomeRecordsTabId, string> = {
  diary: 'Diary',
  scrap: 'Scrap',
  review: 'Review',
  gallery: 'Gallery',
  quote: 'Quote',
};

/** @deprecated 레거시 /records 라우트용 — 홈 인라인으로 이전됨 */
export const RECORDS_SECTIONS = ['diary', 'scrap', 'review', 'gallery', 'quote', 'music'] as const;

export type RecordsSectionId = (typeof RECORDS_SECTIONS)[number];

export const RECORDS_SECTION_LABELS: Record<RecordsSectionId, { heading: string; sub: string }> = {
  diary: { heading: 'Records', sub: 'Diary · 일기' },
  scrap: { heading: 'Records', sub: 'Scrap · 스크랩' },
  review: { heading: 'Records', sub: 'Review · 리뷰' },
  gallery: { heading: 'Records', sub: 'Gallery · 갤러리' },
  quote: { heading: 'Records', sub: 'Quote · 필사' },
  music: { heading: 'Records', sub: 'Music · 플레이리스트' },
};

export function isRecordsSectionId(value: string): value is RecordsSectionId {
  return (RECORDS_SECTIONS as readonly string[]).includes(value);
}

export function isHomeRecordsTabId(value: string): value is HomeRecordsTabId {
  return (HOME_RECORDS_TABS as readonly string[]).includes(value);
}
