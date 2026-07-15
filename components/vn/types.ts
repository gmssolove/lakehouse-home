/** 독립 VN 엔진 — 씬 스크립트 타입 */

export type VNSpriteSlot = {
  character: string;
  expression: string;
  position: 'left' | 'center' | 'right';
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
  | 'ghastly-dim';

export type VNLine = {
  id: string;
  speaker?: string;
  text: string;
  background?: string;
  sprites?: VNSpriteSlot[];
  /** BGM 키. "none"/null 이면 끄기, 생략이면 이전 유지 */
  bgm?: string | null;
  sfx?: string;
  choices?: VNChoice[];
  effect?: VNLineEffect;
  caption?: string;
  narrationOnly?: boolean;
  titleText?: string;
  missionUpdate?: {
    id: string;
    status: 'start' | 'complete';
  };
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
  sfxUrl?: (key: string) => string | undefined;
};
