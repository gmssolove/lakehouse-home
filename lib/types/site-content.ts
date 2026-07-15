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

/** Diary 타래 (작성자만 추가) */
export type DiaryThread = {
  id: string;
  body: string;
  date: string;
  authorName?: string;
  imageUrl?: string;
  /** 이미지 스포일러(블러) */
  imageSpoiler?: boolean;
  likedBy?: string[];
};

export type SitePost = WithSecret & {
  id: string;
  title: string;
  body: string;
  date: string;
  /** @deprecated 날씨 아이콘 — UI에서 제거됨 */
  weather?: string;
  /** @deprecated 기분 아이콘 — UI에서 제거됨 */
  mood?: string;
  /** 첨부 이미지 */
  imageUrl?: string;
  /** 이미지 스포일러(블러) */
  imageSpoiler?: boolean;
  /** 좋아요한 사용자 uid (1인 1회) */
  likedBy?: string[];
  /** 작성자 타래 */
  threads?: DiaryThread[];
  /** 상단 고정 */
  pinned?: boolean;
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
  /** 본문 글자 크기(px) */
  logFontSize?: number;
  /** 본문 줄간격 */
  logLineHeight?: number;
};

export type TrpgPlayerInfoField = {
  key: string;
  value: string;
};

export type TrpgPlayerStat = {
  label: string;
  value: number;
  max?: number;
};

export type TrpgPlayerRelation = {
  id: string;
  /** 연결된 탐사자 id */
  playerId?: string;
  name: string;
  desc?: string;
};

export type TrpgPlayerItem = {
  id: string;
  icon?: string;
  name: string;
  count?: string;
  key?: boolean;
  empty?: boolean;
};

/** 탐사자 표정 또는 버전 이미지 */
export type TrpgPlayerExpressionKind = 'expression' | 'version';

export type TrpgPlayerExpression = {
  id: string;
  label?: string;
  /** 표정(기본) | 버전 — 미설정 시 expression */
  kind?: TrpgPlayerExpressionKind;
  img: string;
  imgFrame?: ImageFrame;
  imgFit?: string;
  imgPos?: string;
};

export type TrpgPlayerProfile = {
  id: string;
  name: string;
  nameEn?: string;
  role?: string;
  /** 프로필 카드 이미지 */
  img?: string;
  imgFrame?: ImageFrame;
  imgFit?: string;
  imgPos?: string;
  /** 상세 스테이지 풀 일러스트 (없으면 카드 이미지 사용) */
  stageImg?: string;
  stageImgFrame?: ImageFrame;
  stageImgFit?: string;
  stageImgPos?: string;
  /** 스테이지 퍼스널 컬러 (HEX) — 배경 비네트에 약하게 스며듦 */
  personalColor?: string;
  /** 대표 한마디 */
  quote?: string;
  /** PV 자막 위치 (스테이지 기준 %, left/top) */
  quotePos?: { x?: number; y?: number };
  /** PV 자막 정렬 */
  quoteAlign?: 'left' | 'center' | 'right';
  /** 표정·버전별 이미지 (기본 img 외) */
  expressions?: TrpgPlayerExpression[];
  bio?: string;
  /** 외관 */
  appearance?: string;
  /** 성격 */
  personality?: string;
  /** 특징 */
  traits?: string;
  /** LIKE */
  likes?: string;
  /** HATE */
  dislikes?: string;
  tags?: string[];
  infoFields?: TrpgPlayerInfoField[];
  stats?: TrpgPlayerStat[];
  relations?: TrpgPlayerRelation[];
  money?: string;
  items?: TrpgPlayerItem[];
  itemNote?: string;
  /** 이 캐릭터를 연기한 플레이어 */
  playerName?: string;
  /** 연결된 OC 캐릭터 id (`/oc?c=`) */
  ocId?: string;
};

export type TrpgRelationship = {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
};

export type TrpgGalleryViewMode = 'slider' | 'scroll';

