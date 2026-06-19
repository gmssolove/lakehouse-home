'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const DRAG_THRESHOLD_PX = 6;
const FLING_VELOCITY_PX_MS = 0.45;
/** Horizontal gap between card centers (px). */
export const PAIR_CAROUSEL_GAP_PX = 252;
/** Drag distance required to advance one card on release. */
export const PAIR_REVOLVE_COMMIT_PX = Math.round(PAIR_CAROUSEL_GAP_PX * 0.18);
export const PAIR_REVOLVE_SNAP_MS = 680;

/** @deprecated use PAIR_CAROUSEL_GAP_PX */
export const PAIR_REVOLVE_PX_PER_CARD = PAIR_CAROUSEL_GAP_PX;
export const PAIR_REVOLVE_RADIUS = 400;

function wrapIndex(index: number, count: number) {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

export function circularDelta(slotIndex: number, virtualIndex: number, count: number) {
  if (count <= 0) return 0;
  let d = slotIndex - virtualIndex;
  d = ((d % count) + count) % count;
  if (d > count / 2) d -= count;
  return d;
}

export function usePairRevolveCarousel(count: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const snapTimerRef = useRef(0);
  const suppressClickRef = useRef(false);
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const dragRef = useRef({
    active: false,
    dragging: false,
    moved: false,
    startX: 0,
    startVirtual: 0,
    lastX: 0,
    lastT: 0,
    pointerId: -1,
  });

  const virtualIndex = index - dragX / PAIR_CAROUSEL_GAP_PX;

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    setIndex((i) => wrapIndex(i, count));
  }, [count]);

  const clearSnap = useCallback(() => {
    const el = containerRef.current;
    if (snapTimerRef.current) {
      window.clearTimeout(snapTimerRef.current);
      snapTimerRef.current = 0;
    }
    el?.classList.remove('is-snapping');
  }, []);

  const beginSnap = useCallback(
    (delta: 1 | -1) => {
      const el = containerRef.current;
      if (!el || count <= 1) return;
      clearSnap();
      el.classList.add('is-snapping');
      setIndex((i) => wrapIndex(i + delta, count));
      setDragX(0);
      suppressClickRef.current = true;
      snapTimerRef.current = window.setTimeout(() => {
        el.classList.remove('is-snapping');
        snapTimerRef.current = 0;
      }, PAIR_REVOLVE_SNAP_MS);
    },
    [clearSnap, count],
  );

  const navigateBy = useCallback(
    (delta: 1 | -1) => {
      beginSnap(delta);
    },
    [beginSnap],
  );

  const commitRelease = useCallback(
    (dx: number, velocity: number, startVirtual: number) => {
      const el = containerRef.current;
      if (!el) return;

      let nextIndex = startVirtual;
      const flingLeft = velocity <= -FLING_VELOCITY_PX_MS;
      const flingRight = velocity >= FLING_VELOCITY_PX_MS;

      if (dx <= -PAIR_REVOLVE_COMMIT_PX || flingLeft) {
        nextIndex = wrapIndex(startVirtual + 1, count);
      } else if (dx >= PAIR_REVOLVE_COMMIT_PX || flingRight) {
        nextIndex = wrapIndex(startVirtual - 1, count);
      }

      clearSnap();
      el.classList.add('is-snapping');
      setIndex(nextIndex);
      setDragX(0);
      suppressClickRef.current = true;

      snapTimerRef.current = window.setTimeout(() => {
        el.classList.remove('is-snapping');
        snapTimerRef.current = 0;
      }, PAIR_REVOLVE_SNAP_MS);
    },
    [clearSnap, count],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || count <= 1) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button, a, input, textarea, select, [role="button"]')) {
        return;
      }

      clearSnap();
      suppressClickRef.current = false;
      dragRef.current = {
        active: true,
        dragging: false,
        moved: false,
        startX: e.clientX,
        startVirtual: indexRef.current,
        lastX: e.clientX,
        lastT: performance.now(),
        pointerId: e.pointerId,
      };
      el.classList.remove('is-snapping');
    };

    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d.active || e.pointerId !== d.pointerId) return;

      const dx = e.clientX - d.startX;
      d.lastX = e.clientX;
      d.lastT = performance.now();

      if (!d.dragging) {
        if (Math.abs(dx) <= DRAG_THRESHOLD_PX) return;
        d.dragging = true;
        d.moved = true;
        el.setPointerCapture(e.pointerId);
        el.classList.add('is-dragging');
      }

      e.preventDefault();
      setDragX(dx);
    };

    const finishDrag = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d.active || e.pointerId !== d.pointerId) return;

      d.active = false;
      el.classList.remove('is-dragging');
      if (d.dragging) {
        el.releasePointerCapture(e.pointerId);
      }

      if (!d.moved) return;

      const dx = e.clientX - d.startX;
      const dt = Math.max(performance.now() - d.lastT, 1);
      const velocity = (e.clientX - d.lastX) / dt;
      commitRelease(dx, velocity, d.startVirtual);
      d.dragging = false;
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', finishDrag);
    el.addEventListener('pointercancel', finishDrag);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', finishDrag);
      el.removeEventListener('pointercancel', finishDrag);
      clearSnap();
    };
  }, [clearSnap, commitRelease, count]);

  const shouldSuppressClick = useCallback(() => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  }, []);

  const slotDelta = useCallback(
    (slotIndex: number) => circularDelta(slotIndex, virtualIndex, count),
    [count, virtualIndex],
  );

  return {
    containerRef,
    index: wrapIndex(index, count),
    slotDelta,
    navigateBy,
    shouldSuppressClick,
  };
}
