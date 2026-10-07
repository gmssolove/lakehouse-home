/**
 * CCFolia 시나리오 로그(export한 html) → 편집 가능한 VN 데이터로 변환.
 * 브라우저에서 바로 돌아가도록 정규식 + DOM 텍스트 디코딩만 사용 (서버 왕복 없음).
 */

import { isDialogueFx, isDialogueMotion } from '@/lib/vn/motions';
import { VN_STAND_LAYOUT } from '@/lib/vn/standLayout';
import {
  resolveCrowdPose,
  resolveStandPoseForSlot,
  seatIndexToCrowdSlot,
  seatIndexToSlot,
  stageSeatFillIndices,
  trioSlotToSeatIndex,
  type StandSlot,
  type TrioSlot,
} from '@/lib/vn/standPosBySlot';

/** 연속된 동일 vignette 토글을 sticky(undefined)로 압축 — 예전「줄마다 끄기」데이터 마이그레이션 */
export function collapseStickyVignette<T extends { vignette?: boolean }>(
  lines: T[],
  initialActive = false,
): T[] {
  let active = initialActive;
  return lines.map((line) => {
    if (line.vignette === true) {
      if (active) return { ...line, vignette: undefined };
      active = true;
      return line;
    }
    if (line.vignette === false) {
      if (!active) return { ...line, vignette: undefined };
      active = false;
      return line;
    }
    return line;
  });
}

export type VnDiceRoll = {
  actor: string;
  skill: string;
  target: number;
  roll: number;
  result: string;
  /** 이 판정만 다른 굴림 효과음 (diceSfxList 키 또는 URL) */
  sfx?: string;
  /** 이 판정만 다른 결과 효과음 */
  resultSfx?: string;
  /** 이 판정만 다른 컷인 GIF (diceCutinList 키 또는 URL) */
  cutin?: string;
};

export type ScenarioVnStandPos = {
  /** 좌우 오프셋 % (음수=왼쪽) */
  x: number;
  /** 상하 오프셋 % (음수=위, +면 아래) */
  y: number;
  /** 확대 배율 */
  scale: number;
};

export type ScenarioVnStandAnim = 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'pop';

/** @deprecated standPos 사용 — 구 데이터 호환용 */
export type ScenarioVnStandPose = Partial<ScenarioVnStandPos>;

export type ScenarioVnStageCmd = {
  enter?: string;
  slot?: TrioSlot;
  exit?: string;
  clear?: boolean;
};

export type ScenarioVnLine = {
  id: string;
  /** '' 면 나레이션 (화자 이름 안 보임) */
  speakerKey: string;
  text: string;
  narrationOnly?: boolean;
  effect?: 'diceRoll' | 'titlecard';
  diceRoll?: VnDiceRoll;
  /** effect === 'titlecard' 일 때 화면 중앙 챕터 제목 */
  titleText?: string;
  /** 챕터카드 영문 소제목 (선택) */
  titleSubtext?: string;
  /** 이 챕터카드 직전 검정 로딩 */
  chapterLoadingBefore?: boolean;
  /** 이 챕터카드 직후(다음 줄 전) 검정 로딩 */
  chapterLoadingAfter?: boolean;
  /** 등록된 배경(ScenarioVnBackground)의 key — "배경 & 장소" 목록에서 고름 */
  background?: string;
  /**
   * BGM 키 / null|'none'=무음 / undefined=이전 유지
   * Firebase RTDB 저장 시에는 'none' 문자열 사용 (null 은 키가 삭제됨)
   */
  bgm?: string | null;
  /**
   * 환경음(루프). BGM과 별개로 지정 타이밍까지 계속 재생.
   * undefined=이전 유지 · null|'none'=끄기 · string=해당 키
   */
  ambient?: string | null;
  sfx?: string;
  missionUpdate?: { id: string; title: string; status: 'start' | 'complete' };
  /** 몸 움직임 — lib/vn/motions */
  motion?: import('@/lib/vn/motions').DialogueMotion | '';
  /** 머리 위 기호 효과 */
  fx?: import('@/lib/vn/motions').DialogueFx | '';
  /** 이 줄만 표정 이미지 (없으면 화자 기본 스프라이트) */
  expression?: string;
  /**
   * 표정 유지 여부.
   * true/undefined = 이후에도 유지 · false = 이번 대사만
   * expressionUntilLineId 가 있으면 해당 줄(포함)까지 유지 후 기본 스탠딩
   */
  expressionPersist?: boolean;
  /** 표정 유지 끝 대사 id (같은 화자 이후 줄). 있으면 그 줄 포함까지 sticky */
  expressionUntilLineId?: string;
  /** 대사 음성 URL */
  voice?: string;
  /** 장소명 — VnLocationBanner */
  location?: string;
  /**
   * 장소 배너(코너 포함) 표시.
   * undefined=이전 유지 · true=이 줄부터 숨김 · false=이 줄부터 다시 표시
   */
  hideLocation?: boolean;
  /**
   * 화면 가장자리 비네트.
   * true=이 줄부터 켜기 · false=이 줄부터 끄기 · undefined=이전 유지
   */
  vignette?: boolean;
  /**
   * 시야 흐림 (배경·스탠딩이 뿌옇게).
   * true=이 줄부터 켜기 · false=이 줄부터 끄기 · undefined=이전 유지
   */
  visionBlur?: boolean;
  /**
   * 스탠딩 화면 출력.
   * undefined=이전 유지 · true=이 줄부터 숨김 · false=이 줄부터 다시 표시
   * (자리 기억은 유지 — 다시 켤 때 같은 자리로 재등장)
   */
  hideStandings?: boolean;
  /**
   * 동시 등장 인원.
   * undefined=이전 유지 · 1~5|'all'=이 줄부터 적용 (씬 기본값은 스탠딩 탭)
   */
  maxOnStage?: VnMaxOnStage;
  /**
   * 무대 자리 순서 (왼쪽→오른쪽 / 군중 1→N).
   * 이 줄부터 sticky. 스프라이트 있는 화자 key. 비우면 등장순 자동 배정.
   */
  stageOrder?: string[];
  /**
   * 등장 연출 순서 (먼저 등장할 key부터).
   * 이 줄부터 sticky. 없으면 stageOrder · 그다음 자리 순.
   */
  stageEnterOrder?: string[];
  /**
   * 자리 기억을 이 줄에서 완전히 비움 (무대 리셋).
   * 이후 화자는 빈 무대에서 한 명씩 새로 등장.
   */
  resetStage?: boolean;
  /** 이 줄에서 배경이 바뀌면 스탠딩을 전부 퇴장 */
  resetOnBackgroundChange?: boolean;
  /**
   * 수동 무대 명령 — 자동 LRU보다 우선.
   * { enter, slot, exit, clear }
   */
  stage?: ScenarioVnStageCmd;
  /**
   * 핸드아웃(소품/증거 이미지).
   * undefined=이전 유지 · null=숨기기 · string=해당 키 표시 (BGM 과 동일 sticky)
   */
  handout?: string | null;
};

