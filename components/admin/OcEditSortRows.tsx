'use client';

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export type OcEditSortItem = {
  id: string;
  label: string;
};

type Ghost = {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
};

type Props = {
  items: OcEditSortItem[];
  onReorder: (nextIds: string[]) => void;
  emptyHint?: ReactNode;
};

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  if (from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** 포인터 드래그 + 고스트 미리보기 정렬 리스트 */
export function OcEditSortRows({ items, onReorder, emptyHint }: Props) {
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragFromRef = useRef<number | null>(null);
  const dragOverRef = useRef<number | null>(null);
  const slotMidsRef = useRef<number[]>([]);
  /** 커서 대비 고스트 좌상단 오프셋 (viewport) */
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
        onReorder(arrayMove(items, from, to).map((a) => a.id));
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
      h: rect.height,
      label: items[i]?.label || '',
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
    setGhost((g) =>
      g
        ? {
            ...g,
            x: e.clientX - ox,
            y: e.clientY - oy,
          }
        : g,
    );
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

  if (!items.length) {
    return emptyHint ? <>{emptyHint}</> : null;
  }

  const ghostNode =
    ghost && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="oc-edit-sort__ghost"
            style={{
              width: ghost.w,
              height: ghost.h,
              transform: `translate3d(${ghost.x}px, ${ghost.y}px, 0)`,
            }}
            aria-hidden
          >
            <span className="oc-edit-sort__handle" aria-hidden>
              ⠿
            </span>
            <span className="oc-edit-sort__label">{ghost.label}</span>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`oc-edit-sort${dragFrom != null ? ' is-sorting' : ''}`}>
      {items.map((item, i) => (
        <div
          key={item.id}
          ref={(el) => {
            rowRefs.current[i] = el;
          }}
          className={`oc-edit-sort__row${dragFrom === i ? ' is-dragging' : ''}${
            dragOver === i && dragFrom !== i ? ' is-drop-slot' : ''
          }`}
        >
          <button
            type="button"
            className="oc-edit-sort__handle"
            aria-label={`${item.label} 순서 이동`}
            title="드래그로 이동"
            onPointerDown={(e) => onHandlePointerDown(e, i)}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={() => endDrag(false)}
          >
            ⠿
          </button>
          <span className="oc-edit-sort__label">{item.label}</span>
        </div>
      ))}
      {ghostNode}
    </div>
  );
}
