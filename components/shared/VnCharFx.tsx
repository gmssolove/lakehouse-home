'use client';

import type { CSSProperties } from 'react';
import { DIALOGUE_FX_GLYPH, type DialogueFx } from '@/lib/vn/motions';

type Props = {
  fx: DialogueFx | null | undefined;
  className?: string;
};

/** 머리 위 만화 기호 (?, !, ♥ …) */
export function VnCharFx({ fx, className = '' }: Props) {
  if (!fx) return null;
  return (
    <span className={`vn-char-fx vn-char-fx--${fx}${className ? ` ${className}` : ''}`} aria-hidden>
      <span className="vn-char-fx__glyph">{DIALOGUE_FX_GLYPH[fx]}</span>
    </span>
  );
}

type BloomProps = {
  src: string;
  imgStyle?: CSSProperties;
  className?: string;
};

/** 두근 — 일러가 바깥으로 슬로우 퍼짐 */
export function VnCharBloom({ src, imgStyle, className = '' }: BloomProps) {
  return (
    <div className={`vn-char-bloom${className ? ` ${className}` : ''}`} aria-hidden>
      <img className="vn-char-bloom__img vn-char-bloom__img--a" src={src} alt="" style={imgStyle} draggable={false} />
      <img className="vn-char-bloom__img vn-char-bloom__img--b" src={src} alt="" style={imgStyle} draggable={false} />
    </div>
  );
}
