/** 독립 VN 엔진 — 씬 스크립트 타입 */

export type VNSpriteAnim = 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'pop';

export type VNSpriteSlot = {
  character: string;
  expression: string;
  position: 'left' | 'center' | 'right';
  /** 현재 좌석 슬롯 — 버전 포즈·재생 중 저장용 (군중은 crowd0~4) */
  standSlot?: import('@/lib/vn/standPosBySlot').StandSlot;
  /** true면 4명+ 군중 배치 — 저장 L/C/R 포즈를 덮지 않음 */
  crowdLayout?: boolean;
  /** true면 비화자 — 어둡게 */
  dimmed?: boolean;
  /** 스탠딩 미세 위치 (%). 기본 0 */
  offsetX?: number;
  offsetY?: number;
  /** README 호환 별칭 — offsetX/Y와 동일 의미 */
  x?: number;
  y?: number;
  /** 확대 배율. 기본 1 */
  scale?: number;
  /** 등장 애니메이션 */
  anim?: VNSpriteAnim;
  /** 등장 연출 지연 (ms) — stageEnterOrder */
  enterDelayMs?: number;
};

export type VNChoice = {
  text: string;
  nextSceneId: string;
};

export type VNLineEffect =
  | 'shake'
  | 'shake-advanced'
  | 'blackout'
  | 'titlecard'
  | 'ghastly-dim'
  | 'diceRoll';

export type VNLine = {
  id: string;
  speaker?: string;
  text: string;
  background?: string;
  sprites?: VNSpriteSlot[];
  /** BGM 키. "none"/null 이면 끄기, 생략이면 이전 유지 */
  bgm?: string | null;
  /**
   * 환경음(루프) 키.
   * undefined=이전 유지 · null/"none"=끄기 · string=재생
   */
  ambient?: string | null;
  /**
   * 핸드아웃 키.
   * undefined=이전 유지 · null/"none"=숨기기 · string=표시
   */
  handout?: string | null;
  sfx?: string;
  choices?: VNChoice[];
  effect?: VNLineEffect;
  caption?: string;
  narrationOnly?: boolean;
  titleText?: string;
  /** 챕터카드 영문 소제목 */
  titleSubtext?: string;
  /** 이 챕터카드 직전 검정 로딩 */
  chapterLoadingBefore?: boolean;
  /** 이 챕터카드 직후 검정 로딩 */
  chapterLoadingAfter?: boolean;
  /** 라인 보이스 URL */
  voice?: string;
  /** 장소명 — 라인별. 없으면 씬 location 사용 */
  location?: string;
  /**
   * 장소 배너 숨김 (sticky 해석 후 절대값).
   * true면 배너·코너 숨김 · false/undefined면 표시
   */
  hideLocation?: boolean;
  /**
   * 화면 가장자리 비네트.
   * true=켜기 · false=끄기 · undefined=이전 유지 (시작/끝만 지정)
   */
  vignette?: boolean;
  /**
   * 시야 흐림 — 배경·스탠딩이 뿌옇게.
   * true=켜기 · false=끄기 · undefined=이전 유지
   */
  visionBlur?: boolean;
  /** CCFolia 다이스 판정 연출 */
  diceRoll?: import('@/lib/vn/parseCcfoliaLog').VnDiceRoll;
  missionUpdate?: {
    id: string;
    status: 'start' | 'complete';
    /** 미션 카탈로그에 없을 때 배너/수첩 표시용 */
    title?: string;
  };
  /** 몸 움직임 (통통·파르르 등) — 화자 스탠딩에 적용 */
  motion?: import('@/lib/vn/motions').DialogueMotion;
  /** 머리 위 기호 효과 */
  fx?: import('@/lib/vn/motions').DialogueFx;
};

/** 기존 대사 씬 (type 생략 시 dialogue) */
export type VNScene = {
  id: string;
  type?: 'dialogue';
  title: string;
  /** 장소명 — 대사창 안 표시 (예: "교실 안") */
  location?: string;
  lines: VNLine[];
  /** 마지막 라인 이후 자동으로 이어갈 씬 */
  nextSceneId?: string;
};

export type Hotspot = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: VNLine[];
  oneTime?: boolean;
  requiresMission?: string;
};

export type ExplorationScene = {
  id: string;
  type: 'exploration';
  title: string;
  /** 장소명 — 대사창 안 표시 */
  location?: string;
  background: string;
  bgm?: string;
  hotspots: Hotspot[];
  nextSceneId?: string;
};

export type VNAnyScene = VNScene | ExplorationScene;

export function isExplorationScene(scene: VNAnyScene): scene is ExplorationScene {
  return scene.type === 'exploration';
}

export function isDialogueScene(scene: VNAnyScene): scene is VNScene {
  return scene.type !== 'exploration';
}

export type VNAssetResolvers = {
  backgroundUrl?: (key: string) => string | undefined;
  spriteUrl?: (character: string, expression: string) => string | undefined;
  bgmUrl?: (key: string) => string | undefined;
  ambientUrl?: (key: string) => string | undefined;
  sfxUrl?: (key: string) => string | undefined;
  handoutUrl?: (key: string) => string | undefined;
};
