/** Client + server shared site-section limits (no Node/CF APIs) */

export const SITE_SECTION_IDS = [
  'main',
  'notices',
  'diary',
  'gallery',
  'universe',
  'trpg',
  'trpg_settings',
  'guests',
  'banners',
  'bgm',
  'oc_settings',
  'ui_settings',
  'access_settings',
  'scrap',
  'scrap_categories',
  'timeline',
  'quotes',
  'guest_settings',
  'review_categories',
  'reviews',
  'music_tracks',
  'music_playlists',
  'char_archive',
] as const;

export type SiteSectionId = (typeof SITE_SECTION_IDS)[number];

export function isSiteSectionId(v: string): v is SiteSectionId {
  return (SITE_SECTION_IDS as readonly string[]).includes(v);
}

/** 목록 섹션 기본 limit */
export const SITE_SECTION_DEFAULT_LIMIT: Partial<Record<SiteSectionId, number>> = {
  notices: 40,
  diary: 40,
  gallery: 40,
  scrap: 30,
  reviews: 40,
  quotes: 40,
  timeline: 40,
  trpg: 20,
  music_tracks: 80,
  char_archive: 40,
  /* guests: limit 금지 — 방명록 저장이 전체 배열을 덮어씀 */
  banners: 40,
  universe: 40,
};

/** Cloudflare Cache API / CDN TTL (초) — 60~300 */
export const SITE_SECTION_CACHE_TTL_SEC = 120;
