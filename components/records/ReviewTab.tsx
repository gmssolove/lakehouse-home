'use client';

import { useMemo, useState } from 'react';
import { SecretItemGate } from '@/components/lake/SecretItemGate';
import { SecretLockBadge } from '@/components/ui/SecretLockBadge';
import { useSaveToast } from '@/components/ui/SaveToast';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { newId, type ReviewItem } from '@/lib/types/site-content';
import type { ReviewCategoryKind } from '@/lib/types/site-content';
import type { User } from 'firebase/auth';

type Props = {
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
  onSave: (next: ReviewItem[]) => Promise<void>;
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

export function ReviewTab({ user, isAdmin, onOpenAuth, onSave }: Props) {
  const { reviews, reviewCategories } = useSiteContent();
  const { showSaveToast } = useSaveToast();
  const [filterId, setFilterId] = useState<string>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [author, setAuthor] = useState('');
  const [status, setStatus] = useState('');
  const [rating, setRating] = useState(4);
  const [categoryId, setCategoryId] = useState(() => reviewCategories[0]?.id || '');
  const [tags, setTags] = useState('');

  const filtered = useMemo(() => {
    const list = filterId === 'all' ? reviews : reviews.filter((r) => r.categoryId === filterId);
    return [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [filterId, reviews]);

  const catMap = useMemo(() => new Map(reviewCategories.map((c) => [c.id, c])), [reviewCategories]);

  async function submit() {
    if (!isAdmin) return;
    const t = title.trim();
    if (!t) return;
    const item: ReviewItem = {
      id: newId(),
      title: t,
      categoryId: categoryId || reviewCategories[0]?.id || 'custom',
      rating: Math.min(5, Math.max(1, rating)),
      status: status.trim() || undefined,
      author: author.trim() || undefined,
      body: body.trim() || undefined,
      tags: tags
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      date: new Date().toISOString().slice(0, 10),
    };
    await onSave([item, ...reviews]);
    setTitle('');
    setBody('');
    setAuthor('');
    setStatus('');
    setTags('');
    showSaveToast();
  }

  return (
    <>
      {isAdmin ? (
        <section className="lh-records-composer">
          <h3 className="lh-records-composer__title">새 리뷰</h3>
          <input
            className="form-input"
            placeholder="제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <select className="form-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {reviewCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              className="form-input"
              type="number"
              min={1}
              max={5}
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
              aria-label="별점"
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input
              className="form-input"
              placeholder="작가 (선택)"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
            <input
              className="form-input"
              placeholder="상태 (감상 중)"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            />
          </div>
          <input
            className="form-input"
            placeholder="태그 (쉼표 구분)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
          <textarea
            className="form-input"
            rows={4}
            placeholder="리뷰 내용"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="lh-records-composer__actions">
            <button type="button" className="btn-save" onClick={() => void submit()}>
              등록
            </button>
          </div>
        </section>
      ) : null}

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
