import type { DialogueFx, DialogueMotion } from '@/lib/vn/motions';

export type { DialogueFx, DialogueMotion };

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

/** dialogue: 대사창 옆 분기 / action: 화면 중앙 행동 선택 */
export type DialogueChoiceMode = 'dialogue' | 'action';

export type DialogueNode = {
  id: string;
  speaker?: string;
  text: string;
  /** 장소명 — 대사창 안 표시. 바뀔 때만 등장 연출 */
  location?: string;
  expression?: string;
  /** 대사 재생 시 음성 (R2 URL / data URL). BGM·테마곡과 무관 */
  voice?: string;
  /** 몸 움직임 — lib/vn/motions.ts */
  motion?: DialogueMotion | '';
  /** 머리 위 기호 효과 (?, !, ♥ …) — 움직임과 별개 */
  fx?: DialogueFx | '';
  /** 선택지 없을 때 이어질 대사 ID (비우면 다음 순서 / 종료) */
  next?: string;
  /** 선택지 표시 방식 (기본: dialogue) */
  choiceMode?: DialogueChoiceMode;
  choices?: DialogueChoice[];
};

export type ImageFrame = {
  scale?: number;
  x?: number;
  y?: number;
  /** 하단 잘림 페이드 블러 높이 0~100 (뷰포트 %) */
  bottomBlur?: number;
};

/** 상세 스테이지 위 플로팅 대사 (탐사자 PV / OC PV 느낌) */
export type OcFloatingQuote = {
  id: string;
  text: string;
  /** 스테이지 가로 % (기본 50) */
  x?: number;
  /** 스테이지 세로 % (기본 72) */
  y?: number;
  /** 글자 배율 0.55~2.2 (기본 1) */
  scale?: number;
  align?: 'left' | 'center' | 'right';
};

/** 페어 대표 대사 — 캐릭터에 앵커 (프리셋 슬롯) */
export type PairQuoteSlot = 'face' | 'chest' | 'waist';

