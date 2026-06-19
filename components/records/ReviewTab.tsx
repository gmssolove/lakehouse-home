'use client';

import { useMemo, useState } from 'react';
import { SecretItemGate } from '@/components/lake/SecretItemGate';
import { SecretLockBadge } from '@/components/ui/SecretLockBadge';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import type { ReviewCategoryKind } from '@/lib/types/site-content';
import type { User } from 'firebase/auth';

type Props = {
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="lh-review-stars" aria-label={`${rating}점`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rating ? 'is-on' : ''}>
          ★
        </span>
      ))}
    </span>
  );
}

function isBookLike(kind: ReviewCategoryKind) {
  return kind === 'book' || kind === 'poetry';
}

export function ReviewTab({ user, isAdmin, onOpenAuth }: Props) {
  const { reviews, reviewCategories } = useSiteContent();
  const [filterId, setFilterId] = useState<string>('all');

  const filtered = useMemo(() => {
    const list = filterId === 'all' ? reviews : reviews.filter((r) => r.categoryId === filterId);
    return [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [filterId, reviews]);

  const catMap = useMemo(() => new Map(reviewCategories.map((c) => [c.id, c])), [reviewCategories]);

  return (
    <>
      <div className="lh-review-filters">
        <button
          type="button"
          className={`lh-review-filter${filterId === 'all' ? ' is-active' : ''}`}
          onClick={() => setFilterId('all')}
        >
          전체
        </button>
        {reviewCategories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`lh-review-filter${filterId === c.id ? ' is-active' : ''}`}
            onClick={() => setFilterId(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {!filtered.length ? (
        <div className="page-coming">— 리뷰가 없습니다 —</div>
      ) : (
        <div className={`lh-review-grid${filterId !== 'all' && isBookLike(catMap.get(filterId)?.kind || 'custom') ? ' lh-review-grid--book' : ''}`}>
          {filtered.map((item) => {
            const cat = catMap.get(item.categoryId);
            const bookLayout = isBookLike(cat?.kind || 'custom');
            return (
              <SecretItemGate
                key={item.id}
                scope="review"
                item={item}
                isAdmin={isAdmin}
                loggedIn={!!user}
                onRequestLogin={onOpenAuth}
              >
                <article className={`lh-review-card${bookLayout ? ' lh-review-card--book' : ' lh-review-card--wide'}`}>
                  {item.coverUrl ? (
                    <div
                      className="lh-review-card__cover"
                      style={{ backgroundImage: `url(${item.coverUrl})` }}
                    />
                  ) : (
                    <div className="lh-review-card__cover lh-review-card__cover--empty">{item.title[0]}</div>
                  )}
                  <div className="lh-review-card__overlay">
                    {item.status ? <span className="lh-review-card__status">{item.status}</span> : null}
                    <Stars rating={item.rating} />
                    <h3>
                      {item.title}
                      {item.secret ? <SecretLockBadge compact /> : null}
                    </h3>
                    {item.author ? <p className="lh-review-card__author">{item.author}</p> : null}
                    {item.tags?.length ? (
                      <div className="lh-review-card__tags">
                        {item.tags.map((t) => (
                          <span key={t}>#{t}</span>
                        ))}
                      </div>
                    ) : null}
                    {item.body ? <p className="lh-review-card__body">{item.body}</p> : null}
                  </div>
                </article>
              </SecretItemGate>
            );
          })}
        </div>
      )}
    </>
  );
}
