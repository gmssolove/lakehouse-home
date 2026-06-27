'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import {
  clampFrameOffset,
  clampFrameScale,
  DEFAULT_IMAGE_FRAME,
  normalizeImageFrame,
  type ImageFrame,
} from '@/lib/shared/imageFrame';
import { ImageFrameView } from '@/components/ui/ImageFrameView';

type Props = {
  src: string;
  value?: ImageFrame;
  onChange: (next: ImageFrame) => void;
  fit?: string;
  pos?: string;
  aspectRatio?: string;
  clipPath?: string;
  className?: string;
  /** false면 휠 확대 비활성 (Pair 썸네일 등) */
  allowWheelZoom?: boolean;
};

export function ImageFrameEditor({
  src,
  value,
  onChange,
  fit = 'cover',
  pos = 'center top',
  aspectRatio = '10 / 16.5',
  clipPath,
  className = '',
  allowWheelZoom = true,
}: Props) {
  const frame = normalizeImageFrame(value);
  const frameRef = useRef(frame);
  frameRef.current = frame;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, sx: 0, sy: 0, ox: 0, oy: 0 });
  const [dragging, setDragging] = useState(false);

  const patch = useCallback((partial: Partial<ImageFrame>) => {
    onChangeRef.current({ ...frameRef.current, ...partial });
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!src) return;
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
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const dx = ((e.clientX - dragRef.current.sx) / r.width) * 100;
    const dy = ((e.clientY - dragRef.current.sy) / r.height) * 100;
    const scale = frameRef.current.scale;
    patch({
      x: clampFrameOffset(dragRef.current.ox + dx, scale),
      y: clampFrameOffset(dragRef.current.oy + dy, scale),
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
    const el = viewportRef.current;
    if (!el || !src || !allowWheelZoom) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -0.06 : 0.06;
      patch({ scale: clampFrameScale(frameRef.current.scale + delta) });
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, [allowWheelZoom, patch, src]);

  const viewportStyle = {
    aspectRatio,
    ...(clipPath ? { clipPath } : null),
  } as CSSProperties;

  if (!src) {
    return (
      <div className={`image-frame-editor image-frame-editor--empty${className ? ` ${className}` : ''}`}>
        이미지를 먼저 업로드하거나 URL을 입력하세요.
      </div>
    );
  }

  return (
    <div className={`image-frame-editor${className ? ` ${className}` : ''}`}>
      <div
        ref={viewportRef}
        className={`image-frame-editor__viewport${dragging ? ' is-dragging' : ''}`}
        style={viewportStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <ImageFrameView src={src} frame={frame} fit={fit} pos={pos} />
      </div>
      <div className="image-frame-editor__controls">
        <label className="image-frame-editor__slider">
          <span>확대</span>
          <input
            type="range"
            min={55}
            max={300}
            step={1}
            value={Math.round(frame.scale * 100)}
            onChange={(e) => patch({ scale: clampFrameScale(Number(e.target.value) / 100) })}
          />
          <span>{Math.round(frame.scale * 100)}%</span>
        </label>
        <button
          type="button"
          className="image-frame-editor__reset"
          onClick={() => onChangeRef.current({ ...DEFAULT_IMAGE_FRAME })}
        >
          위치 초기화
        </button>
      </div>
      <p className="image-frame-editor__hint">
        {allowWheelZoom ? '드래그로 이동 · 휠로 확대/축소' : '드래그로 이동 · 슬라이더로 확대'}
      </p>
    </div>
  );
}
