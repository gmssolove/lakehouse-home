'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import {
  clampFrameScale,
  normalizeImageFrame,
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
  /** offset % 이내면 0으로 스냅 (중앙선). 미설정 시 스냅 없음 */
  snapThreshold?: number;
};

function snapNear(value: number, target: number, threshold: number) {
  return Math.abs(value - target) <= threshold ? target : value;
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

  const patch = useCallback((partial: Partial<ImageFrame>) => {
    let next = normalizeImageFrame({ ...frameRef.current, ...partial });
    if (snapThreshold != null && snapThreshold > 0) {
      next = normalizeImageFrame({
        ...next,
        x: snapNear(next.x, 0, snapThreshold),
        y: snapNear(next.y, 0, snapThreshold),
      });
    }
    frameRef.current = next;
    setSnap({ x: next.x === 0, y: next.y === 0 });
    onChangeRef.current?.(next);
  }, [snapThreshold]);

  useEffect(() => {
    if (!enabled) {
      setSelected(false);
      setSnap({ x: false, y: false });
      return;
    }
    const cur = normalizeImageFrame(value);
    setSnap({ x: cur.x === 0, y: cur.y === 0 });
  }, [enabled, value]);

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
      const delta = e.deltaY > 0 ? -0.06 : 0.06;
      patch({ scale: clampFrameScale(frameRef.current.scale + delta) });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [canManipulate, patch]);

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
    if (Math.abs(dx) + Math.abs(dy) > 0.4) dragRef.current.moved = true;
    const scale = frameRef.current.scale;
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
