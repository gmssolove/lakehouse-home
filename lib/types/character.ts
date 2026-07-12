export type GalleryItem = { src: string; credit?: string };

export type ProfileField = { k: string; v: string };

export type StoryLog = {
  id: string;
  title: string;
  date?: string;
  body: string;
};

export type CharacterRelation = {
  id: string;
  name: string;
  relation: string;
  note?: string;
};

export type ThemeSong = {
  title?: string;
  artist?: string;
  youtubeId?: string;
  fileData?: string;
};

export type DialogueChoice = { label: string; next: string };

/** VN 대사 시 캐릭터 일러스트 연출 */
export type DialogueMotion = 'bounce' | 'shake';

export type DialogueNode = {
  id: string;
  speaker?: string;
  text: string;
  expression?: string;
  /** bounce: 뽀잉 / shake: 부들부들 */
  motion?: DialogueMotion | '';
  choices?: DialogueChoice[];
};

export type ImageFrame = {
  scale?: number;
  x?: number;
  y?: number;
};

export type AuVersion = {
  label?: string;
  img?: string;
  imgFit?: string;
  imgPos?: string;
  imgFrame?: ImageFrame;
};

export type OcCharacter = {
  id: number | string;
  name: string;
  nameSub?: string;
  role?: string;
  category?: string;
  subcat?: string;
  faction?: string;
  stars?: number;
  tag?: string;
  img?: string;
  imgFit?: string;
  imgPos?: string;
  imgFrame?: ImageFrame;
  desc?: string;
  profile?: ProfileField[];
  story?: string;
  gallery?: (string | GalleryItem)[];
  novel?: { title?: string; preview?: string }[];
  /** PV 인트로 전용 대사 (프로필 소개·VN 대화와 분리) */
  pvIntroLines?: { text?: string }[];
  /** @deprecated VN 대화는 dialogue 사용. 구 데이터 호환용 */
  vnLines?: { speaker?: string; text?: string }[];
  theme?: ThemeSong;
  auVersions?: AuVersion[];
  special?: string;
  hobby?: string;
  keywords?: string[];
  likes?: string[];
  hates?: string[];
  items?: string[];
  stats?: ProfileField[];
  dialogue?: DialogueNode[];
  dialogueStart?: string;
  accentColor?: string;
  accentSoft?: string;
  panelColor?: string;
  /** 퍼스널 컬러 HEX — 입력 시 테마 자동 유도 */
  personalColor?: string;
  /** 스테이지 퍼스널 비네트 세기 0~100 (기본 16) */
  personalVignette?: number;
  /** 퍼스널 컬러 선택 시 패널·메뉴 배경까지 자동 유도 (미설정 = true) */
  themeAutoBackground?: boolean;
  /** 캐릭터 영역 테두리·구분선 */
  borderColor?: string;
  /** VN 대사창·선택지 포인트 */
  vnColor?: string;
  /** 왼쪽 정보 패널 박스 배경 */
  menuColor?: string;
  /** null/undefined = 사이트 기본값 따름 */
  pvIntroEnabled?: boolean | null;
  appearance?: string;
  storyLogs?: StoryLog[];
  relationships?: CharacterRelation[];
};

export type PairChemistry = {
  label: string;
  value: number;
};

export type PairGalleryItem = {
  id: string;
  src: string;
  title?: string;
  credit?: string;
};

export type PairItem = {
  id: string;
  chars: [string, string];
  img?: string;
  imgFit?: string;
  imgPos?: string;
  imgFrame?: ImageFrame;
  charImgs?: [string, string];
  charSubs?: [string, string];
  charImgFit?: [string, string];
  charImgPos?: [string, string];
  relation?: string;
  pairTitle?: string;
  pairSub?: string;
  desc?: string;
  keywords?: string[];
  story?: string;
  color?: string;
  /** D-Day 기준일 (YYYY-MM-DD) */
  dday?: string;
  chemistry?: PairChemistry[];
  /** 납작캐해 본문 */
  flatLore?: string;
  flatLoreKeywords?: string[];
  gallery?: PairGalleryItem[];
};

export const DEFAULT_OC: OcCharacter[] = [];

export { DEFAULT_CATEGORIES } from '@/lib/oc/categories';

export const DEFAULT_PAIRS: PairItem[] = [];

export const ADMIN_USERNAME = 'gmssolove';
export const ADMIN_EMAIL = 'gmssolove@naver.com';
