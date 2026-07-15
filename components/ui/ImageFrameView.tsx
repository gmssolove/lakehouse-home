'use client';

import type { CSSProperties } from 'react';
import { normalizeImageFrame, type ImageFrame } from '@/lib/shared/imageFrame';

type Props = {
  src: string;
  alt?: string;
  frame?: ImageFrame;
  fit?: string;
  pos?: string;
  className?: string;
  imgClassName?: string;
};

/** scale/x/y 는 img가아니라 래퍼에 적용 — 일부 전역 CSS가 img transform을 죽여도 미리보기 유지 */
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
  const useTransform = scale !== 1 || x !== 0 || y !== 0;
  const origin =
    pos.includes('top') ? 'center top' : pos.includes('bottom') ? 'center bottom' : 'center center';
  const t = useTransform ? `translate(${x}%, ${y}%) scale(${scale})` : undefined;

  const frameStyle = {
    width: '100%',
    height: '100%',
    ...(useTransform
      ? {
          ['--iff-t' as string]: t,
          ['--iff-o' as string]: origin,
          transform: t,
          transformOrigin: origin,
        }
      : null),
  } as CSSProperties;

  const imgStyle = {
    objectFit: (fit || 'cover') as CSSProperties['objectFit'],
    objectPosition: pos || 'center top',
    width: '100%',
    height: '100%',
    display: 'block',
  } as CSSProperties;

  return (
    <div
      className={`image-frame-viewport${bottomBlur > 0 ? ' has-bottom-blur' : ''}${className ? ` ${className}` : ''}`}
      style={bottomBlur > 0 ? ({ '--img-bottom-blur': `${bottomBlur}%` } as CSSProperties) : undefined}
    >
      <div
        className={`image-frame-viewport__frame${useTransform ? ' has-frame-transform' : ''}`}
        style={frameStyle}
      >
        <img
          className={`image-frame-viewport__img${imgClassName ? ` ${imgClassName}` : ''}`}
          src={src}
          alt={alt}
          draggable={false}
          referrerPolicy="no-referrer"
          decoding="async"
          style={imgStyle}
        />
      </div>
    </div>
  );
}
