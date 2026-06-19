'use client';

import type { CSSProperties } from 'react';
import { PairAddSlot } from '@/components/pair/PairAddSlot';
import { PairArchiveCard } from '@/components/pair/PairArchiveCard';
import { PAIR_CAROUSEL_GAP_PX, usePairRevolveCarousel } from '@/lib/hooks/usePairRevolveCarousel';
import type { PairItem } from '@/lib/types/character';

type Props = {
  pairs: PairItem[];
  isAdmin: boolean;
  onOpen: (pair: PairItem) => void;
  onAdd: () => void;
};

/** Tiered scale — center largest; origin biased up so shield tip stays visible. */
function slotScale(abs: number): number {
  if (abs < 0.48) return 1.06;
  if (abs < 1.35) return 0.92;
  if (abs < 2.35) return 0.8;
  return 0.7;
}

function slotBlur(abs: number): number {
  if (abs < 0.55) return 0;
  if (abs < 1.4) return 0.6;
  if (abs < 2.4) return 1.2;
  return 1.8;
}

/** Flat carousel — cards face forward; depth via scale, opacity, light blur. */
function flatSlotStyle(delta: number): CSSProperties {
  const abs = Math.abs(delta);
  const front = abs < 0.48;
  const scale = slotScale(abs);
  const x = delta * PAIR_CAROUSEL_GAP_PX;
  const opacity = front ? 1 : Math.max(0.38, 1 - abs * 0.22);
  const blur = slotBlur(abs);

  return {
    transform: `translate3d(calc(-50% + ${x}px), 0, 0) scale(${scale})`,
    transformOrigin: front ? '50% 44%' : '50% 50%',
    opacity,
    zIndex: Math.round(140 - abs * 14),
    pointerEvents: front ? 'auto' : 'none',
    contentVisibility: abs > 2.8 ? 'hidden' : 'visible',
    ...(blur > 0 ? { filter: `blur(${blur}px)` } : undefined),
  };
}

export function PairRevolveStage({ pairs, isAdmin, onOpen, onAdd }: Props) {
  const slotCount = pairs.length + 1;
  const { containerRef, index, slotDelta, navigateBy, shouldSuppressClick } =
    usePairRevolveCarousel(slotCount);

  function handleOpen(pair: PairItem) {
    if (shouldSuppressClick()) return;
    onOpen(pair);
  }

  const slots: Array<
    { kind: 'pair'; pair: PairItem; slotIndex: number } | { kind: 'add'; slotIndex: number }
  > = [
    ...pairs.map((pair, i) => ({ kind: 'pair' as const, pair, slotIndex: i })),
    { kind: 'add' as const, slotIndex: pairs.length },
  ];

  return (
    <div ref={containerRef} className="pair-revolve" id="pair-grid">
      <div className="pair-revolve-ambience" aria-hidden="true">
        <div className="pair-revolve-floor-glow" />
        <span className="pair-revolve-corner pair-revolve-corner--tl" />
        <span className="pair-revolve-corner pair-revolve-corner--tr" />
        <span className="pair-revolve-corner pair-revolve-corner--bl" />
        <span className="pair-revolve-corner pair-revolve-corner--br" />
      </div>

      <div className="pair-revolve-scene">
        <div className="pair-revolve-edge-fade pair-revolve-edge-fade--left" aria-hidden="true" />
        <div className="pair-revolve-edge-fade pair-revolve-edge-fade--right" aria-hidden="true" />

        {slotCount > 1 && (
          <div className="pair-revolve-nav">
            <button
              type="button"
              className="pair-revolve-arrow pair-revolve-arrow--prev"
              aria-label="이전 카드"
              onClick={() => navigateBy(-1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="pair-revolve-arrow pair-revolve-arrow--next"
              aria-label="다음 카드"
              onClick={() => navigateBy(1)}
            >
              ›
            </button>
          </div>
        )}

        <div className="pair-revolve-track">
          {slots.map((slot) => {
            const delta = slotDelta(slot.slotIndex);
            const front = Math.abs(delta) < 0.48;

            if (slot.kind === 'pair') {
              return (
                <div
                  key={slot.pair.id}
                  className={`pair-revolve-slot${front ? ' is-front' : ' is-depth'}`}
                  style={flatSlotStyle(delta)}
                >
                  <PairArchiveCard
                    pair={slot.pair}
                    index={slot.slotIndex}
                    active={front}
                    onClick={() => handleOpen(slot.pair)}
                  />
                </div>
              );
            }

            return (
              <div
                key="__coming-soon__"
                className={`pair-revolve-slot pair-revolve-slot--add${front ? ' is-front' : ' is-depth'}`}
                style={flatSlotStyle(delta)}
              >
                <PairAddSlot
                  staggerIndex={pairs.length}
                  isAdmin={isAdmin}
                  onAdd={() => {
                    if (shouldSuppressClick()) return;
                    if (!front) return;
                    onAdd();
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {slotCount > 1 && (
        <div className="pair-revolve-index" aria-hidden="true">
          {String(index + 1).padStart(2, '0')} / {String(slotCount).padStart(2, '0')}
        </div>
      )}
    </div>
  );
}
