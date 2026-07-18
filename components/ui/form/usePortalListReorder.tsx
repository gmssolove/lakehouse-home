'use client';

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

type Ghost = {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  thumb?: string;
};

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  if (from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** 핸들 pointer-drag + portal 고스트로 목록 순서 변경 */
export function usePortalListReorder<T>(opts: {
  items: T[];
  onReorder: (next: T[]) => void;
  labelOf: (item: T, index: number) => string;
  thumbOf?: (item: T, index: number) => string | undefined;
}) {
  const { items, onReorder, labelOf, thumbOf } = opts;
  const rowRefs = useRef<(HTMLElement | null)[]>([]);
  const dragFromRef = useRef<number | null>(null);
  const dragOverRef = useRef<number | null>(null);
  const slotMidsRef = useRef<number[]>([]);
  const grabOffsetRef = useRef({ x: 0, y: 0 });
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);

  const hitIndexAtY = useCallback((clientY: number): number | null => {
    const mids = slotMidsRef.current;
    if (!mids.length) return null;
    for (let i = 0; i < mids.length; i += 1) {
      if (clientY < mids[i]) return i;
    }
    return mids.length - 1;
  }, []);

  const endDrag = useCallback(
    (commit: boolean) => {
      const from = dragFromRef.current;
      const to = dragOverRef.current;
      setDragFrom(null);
      setDragOver(null);
      setGhost(null);
      dragFromRef.current = null;
      dragOverRef.current = null;
      slotMidsRef.current = [];
      if (commit && from != null && to != null && from !== to) {
        onReorder(arrayMove(items, from, to));
      }
    },
    [items, onReorder],
  );

  const onHandlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>, i: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const row = rowRefs.current[i];
    if (!row) return;
    const rect = row.getBoundingClientRect();
    slotMidsRef.current = rowRefs.current.map((el) => {
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    grabOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    dragFromRef.current = i;
    dragOverRef.current = i;
    setDragFrom(i);
    setDragOver(i);
    setGhost({
      x: rect.left,
      y: rect.top,
      w: rect.width,
      h: Math.min(rect.height, 56),
      label: labelOf(items[i]!, i),
      thumb: thumbOf?.(items[i]!, i),
    });
  };

  const onHandlePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragFromRef.current == null) return;
    const nextOver = hitIndexAtY(e.clientY);
    if (nextOver != null && nextOver !== dragOverRef.current) {
      dragOverRef.current = nextOver;
      setDragOver(nextOver);
    }
    const { x: ox, y: oy } = grabOffsetRef.current;
    setGhost((g) => (g ? { ...g, x: e.clientX - ox, y: e.clientY - oy } : g));
  };

  const onHandlePointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragFromRef.current == null) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    endDrag(true);
  };

  const setRowRef = (i: number, el: HTMLElement | null) => {
    rowRefs.current[i] = el;
  };

  const ghostNode: ReactNode =
    ghost && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="lh-gal-edit-ghost"
            style={{
              width: ghost.w,
              height: ghost.h,
              transform: `translate3d(${ghost.x}px, ${ghost.y}px, 0)`,
            }}
            aria-hidden
          >
            <span className="lh-gal-edit-card__handle" aria-hidden>
              ⠿
            </span>
            {ghost.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="lh-gal-edit-ghost__thumb" src={ghost.thumb} alt="" />
            ) : (
              <span className="lh-gal-edit-ghost__ph">🖼</span>
            )}
            <span className="lh-gal-edit-ghost__label">{ghost.label}</span>
          </div>,
          document.body,
        )
      : null;

  return {
    dragFrom,
    dragOver,
    ghostNode,
    setRowRef,
    handleProps: (i: number) => ({
      onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => onHandlePointerDown(e, i),
      onPointerMove: onHandlePointerMove,
      onPointerUp: onHandlePointerUp,
      onPointerCancel: onHandlePointerUp,
    }),
  };
}
