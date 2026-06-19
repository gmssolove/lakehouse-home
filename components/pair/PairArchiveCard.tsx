'use client';

import type { CSSProperties } from 'react';
import { PairSlantHero } from '@/components/pair/PairSlantHero';
import type { PairItem } from '@/lib/types/character';

type Props = {
  pair: PairItem;
  index: number;
  active?: boolean;
  onClick: () => void;
};

export function PairArchiveCard({ pair, index, active = true, onClick }: Props) {
  return (
    <article
      className={`pair-archive-card${active ? ' is-active' : ''}`}
      style={{ '--pair-i': index } as CSSProperties}
      onClick={onClick}
    >
      <div className="pair-archive-card__visual">
        <PairSlantHero pair={pair} variant="card" staggerIndex={index} showMeta interactive={active} />
      </div>
    </article>
  );
}
