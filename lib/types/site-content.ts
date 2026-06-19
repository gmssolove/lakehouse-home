import type { ImageFrame } from '@/lib/types/character';
import type { WithSecret } from '@/lib/types/secret-content';

export type { LakeAccessScope, SiteAccessSettings, WithSecret } from '@/lib/types/secret-content';
export { DEFAULT_SITE_ACCESS_SETTINGS } from '@/lib/types/secret-content';

export type SiteMain = {
  eyebrow: string;
  latin: string;
  heading: string;
  headingAccent: string;
  desc: string;
};

export type SitePost = WithSecret & {
  id: string;
  title: string;
  body: string;
  date: string;
};

export type TrpgFontPreset = 'cormorant' | 'marcellus' | 'playfair' | 'im-fell' | 'noto-serif' | 'default';

export type TrpgSessionLog = WithSecret & {
  id: string;
  title: string;
  /** 캠페인·시나리오 부제 */
  subtitle?: string;
  date?: string;
  body: string;
  /** HTML 백업 원본 */
  html?: string;
  /** 로그 썸네일 */
  thumbnail?: string;
  thumbnailSpoiler?: boolean;
  summary?: string;
  tags?: string[];
  /** playerProfiles id 목록 — 아바타 행 */
  playerIds?: string[];
};

export type TrpgPlayerProfile = {
  id: string;
  name: string;
  role?: string;
  img?: string;
  bio?: string;
};

export type TrpgRelationship = {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
};

export type TrpgGalleryItem = {
  id: string;
  title?: string;
  img: string;
  caption?: string;
  artist?: string;
};

export type TrpgDiceHighlight = {
  id: string;
  title: string;
  roll?: string;
  result?: string;
  note?: string;
  session?: string;
};

export type TrpgHandout = {
  id: string;
  title: string;
  body?: string;
  img?: string;
  spoiler?: boolean;
};

/** TRPG 시나리오 — 티켓 UI */
export type TrpgScenario = {
  id: string;
  title: string;
  subtitle?: string;
  titleFont?: TrpgFontPreset;
  subtitleFont?: TrpgFontPreset;
  thumbnail?: string;
  /** 1800×650 기준 — ImageFrameEditor */
  thumbnailFrame?: ImageFrame;
  thumbnailFit?: string;
  thumbnailPos?: string;
  /** w. 작가/크리에이터 */
  author?: string;
  kp?: string;
  /** CoC, inSANe 등 */
  system?: string;
  dateStart?: string;
  dateEnd?: string;
  /** HO1 … / GM … / PL … (요약 텍스트) */
  players?: string;
  cleared?: boolean;
  /** 아카이브 소개 */
  summary?: string;
  body?: string;
  /** 탐사자 프로필 */
  playerProfiles?: TrpgPlayerProfile[];
  /** 탐사자 관계 */
  relationships?: TrpgRelationship[];
  /** 애프터·연성 갤러리 */
  gallery?: TrpgGalleryItem[];
  /** 주요 판정·다이스 기록 */
  diceHighlights?: TrpgDiceHighlight[];
  /** 플레이어 핸드아웃 */
  handouts?: TrpgHandout[];
  /** 관계도 메모 / 추가 설명 */
  relationshipNotes?: string;
  /** OC 캐릭터 id (문자열) — 선택 연결 */
  characterIds?: string[];
  logs?: TrpgSessionLog[];
};

export type UniverseCard = {
  id: string;
  name: string;
  sub: string;
  icon: string;
  href: string;
  comingSoon?: boolean;
};

export type GalleryItem = WithSecret & {
  id: string;
  title: string;
  img: string;
  caption?: string;
};

export type GuestEntry = {
  id: string;
  name: string;
  message: string;
  date: string;
  reply?: string;
};

export type BannerItem = {
  id: string;
  title: string;
  img: string;
  href?: string;
  /** 링크 주인 이름 — 호버 툴팁 (예: 로나님) */
  ownerName?: string;
};

export type BgmPlaylistItem = {
  title: string;
  artist: string;
  /** R2 업로드 오디오 URL (권장) */
  fileUrl?: string;
  /** YouTube·외부 URL (선택) */
  url?: string;
};

export type SiteBgm = {
  title: string;
  artist: string;
  /** 1번 곡 — 업로드 파일 URL */
  fileUrl?: string;
  /** 1번 곡 — YouTube/외부 URL (fileUrl 없을 때) */
  url?: string;
  /** 2번째 곡부터 */
  playlist?: BgmPlaylistItem[];
};

export type SiteOcSettings = {
  pvIntroEnabled: boolean;
  pvIntroDurationMs: number;
  autoResumeMainBgm: boolean;
};

export const DEFAULT_SITE_OC_SETTINGS: SiteOcSettings = {
  pvIntroEnabled: true,
  pvIntroDurationMs: 7500,
  autoResumeMainBgm: true,
};

export type SiteUiSettings = {
  clickSoundEnabled: boolean;
  clickSoundPreset: 'thud' | 'wood' | 'felt' | 'damp' | 'muted' | 'custom';
  clickSoundCustom: string;
  customCursorEnabled: boolean;
  cursorPreset: 'ring' | 'dot' | 'shard' | 'cross' | 'custom';
  cursorCustom: string;
  clickRippleEnabled: boolean;
};

