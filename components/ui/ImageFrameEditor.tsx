'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import {
  clampFrameOffset,
  clampFrameScale,
  DEFAULT_IMAGE_FRAME,
  normalizeImageFrame,
  wheelScaleStep,
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
  imgClassName?: string;
  viewportClassName?: string;
  /** false면 휠 확대 비활성 (Pair 썸네일 등) */
  allowWheelZoom?: boolean;
  /** 스테이지용: 컨트롤/힌트 숨기고 부모 크기에 맞춤 */
  stageMode?: boolean;
  /** 하단 페이드 슬라이더 (기본 true) */
  showBottomBlur?: boolean;
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
  imgClassName = '',
  viewportClassName = '',
  allowWheelZoom = true,
  stageMode = false,
  showBottomBlur = true,
}: Props) {
  const frame = normalizeImageFrame(value);
  const frameRef = useRef(frame);
  frameRef.current = frame;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, sx: 0, sy: 0, ox: 0, oy: 0 });
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState(false);

  const patch = useCallback((partial: Partial<ImageFrame>) => {
    const merged = { ...frameRef.current, ...partial };
    if (!showBottomBlur) merged.bottomBlur = 0;
    const scale = clampFrameScale(merged.scale ?? 1);
    const next = normalizeImageFrame({
      ...merged,
      scale,
      /* 축소·확대 바꿀 때 오프셋을 한도에 다시 맞춰 잘림 방지 */
      x: clampFrameOffset(merged.x ?? 0, scale),
      y: clampFrameOffset(merged.y ?? 0, scale),
    });
    frameRef.current = next;
    onChangeRef.current(next);
  }, [showBottomBlur]);

  useEffect(() => {
    if (!src) setSelected(false);
  }, [src]);

  useEffect(() => {
    if (!selected) return;
    const onDoc = (e: Event) => {
      const t = e.target as Node | null;
      if (t && viewportRef.current?.contains(t)) return;
      setSelected(false);
    };
    document.addEventListener('pointerdown', onDoc, true);
    return () => document.removeEventListener('pointerdown', onDoc, true);
  }, [selected]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!src) return;
    e.preventDefault();
    e.stopPropagation();
    if (!selected) {
      setSelected(true);
      return;
    }
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
    if (!dragRef.current.active || !selected) return;
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
    if (!el || !src || !allowWheelZoom || !selected) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = wheelScaleStep(e.deltaY, 0.005);
      if (!delta) return;
      const next = clampFrameScale(frameRef.current.scale + delta);
      if (next === frameRef.current.scale) return;
      patch({ scale: next });
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, [allowWheelZoom, patch, selected, src]);

  useEffect(() => {
    if (!selected || !src) return;
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
      const step = (e.shiftKey ? 1.4 : 0.35) * (e.altKey ? 0.35 : 1);
      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else return;
      e.preventDefault();
      patch({
        x: frameRef.current.x + dx,
        y: frameRef.current.y + dy,
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [patch, selected, src]);

  const viewportStyle = {
    ...(stageMode ? null : { aspectRatio }),
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
    <div
      className={`image-frame-editor${stageMode ? ' image-frame-editor--stage' : ''}${className ? ` ${className}` : ''}`}
    >
      <div
        ref={viewportRef}
        className={`image-frame-editor__viewport${selected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}`}
        style={{
          ...viewportStyle,
          cursor: dragging ? 'grabbing' : selected ? 'grab' : 'pointer',
          touchAction: selected ? 'none' : undefined,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <ImageFrameView
          src={src}
          frame={frame}
          fit={fit}
          pos={pos}
          className={viewportClassName}
          imgClassName={imgClassName}
        />
      </div>
      {!stageMode ? (
        <>
          <div className="image-frame-editor__controls">
            <label className="image-frame-editor__slider">
              <span>확대</span>
              <input
                type="range"
                min={70}
                max={300}
                step={1}
                value={Math.round(frame.scale * 100)}
                onChange={(e) => patch({ scale: clampFrameScale(Number(e.target.value) / 100) })}
              />
              <span>{Math.round(frame.scale * 100)}%</span>
            </label>
            {showBottomBlur ? (
              <label className="image-frame-editor__slider">
                <span>하단페이드</span>
                <input
                  type="range"
                  min={0}
                  max={55}
                  step={1}
                  value={Math.round(frame.bottomBlur)}
                  onChange={(e) => patch({ bottomBlur: Math.max(0, Math.min(100, Number(e.target.value))) })}
                />
                <span>{Math.round(frame.bottomBlur)}%</span>
              </label>
            ) : null}
            <button
              type="button"
              className="image-frame-editor__reset"
              onClick={() => {
                const next = { ...DEFAULT_IMAGE_FRAME, bottomBlur: 0 };
                frameRef.current = normalizeImageFrame(next);
                onChangeRef.current(frameRef.current);
              }}
            >
              위치 초기화
            </button>
          </div>
          <p className="image-frame-editor__hint">
            {allowWheelZoom
              ? showBottomBlur
                ? '클릭 선택 → 드래그·방향키 이동 · 휠 확대/축소 · 축소 시 전체 표시 · 하단 투명 페이드'
                : '클릭 선택 → 드래그·방향키 이동 · 휠 확대/축소 · 축소 시 전체 표시'
              : showBottomBlur
                ? '클릭 선택 → 드래그·방향키 이동 · 슬라이더 확대 · 하단 투명 페이드'
                : '클릭 선택 → 드래그·방향키 이동 · 슬라이더 확대'}
          </p>
        </>
      ) : (
        <p className="image-frame-editor__stage-hint">클릭으로 선택 → 드래그 이동 · 휠 확대/축소</p>
      )}
    </div>
  );
}
