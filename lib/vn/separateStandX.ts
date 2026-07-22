import { VN_STAND_LAYOUT } from '@/lib/vn/standLayout';
import { VN_NPC_CHARACTER } from '@/lib/vn/parseCcfoliaLog';

/** 중심 간 최소 간격(%) — 이보다 가까우면 살짝만 밀어 분리 */
const MIN_SEP = 14;

type Posed = {
  character: string;
  dimmed?: boolean;
  x?: number;
  y?: number;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
};

/**
 * 스탠딩 X가 너무 가까우면 최소치만큼만 밀어 겹침 방지.
 * 원래 배열 순서(좌석 순)를 유지 — 화자가 바뀔 때마다 자리 점프하지 않음.
 */
export function separateStandX<T extends Posed>(sprites: T[]): T[] {
  if (sprites.length <= 1) return sprites;

  const posed = sprites.map((s) => ({
    ...s,
    x: s.x ?? s.offsetX ?? 0,
  }));

  let overlap = false;
  for (let i = 0; i < posed.length; i++) {
    for (let j = i + 1; j < posed.length; j++) {
      if (Math.abs((posed[i].x ?? 0) - (posed[j].x ?? 0)) < MIN_SEP) {
        overlap = true;
        break;
      }
    }
    if (overlap) break;
  }
  if (!overlap) return sprites;

  /* 등장 순(배열 순) 그대로 — dimmed/화자로 재정렬하지 않음 */
  const taken: number[] = [];
  const byKey = new Map<string, number>();

  for (const s of posed) {
    /* 이미지 없는 NPC는 오른쪽 레인 고정 */
    if (s.character === VN_NPC_CHARACTER) {
      const x = VN_STAND_LAYOUT.slotBaseX.right;
      taken.push(x);
      byKey.set(s.character, x);
      continue;
    }
    let x = Math.round(s.x ?? 0);
    let guard = 0;
    while (guard++ < 24) {
      const hit = taken.find((t) => Math.abs(t - x) < MIN_SEP);
      if (hit == null) break;
      const dir = x > hit ? 1 : x < hit ? -1 : x >= 0 ? 1 : -1;
      x = hit + dir * MIN_SEP;
      const lim = Math.abs(VN_STAND_LAYOUT.slotBaseX.left) + 28;
      if (x > lim) x = lim;
      if (x < -lim) x = -lim;
    }
    taken.push(x);
    byKey.set(s.character, x);
  }

  return sprites.map((s) => {
    const x = byKey.get(s.character);
    if (x == null) return s;
    if (s.character === VN_NPC_CHARACTER) {
      return {
        ...s,
        x,
        offsetX: x,
        position: 'right' as const,
        standSlot: 'right' as const,
      };
    }
    return { ...s, x, offsetX: x, position: 'center' as const };
  });
}
