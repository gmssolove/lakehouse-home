import type { DialogueFx, DialogueMotion } from '@/lib/vn/motions';
import type { WithSecret } from '@/lib/types/secret-content';

export type { DialogueFx, DialogueMotion };

export type GalleryItem = { src: string; credit?: string };


export type ProfileField = {
  k: string;
  v: string;
  /** 호버 시 커서 따라다니는 TMI */
  tip?: string;
};

/** 왼쪽 메뉴 호버 스탯 패널 — 레이더 + 바 */
export type OcStatRadarAxis = {
  axis: string;
  /** 0~100 */
  value: number;
};

export type OcStatBar = {
  label: string;
  value: number;
  /** 기본 100 */
  max?: number;
};

export type OcStatPanel = {
  radar?: OcStatRadarAxis[];
  bars?: OcStatBar[];
  /** 스탯 패널 전용 컬러 (없으면 퍼스널 컬러) */
  color?: string;
  /** 패널 박스 배경색 (HEX). 없으면 기본 다크 글래스 */
  bgColor?: string;
  /** 글로우 세기 0~100 (기본 40) */
  glow?: number;
};

/** 능력(신비 연출) 항목 — 능력명 + 클릭 시 안개 걷히듯 나타나는 상세 스탯 */
export type OcAbility = {
  id: string;
  /** 능력명 (금빛 그라데이션+글로우로 표시) */
  name: string;
  /** 발동 조건 등 상세 스탯. 클릭 시 리빌 (OcRichText 문법 지원) */
  detail?: string;
};

/** 사용자 정의 프로필 섹션 (왼쪽 메뉴에 자유 항목 추가) */
export type CustomProfileSection = {
  id: string;
  /** 섹션 이름 (예: 능력) */
  title: string;
  /** 본문 (OcRichText 문법 지원) */
  body: string;
  /** 신비 연출: 능력명 금빛 그라데이션+글로우, 클릭 시 상세 안개 리빌 */
  mystic?: boolean;
  /** 능력 목록 (mystic 연출용) */
  abilities?: OcAbility[];
};

/** 특이사항 항목 — 제목(라벨) + 리치 본문 */
export type TasteItem = {
  id: string;
  /** 항목 제목 (예: HOBBY, LIKES) — 표시 시 통일 라벨 스타일 */
  title: string;
  /** 본문 (OcRichText) */
  body: string;
  /** full(기본) | half — 연속 half끼리 2단 배치 */
  width?: 'full' | 'half';
  /** true면 항목 사이 가로 구분선 전용 행 */
  divider?: boolean;
};

/** 위험도 등급 단계 (1=없음 … 7=봉인급) — 순서 비교용 */
export type RiskRankId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * 위험도 프리셋 id
 * - 1~7: 등급 체계
 * - 'unknown': 등급 밖 독립 분류(미상) — 순서 비교에서 제외
 */
export type RiskPresetId = RiskRankId | 'unknown';

/** 위험도 단계 — 프리셋 선택 + 라벨·주의·색 커스텀 */
export type RiskStage = {
  id: string;
  /** 선택한 프리셋 (커스텀 후 유지). 'unknown'은 등급 체계 밖 */
  preset?: RiskPresetId;
  /** 라벨 (예: 매우 높음 / 미상) */
  label: string;
  /** 주의 문구 (예: 접촉 주의) */
  notice?: string;
  /** 배지 색 HEX */
  color: string;
};

/** 페어 중앙 정보판 영역별 TMI */
export type PairInfoTips = {
  title?: string;
  relation?: string;
  honorifics?: string;
};

/** OC/페어 상세 진입 로딩 화면 */
export type EntrySplashLayout = 'fullbleed' | 'corner';

export type EntrySplashLabel = 'tip' | 'tmi';

export type EntrySplashTipItem = {
  id: string;
  kind: EntrySplashLabel;
  text: string;
};

export type EntrySplashConfig = {
  /** 기본 false — 관리자가 켠 경우에만 표시 */
  enabled?: boolean;
  layout?: EntrySplashLayout;
  /** 로딩 화면 컬러감(틴트) HEX — 단색이 아니라 은은하게 물들임 */
  tint?: string;
  /** @deprecated items 사용 */
  label?: EntrySplashLabel;
  /** @deprecated items 사용 */
  tips?: string[];
  /** TIP/TMI 개별 항목 */
  items?: EntrySplashTipItem[];
};

