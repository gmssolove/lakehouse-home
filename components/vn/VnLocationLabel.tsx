'use client';

import { useEffect, useRef, useState } from 'react';

const HOLD_MS = 2800;

type Props = {
  /** 현재 대사/씬 장소. 비어 있으면 렌더하지 않음 */
  location?: string | null;
};

/**
 * 대사창(`.lh-vn-box`) 자식 — 화자 이름 위.
 * 장소가 바뀔 때만 등장 연출 후 은은히 잦아듦.
 */
export function VnLocationLabel({ location }: Props) {
  const next = typeof location === 'string' ? location.trim() : '';
  const [displayedLocation, setDisplayedLocation] = useState(next);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isDimmed, setIsDimmed] = useState(false);
  const prevRef = useRef<string | null>(null);

  useEffect(() => {
    if (!next) {
      prevRef.current = null;
      setDisplayedLocation('');
      setIsRevealed(false);
      setIsDimmed(false);
      return;
    }

    if (prevRef.current === next) return;

    prevRef.current = next;
    setDisplayedLocation(next);
    setIsRevealed(false);
    setIsDimmed(false);

    // 마운트 직후 한 프레임 뒤에 reveal → CSS transition 재생
    const revealId = window.requestAnimationFrame(() => {
      setIsRevealed(true);
    });

    const dimId = window.setTimeout(() => {
      setIsDimmed(true);
    }, HOLD_MS);

    return () => {
      window.cancelAnimationFrame(revealId);
      window.clearTimeout(dimId);
    };
  }, [next]);

  if (!next || !displayedLocation) return null;

  return (
    <div
      className={[
        'lh-vn-location',
        isRevealed ? 'is-revealed' : '',
        isDimmed ? 'is-dimmed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`장소 ${displayedLocation}`}
    >
      <span className="lh-vn-location__label">장소</span>
      <span className="lh-vn-location__text">{displayedLocation}</span>
    </div>
  );
}