export type TrpgGalleryItem = {
  id: string;
  title?: string;
  /** 대표(첫) 이미지 — 하위 호환 */
  img: string;
  /** 한 박스에 여러 장. 있으면 img는 보통 imgs[0] */
  imgs?: string[];
  /** 복수 이미지 상세 보기: 화살표(slider) | 세로 스크롤(scroll) */
  viewMode?: TrpgGalleryViewMode;
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
export type TrpgListCategory = {
  id: string;
  label: string;
};

export type TrpgListSettings = {
  /** 상단 필터 탭 (ALL은 UI 고정) */
  categories: TrpgListCategory[];
  /** CSS aspect-ratio 값 — 예: "3 / 4" */
  cardAspect: string;
};

export const DEFAULT_TRPG_LIST_SETTINGS: TrpgListSettings = {
  categories: [
    { id: 'coc', label: 'CoC' },
    { id: 'insane', label: 'inSANe' },
    { id: 'magirogi', label: 'Magirogi' },
  ],
  cardAspect: '16 / 10',
};

export type TrpgScenario = WithSecret & {
  id: string;
  title: string;
  subtitle?: string;
  titleFont?: TrpgFontPreset;
  subtitleFont?: TrpgFontPreset;
  thumbnail?: string;
  /** 카드 표면 — ImageFrameEditor */
  thumbnailFrame?: ImageFrame;
  thumbnailFit?: string;
  thumbnailPos?: string;
  /** 리스트 필터 카테고리 id (`trpg_settings.categories`) */
  categoryId?: string;
  /** 호버 오버레이 제목 (줄바꿈 가능, 비우면 title) */
  cardHoverTitle?: string;
  /** 호버 오버레이 PC 표시명 (비우면 연결 OC/탐사자) */
  cardHoverPcName?: string;
  /** 호버 오버레이 오른쪽 초상 */
  cardHoverImg?: string;
  cardHoverImgFrame?: ImageFrame;
  cardHoverImgFit?: string;
  cardHoverImgPos?: string;
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
  /** 플레이 후기 (Overview 대신 표시) */
  review?: string;
  /** 시나리오 배포 원본 링크 — 세션 바로가기 */
  sessionUrl?: string;
  /** 시나리오 페이지 배경 (CSS background 값 또는 이미지 URL) */
  pageBackground?: string;
  /** 시나리오 전용 BGM */
  pageBgm?: {
    title?: string;
    artist?: string;
    fileUrl?: string;
    url?: string;
  };
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

export type UniverseEntryBgm = {
  title?: string;
  artist?: string;
  fileUrl?: string;
  url?: string;
};

export type UniverseCard = {
  id: string;
  name: string;
  sub: string;
  icon: string;
  href: string;
  comingSoon?: boolean;
  /** 카드 썸네일 */
  img?: string;
  imgFit?: 'cover' | 'contain';
  imgPos?: string;
  /** 펼침 시 하단 액센트 그라데이션 색 (#rrggbb) */
  glowColor?: string;
  /** 펼침 액센트 그라데이션 불투명도 0–100 */
  glowOpacity?: number;
  /** @deprecated glowColor 사용 */
  veilColor?: string;
  /** @deprecated glowOpacity 사용 */
  veilOpacity?: number;
  /** 세계관 입장 시 BGM */
  entryBgm?: UniverseEntryBgm;
};

export type GalleryCommentReply = {
  id: string;
  author: string;
  authorUid?: string;
  body: string;
  date: string;
  likedBy?: string[];
};

export type GalleryComment = {
  id: string;
  author: string;
  authorUid?: string;
  body: string;
  date: string;
  likedBy?: string[];
  replies?: GalleryCommentReply[];
};

export type GalleryItem = WithSecret & {
  id: string;
  /** 빈 문자열이면 그리드 호버에 제목 없음 */
  title: string;
  img: string;
  /** 상세 코멘트 */
  caption?: string;
  date?: string;
  likedBy?: string[];
  comments?: GalleryComment[];
};

/** Records · Quote — 시 / 가사 / 문장 필사 */
export type QuoteCategory = 'poem' | 'lyrics' | 'sentence';

export type QuoteItem = WithSecret & {
  id: string;
  text: string;
  author?: string;
  work?: string;
  /** 시 / 가사 / 문장 */
  category?: QuoteCategory;
  /** 개인 메모 */
  note?: string;
  date?: string;
};

export type GuestReply = {
  id: string;
  authorName: string;
  authorUid?: string;
  isAdmin?: boolean;
  message: string;
  date: string;
  imageUrl?: string;
};

export type GuestEmoticon = {
  trigger: string;
  emoji: string;
};

export type SiteGuestSettings = {
  guideText?: string;
  emoticons?: GuestEmoticon[];
  /** 방명록 답글 표시 닉네임 — 비우면 사이트 닉네임 사용 */
  replyName?: string;
};

export const DEFAULT_SITE_GUEST_SETTINGS: SiteGuestSettings = {
  guideText: '',
  replyName: '',
  emoticons: [
    { trigger: '/최고', emoji: '👍' },
    { trigger: '/하트', emoji: '❤️' },
  ],
};

export type GuestEntry = {
  id: string;
  name: string;
  message: string;
  date: string;
  authorUid?: string;
  imageUrl?: string;
  videoUrl?: string;
  /** 관리자만 열람 (비밀번호 없음) */
  secret?: boolean;
  replies?: GuestReply[];
  /** @deprecated replies 사용 */
  reply?: string;
  /** @deprecated replies 사용 */
  replyDate?: string;
};

export type BannerItem = {
  id: string;
  title: string;
  img: string;
  href?: string;
  ownerName?: string;
  divider?: boolean;
  dividerIcon?: string;
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

/** OC/페어 탭 코너 Tip·TMI 알림 — 항목마다 kind 지정 */
export type SiteTipToastItem = {
  id: string;
  kind: 'tip' | 'tmi';
  text: string;
};

export type SiteTipToastSettings = {
  enabled: boolean;
  items: SiteTipToastItem[];
};

export const DEFAULT_SITE_TIP_TOAST: SiteTipToastSettings = {
  enabled: false,
  items: [],
};

export type SiteOcSettings = {
  pvIntroEnabled: boolean;
  pvIntroDurationMs: number;
  autoResumeMainBgm: boolean;
  /** OC 아카이브 탭 진입 시 코너 알림 */
  tipToastOc: SiteTipToastSettings;
  /** Pair 아카이브 탭 진입 시 코너 알림 */
  tipToastPair: SiteTipToastSettings;
};

export const DEFAULT_SITE_OC_SETTINGS: SiteOcSettings = {
  pvIntroEnabled: true,
  pvIntroDurationMs: 7500,
  autoResumeMainBgm: true,
  tipToastOc: { ...DEFAULT_SITE_TIP_TOAST },
  tipToastPair: { ...DEFAULT_SITE_TIP_TOAST },
};

export type ClickerButton = {
  id: string;
  /** 키보드 바인딩 (예: z, 1, a) */
  key: string;
  label?: string;
  img?: string;
  sound?: string;
  /** ImageFrameEditor 미리보기와 동일 (드래그·휠) */
  imgFrame?: ImageFrame;
  /**
   * 투명 PNG 컷아웃 모드.
   * 사각 박스 대신 알파 실루엣 테두리 + 박스 밖 살짝 튀어나옴.
   */
  cutout?: boolean;
};

export type ClickerSoundPreset =
  | 'bell'
  | 'harp'
  | 'pluck'
  | 'wood'
  | 'glass'
  | 'pop'
  | 'type'
  | 'keycap'
  | 'linear'
  | 'tactile'
  | 'chime'
  | 'soft'
  | 'mute';

export type SiteUiSettings = {
  clickSoundEnabled: boolean;
  clickSoundPreset: 'thud' | 'wood' | 'felt' | 'damp' | 'muted' | 'custom';
  clickSoundCustom: string;
  customCursorEnabled: boolean;
  cursorPreset:
    | 'ring'
    | 'dot'
    | 'shard'
    | 'cross'
    | 'classic'
    | 'classicHand'
    | 'classicCross'
    | 'classicMove'
    | 'classicWait'
    | 'custom';
  cursorCustom: string;
  clickRippleEnabled: boolean;
  /** 메인 홈 클리커 위젯 */
  clickerEnabled: boolean;
  clickerHint: string;
  clickerDefaultVolume: number;
  clickerTitle: string;
  clickerSoundPreset: ClickerSoundPreset;
  /** 공통 커스텀 사운드 (버튼별 sound 없을 때) */
  clickerSoundCustom: string;
  clickerButtons: ClickerButton[];
  /** @deprecated clickerButtons 사용 */
  clickerKeys?: Partial<Record<'z' | 'x' | 'c' | 'v', { img?: string; sound?: string; label?: string }>>;
};

export const DEFAULT_CLICKER_BUTTONS: ClickerButton[] = [
  { id: 'ck-z', key: 'z' },
  { id: 'ck-x', key: 'x' },
  { id: 'ck-c', key: 'c' },
  { id: 'ck-v', key: 'v' },
];

export const DEFAULT_SITE_UI_SETTINGS: SiteUiSettings = {
  clickSoundEnabled: true,
  clickSoundPreset: 'thud',
  clickSoundCustom: '',
  customCursorEnabled: true,
  cursorPreset: 'ring',
  cursorCustom: '',
  clickRippleEnabled: true,
  clickerEnabled: true,
  clickerHint: 'z · x · c · v',
  clickerDefaultVolume: 0.5,
  clickerTitle: 'Clicker',
  clickerSoundPreset: 'keycap',
  clickerSoundCustom: '',
  clickerButtons: DEFAULT_CLICKER_BUTTONS.map((b) => ({ ...b })),
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
    href: '/verse/gate',
  },
];

export const DEFAULT_SITE_BGM: SiteBgm = {
  title: 'BGM',
  artist: '',
  url: '',
};

export type ScrapCategory = {
  id: string;
  label: string;
};

export const DEFAULT_SCRAP_CATEGORIES: ScrapCategory[] = [
  { id: 'all', label: '전체' },
  { id: 'dream', label: '드림-썰' },
  { id: 'general', label: '북마크-일반' },
  { id: 'otaku', label: '북마크-오타쿠' },
  { id: 'ref', label: '북마크-자료' },
  { id: 'other', label: '북마크-기타' },
];

/** Scrap 카드 타입 (URL 자동 분기) */
export type ScrapKind = 'twitter' | 'youtube' | 'link' | 'memo';

export type ScrapItem = WithSecret & {
  id: string;
  /** @deprecated 단일 태그 — tags 우선 */
  tag?: string;
  /** 카드 상단 멀티 태그 */
  tags?: string[];
  author: string;
  handle?: string;
  avatarUrl?: string;
  body: string;
  imageUrl?: string;
  sourceUrl?: string;
  date: string;
  categoryId?: string;
  kind?: ScrapKind;
  /** Twitter oEmbed HTML (blockquote) */
  embedHtml?: string;
  mediaKind?: 'image' | 'video';
  youtubeId?: string;
  youtubeTitle?: string;
  youtubeChannel?: string;
  /** oEmbed thumbnail_url */
  youtubeThumbUrl?: string;
  /** oEmbed iframe html */
  youtubeEmbedHtml?: string;
  /** Data API — "14:15" */
  youtubeDuration?: string;
  /** Data API — "05.22" */
  youtubeUploadDate?: string;
  replyCount?: number;
  likeLabel?: string;
  quotedBody?: string;
  quotedAuthor?: string;
  quotedHandle?: string;
  quotedAvatarUrl?: string;
  quotedImageUrl?: string;
};

export type TimelineReply = {
  id: string;
  authorName: string;
  authorUid?: string;
  body: string;
  date: string;
  imageUrl?: string;
};

export type TimelinePost = {
  id: string;
  authorName: string;
  authorUid?: string;
  authorAvatarUrl?: string;
  body: string;
  tags?: string[];
  imageUrl?: string;
  videoUrl?: string;
  date: string;
  replies?: TimelineReply[];
  reactions?: Record<string, number>;
  /** uid → like | heart (1인 1회) */
  userReactions?: Record<string, 'like' | 'heart'>;
  secret?: boolean;
  /** 상단 고정 공지 */
  pinned?: boolean;
};

export type ReviewCategoryKind =
  | 'anime'
  | 'movie'
  | 'drama'
  | 'book'
  | 'manga'
  | 'video'
  | 'game'
  | 'poetry'
  | 'food'
  | 'custom';

export type ReviewCategory = {
  id: string;
  label: string;
  kind: ReviewCategoryKind;
};

export type ReviewItem = WithSecret & {
  id: string;
  title: string;
  categoryId: string;
  /** 0.5–5 (0.5 단위) */
  rating: number;
  /** watching | done | oneshot | 자유 문자열 */
  status?: string;
  tags?: string[];
  /** 장르 표시 (영화·드라마 등) */
  genres?: string[];
  coverUrl?: string;
  body?: string;
  /** 상세 상단 짧은 한줄 코멘트 */
  highlight?: string;
  /** 제목 색상 (#hex) */
  titleColor?: string;
  /** 감독·제작 등 크레딧 한 줄 */
  author?: string;
  /** 작품 연도 */
  year?: string;
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
  { id: 'movie', label: '영화', kind: 'movie' },
  { id: 'drama', label: '드라마', kind: 'drama' },
  { id: 'anime', label: '애니', kind: 'anime' },
  { id: 'book', label: '도서', kind: 'book' },
  { id: 'manga', label: '만화', kind: 'manga' },
  { id: 'video', label: '영상', kind: 'video' },
  { id: 'game', label: '게임', kind: 'game' },
  { id: 'poetry', label: '시집', kind: 'poetry' },
];

export type AdminSectionId =
  | 'main'
  | 'notice'
  | 'diary'
  | 'gallery'
  | 'quote'
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

export type AdminNavGroup = 'content' | 'site' | 'ops';

export type AdminNavIcon =
  | 'diary'
  | 'scrap'
  | 'music'
  | 'trpg'
  | 'universe'
  | 'archive'
  | 'gallery'
  | 'quote'
  | 'oc'
  | 'pair'
  | 'review'
  | 'main'
  | 'banner'
  | 'bgm'
  | 'ux'
  | 'notice'
  | 'guest'
  | 'access';

export const ADMIN_NAV_GROUPS: { key: AdminNavGroup; label: string }[] = [
  { key: 'content', label: '콘텐츠' },
  { key: 'site', label: '사이트 설정' },
  { key: 'ops', label: '운영' },
];

export const ADMIN_SECTIONS: {
  id: AdminSectionId;
  label: string;
  group: AdminNavGroup;
  icon: AdminNavIcon;
}[] = [
  { id: 'diary', label: 'Records · Diary', group: 'content', icon: 'diary' },
  { id: 'scrap', label: 'Records · Scrap', group: 'content', icon: 'scrap' },
  { id: 'review', label: 'Records · Review', group: 'content', icon: 'review' },
  { id: 'gallery', label: 'Records · Gallery', group: 'content', icon: 'gallery' },
  { id: 'quote', label: 'Records · Quote', group: 'content', icon: 'quote' },
  { id: 'music', label: 'Records · Music', group: 'content', icon: 'music' },
  { id: 'trpg', label: 'TRPG', group: 'content', icon: 'trpg' },
  { id: 'universe', label: 'Universe', group: 'content', icon: 'universe' },
  { id: 'charArchive', label: 'Character · Archive', group: 'content', icon: 'archive' },
  { id: 'oc', label: 'OC', group: 'content', icon: 'oc' },
  { id: 'pair', label: 'Pair', group: 'content', icon: 'pair' },
  { id: 'main', label: 'Home', group: 'site', icon: 'main' },
  { id: 'banner', label: 'Banner', group: 'site', icon: 'banner' },
  { id: 'bgm', label: 'BGM', group: 'site', icon: 'bgm' },
  { id: 'ux', label: 'UX · 효과', group: 'site', icon: 'ux' },
  { id: 'notice', label: 'Notice', group: 'ops', icon: 'notice' },
  { id: 'guest', label: 'Guest', group: 'ops', icon: 'guest' },
  { id: 'access', label: '접근 · 비밀번호', group: 'ops', icon: 'access' },
];

export function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
