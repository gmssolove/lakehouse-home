export type SiteMain = {
  eyebrow: string;
  latin: string;
  heading: string;
  headingAccent: string;
  desc: string;
};

export type SitePost = {
  id: string;
  title: string;
  body: string;
  date: string;
};

export type UniverseCard = {
  id: string;
  name: string;
  sub: string;
  icon: string;
  href: string;
  comingSoon?: boolean;
};

export type GalleryItem = {
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
  url: string;
};

export type SiteBgm = {
  title: string;
  artist: string;
  url: string;
  /** 비어 있으면 url 단일 곡으로 재생 */
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
  | 'pair';

export const ADMIN_SECTIONS: { id: AdminSectionId; label: string; group: string }[] = [
  { id: 'main', label: 'Main', group: '홈' },
  { id: 'notice', label: 'Notice', group: '홈' },
  { id: 'diary', label: 'Diary', group: '홈' },
  { id: 'gallery', label: 'Gallery', group: '홈' },
  { id: 'universe', label: 'Universe', group: '홈' },
  { id: 'trpg', label: 'TRPG', group: '홈' },
  { id: 'guest', label: 'Guest', group: '홈' },
  { id: 'banner', label: 'Banner', group: '홈' },
  { id: 'bgm', label: 'BGM', group: '사이트' },
  { id: 'ux', label: 'UX · 효과', group: '사이트' },
  { id: 'oc', label: 'OC', group: '캐릭터' },
  { id: 'pair', label: 'Pair', group: '캐릭터' },
];

export function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
