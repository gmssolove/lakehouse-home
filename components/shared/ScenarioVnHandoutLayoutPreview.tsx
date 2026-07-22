'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  DEFAULT_HANDOUT_LAYOUT,
  handoutFigureStyle,
  normalizeHandoutLayoutOrDefault,
} from '@/lib/vn/handoutLayout';
import {
  clampHandoutRadius,
  HANDOUT_RADIUS_MAX,
  type HandoutLayout,
} from '@/lib/vn/menuTheme';
import { useStagePixelSize } from '@/lib/vn/useStandPoseDrag';
import '@/styles/shared/scenario-vn-handout-editor.css';

type Props = {
  image: string;
  layout?: HandoutLayout | null;
  onChange: (layout: HandoutLayout) => void;
};

/** 수정탭 — 핸드아웃 위치·크기·모서리 미리보기 */
export function ScenarioVnHandoutLayoutPreview({ image, layout, onChange }: Props) {
  const pose = normalizeHandoutLayoutOrDefault(layout);
  const radius = clampHandoutRadius(pose.radius);
  const { stageRef, size } = useStagePixelSize();
  const figureRef = useRef<HTMLDivElement | null>(null);
  const scalerRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef(pose);
  const scaleRef = useRef(pose.scale);
  const radiusRef = useRef(radius);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const dragStart = useRef<{ px: number; py: number; x: number; y: number } | null>(
    null,
  );
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const commit = useCallback(
    (partial: Partial<HandoutLayout>) => {
      const next = normalizeHandoutLayoutOrDefault({
        ...liveRef.current,
        radius: radiusRef.current,
        ...partial,
      });
      liveRef.current = next;
      scaleRef.current = next.scale;
      radiusRef.current = clampHandoutRadius(next.radius);
      onChangeRef.current(next);
      return next;
    },
    [],
  );

  const writeDom = useCallback((p: HandoutLayout) => {
    const el = figureRef.current;
    if (!el) return;
    const style = handoutFigureStyle(p);
    el.style.left = String(style.left);
    el.style.top = String(style.top);
    el.style.transform = String(style.transform);
    if (scalerRef.current) scalerRef.current.style.transform = `scale(${p.scale})`;
  }, []);

  useLayoutEffect(() => {
    if (draggingRef.current) return;
    const next = normalizeHandoutLayoutOrDefault(pose);
    liveRef.current = next;
    scaleRef.current = next.scale;
    radiusRef.current = clampHandoutRadius(next.radius);
    writeDom(next);
  }, [pose.x, pose.y, pose.scale, pose.radius, writeDom]);

  const endDrag = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    dragStart.current = null;
    writeDom(
      commit({
        x: liveRef.current.x,
        y: liveRef.current.y,
        scale: scaleRef.current,
      }),
    );
  }, [commit, writeDom]);

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

  useEffect(() => {
    const el = figureRef.current;
    if (!el || dragging) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.06 : 0.06;
      const nextScale = Math.min(2.4, Math.max(0.35, scaleRef.current + delta));
      scaleRef.current = nextScale;
      const next = normalizeHandoutLayoutOrDefault({
        ...liveRef.current,
        scale: nextScale,
        radius: radiusRef.current,
      });
      liveRef.current = next;
      writeDom(next);
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => {
        wheelTimer.current = null;
        onChangeRef.current(liveRef.current);
      }, 160);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
    };
  }, [dragging, writeDom]);

  return (
    <div className="svn-handout-preview">
      <p className="svn-handout-preview__hint">
        드래그로 위치 · 휠로 크기 · 아래에서 모서리 둥글기 · 플레이에 반영
      </p>
      <div ref={stageRef} className="svn-handout-preview__stage">
        <div
          ref={figureRef}
          className={`svn-handout-preview__figure${dragging ? ' is-dragging' : ''}`}
          style={handoutFigureStyle(pose)}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            const cur = normalizeHandoutLayoutOrDefault(liveRef.current);
            scaleRef.current = cur.scale;
            dragStart.current = {
              px: e.clientX,
              py: e.clientY,
              x: cur.x,
              y: cur.y,
            };
            draggingRef.current = true;
            setDragging(true);
          }}
          onPointerMove={(e) => {
            if (!draggingRef.current || !dragStart.current) return;
            const sw = sizeRef.current.w || 1;
            const sh = sizeRef.current.h || 1;
            const next = normalizeHandoutLayoutOrDefault({
              x: dragStart.current.x + ((e.clientX - dragStart.current.px) / sw) * 100,
              y: dragStart.current.y + ((e.clientY - dragStart.current.py) / sh) * 100,
              scale: scaleRef.current,
              radius: radiusRef.current,
            });
            liveRef.current = next;
            writeDom(next);
          }}
        >
          <div
            ref={scalerRef}
            className="svn-handout-preview__scaler"
            style={{ transform: `scale(${pose.scale})` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt=""
              draggable={false}
              style={{ borderRadius: radius > 0 ? `${radius}px` : 0 }}
            />
          </div>
        </div>
      </div>
      <label className="svn-handout-preview__radius">
        <span>
          모서리 둥글기 {radius}px{radius === 0 ? ' (각진 박스)' : ''}
        </span>
        <input
          type="range"
          min={0}
          max={HANDOUT_RADIUS_MAX}
          step={1}
          value={radius}
          onChange={(e) => {
            const r = clampHandoutRadius(Number(e.target.value));
            radiusRef.current = r;
            commit({ radius: r });
          }}
        />
      </label>
      <div className="svn-handout-preview__meta">
        <span>
          x {pose.x.toFixed(0)}% · y {pose.y.toFixed(0)}% · ×{pose.scale.toFixed(2)}
        </span>
        <button
          type="button"
          className="lh-dialogue-editor__tool"
          onClick={() => {
            radiusRef.current = 0;
            const next = { ...DEFAULT_HANDOUT_LAYOUT };
            liveRef.current = next;
            writeDom(next);
            onChange(next);
          }}
        >
          가운데로 리셋
        </button>
      </div>
    </div>
  );
}