/** @deprecated StoryEntry 사용 — 로드 시 마이그레이션 */
export type StoryLog = {
  id: string;
  title: string;
  date?: string;
  body: string;
};

export type ThemeSong = {
  title?: string;
  artist?: string;
  youtubeId?: string;
  fileData?: string;
};

/** 서사 분류 (본편/AU/IF/기타 + 커스텀) */
export type StoryCategory = string;

export type StoryChapter = {
  id: string;
  title?: string;
  body: string;
};

/** 서사 리더 배경 분위기 */
export type StoryBgEffect = 'bottom-gradient' | 'vignette';

/** 비네트/그라데이션 accent — 캐릭터색 맞춤 | 커스텀 */
export type StoryBgAccentMode = 'character' | 'custom';

/** 서사 포스트 보기 모드 */
export type StoryViewMode = 'text' | 'scroll' | 'comic';

/** 서사 포스트 공개 범위 */
export type StoryVisibility = 'public' | 'secret';

/** 페어 스토리 시리즈(로그) 히어로 */
export type PairStorySeries = {
  /** 시리즈 제목 */
  title?: string;
  /** 상징 대사(인용구) */
  quote?: string;
  /** 소개 문구 */
  intro?: string;
  /** 해시태그 (예: #기억 #밤) */
  hashtags?: string[];
  /** 히어로 비주얼 */
  image?: string;
  imageFit?: string;
  imagePos?: string;
};

/** OC/페어 통합 서사 글 */
export type StoryEntry = {
  id: string;
  title: string;
  category: StoryCategory;
  chapters: StoryChapter[];
  order: number;
  /** 작가/출처 — 앞에 © 권장 */
  author?: string;
  /** accent 출처. 기본 character */
  bgAccentMode?: StoryBgAccentMode;
  /** custom 모드일 때 비네트/그라데이션 색 (#hex) */
  bgColor?: string;
  /** 하단 그라데이션 | 중앙 비네트 */
  bgEffect?: StoryBgEffect;
  /** 분위기 레이어 투명도/세기 0~100 (기본 55) */
  bgEffectOpacity?: number;
  /** 부제 */
  subtitle?: string;
  /** 표시 날짜 (YYYY-MM-DD 등) */
  date?: string;
  /** 리스트 썸네일 */
  thumbnail?: string;
  /** 리스트 썸네일 크롭(노출 범위) */
  thumbnailFrame?: ImageFrame;
  /** 보기 모드 — 기본 text */
  viewMode?: StoryViewMode;
  /** 공개 범위 — 기본 public */
  visibility?: StoryVisibility;
  /** 비밀글 비밀번호 (비면 pair scope 기본) */
  secretPassword?: string;
  /** 19금 */
  adult?: boolean;
  /** scroll/comic 모드용 이미지 */
  images?: string[];
  /** 포스트 전용 BGM (없으면 페어 테마곡) */
  theme?: ThemeSong;
  /** 트윗/타래 임베드 URL 목록 (공식 위젯) */
  tweetEmbeds?: string[];
};

/** 프리뷰(한 장씩 캐러셀) */
export type PreviewItem = {
  id: string;
  title?: string;
  body: string;
  order: number;
};

export const DEFAULT_STORY_CATEGORIES = ['본편', 'AU', 'IF', '기타'] as const;

export type CharacterRelation = {
  id: string;
  name: string;
  relation: string;
  note?: string;
};

/** #16 기괴 연출 — 공포/괴이 컨셉 캐릭터용. 선택형·기본 꺼짐 */
export type CreepyFxKind =
  /** 텍스트가 가끔 지직이며 어긋남 */
  | 'textGlitch'
  /** 화면 전체 노이즈/스캔라인 */
  | 'screenStatic'
  /** 조명이 깜빡이듯 밝기 흔들림 */
  | 'flicker'
  /** 화면이 미세하게 떨림 */
  | 'jitter'
  /** 색 어긋남(RGB 분리) */
  | 'chromatic'
  /** 가장자리에서 붉은 어둠이 맥동 */
  | 'creepVignette'
  /** 숨쉬듯 화면이 훅 어두워졌다 돌아옴 */
  | 'breathe'
  /** 텍스트에 잔상이 번짐 */
  | 'smear'
  /** 화면이 물결처럼 일렁임 */
  | 'warp'
  /** 글자가 랜덤하게 이상한 기호로 바뀌었다 돌아옴 */
  | 'glyphScramble';

