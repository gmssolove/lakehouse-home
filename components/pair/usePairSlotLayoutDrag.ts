'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import {
  clampFrameScale,
  normalizeImageFrame,
  wheelScaleStep,
  type ImageFrame,
} from '@/lib/shared/imageFrame';

type DragState = {
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  moved: boolean;
};

/** 래퍼 위치용 — 위로 과도하게 올리면 상단 네비와 겹침 */
function clampLayoutOffset(n: number, scale = 1, axis: 'x' | 'y' = 'x') {
  const s = Math.max(0.55, scale);
  if (axis === 'y') {
    /* 위(+) 방향은 네비(52px) 침범 완화용으로 더 타이트 */
    const up = Math.min(36, 18 + s * 12);
    const down = Math.min(120, 72 + s * 24);
    return Math.min(down, Math.max(-up, n));
  }
  const limit = Math.min(120, 72 + s * 24);
  return Math.min(limit, Math.max(-limit, n));
}

type Options = {
  /** true면 클릭으로 선택한 뒤에만 드래그/휠 (기본 true) */
  requireSelect?: boolean;
  /** 중앙(0) 근접 시 가이드 강조/릴리스 스냅 거리(%). 미설정 시 스냅 없음 */
  snapThreshold?: number;
  /** true면 드래그 중엔 스냅하지 않고 놓을 때만 (기본: snapThreshold 있으면 true) */
  snapOnRelease?: boolean;
  /** 방향키 1회 이동량 (%) */
  nudgeStep?: number;
};

function snapNear(value: number, target: number, threshold: number) {
  return Math.abs(value - target) <= threshold ? target : value;
}

function isNear(value: number, target: number, threshold: number) {
  return Math.abs(value - target) <= threshold;
}

