'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { VN_STAND_LAYOUT, type StandSlotPosition } from '@/lib/vn/standLayout';

export type StandPose = {
  x: number;
  y: number;
  /** 배율 — wheel 핸들러에서만 변경 */
  scale: number;
};

export type StageSize = { w: number; h: number };

export const DEFAULT_STAND_POSE: StandPose = { x: 0, y: 0, scale: 1 };

const SCALE_MIN = 0.4;
const SCALE_MAX = 2.4;

export function normalizeStandPose(pose?: Partial<StandPose> | null): StandPose {
  const x = Number(pose?.x);
  const y = Number(pose?.y);
  const scale = Number(pose?.scale);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    scale:
      Number.isFinite(scale) && scale > 0
        ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale))
        : 1,
  };
}

export function effectiveStandX(pose: StandPose, _slot?: string): number {
  /* standPos.x 는 항상 절대 좌표 — 0 이어도 슬롯으로 재해석하지 않음 */
  return normalizeStandPose(pose).x;
}

/**
 * 재생 스프라이트 슬롯 → 편집용 절대 포즈.
 * left/center/right 만 있는 경우 slotBaseX 로 환산해 위치·스케일이 유지되게 한다.
 */
export function spriteSlotToStandPose(s: {
  position?: StandSlotPosition | 'left' | 'center' | 'right';
  x?: number;
  y?: number;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
}): StandPose {
  const hasExplicit =
    s.x != null ||
    s.y != null ||
    s.scale != null ||
    s.offsetX != null ||
    s.offsetY != null;

  if (hasExplicit) {
    return normalizeStandPose({
      x: s.x ?? s.offsetX ?? 0,
      y: s.y ?? s.offsetY ?? 0,
      scale: s.scale ?? 1,
    });
  }

  const slot = (s.position || 'center') as StandSlotPosition;
  return normalizeStandPose({
    x: VN_STAND_LAYOUT.slotBaseX[slot] ?? 0,
    y: 0,
    scale: 1,
  });
}

/**
 * 화면(스테이지) 밖 포즈 허용 — overflow:hidden 이 박스 밖으로 삐져나오지 않게 자름.
 * 다만 드래그 핸들이 통째로 사라지지 않도록 스프라이트 일부는 박스 안에 남긴다.
 * scale 은 건드리지 않음.
 */
export function clampStandPos(
  x: number,
  y: number,
  stage: StageSize,
  figureEl: HTMLElement | null,
  scale: number,
): { x: number; y: number } {
  const sw = stage.w || 1;
  const sh = stage.h || 1;
  const s = scale > 0 ? scale : 1;

  const layoutW = figureEl?.offsetWidth || sw * 0.28;
  const layoutH = figureEl?.offsetHeight || sh * (VN_STAND_LAYOUT.spriteHeightPct / 100);
  const halfWPct = ((layoutW * s) / 2 / sw) * 100;
  const hPct = ((layoutH * s) / sh) * 100;

  /* 가로: 최대 ~85% 까지 화면 밖, 15% 분량은 박스 안 유지 */
  const keepX = Math.max(3, halfWPct * 0.3);
  let minX = -50 - halfWPct + keepX;
  let maxX = 50 + halfWPct - keepX;
  if (minX > maxX) {
    const mid = (minX + maxX) / 2;
    minX = mid;
    maxX = mid;
  }

  /* 세로: 대부분 화면 밖 가능, 일부만 박스 안 */
  const keepY = Math.max(4, hPct * 0.2);
  let minY = -(100 + hPct - keepY);
  let maxY = 100 - keepY;
  if (minY > maxY) {
    const mid = (minY + maxY) / 2;
    minY = mid;
    maxY = mid;
  }

  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };
}

