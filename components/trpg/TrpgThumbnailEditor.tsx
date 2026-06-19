'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import {
  clampFrameOffset,
  clampFrameScale,
  DEFAULT_IMAGE_FRAME,
  normalizeImageFrame,
  type ImageFrame,
} from '@/lib/shared/imageFrame';
import { TRPG_THUMB_ASPECT } from '@/lib/trpg/constants';

type Props = {
  src: string;
  frame?: ImageFrame;
  onChange: (frame: ImageFrame) => void;
};

export function TrpgThumbnailEditor({ src, frame, onChange }: Props) {
  const f = normalizeImageFrame(frame);
  const frameRef = useRef(f);
  frameRef.current = f;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, sx: 0, sy: 0, ox: 0, oy: 0 });
  const [dragging, setDragging] = useState(false);

  const patch = useCallback((partial: Partial<ImageFrame>) => {
    onChangeRef.current({ ...frameRef.current, ...partial });
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      sx: e.clientX,
      sy: e.clientY,
      ox: frameRef.current.x,
      oy: frameRef.current.y,
    };
    setDragging(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const dx = ((e.clientX - dragRef.current.sx) / r.width) * 100;
    const dy = ((e.clientY - dragRef.current.sy) / r.height) * 100;
    patch({
      x: clampFrameOffset(dragRef.current.ox + dx),
      y: clampFrameOffset(dragRef.current.oy + dy),
    });
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  useEffect(() => {
    const el = stageRef.current;
    if (!el || !src) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -0.06 : 0.06;
      patch({ scale: clampFrameScale(frameRef.current.scale + delta) });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [patch, src]);

  const imgStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'center center',
    transform: `translate(${f.x}%, ${f.y}%) scale(${f.scale})`,
    transformOrigin: 'center center',
    pointerEvents: 'none',
    userSelect: 'none',
    display: 'block',
  };

  if (!src) {
    return <div className="trpg-thumb-editor trpg-thumb-editor--empty">썸네일 URL을 입력하거나 업로드하세요.</div>;
  }

  return (
    <div className="trpg-thumb-editor">
      <div
        ref={stageRef}
        className={`trpg-thumb-editor__stage${dragging ? ' is-dragging' : ''}`}
        style={{ aspectRatio: TRPG_THUMB_ASPECT }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" draggable={false} style={imgStyle} />
      </div>
      <div className="trpg-thumb-editor__controls">
        <label className="trpg-thumb-editor__slider">
          <span>확대</span>
          <input
            type="range"
            min={55}
            max={300}
            step={1}
            value={Math.round(f.scale * 100)}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => patch({ scale: clampFrameScale(Number(e.target.value) / 100) })}
          />
          <span>{Math.round(f.scale * 100)}%</span>
        </label>
        <button
          type="button"
          className="trpg-thumb-editor__reset"
          onClick={() => onChangeRef.current({ ...DEFAULT_IMAGE_FRAME })}
        >
          위치 초기화
        </button>
      </div>
      <p className="trpg-thumb-editor__hint">드래그로 이동 · 휠로 확대/축소</p>
    </div>
  );
}
