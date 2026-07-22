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
  type StandSlot,
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

/** CoC 등 판정 문구 → 연출·효과음 톤 */
export type DiceResultTone = 'extreme' | 'great' | 'ok' | 'fail' | 'fumble' | 'neutral';

/** 판정 종류별 기본 결과 효과음 키 (diceSfxList) */
export type ScenarioVnDiceResultSfxByTone = Partial<
  Record<Exclude<DiceResultTone, 'neutral'>, string>
>;

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
  /** 스탠딩 위치·크기 (미리보기 드래그·휠) — 호환용, center 버전과 동기 */
  standPos?: ScenarioVnStandPos;
  /**
   * 좌석별 버전 포즈.
   * 처음 등장해 앉은 자리(왼/중/우)용 크기·세로·미세 좌우. 말할 때마다 자리를 바꾸지 않음.
   */
  standPosBySlot?: import('@/lib/vn/standPosBySlot').ScenarioVnStandPosBySlot;
  /** 스탠딩 등장 애니메이션 */
  standAnimation?: ScenarioVnStandAnim;
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
  /** 기본 굴림 효과음 키 (diceSfxList) */
  diceRollSfx?: string;
  /**
   * 기본 판정 결과 효과음 키 (선택) — 종류별 미지정·기타 판정 폴백
   * @deprecated 가능하면 diceResultSfxByTone 사용
   */
  diceResultSfx?: string;
  /** 판정 종류별 기본 결과 효과음 키 */
  diceResultSfxByTone?: ScenarioVnDiceResultSfxByTone;
  /** 동시 등장 최대 인원 — 3 | 4 | 'all'(스프라이트 있는 화자 전원) */
  maxOnStage?: number | 'all';
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

