'use client';

import { useCallback, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';

type Props = {
  staggerIndex: number;
  isAdmin: boolean;
  onAdd: () => void;
};

export function PairAddSlot({ staggerIndex, isAdmin, onAdd }: Props) {
  const shieldRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  const handleMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const el = shieldRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    setTilt({
      ry: (x - 0.5) * 10,
      rx: -(y - 0.5) * 8 - 1,
    });
  }, []);

  const handleLeave = useCallback(() => {
    setHovered(false);
    setTilt({ rx: 0, ry: 0 });
  }, []);

  const handleClick = () => {
    if (isAdmin) onAdd();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isAdmin) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onAdd();
    }
  };

  return (
    <article
      className={`pair-archive-add pair-card--add-slot${isAdmin ? ' is-admin' : ''}${hovered ? ' is-hovered' : ''}`}
      style={
        {
          '--pair-i': staggerIndex,
          '--add-rx': `${tilt.rx}deg`,
          '--add-ry': `${tilt.ry}deg`,
        } as CSSProperties
      }
    >
      <div className="pair-archive-card__visual">
        <div className="pair-add-slot">
          <div
            ref={shieldRef}
            className="pair-add-slot__shield"
            role={isAdmin ? 'button' : undefined}
            tabIndex={isAdmin ? 0 : undefined}
            aria-label={isAdmin ? '페어 추가' : 'Coming Soon'}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            onMouseMove={handleMove}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={handleLeave}
          >
            <div className="pair-add-slot__pattern" aria-hidden="true" />
            <div className="pair-add-slot__silhouette" aria-hidden="true" />
            <span className="pair-add-slot__plus" aria-hidden="true">
              +
            </span>
            <span className="pair-add-slot__label">Coming Soon</span>
          </div>
        </div>
      </div>
    </article>
  );
}
