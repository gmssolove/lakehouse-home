'use client';

import type { CSSProperties } from 'react';
import { ImageFrameView } from '@/components/ui/ImageFrameView';
import { pairCardSub, pairCardTitle, pairCover } from '@/lib/oc/pairCover';
import type { PairItem } from '@/lib/types/character';

type Props = {
  pairs: PairItem[];
  onOpen: (pair: PairItem) => void;
};

export function PairRevolveStage({ pairs, onOpen }: Props) {
  const list = Array.isArray(pairs) ? pairs : [];

  if (!list.length) {
    return (
      <div
        id="pair-grid"
        className="card-grid"
        style={{
          gridColumn: '1/-1',
          textAlign: 'center',
          padding: '5rem',
          fontFamily: 'var(--font-playfair), "Playfair Display", serif',
          fontStyle: 'italic',
          fontSize: 20,
          color: 'var(--text-muted)',
        }}
      >
        — 등록된 페어가 없습니다 —
      </div>
    );
  }

  return (
    <div className="card-grid" id="pair-grid">
      {list.map((pair) => {
        const cover = pairCover(pair);
        const title = pairCardTitle(pair);
        const sub = pairCardSub(pair);
        const tag = pair.keywords?.find((k) => k.trim())?.trim() || pair.relation?.trim() || '';
        const accent = pair.color?.trim() || '';

        return (
          <div
            key={pair.id}
            className="char-card"
            role="button"
            tabIndex={0}
            onClick={() => onOpen(pair)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen(pair);
              }
            }}
            style={accent ? ({ '--pair-card-accent': accent } as CSSProperties) : undefined}
          >
            {cover.src ? (
              <ImageFrameView
                src={cover.src}
                frame={cover.frame}
                fit={(cover.fit as CSSProperties['objectFit']) || 'cover'}
                pos={cover.pos || 'center top'}
                className="char-card-img-wrap"
                imgClassName="char-card-img"
              />
            ) : (
              <div className="char-card-placeholder">{title[0] || 'P'}</div>
            )}
            <div className="char-card-hover">
              {sub ? <div className="hover-sub">{sub}</div> : null}
              <div className="hover-name">{title}</div>
              {tag ? <div className="hover-tag">{tag}</div> : null}
            </div>
            <div className="char-card-bottom">
              {sub ? <div className="char-card-role">{sub}</div> : null}
              <div className="char-card-name">{title}</div>
              {tag ? (
                <div className="char-card-tags">
                  <span className="char-card-tag">{tag}</span>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
