import {
  crowdStandLayout,
  VN_STAND_LAYOUT,
  type StandSlotPosition,
} from '@/lib/vn/standLayout';
import { normalizeStandPose, type StandPose } from '@/lib/vn/useStandPoseDrag';
import type { ScenarioVnStandPos } from '@/lib/vn/parseCcfoliaLog';

/** 3인 레인 */
export type TrioSlot = StandSlotPosition;

/** 4~5인 군중 칸 (저장 포즈 — 왼·중·오와 분리) */
export type CrowdSlot = 'crowd0' | 'crowd1' | 'crowd2' | 'crowd3' | 'crowd4';

export type StandSlot = TrioSlot | CrowdSlot;

export type ScenarioVnStandPosBySlot = Partial<Record<StandSlot, ScenarioVnStandPos>>;

export const TRIO_SLOTS: TrioSlot[] = ['left', 'center', 'right'];
export const CROWD_SLOTS: CrowdSlot[] = ['crowd0', 'crowd1', 'crowd2', 'crowd3', 'crowd4'];
export const ALL_STAND_SLOTS: StandSlot[] = [...TRIO_SLOTS, ...CROWD_SLOTS];

/** 레인 기준 미세 X 허용(±%). 이보다 멀면 잘못된 절대좌표로 보고 레인에 스냅 */
const FINE_X_MAX = 12;
/** 군중 칸은 드래그 폭이 넓음 */
const CROWD_X_MAX = 48;

export function isCrowdSlot(slot: string | null | undefined): slot is CrowdSlot {
  return (
    slot === 'crowd0' ||
    slot === 'crowd1' ||
    slot === 'crowd2' ||
    slot === 'crowd3' ||
    slot === 'crowd4'
  );
}

export function isTrioSlot(slot: string | null | undefined): slot is TrioSlot {
  return slot === 'left' || slot === 'center' || slot === 'right';
}

/** 좌석 인덱스 → 군중 슬롯 (0~4) */
export function seatIndexToCrowdSlot(seatIndex: number): CrowdSlot {
  const i = Math.max(0, Math.min(4, Math.floor(seatIndex)));
  return CROWD_SLOTS[i]!;
}

export function crowdSlotIndex(slot: CrowdSlot): number {
  return CROWD_SLOTS.indexOf(slot);
}

export function laneXForSlot(slot: StandSlot, crowdCount = 5): number {
  if (isCrowdSlot(slot)) {
    return crowdStandLayout(Math.max(4, crowdCount), crowdSlotIndex(slot)).x;
  }
  return VN_STAND_LAYOUT.slotBaseX[slot];
}

export function defaultPoseForSlot(slot: StandSlot, crowdCount = 5): StandPose {
  if (isCrowdSlot(slot)) {
    const c = crowdStandLayout(Math.max(4, crowdCount), crowdSlotIndex(slot));
    return normalizeStandPose({ x: c.x, y: 0, scale: c.scale });
  }
  return normalizeStandPose({
    x: VN_STAND_LAYOUT.slotBaseX[slot],
    y: 0,
    scale: 1,
  });
}

/**
 * 좌석은 항상 레인 X. 버전은 scale·y + 레인 대비 미세 x 만.
 * 군중 칸은 절대 x(클램프) + y·scale — 왼·중·오와 독립.
 */
export function anchorPoseToSlot(
  pose: StandPose,
  slot: StandSlot,
  crowdCount = 5,
): StandPose {
  const n = normalizeStandPose(pose);
  if (isCrowdSlot(slot)) {
    const laneX = laneXForSlot(slot, crowdCount);
    const rawDelta = n.x - laneX;
    /* 레인에서 너무 멀면(잘못된 데이터) 레인으로, 그 외엔 드래그 값 유지 */
    const x =
      Math.abs(rawDelta) > CROWD_X_MAX
        ? laneX
        : Math.max(-CROWD_X_MAX, Math.min(CROWD_X_MAX, n.x));
    return normalizeStandPose({ x, y: n.y, scale: n.scale });
  }
  const laneX = VN_STAND_LAYOUT.slotBaseX[slot];
  const rawDelta = n.x - laneX;
  const delta = Math.abs(rawDelta) <= FINE_X_MAX ? rawDelta : 0;
  return normalizeStandPose({
    x: laneX + delta,
    y: n.y,
    scale: n.scale,
  });
}