export type ScenarioVnBackground = {
  key: string;
  /** 장소 이름 — 「장소 배너 표시」가 켜져 있으면 배너에 이 이름이 뜸 */
  label: string;
  /** URL 또는 data URL */
  image?: string;
  /**
   * 이 배경을 고를 때 장소 배너도 띄울지.
   * false면 배경만 바뀌고 배너는 안 뜸. 기본 true.
   */
  announceLocation?: boolean;
};

export type ScenarioVnBgm = {
  key: string;
  /** 목록에 표시될 이름 (예: "긴장되는 씬") */
  label: string;
  /** URL 또는 data URL */
  audio?: string;
};

/** VN 환경음 — 관객 웅성임·바깥 소리 등 루프 재생 */
export type ScenarioVnAmbient = {
  key: string;
  label: string;
  audio?: string;
};

/** VN 다이스 효과음 — 굴림·판정 연출용 */
export type ScenarioVnDiceSfx = {
  key: string;
  label: string;
  /** URL 또는 data URL */
  audio?: string;
};

/** VN 다이스 컷인 — 굴림 연출용 GIF/이미지 */
export type ScenarioVnDiceCutin = {
  key: string;
  label: string;
  /** URL 또는 data URL */
  image?: string;
};

/** CoC 등 판정 문구 → 연출·효과음 톤 */
export type DiceResultTone = 'extreme' | 'great' | 'ok' | 'fail' | 'fumble' | 'neutral';

/** 판정 종류별 기본 결과 효과음 키 (diceSfxList) */
export type ScenarioVnDiceResultSfxByTone = Partial<
  Record<Exclude<DiceResultTone, 'neutral'>, string>
>;

/** 판정 종류별 컷인 GIF 키 (diceCutinList) */
export type ScenarioVnDiceCutinByTone = ScenarioVnDiceResultSfxByTone;

export const DICE_RESULT_TONE_OPTIONS: {
  tone: Exclude<DiceResultTone, 'neutral'>;
  label: string;
}[] = [
  { tone: 'extreme', label: '극단적 성공' },
  { tone: 'great', label: '대성공' },
  { tone: 'ok', label: '성공' },
  { tone: 'fail', label: '실패' },
  { tone: 'fumble', label: '대실패' },
];

/** 기본 키가 비었거나 목록에 없으면, 등록된 첫 항목을 씀 (업로드만 하고 셀렉트를 안 고른 경우) */
export function pickDefaultDiceKey(
  explicit: string | undefined,
  map: Record<string, string> | undefined,
): string | undefined {
  const table = map || {};
  const e = (explicit || '').trim();
  if (e && table[e]) return e;
  if (
    e &&
    (/^https?:\/\//i.test(e) ||
      e.startsWith('/') ||
      e.startsWith('data:') ||
      e.startsWith('blob:'))
  ) {
    return e;
  }
  return Object.keys(table)[0] || undefined;
}

/** 줄 지정 → 판정 종류별 컷인 → 그 외 폴백 */
export function pickDiceCutinKey(
  dice: Pick<VnDiceRoll, 'result' | 'cutin'>,
  byTone: ScenarioVnDiceCutinByTone | undefined,
  fallback?: string,
): string {
  const line = dice.cutin?.trim();
  if (line) return line;
  const tone = classifyDiceResultTone(dice.result);
  if (tone !== 'neutral') {
    const keyed = byTone?.[tone]?.trim();
    if (keyed) return keyed;
  }
  return fallback?.trim() || '';
}

/** 판정 결과 문자열 → 톤 (효과음·연출 공통) */
export function classifyDiceResultTone(result: string): DiceResultTone {
  const r = result.trim();
  if (/펌블|대실패|Fumble/i.test(r)) return 'fumble';
  if (/극단|극한|Extreme|크리티컬|Critical/i.test(r)) return 'extreme';
  if (/대성공|특별성공|Hard\s*Success|Great\s*Success/i.test(r)) return 'great';
  if (/성공|Success/i.test(r)) return 'ok';
  if (/실패|Fail/i.test(r)) return 'fail';
  return 'neutral';
}

/** VN 핸드아웃 — 키퍼가 보여주는 편지·사진 등 */
export type ScenarioVnHandout = {
  key: string;
  label: string;
  /** URL 또는 data URL */
  image?: string;
  /** 화면 위치·크기·모서리 (중앙 기준 x/y%, scale, radius px) */
  layout?: import('@/lib/vn/menuTheme').HandoutLayout;
};

export type ScenarioVnSpeaker = {
  /** 로그 원문 화자명 — 라인의 speakerKey와 매칭되는 키 */
  key: string;
  /** 대사창에 보일 이름 (편집 가능) */
  displayName: string;
  /** 로그에서 추출한 색상 — 참고용 */
  color?: string;
  position: 'left' | 'center' | 'right';
  /** URL 또는 data URL */
  sprite?: string;
  /** 이 화자의 대사는 전부 나레이션으로 표시 */
  treatAsNarration?: boolean;
  /**
   * true면 스탠딩 없이 이름표+대사만.
   * 스프라이트 없는 엑스트라(자리 차지)와 다름 — 기존 no-sprite 동작은 유지.
   */
  extra?: boolean;
  /** 이름표 옆 보조 라벨. 예: 목소리 */
  voiceLabel?: string;
  /** 스탠딩 위치·크기 (미리보기 드래그·휠) — 호환용, center 버전과 동기 */
  standPos?: ScenarioVnStandPos;
  /**
   * 좌석별 버전 포즈.
   * 처음 등장해 앉은 자리(왼/중/우)용 크기·세로·미세 좌우. 말할 때마다 자리를 바꾸지 않음.
   */
  standPosBySlot?: import('@/lib/vn/standPosBySlot').ScenarioVnStandPosBySlot;
  /** 스탠딩 등장 애니메이션 */
  standAnimation?: ScenarioVnStandAnim;
  /** 스탠딩 탭 — 이 인물의 기본 고정 자리. 없으면 등장 순 */
  homeSlot?: import('@/lib/vn/standPosBySlot').TrioSlot;
  /** @deprecated standPos — 구 저장 데이터 */
  standPose?: ScenarioVnStandPose;
};