export type CreepyFxConfig = {
  enabled?: boolean;
  /** 적용할 효과 종류 (복수 선택) */
  kinds?: CreepyFxKind[];
  /** 강도 1~100 (기본 40) */
  intensity?: number;
  /** 어둠 잠식(creepVignette) 색상 (hex, 기본 어두운 적색) */
  vignetteColor?: string;
};

/** 상세 스테이지 공중 먼지 — CreepyFxConfig와 분리 (lib/shared/dustFx.ts와 동일) */
export type DustFxConfig = {
  enabled?: boolean;
  intensity?: number;
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
  /** 목록 카드용 크롭 — 기본(imgFrame)과 별개 */
  imgFrame?: ImageFrame;
  /** 상세 스테이지 「위치」— 기본(detailLayout)과 별개 */
  detailLayout?: ImageFrame;
  /** 이 버전 전용 터치 영역. 없으면 기본 touchZones 상속(표시만) */
  touchZones?: TouchZone[];
};

export type OcCharacter = WithSecret & {
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
  /** @deprecated storyEntries 로 이관 */
  story?: string;
  gallery?: (string | GalleryItem)[];
  /** @deprecated previewItems 로 이관 */
  novel?: { title?: string; preview?: string }[];
  /** 통합 서사 목록 */
  storyEntries?: StoryEntry[];
  /** 서사 분류(커스텀 포함) */
  storyCategories?: string[];
  /** 서사 분류별 태그 색 (hex). 키 = 분류명 */
  storyCategoryColors?: Record<string, string>;
  /** 프리뷰 목록 (캐러셀) */
  previewItems?: PreviewItem[];
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
  /** #16 기괴 연출 설정 */
  creepyFx?: CreepyFxConfig;
  /** 상세 공중 먼지 (기본 꺼짐) */
  dustFx?: DustFxConfig;
  /** 위험도 단계 (라벨+색, 여러 개) */
  riskStages?: RiskStage[];
  /** @deprecated riskStages 사용. 하위 호환·검색용 합쳐진 텍스트 */
  riskLevel?: string;
  auVersions?: AuVersion[];
  /**
   * true: 버전(AU) 이미지 선택 상태에서 대사창을 열어도 그 이미지를 유지.
   * false/미설정: 대사창·괴롭히기 ON 시 기본 이미지로 복귀.
   */
  dialogueKeepAu?: boolean;
  special?: string;
  /** @deprecated tasteItems로 이전 — 읽기 시 migrate */
  hobby?: string;
  keywords?: string[];
  /** @deprecated tasteItems로 이전 */
  likes?: string[];
  /** @deprecated tasteItems로 이전 */
  hates?: string[];
  /** @deprecated tasteItems로 이전 */
  tasteExtra?: ProfileField[];
  /** 특이사항 항목 배열 (제목 + 리치 본문) */
  tasteItems?: TasteItem[];
  items?: string[];
  /** TRPG 스테이터스 (오른쪽 패널 k/v 바) */
  stats?: ProfileField[];
  /**
   * 왼쪽 메뉴 호버 스탯 패널
   * Firestore: { radar: [{axis,value}], bars: [{label,value,max?}] }
   */
  statPanel?: OcStatPanel;
  /** 캐해(캐릭터 해석) — 글로 작성. 프로필 탭 */
  flatLore?: string;
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
  /** 상세 진입 로딩 화면 (풀블리드 / 코너 스피너) */
  entrySplash?: EntrySplashConfig;
  appearance?: string;
  /** 사용자 정의 프로필 섹션 (예: 능력). 왼쪽 메뉴 PROFILE 그룹에 표시 */
  customSections?: CustomProfileSection[];
  /** 왼쪽 메뉴 PROFILE 섹션 표시 순서 (섹션 id 배열; 미포함/신규는 뒤에 자동 배치) */
  sectionOrder?: string[];
  /** @deprecated storyEntries 로 이관 */
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
  /** 손글씨 쪽지 — 이미지 URL 목록 (클릭 시 팝업) */
  handwritingNotes?: string[];
  /** 쪽지 펼침 효과음 (오디오 URL) */
  handwritingNoteSfx?: string;
  /** 쪽지 닫힘 효과음 (오디오 URL) */
  handwritingNoteCloseSfx?: string;
};