/** 단일 standPos 정규화 — 완전 기본값이면 undefined */
export function normalizeStandPosField(raw: unknown): ScenarioVnStandPos | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as Record<string, unknown>;
  const x = Number(p.x);
  const y = Number(p.y);
  const scale = Number(p.scale);
  const ox = Number.isFinite(x) ? x : 0;
  const oy = Number.isFinite(y) ? y : 0;
  const sc =
    Number.isFinite(scale) && scale > 0 ? Math.min(2.4, Math.max(0.4, scale)) : 1;
  if (ox === 0 && oy === 0 && sc === 1) return undefined;
  return { x: ox, y: oy, scale: sc };
}

/**
 * standPosBySlot 정규화.
 * 레거시 standPos 가 있으면 비어 있는 슬롯(특히 center)에 채움.
 */
export function normalizeStandPosBySlot(
  rawBySlot: unknown,
  legacyStandPos?: unknown,
): ScenarioVnStandPosBySlot | undefined {
  const out: ScenarioVnStandPosBySlot = {};
  if (rawBySlot && typeof rawBySlot === 'object') {
    const row = rawBySlot as Record<string, unknown>;
    for (const slot of ALL_STAND_SLOTS) {
      const n = normalizeStandPosField(row[slot]);
      if (n) out[slot] = anchorPoseToSlot(n, slot);
    }
  }
  const legacy = normalizeStandPosField(legacyStandPos);
  if (legacy) {
    if (!out.center) {
      out.center = anchorPoseToSlot(legacy, 'center');
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** 좌석 인덱스 → 3인 슬롯 (0=왼, 1=중, 2+=오) */
export function seatIndexToSlot(seatIndex: number): TrioSlot {
  if (seatIndex === 0) return 'left';
  if (seatIndex === 1) return 'center';
  return 'right';
}

/**
 * 재생용: 이 좌석에 앉았을 때 쓸 포즈.
 * X 는 항상 레인(±미세), 버전은 scale·y 위주.
 */
export function resolveStandPoseForSlot(
  sp: {
    standPosBySlot?: ScenarioVnStandPosBySlot | null;
    standPos?: ScenarioVnStandPos | null;
    standPose?: Partial<ScenarioVnStandPos> | null;
  } | null | undefined,
  slot: StandSlot,
  crowdCount = 5,
): StandPose {
  const by = sp?.standPosBySlot?.[slot];
  if (by) return anchorPoseToSlot(by, slot, crowdCount);

  if (isCrowdSlot(slot)) {
    return defaultPoseForSlot(slot, crowdCount);
  }

  const legacy = sp?.standPos ?? sp?.standPose;
  if (legacy) {
    const n = normalizeStandPose(legacy);
    return normalizeStandPose({
      x: VN_STAND_LAYOUT.slotBaseX[slot],
      y: n.y,
      scale: n.scale,
    });
  }

  return defaultPoseForSlot(slot, crowdCount);
}

/** 군중 칸 전용 resolve — 저장 없으면 crowdStandLayout 기본 */
export function resolveCrowdPose(
  sp: {
    standPosBySlot?: ScenarioVnStandPosBySlot | null;
    standPos?: ScenarioVnStandPos | null;
    standPose?: Partial<ScenarioVnStandPos> | null;
  } | null | undefined,
  seatIndex: number,
  crowdCount: number,
): StandPose {
  const slot = seatIndexToCrowdSlot(seatIndex);
  return resolveStandPoseForSlot(sp, slot, crowdCount);
}

export function mergeStandPosBySlot(
  prev: ScenarioVnStandPosBySlot | undefined,
  patch: Partial<ScenarioVnStandPosBySlot>,
  crowdCount = 5,
): ScenarioVnStandPosBySlot {
  const next: ScenarioVnStandPosBySlot = { ...prev };
  for (const slot of ALL_STAND_SLOTS) {
    const p = patch[slot];
    if (p) next[slot] = anchorPoseToSlot(p, slot, crowdCount);
  }
  return next;
}

export function standSlotPoseKey(character: string, slot: StandSlot): string {
  return `${character.trim()}::${slot}`;
}

export function parseStandSlotPoseKey(
  key: string,
): { character: string; slot: StandSlot } | null {
  const i = key.lastIndexOf('::');
  if (i <= 0) return null;
  const character = key.slice(0, i);
  const slot = key.slice(i + 2);
  if (!isTrioSlot(slot) && !isCrowdSlot(slot)) return null;
  return { character, slot };
}