/** 전신 래퍼용: 드래그 이동 + 휠 확대 (TRPG 스탠딩과 동일 감각) */
export function usePairSlotLayoutDrag(
  value: ImageFrame | undefined,
  onChange: ((next: ImageFrame) => void) | undefined,
  enabled: boolean,
  options?: Options,
) {
  const requireSelect = options?.requireSelect !== false;
  const snapThreshold = options?.snapThreshold;
  const snapOnRelease =
    options?.snapOnRelease !== undefined
      ? options.snapOnRelease
      : snapThreshold != null && snapThreshold > 0;
  const nudgeStep = options?.nudgeStep ?? 0.35;
  const frame = normalizeImageFrame(value);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const dragRef = useRef<DragState | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState(false);
  const [snap, setSnap] = useState({ x: false, y: false });

  const canManipulate = enabled && (!requireSelect || selected);

  const patch = useCallback(
    (partial: Partial<ImageFrame>, opts?: { applySnap?: boolean }) => {
      let next = normalizeImageFrame({ ...frameRef.current, ...partial });
      const thr = snapThreshold;
      const shouldSnap = Boolean(opts?.applySnap && thr != null && thr > 0);
      if (shouldSnap) {
        next = normalizeImageFrame({
          ...next,
          x: snapNear(next.x, 0, thr!),
          y: snapNear(next.y, 0, thr!),
        });
      }
      frameRef.current = next;
      const guideThr = thr != null && thr > 0 ? Math.max(thr, 1.1) : 0;
      setSnap({
        x: guideThr > 0 ? isNear(next.x, 0, guideThr) : next.x === 0,
        y: guideThr > 0 ? isNear(next.y, 0, guideThr) : next.y === 0,
      });
      onChangeRef.current?.(next);
    },
    [snapThreshold],
  );

  const valueX = value?.x ?? 0;
  const valueY = value?.y ?? 0;
  const valueScale = value?.scale ?? 1;
  const valueBlur = value?.bottomBlur ?? 0;

  useEffect(() => {
    if (!enabled) {
      setSelected((prev) => (prev ? false : prev));
      setSnap((prev) => (prev.x || prev.y ? { x: false, y: false } : prev));
      return;
    }
    const thr = snapThreshold != null && snapThreshold > 0 ? Math.max(snapThreshold, 1.1) : 0;
    const next = {
      x: thr > 0 ? isNear(valueX, 0, thr) : valueX === 0,
      y: thr > 0 ? isNear(valueY, 0, thr) : valueY === 0,
    };
    setSnap((prev) => (prev.x === next.x && prev.y === next.y ? prev : next));
  }, [enabled, valueX, valueY, valueScale, valueBlur, snapThreshold]);

  useEffect(() => {
    if (!enabled || !requireSelect || !selected) return;
    const onDoc = (e: Event) => {
      const t = e.target as Node | null;
      if (t && elRef.current?.contains(t)) return;
      setSelected(false);
    };
    document.addEventListener('pointerdown', onDoc, true);
    return () => document.removeEventListener('pointerdown', onDoc, true);
  }, [enabled, requireSelect, selected]);

  useEffect(() => {
    const el = elRef.current;
    if (!el || !canManipulate || !onChangeRef.current) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = wheelScaleStep(e.deltaY, 0.01);
      if (!delta) return;
      const scale = clampFrameScale(frameRef.current.scale + delta);
      if (scale === frameRef.current.scale) return;
      patch({
        scale,
        x: clampLayoutOffset(frameRef.current.x, scale, 'x'),
        y: clampLayoutOffset(frameRef.current.y, scale, 'y'),
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [canManipulate, patch]);

  useEffect(() => {
    if (!canManipulate || !onChangeRef.current) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        return;
      }
      const step = (e.shiftKey ? nudgeStep * 4 : nudgeStep) * (e.altKey ? 0.35 : 1);
      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else return;
      e.preventDefault();
      e.stopPropagation();
      const scale = frameRef.current.scale;
      patch({
        x: clampLayoutOffset(frameRef.current.x + dx, scale, 'x'),
        y: clampLayoutOffset(frameRef.current.y + dy, scale, 'y'),
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canManipulate, nudgeStep, patch]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!enabled || !onChangeRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    if (requireSelect && !selected) {
      setSelected(true);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      sx: e.clientX,
      sy: e.clientY,
      ox: frameRef.current.x,
      oy: frameRef.current.y,
      moved: false,
    };
    setDragging(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !canManipulate) return;
    /* translate(%)는 자기 크기 기준. getBoundingClientRect는 scale 포함 → 커서와 1:1에 가깝게 */
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const dx = ((e.clientX - dragRef.current.sx) / r.width) * 100;
    const dy = ((e.clientY - dragRef.current.sy) / r.height) * 100;
    if (Math.abs(dx) + Math.abs(dy) > 0.25) dragRef.current.moved = true;
    const scale = frameRef.current.scale;
    /* 드래그 중에는 스냅하지 않음 — 미세 조정 가능 */
    patch({
      x: clampLayoutOffset(dragRef.current.ox + dx, scale, 'x'),
      y: clampLayoutOffset(dragRef.current.oy + dy, scale, 'y'),
    });
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (snapOnRelease && snapThreshold != null && snapThreshold > 0) {
      patch(
        {
          x: frameRef.current.x,
          y: frameRef.current.y,
        },
        { applySnap: true },
      );
    }
    dragRef.current = null;
    setDragging(false);
  };

  const layoutStyle = (baseTransform?: string): CSSProperties => {
    const { x, y, scale } = frame;
    const layout =
      x !== 0 || y !== 0 || scale !== 1 ? `translate(${x}%, ${y}%) scale(${scale})` : '';
    const transform = [baseTransform, layout].filter(Boolean).join(' ');
    let cursor: CSSProperties['cursor'];
    if (enabled) {
      if (dragging) cursor = 'grabbing';
      else if (canManipulate) cursor = 'grab';
      else cursor = 'pointer';
    }
    return {
      transform: transform || undefined,
      transformOrigin: 'center center',
      cursor,
      touchAction: canManipulate ? 'none' : undefined,
    };
  };

  return {
    elRef,
    dragging,
    selected,
    snap,
    layoutStyle,
    handlers: enabled
      ? {
          onPointerDown,
          onPointerMove,
          onPointerUp,
          onPointerCancel: onPointerUp,
        }
      : {},
    isDragging: dragging,
  };
}