export type ScenarioVnScene = {
  id: string;
  title: string;
  speakers: ScenarioVnSpeaker[];
  lines: ScenarioVnLine[];
  backgrounds?: ScenarioVnBackground[];
  bgms?: ScenarioVnBgm[];
  ambients?: ScenarioVnAmbient[];
  handouts?: ScenarioVnHandout[];
  /** 다이스 효과음 목록 */
  diceSfxList?: ScenarioVnDiceSfx[];
  /** 다이스 컷인 GIF 목록 */
  diceCutinList?: ScenarioVnDiceCutin[];
  /** 기본 굴림 효과음 키 (diceSfxList) */
  diceRollSfx?: string;
  /** 종류별 미지정·기타 판정 폴백 컷인 키 (diceCutinList) */
  diceRollCutin?: string;
  /** 판정 종류별 컷인 GIF 키 */
  diceCutinByTone?: ScenarioVnDiceCutinByTone;
  /**
   * 기본 판정 결과 효과음 키 (선택) — 종류별 미지정·기타 판정 폴백
   * @deprecated 가능하면 diceResultSfxByTone 사용
   */
  diceResultSfx?: string;
  /** 판정 종류별 기본 결과 효과음 키 */
  diceResultSfxByTone?: ScenarioVnDiceResultSfxByTone;
  /** 동시 등장 최대 인원 — 3 | 4 | 'all'(스프라이트 있는 화자 전원) */
  maxOnStage?: number | 'all';
  /**
   * 씬 기본 무대 자리 (왼쪽→오른쪽 / 1→N).
   * 줄별 stageOrder가 있으면 그 줄부터 덮어씀.
   */
  stageOrder?: string[];
  /**
   * 등장 순(1·2·3번째)이 앉을 왼/중/오. 3명 배치용 구 필드.
   * @deprecated stageSeatLayout[3] 사용
   */
  stageSeatOrder?: import('@/lib/vn/standPosBySlot').TrioSlot[];
  /** 1·2·3명일 때 등장 순 → 자리. 기본 1=중앙, 2=왼·오, 3=왼·중·오 */
  stageSeatLayout?: import('@/lib/vn/standPosBySlot').StageSeatLayoutByCount;
  /** 타이틀(메인) 화면 배경·블러 */
  menuTheme?: import('@/lib/vn/menuTheme').ScenarioVnMenuTheme;
  /**
   * @deprecated 줄별 chapterLoadingBefore/After 사용.
   * true면 줄별 미지정 챕터에 before 로딩 적용 (구 데이터 호환).
   */
  chapterLoading?: boolean;
};

/** 엑스트라 NPC 스프라이트 키 — resolvers.spriteUrl 에서 공용 이미지로 매핑 */
export const VN_NPC_CHARACTER = '__npc__';

export type VnMaxOnStage = 1 | 2 | 3 | 4 | 5 | 'all';

export type ToVnSceneOptions = {
  /** 동시에 화면에 띄울 최대 등장인물 수 (기본 3, 'all' = 스프라이트 화자 전원) */
  maxOnStage?: number | 'all';
};

/** 캐릭터 위치 슬롯 — 등장 순: 0=왼쪽, 1=중앙, 2=오른쪽 */
function seatPosition(seatIndex: number): 'left' | 'center' | 'right' {
  return seatIndexToSlot(seatIndex);
}

function seatExtraX(seatIndex: number): number {
  return seatIndex >= 3 ? 12 * (seatIndex - 2) : 0;
}

/** 좌석 기본 X% — 등장 순 슬롯 (화자 position 고정 안 씀) */
function seatLaneX(seatIndex: number): number {
  const pos = seatPosition(seatIndex);
  return VN_STAND_LAYOUT.slotBaseX[pos] + seatExtraX(seatIndex);
}

export function normalizeVnMaxOnStage(raw: unknown): VnMaxOnStage {
  if (raw === 'all' || raw === 'ALL') return 'all';
  const n = Number(raw);
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) return n as VnMaxOnStage;
  return 3;
}

/** 대사 줄 sticky용 — 없거나 잘못되면 undefined */
export function parseLineMaxOnStage(raw: unknown): VnMaxOnStage | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (raw === 'all' || raw === 'ALL') return 'all';
  const n = Number(raw);
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) return n as VnMaxOnStage;
  return undefined;
}

/** 무대 자리/등장 순서 키 목록. 빈 칸 유지, 전부 공백이면 null */
export function parseSpeakerKeyList(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const seen = new Set<string>();
  const out = raw.map((item) => {
    const k = String(item || '').trim();
    if (!k) return '';
    if (seen.has(k)) return '';
    seen.add(k);
    return k;
  });
  return out.some((k) => k) ? out : null;
}

export function parseStageCmd(raw: unknown): ScenarioVnStageCmd | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  const slotRaw = String(row.slot || '').trim();
  const slot: TrioSlot | undefined =
    slotRaw === 'left' || slotRaw === 'center' || slotRaw === 'right'
      ? slotRaw
      : undefined;
  const enter = String(row.enter || '').trim() || undefined;
  const exit = String(row.exit || '').trim() || undefined;
  const clear = row.clear === true ? true : undefined;
  if (!enter && !exit && !clear && !slot) return undefined;
  return { enter, slot, exit, clear };
}

/** 재생 시 실제 동시 등장 상한 */
export function resolveMaxOnStage(
  max: number | 'all' | undefined,
  speakers: ScenarioVnSpeaker[],
): number {
  if (max === 'all') {
    const n = speakers.filter((s) => s.sprite?.trim()).length;
    return Math.max(1, n);
  }
  const n = Number(max);
  if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  return 3;
}

/**
 * n명 동시 등장 시 i번째 자동 배치 — `lib/vn/standLayout` 로 이전.
 * @deprecated import { crowdStandLayout } from '@/lib/vn/standLayout'
 */
export { crowdStandLayout } from '@/lib/vn/standLayout';

const BLOCK_RE =
  /<p style="color:(#[0-9a-fA-F]{6});">\s*<span>\s*\[(.*?)\]<\/span>\s*<span>(.*?)<\/span>\s*:\s*<span>\s*([\s\S]*?)\s*<\/span>\s*<\/p>/g;

/**
 * Ccfolia CoC 판정. `패널티`/`페널티`, 주사위[0]/[0,0], CCB, 전각 ＞ 모두 허용.
 * 예: CC<=85  요리 (1D100<=85) 보너스, 페널티 주사위[0] ＞ 16 ＞ 16 ＞ 극단적 성공
 */
const DICE_TEXT_RE =
  /^CCB?\s*<=\s*(\d+)\s+(.+?)\s*\(\s*1\s*[dD]\s*100\s*<=\s*\d+\s*\)[\s\S]*?[＞>]\s*(\d+)\s*[＞>]\s*(\d+)\s*[＞>]\s*(.+)$/;