export type PairFloatingQuote = {
  id: string;
  text: string;
  side: 'A' | 'B';
  /** 캐릭터 기준 고정 자리 (기본 chest) */
  slot?: PairQuoteSlot;
  /** 글자 배율 0.7~1.6 (기본 1) */
  scale?: number;
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
  /** 상세(정보) 스테이지 메인 일러 위치·크기 — 「위치」탭에서 조절 (카드용 imgFrame과 별개) */
  detailLayout?: ImageFrame;
  /** 상세 뒤 고스트 일러 위치·크기 (드래그/휠) — OC는 1장 */
  ghostLayout?: ImageFrame;
  /** 고스트 전용 이미지 (미설정이면 메인/표시 이미지) */
  ghostImg?: string;
  /** 고스트 표시 여부 (미설정 = true, 관리자만 토글) */
  ghostEnabled?: boolean;
  /** @deprecated ghostLayout 사용. 구 좌·우 2장 데이터 호환 */
  ghostLayouts?: [ImageFrame, ImageFrame];
  desc?: string;
  profile?: ProfileField[];
  story?: string;
  gallery?: (string | GalleryItem)[];
  novel?: { title?: string; preview?: string }[];
  /** PV 인트로 전용 대사 (프로필 소개·VN 대화와 분리) */
  pvIntroLines?: { text?: string }[];
  /**
   * 상세 스테이지 플로팅 대사 (무제한).
   * 탐사자 PV 스타일 — 위치·크기 조절 가능.
   */
  floatingQuotes?: OcFloatingQuote[];
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
  /** 메인 포트레이트 터치 반응 영역 */
  touchZones?: TouchZone[];
  touchHoverStyle?: TouchHoverStyle;
  /**
   * 터치 반응 모드(ON).
   * true면 영역 터치·터치 대사. false면 일러스트 클릭 시 기존 VN 대사창.
   */
  touchEnabled?: boolean;
  /**
   * @deprecated touchEnabled 사용.
   * 예전 「대사 숨김」값 — true였으면 터치 모드로 취급.
   */
  touchReactionOnly?: boolean;
  touchSpeaker?: string;
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

/** A↔B 호칭 */
export type PairHonorifics = {
  aToB?: string;
  bToA?: string;
};

/** 페어 슬롯별 캐릭터 메모(기본정보) */
export type PairCharNote = {
  role?: string;
  /** 한마디(말풍선) wr_2 */
  note?: string;
  /** 캐릭터 서술(중앙 반투명 박스) wr_story — HTML 허용 */
  story?: string;
  /** 프로필 링크 wr_1 */
  profileLink?: string;
  /** 헤드샷(폴라로이드) 출처 wr_5 */
  headCredit?: string;
  /** 전신 출처 wr_6 */
  bodyCredit?: string;
};

/** 페어 대사 티키타카 한 줄 (@deprecated — dialogue 사용) */
export type PairDialogueLine = {
  id: string;
  /** 'A' | 'B' | 자유 화자명 */
  speaker: string;
  text: string;
};

export type PairCommissionKind = 'anecdote' | 'if' | 'au';

/** [Anecdote][IF][AU] 글커미션·자료 백업 */
export type PairCommission = {
  id: string;
  kind: PairCommissionKind;
  title: string;
  body?: string;
  url?: string;
  note?: string;
};

/** 페어 VN 스탠딩 위치 (드래그·확대·하단 블러) */
export type PairVnStandPose = {
  /** 좌우 % (음수=왼쪽) */
  x?: number;
  /** 상하 % (음수=위) */
  y?: number;
  /** 확대 배율 */
  scale?: number;
  /** 하단 잘림 블러 0~100 */
  bottomBlur?: number;
};

/** 정보 탭 이미지 레이아웃 7종 */
export type PairPanelLayout =
  | 'panel'
  | 'floating'
  | 'wide-split'
  | 'cinematic'
  | 'banner'
  | 'diagonal'
  | 'book';

export type PairPanelSectionKey = 'relation' | 'flat' | 'archive' | 'gallery';

/** 정보탭 터치 반응 — 호버 애니메이션 스타일 */
export type TouchHoverStyle = 'corners' | 'dashed';

/** 터치 영역 한 줄 대사 (+ 표정·움직임) */
export type TouchZoneLine = {
  text: string;
  /** 표정 이미지 URL */
  expression?: string;
  motion?: DialogueMotion | '';
  fx?: DialogueFx | '';
};

/** 캐릭터 이미지 위 터치 영역 (좌표는 % 기준) */
export type TouchZone = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 클릭 시 순서대로 순환 표시 */
  lines: TouchZoneLine[];
  /** 포인트 마커 위치 (영역 내부 %, 기본 50) */
  markerX?: number;
  markerY?: number;
  /** 포인트 마커 크기 px (기본 5) */
  markerSize?: number;
  /** 대사 표시 위치 (스테이지 %, 없으면 영역 바깥쪽 자동) */
  bubbleX?: number;
  bubbleY?: number;
};

/** 탭별 이미지 표현 + 에코 + pan/zoom + 터치 반응 */
export type PairPanelView = {
  layout?: PairPanelLayout;
  /** 메인 이미지 뒤 잔상(에코) 레이어 */
  echo?: boolean;
  /** 히어로 이미지 URL (없으면 pair.img / gallery 등 폴백) */
  img?: string;
  /** pan(x/y %) + zoom(scale) */
  frame?: ImageFrame;
  /** 터치 영역 (최대 5) */
  touchZones?: TouchZone[];
  /** 호버 애니메이션: corners=코너 브라켓, dashed=점선 아웃라인 */
  touchHoverStyle?: TouchHoverStyle;
  /**
   * @deprecated OC는 touchEnabled 사용.
   * true면 대사 끔(구 의미) → touchEnabled=false 로 매핑.
   */
  touchReactionOnly?: boolean;
  /** 글로우 대사 위에 표시할 이름 */
  touchSpeaker?: string;
};

export type PairPanelViews = Partial<Record<PairPanelSectionKey, PairPanelView>>;

