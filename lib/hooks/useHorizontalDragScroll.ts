'use client';

import { useCallback, useEffect, useRef } from 'react';

const DRAG_THRESHOLD_PX = 6;

export function useHorizontalDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const dragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startScroll: 0,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button, a, input, textarea, select, [role="button"]')) return;

      dragRef.current = {
        active: true,
        moved: false,
        startX: e.clientX,
        startScroll: el.scrollLeft,
      };
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-drag-scrolling');
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.startX;
      if (Math.abs(dx) > DRAG_THRESHOLD_PX) dragRef.current.moved = true;
      if (!dragRef.current.moved) return;
      e.preventDefault();
      el.scrollLeft = dragRef.current.startScroll - dx;
    };

    const endDrag = (e: PointerEvent) => {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      el.classList.remove('is-drag-scrolling');
      el.releasePointerCapture(e.pointerId);
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointercancel', endDrag);
    };
  }, []);

  const shouldSuppressClick = useCallback(() => {
    if (!dragRef.current.moved) return false;
    dragRef.current.moved = false;
    return true;
  }, []);

  return { ref, shouldSuppressClick };
}
