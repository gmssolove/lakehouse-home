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
import { normalizeImageFrame, wheelScaleStep } from '@/lib/shared/imageFrame';
import {
  clampPanelImageOffset,
  clampPanelImageScale,
  clampPanelMediaSize,
  PAIR_PANEL_LAYOUTS,
  normalizePanelLayout,
} from '@/lib/pair/panelView';
import type { PairPanelLayout } from '@/lib/types/character';
import { uploadImageFile } from '@/lib/r2/client';

type MediaDragOpts = {
  value: ImageFrame | undefined;
  onChange: ((next: ImageFrame) => void) | undefined;
  enabled: boolean;
};

/**
 * cover 이미지 크롭.
 * - x/y: object-position 오프셋 (확대 없이도 바로 먹힘)
 * - scale: 줌 (1~2.5)
 * 드래그·휠 + 슬라이더 동시 지원.
 */
function usePanelImagePanZoom({ value, onChange, enabled }: MediaDragOpts) {
  const frame = normalizeImageFrame({
    ...value,
    scale: clampPanelImageScale(value?.scale ?? 1),
    x: clampPanelImageOffset(value?.x ?? 0, value?.scale ?? 1),
    y: clampPanelImageOffset(value?.y ?? 0, value?.scale ?? 1),
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
      const delta = wheelScaleStep(e.deltaY, 0.01);
      if (!delta) return;
      const next = clampPanelImageScale(frameRef.current.scale + delta);
      if (next === frameRef.current.scale) return;
      patch({ scale: next });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [enabled, patch]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!enabled || !onChangeRef.current) return;
    if ((e.target as HTMLElement).closest('input,button,label,select,a')) return;
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
    /* 드래그 방향 = 보이는 영역 이동 (손가락으로 밀면 그 방향이 더 보임) */
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

  /* cover 레이아웃: object-position (+ scale) / floating: translate + scale */
  const posX = 50 - frame.x;
  const posY = 50 - frame.y;
  const coverStyle: CSSProperties = {
    objectFit: 'cover',
    objectPosition: `${posX}% ${posY}%`,
    transform: frame.scale !== 1 ? `scale(${frame.scale})` : undefined,
    transformOrigin: `${posX}% ${posY}%`,
  };
  const floatLayerStyle: CSSProperties = {
    transform: `translate(${frame.x}%, ${frame.y}%) scale(${frame.scale})`,
    transformOrigin: 'center center',
  };

  return {
    elRef,
    dragging,
    frame,
    coverStyle,
    floatLayerStyle,
    patch,
    reset: () => patch({ scale: 1, x: 0, y: 0 }),
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
  /** 탭에 지정한 이미지 URL (대표 이미지와 무관) */
  imgSrc: string;
  /** 저장된 커스텀 URL (툴바 입력용, 빈 문자열 가능) */
  imgValue?: string;
  /** R2 업로드 폴더 접미사 — pair/panel/{section} */
  imgUploadFolder?: string;
  frame?: ImageFrame;
  /** 이미지 판 크기 배율 */
  mediaSize?: number;
  editable?: boolean;
  textReveal?: boolean;
  onLayoutChange?: (layout: PairPanelLayout) => void;
  onEchoChange?: (echo: boolean) => void;
  onFrameChange?: (frame: ImageFrame) => void;
  onMediaSizeChange?: (mediaSize: number) => void;
  onImgChange?: (img: string) => void;
  children: ReactNode;
};

export function PairPanelStage({
  layout: layoutRaw,
  echo = false,
  imgSrc,
  imgValue = '',
  imgUploadFolder = 'pair/panel',
  frame,
  mediaSize: mediaSizeRaw,
  editable = false,
  textReveal = false,
  onLayoutChange,
  onEchoChange,
  onFrameChange,
  onMediaSizeChange,
  onImgChange,
  children,
}: PairPanelStageProps) {
  const layout = normalizePanelLayout(layoutRaw);
  const mediaSize = clampPanelMediaSize(mediaSizeRaw);
  const hasImg = Boolean(imgSrc);
  const [uploading, setUploading] = useState(false);
  const [toolTab, setToolTab] = useState<'layout' | 'image' | 'crop'>('layout');
  const media = usePanelImagePanZoom({
    value: frame,
    onChange: onFrameChange,
    enabled: editable && hasImg,
  });

  const uploadPanelImg = async (file: File) => {
    if (!onImgChange) return;
    setUploading(true);
    try {
      const url = await uploadImageFile(file, imgUploadFolder);
      onImgChange(url);
      setToolTab('crop');
    } catch (err) {
      console.error(err);
      window.alert('이미지 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className={`pair-panel-stage pair-panel-stage--${layout}${echo && hasImg ? ' has-echo' : ''}${
        textReveal ? ' is-text-reveal' : ''
      }${editable ? ' is-editable' : ''}${media.dragging ? ' is-media-dragging' : ''}${
        hasImg ? ' has-media' : ' no-media'
      }`}
      style={{ ['--pps-media-size' as string]: String(mediaSize) }}
    >
      {editable ? (
        <div className="pair-panel-stage__edit" onPointerDown={(e) => e.stopPropagation()}>
          <div className="pair-panel-stage__tool-tabs" role="tablist" aria-label="패널 수정">
            <button
              type="button"
              role="tab"
              className={toolTab === 'layout' ? 'is-active' : ''}
              aria-selected={toolTab === 'layout'}
              onClick={() => setToolTab('layout')}
            >
              레이아웃
            </button>
            <button
              type="button"
              role="tab"
              className={toolTab === 'image' ? 'is-active' : ''}
              aria-selected={toolTab === 'image'}
              onClick={() => setToolTab('image')}
            >
              이미지
            </button>
            <button
              type="button"
              role="tab"
              className={toolTab === 'crop' ? 'is-active' : ''}
              aria-selected={toolTab === 'crop'}
              disabled={!hasImg}
              onClick={() => setToolTab('crop')}
            >
              위치·확대
            </button>
          </div>

          {toolTab === 'layout' ? (
            <div className="pair-panel-stage__layout-grid">
              {PAIR_PANEL_LAYOUTS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`pair-panel-stage__layout-chip${layout === opt.id ? ' is-active' : ''}`}
                  aria-pressed={layout === opt.id}
                  onClick={() => onLayoutChange?.(opt.id)}
                >
                  <span className={`pair-panel-stage__layout-ico is-${opt.id}`} aria-hidden />
                  <span>{opt.label}</span>
                </button>
              ))}
              <label className="pair-panel-stage__echo">
                <input
                  type="checkbox"
                  checked={echo}
                  onChange={(e) => onEchoChange?.(e.target.checked)}
                  disabled={!hasImg}
                />
                <span>에코 레이어</span>
              </label>
            </div>
          ) : null}

          {toolTab === 'image' && onImgChange ? (
            <div className="pair-panel-stage__img-pane">
              <div className="pair-panel-stage__img-row">
                <label className="pair-panel-stage__file">
                  {uploading ? '업로드 중…' : '파일 업로드'}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadPanelImg(f);
                      e.target.value = '';
                    }}
                  />
                </label>
                {imgValue ? (
                  <button
                    type="button"
                    className="pair-panel-stage__clear"
                    onClick={() => onImgChange('')}
                  >
                    이미지 제거
                  </button>
                ) : null}
              </div>
              <input
                type="url"
                className="pair-panel-stage__url"
                value={imgValue}
                placeholder="또는 이미지 URL"
                onChange={(e) => onImgChange(e.target.value)}
                aria-label="탭 히어로 이미지 URL"
              />
              <p className="pair-panel-stage__hint">
                이 탭 전용 이미지입니다. 커버·갤러리와 별개로 저장됩니다.
              </p>
            </div>
          ) : null}

          {toolTab === 'crop' && hasImg ? (
            <div className="pair-panel-stage__crop-pane">
              <label className="pair-panel-stage__slider">
                <span>
                  판 크기 <em>{Math.round(mediaSize * 100)}%</em>
                </span>
                <input
                  type="range"
                  min={75}
                  max={145}
                  step={1}
                  value={Math.round(mediaSize * 100)}
                  onChange={(e) =>
                    onMediaSizeChange?.(clampPanelMediaSize(Number(e.target.value) / 100))
                  }
                />
              </label>
              <label className="pair-panel-stage__slider">
                <span>
                  가로 위치 <em>{media.frame.x.toFixed(0)}</em>
                </span>
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={1}
                  value={media.frame.x}
                  onChange={(e) => media.patch({ x: Number(e.target.value) })}
                />
              </label>
              <label className="pair-panel-stage__slider">
                <span>
                  세로 위치 <em>{media.frame.y.toFixed(0)}</em>
                </span>
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={1}
                  value={media.frame.y}
                  onChange={(e) => media.patch({ y: Number(e.target.value) })}
                />
              </label>
              <label className="pair-panel-stage__slider">
                <span>
                  확대(크롭) <em>{media.frame.scale.toFixed(2)}×</em>
                </span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={media.frame.scale}
                  onChange={(e) => media.patch({ scale: Number(e.target.value) })}
                />
              </label>
              <div className="pair-panel-stage__crop-actions">
                <button type="button" className="pair-panel-stage__clear" onClick={media.reset}>
                  크롭 초기화
                </button>
                <button
                  type="button"
                  className="pair-panel-stage__clear"
                  onClick={() => onMediaSizeChange?.(1.15)}
                >
                  판 크기 기본
                </button>
                <span className="pair-panel-stage__hint">
                  판 크기=영역 · 확대=안쪽 크롭 · 드래그/휠도 가능
                </span>
              </div>
            </div>
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
            <div
              className="pair-panel-stage__media-layers"
              style={layout === 'floating' ? media.floatLayerStyle : undefined}
            >
              {echo ? (
                <img
                  className="pair-panel-stage__echo-img"
                  src={imgSrc}
                  alt=""
                  aria-hidden
                  draggable={false}
                  referrerPolicy="no-referrer"
                  style={
                    layout === 'floating'
                      ? undefined
                      : {
                          ...media.coverStyle,
                          transform: [
                            'translate(var(--pps-echo-x), var(--pps-echo-y))',
                            media.frame.scale !== 1 ? `scale(${media.frame.scale})` : '',
                          ]
                            .filter(Boolean)
                            .join(' '),
                        }
                  }
                />
              ) : null}
              <img
                className="pair-panel-stage__photo"
                src={imgSrc}
                alt=""
                draggable={false}
                referrerPolicy="no-referrer"
                style={layout === 'floating' ? undefined : media.coverStyle}
              />
            </div>
            <div className="pair-panel-stage__media-fade" aria-hidden />
            {editable ? (
              <div className="pair-panel-stage__media-badge" aria-hidden>
                {media.frame.scale.toFixed(2)}×
              </div>
            ) : null}
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