export type PairItem = {
  id: string;
  chars: [string, string];
  img?: string;
  imgFit?: string;
  imgPos?: string;
  imgFrame?: ImageFrame;
  /** 헤드샷(폴라로이드) */
  charImgs?: [string, string];
  charSubs?: [string, string];
  charImgFit?: [string, string];
  charImgPos?: [string, string];
  /** 헤드샷 노출 프레임 (A/B) */
  charImgFrames?: [ImageFrame, ImageFrame];
  /** 전신 일러스트 */
  charBodyImgs?: [string, string];
  /** 전신 노출 프레임 (A/B) */
  charBodyImgFrames?: [ImageFrame, ImageFrame];
  /** 상세 전신 래퍼 위치·크기 (드래그/휠) */
  charBodyLayout?: [ImageFrame, ImageFrame];
  /** 상세 고스트(뒤 일러) 위치·크기 A/B (드래그/휠) */
  charGhostLayout?: [ImageFrame, ImageFrame];
  /** 상세 폴라로이드 래퍼 위치·크기 (드래그/휠) */
  charHeadLayout?: [ImageFrame, ImageFrame];
  /** 캐릭터별 포인트 컬러 */
  charColors?: [string, string];
  relation?: string;
  pairTitle?: string;
  pairSub?: string;
  desc?: string;
  keywords?: string[];
  story?: string;
  color?: string;
  /** 상세 배경 이미지 */
  bg?: string;
  /** 배경 비네트 색 (HEX). 없으면 color */
  bgVignetteColor?: string;
  /** 배경 비네트 세기 0~100 (기본 16) */
  bgVignette?: number;
  /** 배경 다크 딤 0~100 (기본 0) */
  bgDim?: number;
  /** 페어 로고 */
  logo?: string;
  /** D-Day 기준일 (YYYY-MM-DD) */
  dday?: string;
  chemistry?: PairChemistry[];
  /** 납작캐해 본문 */
  flatLore?: string;
  flatLoreKeywords?: string[];
  gallery?: PairGalleryItem[];
  honorifics?: PairHonorifics;
  charNotes?: [PairCharNote, PairCharNote];
  /**
   * VN 대화 — 왼쪽(A)·오른쪽(B) 전신 클릭별 분리
   * 없으면 legacy `dialogue` 를 양쪽 공통으로 재생
   */
  dialogueBySide?: {
    A?: { nodes?: DialogueNode[]; start?: string };
    B?: { nodes?: DialogueNode[]; start?: string };
  };
  /** @deprecated dialogueBySide.A 로 이관 */
  dialogue?: DialogueNode[];
  /** @deprecated dialogueBySide.A.start 로 이관 */
  dialogueStart?: string;
  /** @deprecated dialogue 사용 */
  dialogues?: PairDialogueLine[];
  /** VN 스탠딩 A/B 위치·크기 */
  vnStandPos?: [PairVnStandPose, PairVnStandPose];
  /**
   * 스테이지 대표 플로팅 대사 (최대 2줄 고정).
   * 진입 시 스윕 연출 후 유지. 각 줄 side(A/B)로 기본 위치.
   */
  floatingQuotes?: PairFloatingQuote[];
  /** @deprecated floatingQuotes 사용. A/B 분리 목록은 로드 시 합침 */
  floatingQuotesBySide?: {
    A?: OcFloatingQuote[];
    B?: OcFloatingQuote[];
  };
  commissions?: PairCommission[];
  /** 페어 상세 진입 시 재생할 테마곡 (OC theme과 동일 구조) */
  theme?: ThemeSong;
  /**
   * 정보 탭(관계/납작캐해/자료/갤러리)별 이미지 레이아웃
   * — layout · echo · pan/zoom · hero img 를 탭 독립 저장
   */
  panelViews?: PairPanelViews;
};

export const DEFAULT_OC: OcCharacter[] = [];

export { DEFAULT_CATEGORIES } from '@/lib/oc/categories';

export const DEFAULT_PAIRS: PairItem[] = [];

export const ADMIN_USERNAME = 'gmssolove';
export const ADMIN_EMAIL = 'gmssolove@naver.com';