export function parseCcfoliaDiceText(text: string, actor = ''): VnDiceRoll | null {
  const t = String(text || '')
    .trim()
    .replace(/\u3000/g, ' ');
  const m = t.match(DICE_TEXT_RE);
  if (!m) return null;
  const target = Number(m[1]);
  const roll = Number(m[4]);
  if (!Number.isFinite(target) || !Number.isFinite(roll)) return null;
  return {
    actor: actor.trim(),
    skill: m[2]!.trim(),
    target,
    roll,
    result: m[5]!.trim(),
  };
}

export function withParsedDiceLine(line: ScenarioVnLine): ScenarioVnLine {
  if (line.effect === 'titlecard') return line;
  if (line.effect === 'diceRoll' && line.diceRoll) return line;
  const parsed = parseCcfoliaDiceText(line.text, line.diceRoll?.actor || line.speakerKey);
  if (!parsed) return line;
  return { ...line, effect: 'diceRoll', diceRoll: parsed };
}

let decoder: HTMLTextAreaElement | null = null;
function decodeEntities(s: string): string {
  if (typeof document === 'undefined') return s;
  if (!decoder) decoder = document.createElement('textarea');
  decoder.innerHTML = s;
  return decoder.value;
}

function cleanText(raw: string): string {
  let t = raw.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<[^>]+>/g, '');
  t = decodeEntities(t);
  t = t.replace(/[ \t]+\n/g, '\n');
  t = t.replace(/\n{2,}/g, '\n');
  return t.trim();
}

const AUTO_POSITIONS: Array<ScenarioVnSpeaker['position']> = ['left', 'right', 'center'];

/** KP/키퍼로 흔히 쓰이는 이름 — 처음엔 나레이션으로 기본 체크해줌 (수정 가능) */
const LIKELY_NARRATION_NAMES = ['kp', 'keeper', '키퍼', 'gm'];

function isAssetUrl(v: string) {
  return /^https?:\/\//i.test(v) || v.startsWith('data:') || v.startsWith('blob:');
}

export function parseCcfoliaLog(html: string): { speakers: ScenarioVnSpeaker[]; lines: ScenarioVnLine[] } {
  const lines: ScenarioVnLine[] = [];
  const speakerOrder: string[] = [];
  const speakerColor = new Map<string, string>();

  let i = 0;
  let match: RegExpExecArray | null;
  BLOCK_RE.lastIndex = 0;
  while ((match = BLOCK_RE.exec(html))) {
    i += 1;
    const [, color, , speakerRaw, textHtml] = match;
    const speaker = speakerRaw.trim();
    const text = cleanText(textHtml);
    if (!text) continue;

    if (!speakerColor.has(speaker)) {
      speakerColor.set(speaker, color);
      speakerOrder.push(speaker);
    }

    const id = `L${String(i).padStart(4, '0')}`;
    const dice = parseCcfoliaDiceText(text, speaker);

    if (dice) {
      lines.push({
        id,
        speakerKey: speaker,
        text,
        effect: 'diceRoll',
        diceRoll: dice,
      });
    } else {
      lines.push({ id, speakerKey: speaker, text });
    }
  }

  const speakers: ScenarioVnSpeaker[] = speakerOrder.map((key, idx) => ({
    key,
    displayName: key,
    color: speakerColor.get(key),
    position: AUTO_POSITIONS[idx % AUTO_POSITIONS.length],
    treatAsNarration: LIKELY_NARRATION_NAMES.includes(key.toLowerCase()),
  }));

  return { speakers, lines };
}

/** 편집기 상태 → 저장용 씬 (재생은 scenarioVnToEnginePayload) */
export function toVnScene(
  id: string,
  title: string,
  speakers: ScenarioVnSpeaker[],
  lines: ScenarioVnLine[],
  opts?: ToVnSceneOptions & {
    backgrounds?: ScenarioVnBackground[];
    bgms?: ScenarioVnBgm[];
    ambients?: ScenarioVnAmbient[];
    handouts?: ScenarioVnHandout[];
    diceSfxList?: ScenarioVnDiceSfx[];
    diceCutinList?: ScenarioVnDiceCutin[];
    diceRollSfx?: string;
    diceRollCutin?: string;
    diceCutinByTone?: ScenarioVnDiceCutinByTone;
    diceResultSfx?: string;
    diceResultSfxByTone?: ScenarioVnDiceResultSfxByTone;
    menuTheme?: import('@/lib/vn/menuTheme').ScenarioVnMenuTheme;
    chapterLoading?: boolean;
    stageOrder?: string[];
    stageSeatOrder?: import('@/lib/vn/standPosBySlot').TrioSlot[];
    stageSeatLayout?: import('@/lib/vn/standPosBySlot').StageSeatLayoutByCount;
  },
): ScenarioVnScene {
  const max = normalizeVnMaxOnStage(opts?.maxOnStage);
  return {
    id,
    title,
    speakers,
    lines,
    backgrounds: opts?.backgrounds ?? [],
    bgms: opts?.bgms ?? [],
    ambients: opts?.ambients ?? [],
    handouts: opts?.handouts ?? [],
    diceSfxList: opts?.diceSfxList ?? [],
    diceCutinList: opts?.diceCutinList ?? [],
    diceRollSfx: opts?.diceRollSfx,
    diceRollCutin: opts?.diceRollCutin,
    diceCutinByTone: opts?.diceCutinByTone,
    diceResultSfx: opts?.diceResultSfx,
    diceResultSfxByTone: opts?.diceResultSfxByTone,
    maxOnStage: max,
    stageOrder: parseSpeakerKeyList(opts?.stageOrder) ?? undefined,
    stageSeatOrder: opts?.stageSeatOrder,
    stageSeatLayout: opts?.stageSeatLayout,
    menuTheme: opts?.menuTheme,
    chapterLoading: opts?.chapterLoading ? true : undefined,
  };
}

