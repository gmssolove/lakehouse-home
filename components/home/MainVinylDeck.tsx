'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { useBgm } from '@/lib/contexts/BgmContext';

type Tilt = { rx: number; ry: number; shine: number };

const TILT_IDLE: Tilt = { rx: 0, ry: 0, shine: 38 };

/** 메인 LP — BgmPlayer 재생 상태와 동기화 */
export function MainVinylDeck() {
  const { playing } = useBgm();
  const [mounted, setMounted] = useState(false);
  const deckRef = useRef<HTMLDivElement>(null);
  const tiltRaf = useRef(0);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  const [tilt, setTilt] = useState<Tilt>(TILT_IDLE);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (tiltRaf.current) window.cancelAnimationFrame(tiltRaf.current);
    };
  }, []);

  const spinning = mounted && playing;

  const handleMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const el = deckRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    pendingRef.current = {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
    };
    if (tiltRaf.current) return;
    tiltRaf.current = window.requestAnimationFrame(() => {
      tiltRaf.current = 0;
      const p = pendingRef.current;
      if (!p) return;
      setTilt({
        ry: (p.x - 0.5) * 10,
        rx: -(p.y - 0.5) * 8,
        shine: p.x * 100,
      });
    });
  }, []);

  const handleLeave = useCallback(() => {
    setHovered(false);
    setTilt(TILT_IDLE);
  }, []);

  const tiltStyle = {
    '--vinyl-rx': `${tilt.rx}deg`,
    '--vinyl-ry': `${tilt.ry}deg`,
    '--vinyl-shine': `${tilt.shine}%`,
  } as CSSProperties;

  return (
    <div className="main-vinyl-deck-wrap" aria-hidden="true">
      <div className="main-vinyl-stage">
        <div
          ref={deckRef}
          className={[
            'main-vinyl-deck',
            hovered ? 'is-hovered' : '',
            spinning ? 'is-live' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={tiltStyle}
          onMouseMove={handleMove}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={handleLeave}
        >
          <div className="main-vinyl-tilt">
            <div
              className={[
                'main-vinyl-disc',
                mounted ? 'is-animated' : '',
                spinning ? 'is-running' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="main-vinyl-disc__rotor">
                <div className="main-vinyl-disc__face">
                  <div className="main-vinyl-disc__grooves" />
                  <div className="main-vinyl-disc__label">
                    <div className="main-vinyl-disc__spindle" />
                  </div>
                </div>
                <div className="main-vinyl-disc__specular" />
                <div className="main-vinyl-disc__rim" />
              </div>
              <div className="main-vinyl-disc__shine" />
            </div>

            <div className={`main-vinyl-arm${spinning ? ' is-playing' : ''}`}>
              <svg className="main-vinyl-arm__svg" viewBox="0 0 160 160" aria-hidden="true">
                <defs>
                  <linearGradient id="main-vinyl-brass" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#c4a882" />
                    <stop offset="45%" stopColor="#8a7358" />
                    <stop offset="100%" stopColor="#5a4838" />
                  </linearGradient>
                  <linearGradient id="main-vinyl-brass-shine" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#e8d4b0" />
                    <stop offset="100%" stopColor="#7a6348" />
                  </linearGradient>
                </defs>
                <circle className="main-vinyl-arm__pivot" cx="132" cy="22" r="11" />
                <circle className="main-vinyl-arm__pivot-ring" cx="132" cy="22" r="14" />
                <path className="main-vinyl-arm__bar" d="M132 22 L46 88" />
                <path className="main-vinyl-arm__bar-shine" d="M132 22 L46 88" />
                <rect className="main-vinyl-arm__cart" x="36" y="82" width="18" height="22" rx="2.5" />
                <rect className="main-vinyl-arm__needle" x="43" y="100" width="2.5" height="11" rx="1" />
              </svg>
            </div>

            <div className="main-vinyl-deck__shadow" />
          </div>
        </div>
      </div>
    </div>
  );
}
