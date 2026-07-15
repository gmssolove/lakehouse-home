import type { TouchHoverStyle, TouchZone, TouchZoneLine } from '@/lib/types/character';
import { isDialogueFx, normalizeMotion } from '@/lib/vn/motions';

export const TOUCH_ZONE_MAX = 5;
export const TOUCH_ZONE_MIN_SIZE = 3;
export const TOUCH_MARKER_DEFAULT = { x: 50, y: 50, size: 5 } as const;
export const TOUCH_MARKER_SIZE_MIN = 3;
export const TOUCH_MARKER_SIZE_MAX = 28;

export const TOUCH_HOVER_STYLES: { id: TouchHoverStyle; label: string }[] = [
  { id: 'corners', label: '코너 브라켓' },
  { id: 'dashed', label: '점선 아웃라인' },
];

export function normalizeTouchHoverStyle(v?: string): TouchHoverStyle {
  return v === 'dashed' ? 'dashed' : 'corners';
}

function clampPct(n: number, min = 0, max = 100) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function normalizeTouchZoneLine(raw: unknown): TouchZoneLine | null {
  if (typeof raw === 'string') {
    const text = raw.trim();
    return text ? { text } : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const text = String(row.text ?? '').trim();
  if (!text) return null;
  const expression = String(row.expression ?? '').trim() || undefined;
  const motion = normalizeMotion(row.motion) || undefined;
  const fx = isDialogueFx(row.fx) ? row.fx : undefined;
  return {
    text,
    ...(expression ? { expression } : {}),
    ...(motion ? { motion } : {}),
    ...(fx ? { fx } : {}),
  };
}

export function normalizeTouchZone(raw: Partial<TouchZone> | null | undefined, i = 0): TouchZone | null {
  if (!raw) return null;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `tz-${i}`;
  const x = clampPct(Number(raw.x));
  const y = clampPct(Number(raw.y));
  const w = clampPct(Number(raw.w), TOUCH_ZONE_MIN_SIZE, 100 - x);
  const h = clampPct(Number(raw.h), TOUCH_ZONE_MIN_SIZE, 100 - y);
  const lines = Array.isArray(raw.lines)
    ? raw.lines.map(normalizeTouchZoneLine).filter((l): l is TouchZoneLine => !!l)
    : [];
  const markerX = clampPct(
    Number(raw.markerX ?? TOUCH_MARKER_DEFAULT.x),
    0,
    100,
  );
  const markerY = clampPct(
    Number(raw.markerY ?? TOUCH_MARKER_DEFAULT.y),
    0,
    100,
  );
  let markerSize = Number(raw.markerSize ?? TOUCH_MARKER_DEFAULT.size);
  if (!Number.isFinite(markerSize)) markerSize = TOUCH_MARKER_DEFAULT.size;
  markerSize = Math.min(TOUCH_MARKER_SIZE_MAX, Math.max(TOUCH_MARKER_SIZE_MIN, markerSize));
  const hasBubble =
    Number.isFinite(Number(raw.bubbleX)) && Number.isFinite(Number(raw.bubbleY));
  const bubbleX = hasBubble ? clampPct(Number(raw.bubbleX), 0, 100) : undefined;
  const bubbleY = hasBubble ? clampPct(Number(raw.bubbleY), 0, 100) : undefined;
  return {
    id,
    x,
    y,
    w,
    h,
    lines,
    markerX,
    markerY,
    markerSize,
    ...(bubbleX != null && bubbleY != null ? { bubbleX, bubbleY } : {}),
  };
}

export function normalizeTouchZones(raw?: TouchZone[] | null): TouchZone[] {
  if (!Array.isArray(raw)) return [];
  const out: TouchZone[] = [];
  for (let i = 0; i < raw.length && out.length < TOUCH_ZONE_MAX; i++) {
    const z = normalizeTouchZone(raw[i], i);
    if (z) out.push(z);
  }
  return out;
}

export function newTouchZoneId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `tz-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `tz-${Date.now().toString(36)}`;
}

export function emptyTouchZoneLine(): TouchZoneLine {
  return { text: '' };
}

/** 축정렬 사각형 겹침 (퍼센트 좌표) */
export function touchZonesOverlap(
  a: Pick<TouchZone, 'x' | 'y' | 'w' | 'h'>,
  b: Pick<TouchZone, 'x' | 'y' | 'w' | 'h'>,
  gap = 0.4,
) {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

export function touchZoneOverlapsAny(
  draft: Pick<TouchZone, 'x' | 'y' | 'w' | 'h'>,
  zones: TouchZone[],
  ignoreId?: string,
) {
  return zones.some((z) => z.id !== ignoreId && touchZonesOverlap(draft, z));
}

/** pointer % → 정규화된 박스 (드래그 시작/끝 순서 무관) */
export function rectFromPoints(x0: number, y0: number, x1: number, y1: number): Pick<
  TouchZone,
  'x' | 'y' | 'w' | 'h'
> {
  const left = clampPct(Math.min(x0, x1));
  const top = clampPct(Math.min(y0, y1));
  const right = clampPct(Math.max(x0, x1));
  const bottom = clampPct(Math.max(y0, y1));
  return {
    x: left,
    y: top,
    w: Math.max(TOUCH_ZONE_MIN_SIZE, right - left),
    h: Math.max(TOUCH_ZONE_MIN_SIZE, bottom - top),
  };
}

export type TouchBox = Pick<TouchZone, 'x' | 'y' | 'w' | 'h'>;
export type TouchResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

/** 영역이 0~100 안·최소 크기 유지하도록 보정 */
export function clampTouchBox(box: TouchBox): TouchBox {
  let w = Math.max(TOUCH_ZONE_MIN_SIZE, Math.min(100, box.w));
  let h = Math.max(TOUCH_ZONE_MIN_SIZE, Math.min(100, box.h));
  let x = clampPct(box.x, 0, 100 - w);
  let y = clampPct(box.y, 0, 100 - h);
  w = Math.min(w, 100 - x);
  h = Math.min(h, 100 - y);
  return { x, y, w, h };
}

export function moveTouchBox(orig: TouchBox, dx: number, dy: number): TouchBox {
  return clampTouchBox({ ...orig, x: orig.x + dx, y: orig.y + dy });
}

export function resizeTouchBox(
  orig: TouchBox,
  corner: TouchResizeCorner,
  dx: number,
  dy: number,
): TouchBox {
  let { x, y, w, h } = orig;
  if (corner.includes('w')) {
    const nx = x + dx;
    const nw = w - dx;
    if (nw >= TOUCH_ZONE_MIN_SIZE) {
      x = nx;
      w = nw;
    }
  } else {
    w = w + dx;
  }
  if (corner.includes('n')) {
    const ny = y + dy;
    const nh = h - dy;
    if (nh >= TOUCH_ZONE_MIN_SIZE) {
      y = ny;
      h = nh;
    }
  } else {
    h = h + dy;
  }
  return clampTouchBox({ x, y, w, h });
}

export function clampMarkerPos(x: number, y: number) {
  return { x: clampPct(x, 0, 100), y: clampPct(y, 0, 100) };
}

export function clampMarkerSize(size: number) {
  if (!Number.isFinite(size)) return TOUCH_MARKER_DEFAULT.size;
  return Math.min(TOUCH_MARKER_SIZE_MAX, Math.max(TOUCH_MARKER_SIZE_MIN, size));
}

/** 영역 기준 기본 대사 앵커 (영역 바깥쪽) */
export function defaultBubbleAnchor(zone: Pick<TouchZone, 'x' | 'y' | 'w' | 'h'>): {
  x: number;
  y: number;
} {
  const cx = zone.x + zone.w / 2;
  const cy = zone.y + zone.h / 2;
  const gap = 2.4;
  if (cx <= 50) {
    return { x: Math.max(1, zone.x - gap), y: cy };
  }
  return { x: Math.min(99, zone.x + zone.w + gap), y: cy };
}

/** 대사창 위치 — 영역 옆 자동 */
export function resolveBubbleAnchor(zone: TouchZone): {
  x: number;
  y: number;
  custom: boolean;
  side: 'left' | 'right';
} {
  const d = defaultBubbleAnchor(zone);
  const cx = zone.x + zone.w / 2;
  return { x: d.x, y: d.y, custom: false, side: cx <= 50 ? 'left' : 'right' };
}