export type PairChemistry = {
  label: string;
  value: number;
  /** 레이더 축 호버 TMI */
  hint?: string;
};

/** 소개 탭 — 가상 인터뷰 문답 (같은 질문, 각자 다른 답) */
export type PairInterviewQA = {
  id: string;
  question: string;
  /** A(chars[0]) 답변 */
  answerA?: string;
  /** B(chars[1]) 답변 */
  answerB?: string;
};

/** 소개 탭 — "만약에" 시나리오 */
export type PairWhatIf = {
  id: string;
  /** 가정 상황 (예: 둘 중 하나가 사라진다면?) */
  scenario: string;
  /** @deprecated answerA/answerB 사용 */
  answer?: string;
  /** A(chars[0]) 답변 */
  answerA?: string;
  /** B(chars[1]) 답변 */
  answerB?: string;
  /** 시나리오 일러스트 */
  img?: string;
  imgFrame?: ImageFrame;
  /** CSS aspect-ratio — 예: "1 / 1", "16 / 9" */
  imgAspect?: string;
  /** 표시 크기 % (60~140, 기본 100) */
  imgSize?: number;
};

/** 페어 소개 탭 확장 콘텐츠 */
export type PairIntro = {
  /**
   * @deprecated A 시점 폴백 — `firstImpressionA` 사용
   * 첫인상 (처음 만났을 때)
   */
  firstImpression?: string;
  /**
   * @deprecated A 시점 폴백 — `nowA` 사용
   * 현인상 (현재)
   */
  now?: string;
  /** A 시점 첫인상 */
  firstImpressionA?: string;
  /** B 시점 첫인상 */
  firstImpressionB?: string;
  /** A 시점 현인상 */
  nowA?: string;
  /** B 시점 현인상 */
  nowB?: string;
  /** A가 보는 B — A 말투 */
  aOnB?: string;
  /** B가 보는 A — B 말투 */
  bOnA?: string;
  /** 가상 인터뷰 */
  interview?: PairInterviewQA[];
  /** "만약에" 시나리오 */
  whatIf?: PairWhatIf[];

  /** 관계 정의 일러스트 */
  defineImg?: string;
  defineImgFrame?: ImageFrame;
  defineImgAspect?: string;
  defineImgSize?: number;
  /**
   * @deprecated A 시점 폴백 — `firstImgA` 사용
   * 첫인상 일러스트
   */
  firstImg?: string;
  firstImgFrame?: ImageFrame;
  firstImgAspect?: string;
  firstImgSize?: number;
  /**
   * @deprecated A 시점 폴백 — `nowImgA` 사용
   * 현인상 일러스트
   */
  nowImg?: string;
  nowImgFrame?: ImageFrame;
  nowImgAspect?: string;
  nowImgSize?: number;
  /** A 시점 첫인상 일러스트 */
  firstImgA?: string;
  firstImgAFrame?: ImageFrame;
  firstImgAAspect?: string;
  firstImgASize?: number;
  /** A 시점 현인상 일러스트 */
  nowImgA?: string;
  nowImgAFrame?: ImageFrame;
  nowImgAAspect?: string;
  nowImgASize?: number;
  /** B 시점 첫인상 일러스트 */
  firstImgB?: string;
  firstImgBFrame?: ImageFrame;
  firstImgBAspect?: string;
  firstImgBSize?: number;
  /** B 시점 현인상 일러스트 */
  nowImgB?: string;
  nowImgBFrame?: ImageFrame;
  nowImgBAspect?: string;
  nowImgBSize?: number;
  /** A 시점: 첫인상·현인상 공유 일러스트 */
  povImgA?: string;
  povImgAFrame?: ImageFrame;
  povImgAAspect?: string;
  povImgASize?: number;
  /** B 시점: 첫인상·현인상 공유 일러스트 */
  povImgB?: string;
  povImgBFrame?: ImageFrame;
  povImgBAspect?: string;
  povImgBSize?: number;
  /** A/B 시점 일러스트를 하나로 통일 (구도·확대 포함) */
  unifyPovImg?: boolean;
  /**
   * @deprecated 시점별 povImg* 사용 — 항상 통일
   */
  unifyFirstNowImgA?: boolean;
  /**
   * @deprecated 시점별 povImg* 사용 — 항상 통일
   */
  unifyFirstNowImgB?: boolean;
  /** A→B 인상 일러스트 */
  aOnBImg?: string;
  aOnBImgFrame?: ImageFrame;
  aOnBImgAspect?: string;
  aOnBImgSize?: number;
  /** B→A 인상 일러스트 */
  bOnAImg?: string;
  bOnAImgFrame?: ImageFrame;
  bOnAImgAspect?: string;
  bOnAImgSize?: number;
  /** 가상 인터뷰 섹션 일러스트 (질문 공통 1장) */
  interviewImg?: string;
  interviewImgFrame?: ImageFrame;
  interviewImgAspect?: string;
  interviewImgSize?: number;
};

