'use client';

import { useMemo, useState } from 'react';
import { SecretItemGate } from '@/components/lake/SecretItemGate';
import { SecretLockBadge } from '@/components/ui/SecretLockBadge';
import { useSaveToast } from '@/components/ui/SaveToast';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { DEFAULT_SCRAP_CATEGORIES, newId, type ScrapItem } from '@/lib/types/site-content';
import type { User } from 'firebase/auth';

type Props = {
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
};

function isTwitterUrl(url?: string) {
  if (!url) return false;
  return /(?:twitter\.com|x\.com)\//i.test(url);
}

function hasQuoteEmbed(item: ScrapItem) {
  return !!(item.quotedBody || item.quotedAuthor || isTwitterUrl(item.sourceUrl));
}

function scrapPreview(item: ScrapItem) {
  const text = item.body?.trim() || item.quotedBody?.trim() || '';
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

function ScrapQuoteCard({ item }: { item: ScrapItem }) {
  const showEmbed = hasQuoteEmbed(item);
  return (
    <div className="lh-scrap-quote">
      <header className="lh-scrap-quote__outer">
        {item.avatarUrl ? (
          <img src={item.avatarUrl} alt="" className="lh-scrap-quote__av" />
        ) : (
          <span className="lh-scrap-quote__av lh-scrap-quote__av--ph">{item.author[0]}</span>
        )}
        <div>
          <strong>{item.author}</strong>
          {item.handle ? <span className="lh-scrap-quote__handle">@{item.handle.replace(/^@/, '')}</span> : null}
        </div>
      </header>
      {item.body ? <p className="lh-scrap-quote__comment">{item.body}</p> : null}
      {showEmbed ? (
        <div className="lh-scrap-quote__embed">
          <header className="lh-scrap-quote__embed-head">
            {item.quotedAvatarUrl ? (
              <img src={item.quotedAvatarUrl} alt="" className="lh-scrap-quote__embed-av" />
            ) : (
              <span className="lh-scrap-quote__embed-av lh-scrap-quote__embed-av--ph">X</span>
            )}
            <div>
              <strong>{item.quotedAuthor || '원문'}</strong>
              {item.quotedHandle ? (
                <span className="lh-scrap-quote__handle">@{item.quotedHandle.replace(/^@/, '')}</span>
              ) : null}
            </div>
            <span className="lh-scrap-quote__x" aria-hidden="true">
              𝕏
            </span>
          </header>
          {item.quotedBody ? <p className="lh-scrap-quote__embed-body">{item.quotedBody}</p> : null}
          {item.quotedImageUrl ? <img src={item.quotedImageUrl} alt="" className="lh-scrap-quote__embed-img" /> : null}
          {item.imageUrl && !item.quotedImageUrl ? (
            <img src={item.imageUrl} alt="" className="lh-scrap-quote__embed-img" />
          ) : null}
        </div>
      ) : item.imageUrl ? (
        <img src={item.imageUrl} alt="" className="lh-scrap-quote__media" />
      ) : null}
      {item.sourceUrl ? (
        <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="lh-scrap-quote__link">
          {isTwitterUrl(item.sourceUrl) ? '원문 트윗 보기' : item.sourceUrl}
        </a>
      ) : null}
    </div>
  );
}

function ScrapInlineComposer({
  cats,
  onSave,
}: {
  cats: { id: string; label: string }[];
  onSave: (item: ScrapItem) => void;
}) {
  const [author, setAuthor] = useState('');
  const [body, setBody] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [categoryId, setCategoryId] = useState(() => cats.find((c) => c.id !== 'all')?.id || 'general');

  function reset() {
    setAuthor('');
    setBody('');
    setSourceUrl('');
  }

  return (
    <section className="lh-records-composer">
      <h3 className="lh-records-composer__title">새 스크랩</h3>
      <input
        className="form-input"
        placeholder="작성자"
        value={author}
        onChange={(e) => setAuthor(e.target.value)}
      />
      <select
        className="form-input"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
      >
        {cats.filter((c) => c.id !== 'all').map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <textarea
        className="form-input"
        rows={5}
        placeholder="내용"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <input
        className="form-input"
        placeholder="원문 URL (선택)"
        value={sourceUrl}
        onChange={(e) => setSourceUrl(e.target.value)}
      />
      <div className="lh-records-composer__actions">
        <button type="button" className="btn-edit" onClick={reset}>
          지우기
        </button>
        <button
          type="button"
          className="btn-save"
          onClick={() => {
            if (!author.trim() || !body.trim()) {
              alert('작성자와 내용을 입력하세요.');
              return;
            }
            onSave({
              id: newId(),
              author: author.trim(),
              body: body.trim(),
              date: new Date().toISOString().slice(0, 10),
              categoryId,
              sourceUrl: sourceUrl.trim() || undefined,
            });
            reset();
          }}
        >
          등록
        </button>
      </div>
    </section>
  );
}

export function ScrapTab({ user, isAdmin, onOpenAuth }: Props) {
  const { scrap, scrapCategories, saveScrap } = useSiteContent();
  const { showSaveToast } = useSaveToast();
  const [activeCat, setActiveCat] = useState('all');
  const [query, setQuery] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);

  const cats = scrapCategories.length ? scrapCategories : DEFAULT_SCRAP_CATEGORIES;

  const sorted = useMemo(
    () => [...scrap].sort((a, b) => b.date.localeCompare(a.date)),
    [scrap],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((item) => {
      if (activeCat !== 'all' && item.categoryId !== activeCat) return false;
      if (!q) return true;
      const hay = [item.author, item.body, item.quotedBody, item.sourceUrl].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [sorted, activeCat, query]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    sorted.forEach((item) => {
      const key = item.categoryId || 'other';
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [sorted]);

  const detail = detailId ? filtered.find((i) => i.id === detailId) : null;

  async function addItem(item: ScrapItem) {
    await saveScrap([item, ...scrap]);
    showSaveToast();
  }

  return (
    <div className="lh-scrap-layout">
      <aside className="lh-scrap-sidebar">
        <div className="lh-scrap-sidebar__title">카테고리</div>
        <ul className="lh-scrap-sidebar__list">
          {cats.map((cat) => (
            <li key={cat.id}>
              <button
                type="button"
                className={`lh-scrap-sidebar__item${activeCat === cat.id ? ' is-active' : ''}`}
                onClick={() => setActiveCat(cat.id)}
              >
                <span>{cat.label}</span>
                <em>{cat.id === 'all' ? sorted.length : counts.get(cat.id) || 0}</em>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="lh-scrap-main">
        {isAdmin ? <ScrapInlineComposer cats={cats} onSave={(item) => void addItem(item)} /> : null}

        <div className="lh-scrap-main__head">
          <span>{filtered.length}건</span>
          <input
            className="lh-scrap-main__search"
            placeholder="검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {!sorted.length ? (
          <div className="page-coming">— 스크랩이 없습니다 —</div>
        ) : (
          <div className="lh-scrap-grid">
            {filtered.map((item) => {
              const catLabel = cats.find((c) => c.id === item.categoryId)?.label || '기타';
              return (
                <SecretItemGate
                  key={item.id}
                  scope="scrap"
                  item={item}
                  isAdmin={isAdmin}
                  loggedIn={!!user}
                  onRequestLogin={onOpenAuth}
                >
                  <button type="button" className="lh-scrap-card" onClick={() => setDetailId(item.id)}>
                    <span className="lh-scrap-card__tag">{catLabel}</span>
                    <strong className="lh-scrap-card__title">
                      {item.author}
                      {item.secret ? <SecretLockBadge compact /> : null}
                    </strong>
                    <p className="lh-scrap-card__body">{scrapPreview(item)}</p>
                    {item.sourceUrl ? (
                      <span className="lh-scrap-card__source">
                        출처: {item.sourceUrl.replace(/^https?:\/\//, '').slice(0, 36)}…
                      </span>
                    ) : null}
                    <time className="lh-scrap-card__date">{item.date}</time>
                  </button>
                </SecretItemGate>
              );
            })}
          </div>
        )}
      </div>

      {detail ? (
        <div className="lh-scrap-detail" role="dialog" aria-modal="true">
          <div className="lh-scrap-detail__backdrop" onClick={() => setDetailId(null)} />
          <div className="lh-scrap-detail__panel">
            <button type="button" className="lh-scrap-detail__close" onClick={() => setDetailId(null)} aria-label="닫기">
              ×
            </button>
            <ScrapQuoteCard item={detail} />
            {detail.sourceUrl ? (
              <a href={detail.sourceUrl} target="_blank" rel="noreferrer" className="lh-scrap-detail__more">
                자세히 보기 ↗
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