const DICE_RE =
  /CC<=\s*(\d+)\s+(.+?)\s*\(1D100<=\d+\)\s*보너스,\s*패널티\s*주사위\[0\]\s*[＞>]\s*(\d+)\s*[＞>]\s*(\d+)\s*[＞>]\s*(.+)$/;

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
    const dice = DICE_RE.exec(text);

    if (dice) {
      const [, target, skill, , roll2, result] = dice;
      lines.push({
        id,
        speakerKey: speaker,
        text,
        effect: 'diceRoll',
        diceRoll: {
          actor: speaker,
          skill: skill.trim(),
          target: Number(target),
          roll: Number(roll2),
          result: result.trim(),
        },
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
    diceRollSfx?: string;
    diceResultSfx?: string;
    diceResultSfxByTone?: ScenarioVnDiceResultSfxByTone;
    menuTheme?: import('@/lib/vn/menuTheme').ScenarioVnMenuTheme;
    chapterLoading?: boolean;
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
    diceRollSfx: opts?.diceRollSfx,
    diceResultSfx: opts?.diceResultSfx,
    diceResultSfxByTone: opts?.diceResultSfxByTone,
    maxOnStage: max,
    menuTheme: opts?.menuTheme,
    chapterLoading: opts?.chapterLoading ? true : undefined,
  };
}

/** 저장·재생용 — 동시 등장 제한 + 엑스트라 NPC + 표정/음성 필드 */
export function scenarioVnToEnginePayload(scene: ScenarioVnScene) {
  const lines = collapseStickyVignette(scene.lines);
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

  const maxOnStage = resolveMaxOnStage(scene.maxOnStage, scene.speakers);
  /** 좌석 — 등장 순으로 앉힘(0 왼 → 1 중 → 2 오른). 한 번 앉으면 유지.
   * 정원 초과 시에만 ‘가장 오래 말 안 한’ 화자 교체 */
  const seats: (string | null)[] = Array.from({ length: maxOnStage }, () => null);
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
  /** true면 화면 비네트 ON. 줄의 true/false 지정 시만 바뀌고, 미지정은 유지 */
  let vignetteActive = false;
  /** true면 시야 흐림 ON */
  let visionBlurActive = false;
  /** 이미지 없는 화자 실루엣 — 첫 대사부터 씬 내 마지막 NPC 대사까지 유지 */
  let npcOnStage = false;
  /** sticky 무대 자리 순서 (왼쪽→오른쪽). null이면 등장순 자동 */
  let stickyStageOrder: string[] | null = null;
  /** sticky 등장 연출 순서 */
  let stickyEnterOrder: string[] | null = null;

  function isNpcLine(l: ScenarioVnLine): boolean {
    if (l.effect === 'titlecard') return false;
    const sp = bySpeaker.get(l.speakerKey);
    const narration = Boolean(l.narrationOnly || sp?.treatAsNarration || !l.speakerKey);
    if (narration) return false;
    return !Boolean(sp?.sprite?.trim()) && Boolean(l.speakerKey);
  }

  let lastNpcIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isNpcLine(lines[i]!)) lastNpcIdx = i;
  }

  function resizeSeats(nextMax: number) {
    const n = Math.max(1, nextMax);
    if (n === seats.length) return;
    if (n > seats.length) {
      while (seats.length < n) seats.push(null);
      return;
    }
    /* 축소 — 최신 n명만 남기되, 남은 인원의 좌→우 순서는 유지(자리 점프 방지) */
    const occupied = seats
      .map((key, seatIndex) =>
        key ? { key, seatIndex, li: lastIndex.get(key) ?? 0 } : null,
      )
      .filter((x): x is { key: string; seatIndex: number; li: number } => x != null);
    const kept = [...occupied].sort((a, b) => b.li - a.li).slice(0, n);
    kept.sort((a, b) => a.seatIndex - b.seatIndex);
    const next: (string | null)[] = Array.from({ length: n }, (_, i) => kept[i]?.key ?? null);
    seats.splice(0, seats.length, ...next);
  }

  function applyStageOrder(keys: string[]) {
    const max = seats.length;
    const next: (string | null)[] = Array.from({ length: max }, () => null);
    const seen = new Set<string>();
    for (let i = 0; i < Math.min(keys.length, max); i++) {
      const k = (keys[i] || '').trim();
      if (!k || seen.has(k)) continue;
      const sp = bySpeaker.get(k);
      if (!sp?.sprite?.trim()) continue;
      seen.add(k);
      next[i] = k;
      lastIndex.set(k, lineIndex);
    }
    seats.splice(0, seats.length, ...next);
  }

  function parseSpeakerKeyList(raw: unknown): string[] | null {
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

  function placeOnStage(key: string) {
    lastIndex.set(key, lineIndex);

    /* 이미 무대에 있으면 자리 그대로 — 매 대사마다 재배치하지 않음 */
    if (seats.includes(key)) return;

    const empty = seats.findIndex((s) => s == null);
    if (empty >= 0) {
      seats[empty] = key;
      return;
    }

    /* 정원 초과 — 가장 오래된 화자 자리에만 교체 (다른 사람 자리는 유지) */
    let oldestSeat = 0;
    let oldestLi = Infinity;
    for (let i = 0; i < seats.length; i++) {
      const k = seats[i];
      if (!k) continue;
      const li = lastIndex.get(k) ?? 0;
      if (li < oldestLi) {
        oldestLi = li;
        oldestSeat = i;
      }
    }
    seats[oldestSeat] = key;
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
    showNpc: boolean,
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
      const npcShift = showNpc ? -16 : 0;
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
          offsetX: pose.x + npcShift,
          offsetY: pose.y,
          x: pose.x + npcShift,
          y: pose.y,
          scale: pose.scale,
          anim: sp?.standAnimation || 'fade',
          enterDelayMs,
        });
        return;
      }

      const standSlot: StandSlot = seatPosition(seatIndex);
      const versionPose = resolveStandPoseForSlot(sp, standSlot);
      const laneX = seatLaneX(seatIndex) + npcShift;

      let x = versionPose.x + npcShift;
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
        anim: sp?.standAnimation || 'fade',
        enterDelayMs,
      });
    });

    if (showNpc) {
      slots.push({
        character: VN_NPC_CHARACTER,
        expression: 'default',
        position: 'right',
        standSlot: 'right',
        dimmed: speakingKey !== VN_NPC_CHARACTER,
        offsetX: VN_STAND_LAYOUT.slotBaseX.right,
        x: VN_STAND_LAYOUT.slotBaseX.right,
        anim: 'slide-right',
      });
    }

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
    diceRollSfx: scene.diceRollSfx,
    diceResultSfx: scene.diceResultSfx,
    diceResultSfxByTone: scene.diceResultSfxByTone,
    menuTheme: scene.menuTheme,
    chapterLoading: scene.chapterLoading ? true : undefined,
    scene: {
      id: scene.id,
      title: scene.title,
      type: 'dialogue' as const,
      lines: lines.map((l) => {
        lineIndex += 1;
        const location = l.location?.trim() || undefined;

        /* 무대 리셋 — 자리·LRU 전부 비운 뒤 이 줄 화자부터 다시 앉힘 */
        if (l.resetStage) {
          for (let i = 0; i < seats.length; i++) seats[i] = null;
          lastIndex.clear();
          npcOnStage = false;
          lastExpr.clear();
          exprUntilIdx.clear();
          stickyStageOrder = null;
          stickyEnterOrder = null;
        }

        const lineMax = parseLineMaxOnStage(l.maxOnStage);
        if (lineMax !== undefined) {
          resizeSeats(resolveMaxOnStage(lineMax, scene.speakers));
        }

        const orderPatch = parseSpeakerKeyList(l.stageOrder);
        if (orderPatch) {
          stickyStageOrder = orderPatch;
          applyStageOrder(stickyStageOrder);
        } else if (stickyStageOrder) {
          /* sticky 유지 — 정원 변경 후에도 같은 순서로 다시 앉힘 */
          applyStageOrder(stickyStageOrder);
        }

        const enterPatch = parseSpeakerKeyList(l.stageEnterOrder);
        if (enterPatch) stickyEnterOrder = enterPatch;

        if (l.hideStandings === true) hideStandingsActive = true;
        else if (l.hideStandings === false) hideStandingsActive = false;

        if (l.vignette === true) vignetteActive = true;
        else if (l.vignette === false) vignetteActive = false;

        if (l.visionBlur === true) visionBlurActive = true;
        else if (l.visionBlur === false) visionBlurActive = false;

        const lineIdx0 = lineIndex - 1;
        expireExprsPast(lineIdx0);

        const showNpc =
          npcOnStage && lastNpcIdx >= 0 && lineIdx0 <= lastNpcIdx;

        if (l.effect === 'titlecard') {
          const titleSprites = hideStandingsActive
            ? undefined
            : buildSprites(null, undefined, showNpc);
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
        const isCastMember = !narration && Boolean(sp?.sprite?.trim());
        const isNpc = !narration && !isCastMember && Boolean(l.speakerKey);
        const expr = l.expression?.trim() || '';
        const persistExpr = l.expressionPersist !== false;
        const untilLineId =
          persistExpr && expr ? l.expressionUntilLineId?.trim() || undefined : undefined;

        if (isNpc) npcOnStage = true;

        /* 다이스도 굴린 캐릭터를 무대에 올리고 하이라이트 — 자리 재배치는 placeOnStage 내부에서 기존 좌석 유지 */
        if (isCastMember && sp) {
          if (!stickyStageOrder || !seats.includes(sp.key)) {
            placeOnStage(sp.key);
          } else {
            lastIndex.set(sp.key, lineIndex);
          }
        }

        let speakingKey = narration
          ? null
          : isNpc
            ? VN_NPC_CHARACTER
            : sp?.key || l.speakerKey || null;

        /* 다이스: actor 기준으로 스탠딩 등장·강조 (speakerKey와 키가 어긋나도 보정) */
        if (l.effect === 'diceRoll' && l.diceRoll?.actor?.trim()) {
          const actorName = l.diceRoll.actor.trim();
          const actorSp =
            bySpeaker.get(actorName) ||
            [...bySpeaker.values()].find(
              (s) => s.key === actorName || s.displayName === actorName,
            );
          if (actorSp?.sprite?.trim()) {
            if (!stickyStageOrder || !seats.includes(actorSp.key)) {
              placeOnStage(actorSp.key);
            } else {
              lastIndex.set(actorSp.key, lineIndex);
            }
            speakingKey = actorSp.key;
          }
        }

        const showNpcNow =
          npcOnStage && lastNpcIdx >= 0 && lineIdx0 <= lastNpcIdx;

        /* seats 갱신은 위에서 끝 — hideStandings 는 sticky 출력만 숨김 */
        const built = buildSprites(
          speakingKey,
          expr,
          showNpcNow,
          persistExpr,
          untilLineId,
        );
        const sprites = hideStandingsActive ? undefined : built;

        return {
          id: l.id,
          speaker: narration
            ? undefined
            : isNpc
              ? l.speakerKey || undefined
              : sp?.displayName || l.speakerKey || undefined,
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