export const DEFAULT_SITE_UI_SETTINGS: SiteUiSettings = {
  clickSoundEnabled: true,
  clickSoundPreset: 'thud',
  clickSoundCustom: '',
  customCursorEnabled: true,
  cursorPreset: 'ring',
  cursorCustom: '',
  clickRippleEnabled: true,
};

export const DEFAULT_SITE_MAIN: SiteMain = {
  eyebrow: '메뉴 상세 / MENU DETAILS',
  latin: 'a lake in the mountains — welcome to my space',
  heading: 'lake',
  headingAccent: 'house',
  desc: '',
};

export const DEFAULT_UNIVERSE: UniverseCard[] = [
  {
    id: 'kisaragi',
    name: '키사라기고교',
    sub: '如月高校 — Kisaragi High School',
    icon: '如',
    href: '/kisaragi.html',
  },
  {
    id: 'coming-soon',
    name: 'Coming Soon',
    sub: '새로운 세계관 준비 중',
    icon: '…',
    href: '',
    comingSoon: true,
  },
];

export const DEFAULT_SITE_BGM: SiteBgm = {
  title: 'BGM',
  artist: '',
  url: '',
};

export type ScrapItem = WithSecret & {
  id: string;
  author: string;
  handle?: string;
  avatarUrl?: string;
  body: string;
  imageUrl?: string;
  sourceUrl?: string;
  date: string;
};

export type ReviewCategoryKind = 'anime' | 'movie' | 'drama' | 'book' | 'poetry' | 'food' | 'custom';

export type ReviewCategory = {
  id: string;
  label: string;
  kind: ReviewCategoryKind;
};

export type ReviewItem = WithSecret & {
  id: string;
  title: string;
  categoryId: string;
  /** 1–5 */
  rating: number;
  status?: string;
  tags?: string[];
  coverUrl?: string;
  body?: string;
  author?: string;
  date?: string;
};

export type MusicLyricLine = {
  time: number;
  text: string;
};

export type MusicComment = {
  id: string;
  author: string;
  body: string;
  date: string;
  reply?: string;
};

export type MusicTrack = WithSecret & {
  id: string;
  title: string;
  artist: string;
  fileUrl: string;
  coverUrl?: string;
  lyrics?: string;
  lyricLines?: MusicLyricLine[];
  comments?: MusicComment[];
};

export type MusicPlaylist = WithSecret & {
  id: string;
  title: string;
  description?: string;
  coverUrl?: string;
  trackIds?: string[];
};

export type CharArchiveKind = 'story' | 'rant' | 'impression' | 'novel' | 'other';

export type CharArchiveItem = WithSecret & {
  id: string;
  title: string;
  kind: CharArchiveKind;
  body: string;
  characterIds?: string[];
  coverUrl?: string;
  date: string;
};

export const DEFAULT_REVIEW_CATEGORIES: ReviewCategory[] = [
  { id: 'anime', label: '애니', kind: 'anime' },
  { id: 'movie', label: '영화', kind: 'movie' },
  { id: 'drama', label: '드라마', kind: 'drama' },
  { id: 'book', label: '책', kind: 'book' },
  { id: 'poetry', label: '시집', kind: 'poetry' },
  { id: 'food', label: '음식', kind: 'food' },
];

export type AdminSectionId =
  | 'main'
  | 'notice'
  | 'diary'
  | 'gallery'
  | 'universe'
  | 'trpg'
  | 'guest'
  | 'banner'
  | 'bgm'
  | 'ux'
  | 'oc'
  | 'pair'
  | 'access'
  | 'scrap'
  | 'review'
  | 'music'
  | 'charArchive';

export const ADMIN_SECTIONS: { id: AdminSectionId; label: string; group: string }[] = [
  { id: 'main', label: 'Main', group: '홈' },
  { id: 'notice', label: 'Notice', group: '홈' },
  { id: 'diary', label: 'Records · Diary', group: '기록' },
  { id: 'scrap', label: 'Records · Scrap', group: '기록' },
  { id: 'review', label: 'Records · Review', group: '기록' },
  { id: 'music', label: 'Records · Music', group: '기록' },
  { id: 'charArchive', label: 'Character · Archive', group: '캐릭터' },
  { id: 'gallery', label: 'Gallery', group: '홈' },
  { id: 'universe', label: 'Universe', group: '홈' },
  { id: 'trpg', label: 'TRPG', group: '홈' },
  { id: 'guest', label: 'Guest', group: '홈' },
  { id: 'banner', label: 'Banner', group: '홈' },
  { id: 'bgm', label: 'BGM', group: '사이트' },
  { id: 'access', label: '접근 · 비밀번호', group: '사이트' },
  { id: 'ux', label: 'UX · 효과', group: '사이트' },
  { id: 'oc', label: 'OC', group: '캐릭터' },
  { id: 'pair', label: 'Pair', group: '캐릭터' },
];

export function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
