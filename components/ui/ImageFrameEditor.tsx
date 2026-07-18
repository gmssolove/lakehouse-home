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
import { SliderField } from '@/components/ui/form/SliderField';

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
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  /* 로컬 렌더 상태 — 휠/드래그 중에는 이걸로 즉시 그려 부모 재렌더 지연과 무관하게 부드럽게. */
  const [renderFrame, setRenderFrame] = useState<ImageFrame>(() => normalizeImageFrame(value));
  const frame = renderFrame;
  const frameRef = useRef(renderFrame);
  const interactingRef = useRef(false);
  const commitRafRef = useRef<number | null>(null);
  const pendingRef = useRef<ImageFrame | null>(null);
  const wheelIdleRef = useRef<number | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, sx: 0, sy: 0, ox: 0, oy: 0 });
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState(false);

  const flushCommit = useCallback(() => {
    if (pendingRef.current) {
      onChangeRef.current(pendingRef.current);
      pendingRef.current = null;
    }
  }, []);

  /* 외부(value) 변경 동기화 — 제스처 중엔 로컬 값을 덮지 않는다. */
  const valueKey = `${value?.x ?? 0}|${value?.y ?? 0}|${value?.scale ?? 1}|${value?.bottomBlur ?? 0}`;
  useEffect(() => {
    if (interactingRef.current) return;
    const nf = normalizeImageFrame(value);
    frameRef.current = nf;
    setRenderFrame(nf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueKey, showBottomBlur]);

  useEffect(
    () => () => {
      if (commitRafRef.current != null) cancelAnimationFrame(commitRafRef.current);
      if (wheelIdleRef.current != null) window.clearTimeout(wheelIdleRef.current);
      /* 언마운트(모달 닫힘 등) 시 아직 부모에 반영되지 않은 마지막 조정을
         반드시 커밋한다 — 안 그러면 위치 조정이 저장 전에 사라진다. */
      if (pendingRef.current) {
        onChangeRef.current(pendingRef.current);
        pendingRef.current = null;
      }
    },
    [],
  );

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
    setRenderFrame(next);
    pendingRef.current = next;
    /* 드래그/휠 등 제스처 중에는 부모 커밋을 아예 미룬다 — 매 프레임 무거운
       상세 재렌더가 끼어들면 끊김·튐이 생긴다. 제스처가 끝날 때(endDrag /
       휠 idle) flushCommit() 으로 한 번만 반영한다. */
    if (interactingRef.current) return;
    /* 제스처가 아닌 변경(슬라이더·방향키)은 프레임당 1회로 합쳐 커밋. */
    if (commitRafRef.current == null) {
      commitRafRef.current = requestAnimationFrame(() => {
        commitRafRef.current = null;
        flushCommit();
      });
    }
  }, [flushCommit, showBottomBlur]);

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
    interactingRef.current = true;
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
    interactingRef.current = false;
    flushCommit();
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
      interactingRef.current = true;
      patch({ scale: next });
      if (wheelIdleRef.current != null) window.clearTimeout(wheelIdleRef.current);
      wheelIdleRef.current = window.setTimeout(() => {
        interactingRef.current = false;
        flushCommit();
      }, 220);
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, [allowWheelZoom, flushCommit, patch, selected, src]);

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
            <SliderField
              className="image-frame-editor__slider"
              label="확대"
              min={70}
              max={300}
              step={1}
              value={Math.round(frame.scale * 100)}
              displayValue={`${Math.round(frame.scale * 100)}%`}
              onChange={(n) => patch({ scale: clampFrameScale(n / 100) })}
              aria-label="확대"
            />
            {showBottomBlur ? (
              <SliderField
                className="image-frame-editor__slider"
                label="하단페이드"
                min={0}
                max={55}
                step={1}
                value={Math.round(frame.bottomBlur)}
                displayValue={`${Math.round(frame.bottomBlur)}%`}
                onChange={(n) => patch({ bottomBlur: Math.max(0, Math.min(100, n)) })}
                aria-label="하단페이드"
              />
            ) : null}
            <button
              type="button"
              className="image-frame-editor__reset"
              onClick={() => {
                const next = normalizeImageFrame({ ...DEFAULT_IMAGE_FRAME, bottomBlur: 0 });
                frameRef.current = next;
                setRenderFrame(next);
                pendingRef.current = null;
                onChangeRef.current(next);
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
