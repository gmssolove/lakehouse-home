'use client';

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from 'react';
import {
  frameImageLayout,
  frameObjectFit,
  normalizeImageFrame,
  type ImageFrame,
} from '@/lib/shared/imageFrame';

type Props = {
  src: string;
  alt?: string;
  frame?: ImageFrame;
  fit?: string;
  pos?: string;
  className?: string;
  imgClassName?: string;
};

type NatSize = { w: number; h: number };
type BoxSize = { w: number; h: number };

/**
 * cover 모드: 항상 측정 레이아웃 한 경로 (scale≥1·&lt;1 분기 없음 → 쏠림/틈 재발 방지)
 * 그 외 fit: object-fit + frame transform
 */
export function ImageFrameView({
  src,
  alt = '',
  frame,
  fit = 'cover',
  pos = 'center top',
  className = '',
  imgClassName = '',
}: Props) {
  const { scale, x, y, bottomBlur } = normalizeImageFrame(frame);
  const rootRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [box, setBox] = useState<BoxSize | null>(null);
  const [nat, setNat] = useState<NatSize | null>(null);

  const useCoverLayout = (fit || 'cover') === 'cover';

  const readNat = useCallback((img: HTMLImageElement | null) => {
    if (!img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w > 0 && h > 0) setNat((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
  }, []);

  useLayoutEffect(() => {
    if (!useCoverLayout) {
      setBox(null);
      return;
    }
    const el = rootRef.current;
    if (!el) return;

    const sync = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w < 2 || h < 2) return;
      setBox((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    const raf = window.requestAnimationFrame(() => {
      sync();
      window.requestAnimationFrame(sync);
    });
    return () => {
      ro.disconnect();
      window.cancelAnimationFrame(raf);
    };
  }, [src, useCoverLayout]);

  useLayoutEffect(() => {
    if (!useCoverLayout) {
      setNat(null);
      return;
    }
    setNat(null);
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) readNat(img);
  }, [src, useCoverLayout, readNat]);

  const onImgLoad = useCallback(
    (e: SyntheticEvent<HTMLImageElement>) => {
      if (useCoverLayout) readNat(e.currentTarget);
    },
    [useCoverLayout, readNat],
  );

  const layout =
    useCoverLayout && box && nat
      ? frameImageLayout(box.w, box.h, nat.w, nat.h, frame, pos || 'center top')
      : null;

  const origin =
    pos.includes('top') ? 'center top' : pos.includes('bottom') ? 'center bottom' : 'center center';

  /* cover가 아닐 때만 transform 경로 */
  const useTransform = !useCoverLayout && (scale !== 1 || x !== 0 || y !== 0);
  const transform = useTransform ? `translate(${x}%, ${y}%) scale(${scale})` : undefined;

  const frameStyle = {
    width: '100%',
    height: '100%',
    position: 'relative' as const,
    ...(transform
      ? {
          ['--iff-t' as string]: transform,
          ['--iff-o' as string]: origin,
          transform,
          transformOrigin: origin,
        }
      : null),
  } as CSSProperties;

  const imgStyle = (
    layout
      ? {
          position: 'absolute' as const,
          width: layout.width,
          height: layout.height,
          left: layout.left,
          top: layout.top,
          right: 'auto',
          bottom: 'auto',
          maxWidth: 'none',
          maxHeight: 'none',
          objectFit: 'fill' as const,
          objectPosition: 'center',
          display: 'block',
          transform: 'none',
        }
      : useCoverLayout
        ? {
            position: 'absolute' as const,
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            visibility: 'hidden' as const,
            objectFit: 'cover' as const,
            display: 'block',
          }
        : {
            position: 'absolute' as const,
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            display: 'block',
            objectFit: frameObjectFit(fit, scale),
            objectPosition: pos || 'center top',
            transform: 'none',
          }
  ) as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={`image-frame-viewport${bottomBlur > 0 ? ' has-bottom-blur' : ''}${className ? ` ${className}` : ''}`}
      style={bottomBlur > 0 ? ({ '--img-bottom-blur': `${bottomBlur}%` } as CSSProperties) : undefined}
    >
      <div
        className={`image-frame-viewport__frame${transform ? ' has-frame-transform' : ''}`}
        style={frameStyle}
      >
        <img
          ref={imgRef}
          className={`image-frame-viewport__img${imgClassName ? ` ${imgClassName}` : ''}${layout ? ' is-laid-out' : ''}`}
          src={src}
          alt={alt}
          draggable={false}
          referrerPolicy="no-referrer"
          decoding="async"
          onLoad={onImgLoad}
          style={imgStyle}
        />
      </div>
    </div>
  );
}