/** 저장·재생용 — 동시 등장 제한 + 엑스트라 NPC + 표정/음성 필드 */
export function scenarioVnToEnginePayload(scene: ScenarioVnScene) {
  const lines = collapseStickyVignette(scene.lines).map(withParsedDiceLine);
  const bySpeaker = new Map(scene.speakers.map((s) => [s.key, s]));
  const spriteMap: Record<string, string> = {};
  for (const sp of scene.speakers) {
    if (sp.sprite?.trim()) spriteMap[sp.key] = sp.sprite.trim();
  }
  const backgroundMap: Record<string, string> = {};
  for (const bg of scene.backgrounds ?? []) {
    if (bg.image?.trim()) backgroundMap[bg.key] = bg.image.trim();
  }
  const bgmMap: Record<string, string> = {};
  for (const b of scene.bgms ?? []) {
    if (b.audio?.trim()) bgmMap[b.key] = b.audio.trim();
  }
  const ambientMap: Record<string, string> = {};
  for (const a of scene.ambients ?? []) {
    if (a.audio?.trim()) ambientMap[a.key] = a.audio.trim();
  }
  const handoutMap: Record<string, string> = {};
  const handoutLayoutMap: Record<string, import('@/lib/vn/menuTheme').HandoutLayout> = {};
  for (const h of scene.handouts ?? []) {
    if (h.image?.trim()) handoutMap[h.key] = h.image.trim();
    if (h.layout) {
      handoutLayoutMap[h.key] = {
        x: h.layout.x ?? 0,
        y: h.layout.y ?? 0,
        scale: h.layout.scale ?? 1,
        radius: h.layout.radius ?? 0,
      };
    }
  }
  const diceSfxMap: Record<string, string> = {};
  for (const d of scene.diceSfxList ?? []) {
    if (d.audio?.trim()) diceSfxMap[d.key] = d.audio.trim();
  }
  const diceCutinMap: Record<string, string> = {};
  for (const d of scene.diceCutinList ?? []) {
    if (d.image?.trim()) diceCutinMap[d.key] = d.image.trim();
  }

  const maxOnStage = resolveMaxOnStage(scene.maxOnStage, scene.speakers);
  let occupancyCap = maxOnStage;
  const currentFill = () =>
    stageSeatFillIndices(occupancyCap, scene.stageSeatLayout, scene.stageSeatOrder);

  /** 대사 줄 「자리 고정」만 하드 핀. homeSlot은 들어갈 때 선호일 뿐 칸을 막지 않음. */
  function hardPinSlotOf(key: string): number | null {
    const k = (key || '').trim();
    if (!k || !stickyStageOrder) return null;
    const i = stickyStageOrder.findIndex((x) => (x || '').trim() === k);
    return i >= 0 ? i : null;
  }

  /** 이 인물이 앉을 칸: 줄 자리 고정 → 화자 기본 고정 자리 */
  function preferSlotOf(key: string): number | null {
    const hard = hardPinSlotOf(key);
    if (hard != null) return hard;
    const home = bySpeaker.get((key || '').trim())?.homeSlot;
    if (home === 'left') return 0;
    if (home === 'center') return 1;
    if (home === 'right') return 2;
    return null;
  }

  function isHardPinned(key: string | null | undefined): boolean {
    const k = (key || '').trim();
    if (!k || speakerIsVoiceOnly(k) || speakerIsExtra(k)) return false;
    return hardPinSlotOf(k) != null;
  }

  /** 3명 이하는 왼·중·오 레인(길이 3)을 유지. 2명일 때 가운데를 비우고 양옆만 씀. */
  const seats: (string | null)[] = Array.from(
    { length: Math.max(occupancyCap, occupancyCap <= 3 ? 3 : occupancyCap) },
    () => null,
  );
  /** 마지막으로 말한 줄 번호 — 클수록 최근 (퇴장 우선순위만) */
  const lastIndex = new Map<string, number>();
  let lineIndex = 0;
  /** 화자별 마지막 표정/스탠딩 URL */
  const lastExpr = new Map<string, string>();
  /** 화자별 표정 유지 끝 줄 인덱스 (없으면 계속 유지) */
  const exprUntilIdx = new Map<string, number>();
  const lineIdToIndex = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    lineIdToIndex.set(lines[i]!.id, i);
  }
  /** sticky — true면 스탠딩 출력 숨김 (자리 기억은 유지) */
  let hideStandingsActive = false;
  /** sticky — true면 장소 배너 숨김 */
  let hideLocationActive = false;
  /** true면 화면 비네트 ON. 줄의 true/false 지정 시만 바뀌고, 미지정은 유지 */
  let vignetteActive = false;
  /** true면 시야 흐림 ON */
  let visionBlurActive = false;
  /** sticky 무대 자리 순서 (왼쪽→오른쪽). null이면 등장순 자동 */
  let stickyStageOrder: string[] | null = null;
  /** sticky 등장 연출 순서 */
  let stickyEnterOrder: string[] | null = null;

  function speakerIsVoiceOnly(key: string): boolean {
    const k = (key || '').trim();
    if (!k) return false;
    return Boolean(bySpeaker.get(k)?.extra);
  }

  function speakerIsExtra(key: string): boolean {
    const k = (key || '').trim();
    if (!k || k === VN_NPC_CHARACTER) return false;
    const sp = bySpeaker.get(k);
    if (sp?.treatAsNarration || sp?.extra) return false;
    return !Boolean(sp?.sprite?.trim());
  }

  function resolveNamedKey(raw: string | undefined): string | null {
    const name = (raw || '').trim();
    if (!name) return null;
    if (bySpeaker.has(name)) return name;
    const hit = [...bySpeaker.values()].find(
      (s) => s.key === name || s.displayName === name,
    );
    return hit?.key || name;
  }

  function lineIsNarration(row: ScenarioVnLine): boolean {
    if (row.effect === 'titlecard') return true;
    const sp = bySpeaker.get(row.speakerKey);
    return Boolean(row.narrationOnly || sp?.treatAsNarration || !row.speakerKey);
  }

  function lineActorKey(row: ScenarioVnLine): string | null {
    if (row.effect === 'diceRoll' && row.diceRoll?.actor?.trim()) {
      const actorName = row.diceRoll.actor.trim();
      const actorSp =
        bySpeaker.get(actorName) ||
        [...bySpeaker.values()].find(
          (s) => s.key === actorName || s.displayName === actorName,
        );
      const k = (actorSp?.key || actorName).trim();
      return k || null;
    }
    if (lineIsNarration(row)) return null;
    const k = (row.speakerKey || '').trim();
    return k || null;
  }

  /** 스탠딩 탭 인원별 등장 순(기본 3명=왼→중→오). 줄 자리 고정 칸은 항상 포함. */
  function fillSeatIndices(): number[] {
    const base = currentFill().filter((i) => i < seats.length);
    const seen = new Set(base);
    const out = [...base];
    if (stickyStageOrder) {
      stickyStageOrder.forEach((raw, i) => {
        if (!(raw || '').trim() || seen.has(i) || i >= seats.length) return;
        seen.add(i);
        out.push(i);
      });
    }
    return out;
  }

  function reservedSlotsExcept(forKey: string): Set<number> {
    const out = new Set<number>();
    for (let i = 0; i < seats.length; i++) {
      const k = seats[i];
      if (!k || k === forKey || !isHardPinned(k)) continue;
      const pin = hardPinSlotOf(k);
      if (pin != null) out.add(pin);
    }
    return out;
  }

  function seatFreeFor(i: number, key: string): boolean {
    if (i < 0 || i >= seats.length) return false;
    if (seats[i] && seats[i] !== key) return false;
    if (preferSlotOf(key) === i) return true;
    if (reservedSlotsExcept(key).has(i)) return false;
    return fillSeatIndices().includes(i);
  }

  function pickEmptySlot(key: string, forced?: number | null): number | null {
    if (forced != null && seatFreeFor(forced, key) && !seats[forced]) return forced;
    const prefer = preferSlotOf(key);
    if (
      prefer != null &&
      (seats[prefer] == null || seats[prefer] === key || !isHardPinned(seats[prefer]))
    ) {
      return prefer;
    }
    for (const i of fillSeatIndices()) {
      if (!seats[i] && seatFreeFor(i, key)) return i;
    }
    return null;
  }

  /** 핀·현재 화자는 퇴장 후보 아님 */
  function lruVictimIndex(protect: string | null): number {
    const fill = fillSeatIndices();
    const rows = seats
      .map((key, seatIndex) =>
        key && fill.includes(seatIndex)
          ? {
              key,
              seatIndex,
              li: lastIndex.get(key) ?? 0,
              extra: speakerIsExtra(key),
            }
          : null,
      )
      .filter((x): x is { key: string; seatIndex: number; li: number; extra: boolean } => x != null)
      .filter((x) => x.key !== protect && !isHardPinned(x.key));
    if (!rows.length) return -1;
    rows.sort((a, b) => {
      if (a.extra !== b.extra) return a.extra ? -1 : 1;
      return a.li - b.li;
    });
    return rows[0]!.seatIndex;
  }

  function occupySeat(key: string, dest: number) {
    for (let i = 0; i < seats.length; i++) {
      if (seats[i] === key) seats[i] = null;
    }
    if (dest >= 0 && dest < seats.length) seats[dest] = key;
  }

  function displaceIfUnpinned(fromSlot: number, incoming: string) {
    const occ = seats[fromSlot];
    if (!occ || occ === incoming) return;
    if (isHardPinned(occ)) return;
    seats[fromSlot] = null;
    const alt = pickEmptySlot(occ);
    if (alt != null) occupySeat(occ, alt);
  }

  function enterOnStage(key: string, forcedSlot?: number | null) {
    if (!key || speakerIsVoiceOnly(key)) return;
    const pin = preferSlotOf(key);
    const destWanted =
      forcedSlot != null && forcedSlot >= 0 ? forcedSlot : pin;

    if (seats.includes(key) && destWanted == null) return;
    if (destWanted != null) {
      const occ = seats[destWanted];
      if (occ && occ !== key && isHardPinned(occ)) {
        /* 다른 핀 칸은 못 씀 */
      } else {
        if (occ && occ !== key) displaceIfUnpinned(destWanted, key);
        if (seats[destWanted] == null || seats[destWanted] === key) {
          occupySeat(key, destWanted);
          return;
        }
      }
      if (seats.includes(key) && pin != null && seats[pin] === key) return;
    }

    let dest = pickEmptySlot(key, destWanted);
    if (dest == null) {
      const vi = lruVictimIndex(key);
      if (vi >= 0) {
        seats[vi] = null;
        dest = vi;
      }
    }
    if (dest != null) occupySeat(key, dest);
  }

  function slotLabel(i: number): string {
    return i === 0 ? 'left' : i === 1 ? 'center' : i === 2 ? 'right' : `s${i}`;
  }

  function seatSnapshot(): string {
    return seats
      .map((k, i) => (k ? `${slotLabel(i)}:${bySpeaker.get(k)?.displayName || k}` : ''))
      .filter(Boolean)
      .join(', ');
  }

  let prevSeatSnap = '';
  function logSeatChange(reason: string) {
    const next = seatSnapshot();
    if (next === prevSeatSnap) return;
    const line = lines[Math.max(0, lineIndex - 1)];
    console.debug('[vn-stand]', reason, {
      line: line?.id,
      speaker: line?.speakerKey,
      from: prevSeatSnap || '(empty)',
      to: next || '(empty)',
    });
    prevSeatSnap = next;
  }

  /** 줄 「자리 고정」만 무대에 미리 앉힘. */
  function ensurePinnedOnStage() {
    if (!stickyStageOrder) return;
    for (const raw of stickyStageOrder) {
      const k = (raw || '').trim();
      if (!k || !isHardPinned(k)) continue;
      const p = hardPinSlotOf(k);
      if (p != null) enterOnStage(k, p);
    }
  }

  /**
   * 등장 순 자리로 앉힘. 지금 화자는 반드시 무대에 둔다.
   */
  function applyLruCast(speakingKey: string | null) {
    const actor =
      speakingKey && !speakerIsVoiceOnly(speakingKey) ? speakingKey : null;
    if (speakingKey) lastIndex.set(speakingKey, lineIndex);

    ensurePinnedOnStage();

    const seatedN = seats.filter(Boolean).length;
    const needEnter = Boolean(actor && !seats.includes(actor));
    let over = seatedN - occupancyCap + (needEnter ? 1 : 0);
    while (over > 0) {
      const vi = lruVictimIndex(actor);
      if (vi < 0) break;
      seats[vi] = null;
      over -= 1;
    }

    if (actor) enterOnStage(actor);
    ensurePinnedOnStage();
    logSeatChange('cast');
  }

  function applyStageCmd(cmd: ScenarioVnStageCmd | undefined) {
    if (!cmd) return;
    if (cmd.clear) {
      for (let i = 0; i < seats.length; i++) seats[i] = null;
      lastIndex.clear();
      lastExpr.clear();
      exprUntilIdx.clear();
      stickyStageOrder = null;
      stickyEnterOrder = null;
    }
    const exitKey = resolveNamedKey(cmd.exit);
    if (exitKey) {
      const i = seats.indexOf(exitKey);
      if (i >= 0) seats[i] = null;
    }
    const enterKey = resolveNamedKey(cmd.enter);
    if (enterKey && !speakerIsVoiceOnly(enterKey)) {
      const slot = cmd.slot;
      const forced =
        slot === 'left' || slot === 'center' || slot === 'right'
          ? trioSlotToSeatIndex(slot)
          : null;
      enterOnStage(enterKey, forced);
      lastIndex.set(enterKey, lineIndex);
    }
    logSeatChange('stage-cmd');
  }

  function resizeSeats(nextMax: number) {
    occupancyCap = Math.max(1, nextMax);
    const len = occupancyCap <= 3 ? 3 : occupancyCap;
    const next: (string | null)[] = Array.from({ length: len }, () => null);
    for (let i = 0; i < Math.min(seats.length, len); i++) next[i] = seats[i];
    const fill = fillSeatIndices();
    for (let i = 0; i < next.length; i++) {
      const k = next[i];
      if (!k) continue;
      if (isHardPinned(k)) {
        const p = hardPinSlotOf(k);
        if (p != null && p < len && p !== i) {
          const occ = next[p];
          next[i] = occ && !isHardPinned(occ) ? occ : null;
          next[p] = k;
        }
        continue;
      }
      if (fill.includes(i)) continue;
      next[i] = null;
      const dest = fill.find((idx) => idx < len && next[idx] == null && !reservedSlotsExcept(k).has(idx));
      if (dest != null) next[dest] = k;
    }
    seats.splice(0, seats.length, ...next);
    const pinnedN = seats.filter((k) => k && isHardPinned(k)).length;
    const floaterCap = Math.max(0, occupancyCap - pinnedN);
    let extra =
      seats.filter((k) => k && !isHardPinned(k)).length - floaterCap;
    while (extra > 0) {
      const vi = lruVictimIndex(null);
      if (vi < 0) break;
      seats[vi] = null;
      extra -= 1;
    }
    ensurePinnedOnStage();
    logSeatChange('resize');
  }

  function baseSpriteFor(key: string): string {
    const sp = bySpeaker.get(key);
    return sp?.sprite?.trim() || spriteMap[key] || '';
  }

  /** until 지난 화자 sticky → 기본 스탠딩 */
  function expireExprsPast(currentIdx: number) {
    for (const [key, until] of [...exprUntilIdx.entries()]) {
      if (currentIdx <= until) continue;
      const base = baseSpriteFor(key);
      if (base) lastExpr.set(key, base);
      else lastExpr.delete(key);
      exprUntilIdx.delete(key);
    }
  }

  function resolveExpr(
    key: string,
    speakingKey: string | null,
    lineExpr?: string,
    persist = true,
    untilLineId?: string,
  ): string | null {
    const base = baseSpriteFor(key);
    const rawExpr = (speakingKey === key ? lineExpr?.trim() : '') || '';
    const exprUrl = rawExpr && isAssetUrl(rawExpr) ? rawExpr : '';

    if (!base) {
      if (speakingKey === key && exprUrl) {
        if (persist) lastExpr.set(key, exprUrl);
        return exprUrl;
      }
      return lastExpr.get(key) || 'default';
    }

    if (speakingKey === key) {
      if (exprUrl) {
        /* 표정 URL이 있을 때만 sticky 갱신 */
        if (persist) {
          lastExpr.set(key, exprUrl);
          const untilId = untilLineId?.trim() || '';
          if (untilId) {
            const idx = lineIdToIndex.get(untilId);
            if (idx != null) exprUntilIdx.set(key, idx);
            else exprUntilIdx.delete(key);
          } else {
            exprUntilIdx.delete(key);
          }
        }
        return exprUrl;
      }
      /* 표정 칸 비움 */
      if (persist) {
        /* 유지 모드: 이전 표정 없으면 기본 스탠딩 */
        const kept = lastExpr.get(key) || base;
        if (base && !lastExpr.has(key)) lastExpr.set(key, base);
        return kept || null;
      }
      /* 이번만 모드에서 표정 없음 → 기본 스탠딩 (sticky 표정으로 덮지 않음) */
      return base || null;
    }

    /* 비화자: 마지막 표정 유지, 없으면 기본 */
    if (!lastExpr.has(key) && base) lastExpr.set(key, base);
    return lastExpr.get(key) || base || null;
  }

  function buildSprites(
    speakingKey: string | null,
    lineExpr: string | undefined,
    persistExpr = true,
    untilLineId?: string,
  ): import('@/components/vn/types').VNSpriteSlot[] | undefined {
    const slots: import('@/components/vn/types').VNSpriteSlot[] = [];
    const occupied = seats
      .map((key, seatIndex) => (key ? { key, seatIndex } : null))
      .filter((x): x is { key: string; seatIndex: number } => x != null);
    const n = occupied.length;
    const useCrowd = n > 3;
    const crowdCount = Math.max(4, seats.length, n);
    const enterSeq = (
      stickyEnterOrder ||
      stickyStageOrder ||
      occupied.map((o) => o.key)
    ).filter((k): k is string => Boolean(k && k.trim()));
    const claimedX = new Set<number>();

    occupied.forEach(({ key, seatIndex }, i) => {
      const resolved = resolveExpr(key, speakingKey, lineExpr, persistExpr, untilLineId);
      if (!resolved) return;
      const sp = bySpeaker.get(key);
      const enterRank = enterSeq.indexOf(key);
      const enterDelayMs = enterRank >= 0 ? enterRank * 160 : 0;

      if (useCrowd) {
        /* 4명+ : 군중 칸 버전(crowd0~4) — 왼·중·오와 분리 저장 */
        const crowdSlot = seatIndexToCrowdSlot(seatIndex);
        const pose = resolveCrowdPose(sp, seatIndex, crowdCount);
        slots.push({
          character: key,
          expression: resolved,
          position: 'center',
          standSlot: crowdSlot,
          crowdLayout: true,
          dimmed: !speakingKey || speakingKey !== key,
          offsetX: pose.x,
          offsetY: pose.y,
          x: pose.x,
          y: pose.y,
          scale: pose.scale,
          anim: sp?.standAnimation || 'fade',
          enterDelayMs,
        });
        return;
      }

      const standSlot: StandSlot = seatPosition(seatIndex);
      const versionPose = resolveStandPoseForSlot(sp, standSlot);
      const laneX = seatLaneX(seatIndex);

      let x = versionPose.x;
      let y = versionPose.y;
      let scale = versionPose.scale;

      const rx = Math.round(x);
      if (claimedX.has(rx)) {
        x = laneX;
        if (claimedX.has(Math.round(x))) {
          const dir = seatIndex === 0 ? -1 : seatIndex === 1 ? 0 : 1;
          const nudge = dir === 0 ? 8 : dir * 8;
          let guard = 0;
          while (claimedX.has(Math.round(x)) && guard++ < 12) {
            x += nudge || 8;
          }
        }
      }
      claimedX.add(Math.round(x));

      slots.push({
        character: key,
        expression: resolved,
        position: 'center',
        standSlot,
        dimmed: !speakingKey || speakingKey !== key,
        offsetX: x,
        offsetY: y,
        x,
        y,
        scale,
        anim:
          sp?.standAnimation ||
          (standSlot === 'left'
            ? 'slide-left'
            : standSlot === 'right'
              ? 'slide-right'
              : 'fade'),
        enterDelayMs,
      });
    });

    return slots.length ? slots : undefined;
  }

  return {
    spriteMap,
    backgroundMap,
    bgmMap,
    ambientMap,
    handoutMap,
    handoutLayoutMap,
    diceSfxMap,
    diceCutinMap,
    diceRollSfx: scene.diceRollSfx,
    diceRollCutin: scene.diceRollCutin,
    diceCutinByTone: scene.diceCutinByTone,
    diceResultSfx: scene.diceResultSfx,
    diceResultSfxByTone: scene.diceResultSfxByTone,
    menuTheme: scene.menuTheme,
    chapterLoading: scene.chapterLoading ? true : undefined,
    scene: {
      id: scene.id,
      title: scene.title,
      type: 'dialogue' as const,
      lines: lines.map((l, mapIdx) => {
        lineIndex += 1;
        const location = l.location?.trim() || undefined;
        const prevBg = mapIdx > 0 ? lines[mapIdx - 1]?.background : undefined;
        const bgChanged = Boolean(
          l.background?.trim() && l.background.trim() !== (prevBg || '').trim(),
        );

        /* 무대 리셋은 명시적. 배경 전환은 핀을 유지하고 나머지만 비움 */
        if (l.resetStage || l.stage?.clear) {
          for (let i = 0; i < seats.length; i++) seats[i] = null;
          lastIndex.clear();
          lastExpr.clear();
          exprUntilIdx.clear();
          stickyStageOrder = null;
          stickyEnterOrder = null;
        } else if (l.resetOnBackgroundChange && bgChanged) {
          for (let i = 0; i < seats.length; i++) {
            if (seats[i] && !isHardPinned(seats[i])) seats[i] = null;
          }
        }

        const lineMax = parseLineMaxOnStage(l.maxOnStage);
        if (lineMax !== undefined) {
          resizeSeats(resolveMaxOnStage(lineMax, scene.speakers));
        }

        const orderPatch = parseSpeakerKeyList(l.stageOrder);
        if (orderPatch) {
          stickyStageOrder = orderPatch;
        }

        const enterPatch = parseSpeakerKeyList(l.stageEnterOrder);
        if (enterPatch) stickyEnterOrder = enterPatch;

        if (l.hideStandings === true) hideStandingsActive = true;
        else if (l.hideStandings === false) hideStandingsActive = false;

        if (l.hideLocation === true) hideLocationActive = true;
        else if (l.hideLocation === false) hideLocationActive = false;

        if (l.vignette === true) vignetteActive = true;
        else if (l.vignette === false) vignetteActive = false;

        if (l.visionBlur === true) visionBlurActive = true;
        else if (l.visionBlur === false) visionBlurActive = false;

        const lineIdx0 = lineIndex - 1;
        expireExprsPast(lineIdx0);

        if (l.effect === 'titlecard') {
          applyStageCmd(l.stage);
          applyLruCast(null);
          const titleSprites = hideStandingsActive
            ? undefined
            : buildSprites(null, undefined);
          return {
            id: l.id,
            text: '',
            effect: 'titlecard' as const,
            titleText: l.titleText || '',
            titleSubtext: l.titleSubtext?.trim() || undefined,
            chapterLoadingBefore: l.chapterLoadingBefore ? true : undefined,
            chapterLoadingAfter: l.chapterLoadingAfter ? true : undefined,
            background: l.background,
            location,
            hideLocation: hideLocationActive || undefined,
            vignette: vignetteActive,
            visionBlur: visionBlurActive,
            bgm: l.bgm,
            ambient: l.ambient,
            handout: l.handout,
            sfx: l.sfx,
            sprites: titleSprites,
          };
        }

        const sp = bySpeaker.get(l.speakerKey);
        const narration = Boolean(l.narrationOnly || sp?.treatAsNarration || !l.speakerKey);
        const mu = l.missionUpdate;
        const isNpc = !narration && !Boolean(sp?.sprite?.trim()) && Boolean(l.speakerKey);
        const expr = l.expression?.trim() || '';
        const persistExpr = l.expressionPersist !== false;
        const untilLineId =
          persistExpr && expr ? l.expressionUntilLineId?.trim() || undefined : undefined;

        let speakingKey = narration
          ? null
          : isNpc
            ? l.speakerKey
            : sp?.key || l.speakerKey || null;

        /* 다이스: actor 기준으로 스탠딩 등장·강조 (speakerKey와 키가 어긋나도 보정) */
        if (l.effect === 'diceRoll' && l.diceRoll?.actor?.trim()) {
          const actorName = l.diceRoll.actor.trim();
          const actorSp =
            bySpeaker.get(actorName) ||
            [...bySpeaker.values()].find(
              (s) => s.key === actorName || s.displayName === actorName,
            );
          const actorKey = actorSp?.key || actorName;
          if (actorSp?.sprite?.trim() || speakerIsExtra(actorKey)) {
            speakingKey = actorKey;
          }
        }

        applyStageCmd(l.stage);
        applyLruCast(speakingKey);

        /* seats 갱신은 위에서 끝 — hideStandings 는 sticky 출력만 숨김 */
        const built = buildSprites(
          speakingKey,
          expr,
          persistExpr,
          untilLineId,
        );
        const sprites = hideStandingsActive ? undefined : built;
        const nameBase = narration
          ? undefined
          : isNpc
            ? l.speakerKey || undefined
            : sp?.displayName || l.speakerKey || undefined;
        const voiceTag = sp?.voiceLabel?.trim();
        const speakerName =
          nameBase && voiceTag ? `${nameBase} (${voiceTag})` : nameBase;

        return {
          id: l.id,
          speaker: speakerName,
          speakerColor: narration ? undefined : sp?.color?.trim() || undefined,
          text: l.text,
          narrationOnly: narration || undefined,
          effect: l.effect === 'diceRoll' ? ('diceRoll' as const) : undefined,
          diceRoll: l.diceRoll,
          background: l.background,
          bgm: l.bgm,
          ambient: l.ambient,
          handout: l.handout,
          sfx: l.sfx,
          voice: l.voice?.trim() || undefined,
          location,
          hideLocation: hideLocationActive || undefined,
          vignette: vignetteActive,
          visionBlur: visionBlurActive,
          motion: isDialogueMotion(l.motion) ? l.motion : undefined,
          fx: isDialogueFx(l.fx) ? l.fx : undefined,
          missionUpdate: mu
            ? { id: mu.id, status: mu.status, title: mu.title }
            : undefined,
          sprites,
        };
      }),
    },
  };
}