export type PairGalleryItem = {
  id: string;
  /** 대표(첫) 이미지 — 하위 호환 */
  src: string;
  /** 슬라이드 이미지들 (있으면 src 포함해 통일 가능) */
  images?: string[];
  title?: string;
  credit?: string;
};

/** 갤러리 항목의 표시용 URL 목록 */
export function pairGalleryUrls(g: Pick<PairGalleryItem, 'src' | 'images'>): string[] {
  const fromList = (g.images || []).map((s) => s.trim()).filter(Boolean);
  if (fromList.length) return fromList;
  const one = (g.src || '').trim();
  return one ? [one] : [];
}

/** 페어 스토리 타임라인 사건 (날짜·제목·내용·이미지) */
export type PairTimelineEvent = {
  id: string;
  /** 날짜 (자유 텍스트, 예: 2025.05.11 / Occur 317년 3월) */
  date?: string;
  title?: string;
  /** 본문 (OcRichText 문법 지원) */
  body?: string;
  /** 본문 아래 이미지 */
  image?: string;
  /** 표시 순서 */
  order?: number;
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
  /** 이름 위 한 줄 대사 (PV 대사 폰트·애니) */
  quote?: string;
  /** 대표 이모티콘 (예: 🐍) */
  emoji?: string;
  /** 캐릭터별 키워드 */
  keywords?: string[];
  /** 캐릭터별 납작 캐해 (글) */
  flatLore?: string;
  /** 추가 프로필 항목 (나이 등 — 관리자가 직접 추가) */
  fields?: ProfileField[];
  /** 캐릭터 서술(중앙 반투명 박스) wr_story — HTML 허용 */
  story?: string;
  /** 프로필 링크 wr_1 */
  profileLink?: string;
  /** 이 캐릭터와 연결할 내 OC id — 설정 시 상세에 「OC 프로필 보기」 버튼 표시 (미설정=이름 자동 일치) */
  ocProfileId?: string;
  /** 헤드샷(폴라로이드) 출처 wr_5 */
  headCredit?: string;
  /** 전신 출처 wr_6 */
  bodyCredit?: string;
  /** 손글씨 쪽지 — 이미지 URL 목록 (클릭 시 팝업) */
  handwritingNotes?: string[];
  /** 쪽지 펼침 효과음 (오디오 URL) */
  handwritingNoteSfx?: string;
  /** 쪽지 닫힘 효과음 (오디오 URL) */
  handwritingNoteCloseSfx?: string;
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

export type PairPanelSectionKey = 'relation' | 'flat' | 'gallery' | 'story' | 'archive';

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
  /** 이미지 판(영역) 크기 배율 0.75~1.45 — 레이아웃 여백 조절 */
  mediaSize?: number;
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

export type PairItem = WithSecret & {
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
  /** 상세 고스트 soft blur (기본 true, false면 끄기) */
  charGhostBlur?: boolean;
  /** 상세 폴라로이드 래퍼 위치·크기 (드래그/휠) */
  charHeadLayout?: [ImageFrame, ImageFrame];
  /** 캐릭터별 포인트 컬러 */
  charColors?: [string, string];
  /**
   * 페어 소개 전용 — 「서로의 인상」·인터뷰·만약에 이름에
   * 퍼스널컬러 text-shadow 글로우. OC 프로필에는 미적용.
   */
  personalNameGlow?: boolean;
  /** A/B 글로우 색. 비면 해당 슬롯 charColors 사용 */
  personalNameGlowColors?: [string, string];
  relation?: string;
  /** 중앙 캐치프레이즈 */
  catchphrase?: string;
  pairTitle?: string;
  pairSub?: string;
  desc?: string;
  keywords?: string[];
  /** @deprecated storyEntries 로 이관 */
  story?: string;
  /** 통합 서사 목록 */
  storyEntries?: StoryEntry[];
  storyCategories?: string[];
  /** 서사 분류별 태그 색 (hex). 키 = 분류명 */
  storyCategoryColors?: Record<string, string>;
  /** 스토리 > 로그 시리즈 히어로 */
  storySeries?: PairStorySeries;
  /** 스토리 타임라인 (날짜별 사건) */
  timeline?: PairTimelineEvent[];
  color?: string;
  /** 케미 레이더 채움/점 색. 없으면 color */
  radarColor?: string;
  /** 타임라인 세로 레일·닷 색. 없으면 color */
  timelineRailColor?: string;
  /** 상세 배경 이미지 */
  bg?: string;
  /** 배경 비네트 색 (HEX). 없으면 color */
  bgVignetteColor?: string;
  /** 비네트를 좌(A)/우(B) 반반으로 분리해 각각 다른 색 틴트 */
  bgVignetteSplit?: boolean;
  /** 좌(A) 비네트 색. 없으면 charColors[0] → bgVignetteColor */
  bgVignetteColorA?: string;
  /** 우(B) 비네트 색. 없으면 charColors[1] → bgVignetteColor */
  bgVignetteColorB?: string;
  /** 배경 비네트 세기 0~100 (기본 16) */
  bgVignette?: number;
  /** 배경 다크 딤 0~100 (기본 0) */
  bgDim?: number;
  /** 페어 로고 */
  logo?: string;
  /** D-Day 기준일 (YYYY-MM-DD) */
  dday?: string;
  chemistry?: PairChemistry[];
  /** 소개 탭 확장 콘텐츠 (첫인상/인상/인터뷰/만약에) */
  intro?: PairIntro;
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
  /** @deprecated storyEntries 로 이관 (IF/AU/anecdote) */
  commissions?: PairCommission[];
  /** 페어 상세 진입 시 재생할 테마곡 (OC theme과 동일 구조) */
  theme?: ThemeSong;
  /** #16 기괴 연출 설정 */
  creepyFx?: CreepyFxConfig;
  /** 상세 공중 먼지 (기본 꺼짐) */
  dustFx?: DustFxConfig;
  /** 위험도 단계 (라벨+색, 여러 개) */
  riskStages?: RiskStage[];
  /** @deprecated riskStages 사용. 하위 호환용 합쳐진 텍스트 */
  riskLevel?: string;
  /**
   * 정보 탭(관계/납작캐해/스토리/갤러리)별 이미지 레이아웃
   * — layout · echo · pan/zoom · hero img 를 탭 독립 저장
   */
  panelViews?: PairPanelViews;
  /** 중앙 정보판(타이틀·관계·호칭) 호버 TMI */
  infoTips?: PairInfoTips;
  /** 상세 진입 로딩 화면 */
  entrySplash?: EntrySplashConfig;
};

export const DEFAULT_OC: OcCharacter[] = [];

export { DEFAULT_CATEGORIES } from '@/lib/oc/categories';

export const DEFAULT_PAIRS: PairItem[] = [];

export const ADMIN_USERNAME = 'gmssolove';
export const ADMIN_EMAIL = 'gmssolove@naver.com';
