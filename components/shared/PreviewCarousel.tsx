'use client';

import { useEffect, useState } from 'react';
import { OcRichText } from '@/lib/oc/richText';
import type { PreviewItem } from '@/lib/types/character';

type Props = {
  items: PreviewItem[];
  className?: string;
};

export function PreviewCarousel({ items, className = '' }: Props) {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const [index, setIndex] = useState(0);
  const [tick, setTick] = useState(0);
  const itemKey = sorted.map((i) => i.id).join('|');

  useEffect(() => {
    setIndex(0);
  }, [itemKey]);

  if (!sorted.length) {
    return <p className="lh-story-list__empty">등록된 프리뷰가 없습니다.</p>;
  }

  const cur = sorted[Math.min(index, sorted.length - 1)];
  const go = (dir: -1 | 1) => {
    setIndex((i) => Math.min(sorted.length - 1, Math.max(0, i + dir)));
    setTick((t) => t + 1);
  };

  return (
    <div className={`lh-preview-carousel ${className}`.trim()}>
      <div key={`${cur.id}-${tick}`} className="lh-preview-carousel__frame">
        {cur.title?.trim() ? (
          <h4 className="lh-preview-carousel__title">{cur.title.trim()}</h4>
        ) : null}
        <OcRichText text={cur.body || ''} className="lh-preview-carousel__body" />
      </div>
      {sorted.length > 1 ? (
        <div className="lh-preview-carousel__ctrl">
          <button type="button" aria-label="이전" disabled={index <= 0} onClick={() => go(-1)}>
            ‹
          </button>
          <span className="lh-preview-carousel__dots">
            {index + 1} / {sorted.length}
          </span>
          <button
            type="button"
            aria-label="다음"
            disabled={index >= sorted.length - 1}
            onClick={() => go(1)}
          >
            ›
          </button>
        </div>
      ) : null}
    </div>
  );
}
