'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';
import type { ImageFrame } from '@/lib/shared/imageFrame';
import { normalizeImageFrame } from '@/lib/shared/imageFrame';
import {
  clampPanelImageOffset,
  clampPanelImageScale,
  PAIR_PANEL_LAYOUTS,
  normalizePanelLayout,
} from '@/lib/pair/panelView';
import type { PairPanelLayout } from '@/lib/types/character';

type MediaDragOpts = {
  value: ImageFrame | undefined;
  onChange: ((next: ImageFrame) => void) | undefined;
  enabled: boolean;
};

function usePanelImagePanZoom({ value, onChange, enabled }: MediaDragOpts) {
  const frame = normalizeImageFrame({
    ...value,
    scale: clampPanelImageScale(value?.scale ?? 1),
  });
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const dragRef = useRef<{
    sx: number;
    sy: number;
    ox: number;
    oy: number;
  } | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const patch = useCallback((partial: Partial<ImageFrame>) => {
    const cur = frameRef.current;
    const nextScale = clampPanelImageScale(partial.scale ?? cur.scale);
    const next = normalizeImageFrame({
      ...cur,
      ...partial,
      scale: nextScale,
      x: clampPanelImageOffset(partial.x ?? cur.x, nextScale),
      y: clampPanelImageOffset(partial.y ?? cur.y, nextScale),
    });
    frameRef.current = next;
    onChangeRef.current?.(next);
  }, []);

  useEffect(() => {
    const el = elRef.current;
    if (!el || !enabled || !onChangeRef.current) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      patch({ scale: clampPanelImageScale(frameRef.current.scale + delta) });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [enabled, patch]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!enabled || !onChangeRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      sx: e.clientX,
      sy: e.clientY,
      ox: frameRef.current.x,
      oy: frameRef.current.y,
    };
    setDragging(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !enabled) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const dx = ((e.clientX - dragRef.current.sx) / r.width) * 100;
    const dy = ((e.clientY - dragRef.current.sy) / r.height) * 100;
    const scale = frameRef.current.scale;
    patch({
      x: clampPanelImageOffset(dragRef.current.ox + dx, scale),
      y: clampPanelImageOffset(dragRef.current.oy + dy, scale),
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

  const imgStyle: CSSProperties = {
    transform: `translate(${frame.x}%, ${frame.y}%) scale(${frame.scale})`,
    transformOrigin: 'center center',
  };

  return {
    elRef,
    dragging,
    imgStyle,
    handlers: enabled
      ? {
          onPointerDown,
          onPointerMove,
          onPointerUp,
          onPointerCancel: onPointerUp,
        }
      : {},
  };
}

export type PairPanelStageProps = {
  layout: PairPanelLayout | string | undefined;
  echo?: boolean;
  /** 실제 표시에 쓰는 URL (폴백 포함) */
  imgSrc: string;
  /** 저장된 커스텀 URL (툴바 입력용, 빈 문자열 가능) */
  imgValue?: string;
  frame?: ImageFrame;
  editable?: boolean;
  textReveal?: boolean;
  onLayoutChange?: (layout: PairPanelLayout) => void;
  onEchoChange?: (echo: boolean) => void;
  onFrameChange?: (frame: ImageFrame) => void;
  onImgChange?: (img: string) => void;
  children: ReactNode;
};

export function PairPanelStage({
  layout: layoutRaw,
  echo = false,
  imgSrc,
  imgValue = '',
  frame,
  editable = false,
  textReveal = false,
  onLayoutChange,
  onEchoChange,
  onFrameChange,
  onImgChange,
  children,
}: PairPanelStageProps) {
  const layout = normalizePanelLayout(layoutRaw);
  const hasImg = Boolean(imgSrc);
  const media = usePanelImagePanZoom({
    value: frame,
    onChange: onFrameChange,
    enabled: editable && hasImg,
  });

  return (
    <div
      className={`pair-panel-stage pair-panel-stage--${layout}${echo && hasImg ? ' has-echo' : ''}${
        textReveal ? ' is-text-reveal' : ''
      }${editable ? ' is-editable' : ''}${media.dragging ? ' is-media-dragging' : ''}${
        hasImg ? ' has-media' : ' no-media'
      }`}
    >
      {editable ? (
        <div className="pair-panel-stage__toolbar" onPointerDown={(e) => e.stopPropagation()}>
          <label className="pair-panel-stage__field">
            <span>레이아웃</span>
            <select
              value={layout}
              onChange={(e) => onLayoutChange?.(normalizePanelLayout(e.target.value))}
              aria-label="정보 탭 레이아웃"
            >
              {PAIR_PANEL_LAYOUTS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="pair-panel-stage__echo">
            <input
              type="checkbox"
              checked={echo}
              onChange={(e) => onEchoChange?.(e.target.checked)}
              disabled={!hasImg}
            />
            <span>에코 레이어</span>
          </label>
          {onImgChange ? (
            <label className="pair-panel-stage__field pair-panel-stage__field--grow">
              <span>이미지 URL</span>
              <input
                type="url"
                value={imgValue}
                placeholder="비우면 커버/갤러리 폴백"
                onChange={(e) => onImgChange(e.target.value)}
                aria-label="탭 히어로 이미지 URL"
              />
            </label>
          ) : null}
          {hasImg ? (
            <span className="pair-panel-stage__hint">드래그=위치 · 휠=확대(1~2×)</span>
          ) : null}
        </div>
      ) : null}

      <div className="pair-panel-stage__body">
        {hasImg ? (
          <div
            className={`pair-panel-stage__media${media.dragging ? ' is-dragging' : ''}`}
            ref={media.elRef}
            {...media.handlers}
          >
            <div className="pair-panel-stage__media-layers" style={media.imgStyle}>
              {echo ? (
                <img
                  className="pair-panel-stage__echo-img"
                  src={imgSrc}
                  alt=""
                  aria-hidden
                  draggable={false}
                  referrerPolicy="no-referrer"
                />
              ) : null}
              <img
                className="pair-panel-stage__photo"
                src={imgSrc}
                alt=""
                draggable={false}
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="pair-panel-stage__media-fade" aria-hidden />
            {layout === 'book' ? <div className="pair-panel-stage__gutter" aria-hidden /> : null}
          </div>
        ) : null}
        <div className="pair-panel-stage__content">{children}</div>
      </div>
    </div>
  );
}

/** 텍스트 reveal 스태거용 래퍼 */
export function PairReveal({
  index,
  className = '',
  children,
}: {
  index: number;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`pair-reveal ${className}`.trim()} style={{ ['--reveal-i' as string]: index }}>
      {children}
    </div>
  );
}
