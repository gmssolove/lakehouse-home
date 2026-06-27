'use client';

import type { CSSProperties } from 'react';
import { framedImageStyle, type ImageFrame } from '@/lib/shared/imageFrame';

type Props = {
  src: string;
  alt?: string;
  frame?: ImageFrame;
  fit?: string;
  pos?: string;
  className?: string;
  imgClassName?: string;
};

export function ImageFrameView({
  src,
  alt = '',
  frame,
  fit = 'cover',
  pos = 'center top',
  className = '',
  imgClassName = '',
}: Props) {
  return (
    <div className={`image-frame-viewport${className ? ` ${className}` : ''}`}>
      <img
        className={`image-frame-viewport__img${imgClassName ? ` ${imgClassName}` : ''}`}
        src={src}
        alt={alt}
        draggable={false}
        referrerPolicy="no-referrer"
        style={framedImageStyle(frame, { fit, pos })}
      />
    </div>
  );
}
