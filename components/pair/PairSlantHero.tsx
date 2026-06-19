'use client';

import { useCallback, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { ImageFrameView } from '@/components/ui/ImageFrameView';
import { pairCardSub, pairCardTitle, pairCover } from '@/lib/oc/pairCover';
import type { PairItem } from '@/lib/types/character';

export type PairSlantVariant = 'card' | 'detail' | 'preview';

type Props = {
  pair: PairItem;
  variant?: PairSlantVariant;
  className?: string;
  showMeta?: boolean;
  staggerIndex?: number;
  interactive?: boolean;
};

type Tilt = { rx: number; ry: number; shine: number };

const TILT_IDLE: Tilt = { rx: 0, ry: 0, shine: 42 };

export function PairSlantHero({
  pair,
  variant = 'card',
  className = '',
  showMeta,
  staggerIndex = 0,
  interactive: interactiveProp,
}: Props) {
  const cover = pairCover(pair);
  const title = pairCardTitle(pair);
  const sub = pairCardSub(pair);
  const metaVisible = showMeta ?? variant === 'card';
  const interactive = interactiveProp ?? variant === 'card';
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState<Tilt>(TILT_IDLE);
  const [hovered, setHovered] = useState(false);

  const handleMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    setTilt({
      ry: (x - 0.5) * 14,
      rx: -(y - 0.5) * 11 - 2,
      shine: x * 100,
    });
  }, []);

  const handleLeave = useCallback(() => {
    setHovered(false);
    setTilt(TILT_IDLE);
  }, []);

  const tiltStyle = {
    '--pair-rx': `${tilt.rx}deg`,
    '--pair-ry': `${tilt.ry}deg`,
    '--pair-shine': `${tilt.shine}%`,
    '--pair-i': staggerIndex,
    '--pair-accent': pair.color?.trim() || '#d7a982',
  } as CSSProperties;

  const cardKeywords = (pair.keywords || []).slice(0, 2);

  return (
    <div
      ref={cardRef}
      className={`pair-banner pair-banner--${variant}${hovered ? ' is-hovered' : ''}${className ? ` ${className}` : ''}`}
      style={tiltStyle}
      onMouseMove={interactive ? handleMove : undefined}
      onMouseEnter={interactive ? () => setHovered(true) : undefined}
      onMouseLeave={interactive ? handleLeave : undefined}
    >
      <div className="pair-banner__tilt">
        <div className="pair-banner__shield">
          <div className="pair-banner__cover">
            {cover.src ? (
              <ImageFrameView
                src={cover.src}
                alt={`${pair.chars[0]} & ${pair.chars[1]}`}
                frame={cover.frame}
                fit={cover.fit}
                pos={cover.pos}
                imgClassName="pair-banner__img"
              />
            ) : (
              <div className="pair-banner__placeholder">
                {pair.chars[0]?.[0] || '?'}
                <span>&</span>
                {pair.chars[1]?.[0] || '?'}
              </div>
            )}
            {interactive && <div className="pair-banner__shine" aria-hidden="true" />}
            <div className="pair-banner__accent-line" aria-hidden="true" />
            <div className="pair-banner__vignette" aria-hidden="true" />

            {metaVisible && (
              <div className="pair-banner__meta pair-banner__meta--center">
                <div
                  className="pair-banner__title"
                  style={{ '--line-delay': '0s' } as CSSProperties}
                >
                  {title}
                </div>
                {sub && (
                  <div
                    className="pair-banner__subtitle"
                    style={{ '--line-delay': '0.08s' } as CSSProperties}
                  >
                    {sub}
                  </div>
                )}
                {variant === 'card' && cardKeywords.length > 0 && (
                  <div className="pair-banner__tags">
                    {cardKeywords.map((k) => (
                      <span key={k} className="pair-banner__tag">
                        {k}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