export function useStagePixelSize() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<StageSize>({ w: 0, h: 0 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setSize((prev) =>
        prev.w === box.width && prev.h === box.height
          ? prev
          : { w: box.width, h: box.height },
      );
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  return { stageRef, size };
}

/**
 * scale 은 scaler 전용 — figure 는 중심 정렬(translateX)만.
 * left 는 calc(50% + x%) — clampStandPos 의 중심 기준과 일치.
 */
function writePos(el: HTMLElement, x: number, y: number) {
  el.style.left = `calc(50% + ${x}%)`;
  el.style.right = 'auto';
  el.style.bottom = `calc(0% - ${y}%)`;
  el.style.transform = 'translateX(-50%)';
}

/**
 * abspos + left 가 오른쪽 끝으로 가면 shrink-to-fit 이
 * "남은 폭"으로 너비를 줄인다. 이미지 비율로 너비를 고정해 방지.
 * stage 폭을 모를 때는 건드리지 않음 (이상 너비로 커지는 것 방지).
 */
function lockFigureWidth(el: HTMLElement, stageW: number) {
  const img = el.querySelector('img');
  if (!(img instanceof HTMLImageElement) || !img.naturalHeight) return;
  const h = el.offsetHeight;
  if (!h) return;
  const parentW =
    stageW ||
    (el.parentElement instanceof HTMLElement ? el.parentElement.clientWidth : 0) ||
    0;
  if (parentW <= 0) return;
  const ideal = h * (img.naturalWidth / img.naturalHeight);
  const maxW = parentW * 0.68;
  const w = Math.min(ideal, maxW);
  if (w > 0) el.style.width = `${w}px`;
}

function writeScale(el: HTMLElement | null, scale: number) {
  if (!el) return;
  el.style.setProperty('transform', `scale(${scale})`);
}

export function standPoseToStyle(
  pose: StandPose,
  slot: string = 'center',
): CSSProperties {
  const p = normalizeStandPose(pose);
  const x = effectiveStandX(p, slot);
  return {
    height: `${VN_STAND_LAYOUT.spriteHeightPct}%`,
    left: `calc(50% + ${x}%)`,
    right: 'auto',
    bottom: `calc(0% - ${p.y}%)`,
    transform: `translateX(-50%) scale(${p.scale})`,
    transformOrigin: 'center bottom',
  };
}

export function standPoseToFigureStyle(
  pose: StandPose,
  slot: string = 'center',
): CSSProperties {
  const p = normalizeStandPose(pose);
  const x = effectiveStandX(p, slot);
  return {
    left: `calc(50% + ${x}%)`,
    right: 'auto',
    bottom: `calc(0% - ${p.y}%)`,
    transform: 'translateX(-50%)',
  };
}

/**
 * pointermove → x/y 만 (scale 절대 변경 금지, clamp로 스테이지 안 유지).
 * wheel → scale 만.
 */
export function useStandPoseDrag(
  pose: StandPose,
  onChange: ((next: StandPose) => void) | undefined,
  enabled: boolean,
  stageSize: StageSize,
  slot: StandSlotPosition | string = 'center',
) {
  const figureRef = useRef<HTMLDivElement | null>(null);
  const scalerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const liveRef = useRef<StandPose>(normalizeStandPose(pose));
  const lockedScaleRef = useRef(normalizeStandPose(pose).scale);
  const dragStart = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const slotRef = useRef(slot);
  slotRef.current = slot;
  const stageSizeRef = useRef(stageSize);
  stageSizeRef.current = stageSize;

  const applyClampedPos = useCallback((x: number, y: number, scale: number) => {
    const el = figureRef.current;
    if (el) lockFigureWidth(el, stageSizeRef.current.w);
    const clamped = clampStandPos(x, y, stageSizeRef.current, el, scale);
    liveRef.current = { x: clamped.x, y: clamped.y, scale };
    if (el) writePos(el, clamped.x, clamped.y);
    return clamped;
  }, []);

  const syncDom = useCallback(
    (p: StandPose, slotNow: StandSlotPosition) => {
      const el = figureRef.current;
      if (!el) return;
      const x = effectiveStandX(p, slotNow);
      applyClampedPos(x, p.y, p.scale);
      writeScale(scalerRef.current, p.scale);
    },
    [applyClampedPos],
  );

  useLayoutEffect(() => {
    if (draggingRef.current) return;
    const next = normalizeStandPose(pose);
    liveRef.current = next;
    lockedScaleRef.current = next.scale;
    syncDom(next, slot);
  }, [pose.x, pose.y, pose.scale, slot, syncDom, stageSize.w, stageSize.h]);

  /* 이미지 로드 후 너비 고정 — shrink-to-fit 방지 */
  useEffect(() => {
    const el = figureRef.current;
    const img = el?.querySelector('img');
    if (!el || !(img instanceof HTMLImageElement)) return;
    const apply = () => {
      lockFigureWidth(el, stageSizeRef.current.w);
      if (!draggingRef.current) syncDom(liveRef.current, slotRef.current);
    };
    if (img.complete && img.naturalHeight) apply();
    img.addEventListener('load', apply);
    return () => img.removeEventListener('load', apply);
  }, [syncDom, pose.scale]);

  useLayoutEffect(() => {
    if (!draggingRef.current) return;
    const el = figureRef.current;
    if (!el) return;
    lockFigureWidth(el, stageSizeRef.current.w);
    writePos(el, liveRef.current.x, liveRef.current.y);
    writeScale(scalerRef.current, lockedScaleRef.current);
  }, [dragging, stageSize.w, stageSize.h]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!enabled || !onChange) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

      const cur = normalizeStandPose(liveRef.current);
      const lockedScale = cur.scale;
      lockedScaleRef.current = lockedScale;

      const start = applyClampedPos(
        effectiveStandX(cur, slotRef.current),
        cur.y,
        lockedScale,
      );
      writeScale(scalerRef.current, lockedScale);

      dragStart.current = { px: e.clientX, py: e.clientY, x: start.x, y: start.y };
      draggingRef.current = true;
      setDragging(true);
    },
    [enabled, onChange, applyClampedPos],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!draggingRef.current || !dragStart.current || !figureRef.current) return;
      const sw = stageSizeRef.current.w || 1;
      const sh = stageSizeRef.current.h || 1;
      const nextX = dragStart.current.x + ((e.clientX - dragStart.current.px) / sw) * 100;
      const nextY = dragStart.current.y + ((e.clientY - dragStart.current.py) / sh) * 100;
      /* (A) scale 은 절대 계산/변경하지 않음 — locked 값만 유지 */
      applyClampedPos(nextX, nextY, lockedScaleRef.current);
      writeScale(scalerRef.current, lockedScaleRef.current);
    },
    [applyClampedPos],
  );

  const endDrag = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    dragStart.current = null;
    const committed = normalizeStandPose({
      x: liveRef.current.x,
      y: liveRef.current.y,
      scale: lockedScaleRef.current,
    });
    liveRef.current = committed;
    writeScale(scalerRef.current, committed.scale);
    onChangeRef.current?.(committed);
  }, []);

  /* 위치 조정 종료(언마운트) 시 드래그·휠 대기분 커밋 */
  useEffect(() => {
    return () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        dragStart.current = null;
        onChangeRef.current?.(
          normalizeStandPose({
            x: liveRef.current.x,
            y: liveRef.current.y,
            scale: lockedScaleRef.current,
          }),
        );
      }
    };
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const up = () => endDrag();
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragging, endDrag]);

  const flushWheel = useCallback(() => {
    if (!wheelTimer.current) return;
    clearTimeout(wheelTimer.current);
    wheelTimer.current = null;
    onChangeRef.current?.(
      normalizeStandPose({
        x: liveRef.current.x,
        y: liveRef.current.y,
        scale: lockedScaleRef.current,
      }),
    );
  }, []);

  useEffect(() => {
    const el = figureRef.current;
    if (!el || !enabled || dragging) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.buttons !== 0) return;
      if (e.ctrlKey || e.metaKey) return;
      if (Math.abs(e.deltaX) > 0.5) return;
      if (Math.abs(e.deltaY) < 1) return;

      const nextScale = Math.min(
        SCALE_MAX,
        Math.max(SCALE_MIN, lockedScaleRef.current + (e.deltaY > 0 ? -0.04 : 0.04)),
      );
      if (nextScale === lockedScaleRef.current) return;

      lockedScaleRef.current = nextScale;
      const { x, y } = applyClampedPos(liveRef.current.x, liveRef.current.y, nextScale);
      liveRef.current = { x, y, scale: nextScale };
      writeScale(scalerRef.current, nextScale);

      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => {
        wheelTimer.current = null;
        onChangeRef.current?.(normalizeStandPose(liveRef.current));
      }, 320);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      /* 완료/언마운트 시 대기 중 스케일을 버리지 않음 */
      flushWheel();
    };
  }, [enabled, dragging, applyClampedPos, flushWheel]);

  const p = normalizeStandPose(pose);
  const styleX = dragging ? liveRef.current.x : effectiveStandX(p, slot);
  const styleY = dragging ? liveRef.current.y : p.y;
  const figureStyle: CSSProperties = {
    cursor: enabled ? (dragging ? 'grabbing' : 'grab') : 'default',
    touchAction: 'none',
    left: `calc(50% + ${styleX}%)`,
    right: 'auto',
    bottom: `calc(0% - ${styleY}%)`,
    transform: 'translateX(-50%)',
  };

  return {
    figureRef,
    scalerRef,
    dragging,
    figureStyle,
    handlers: enabled ? { onPointerDown, onPointerMove } : {},
  };
}
