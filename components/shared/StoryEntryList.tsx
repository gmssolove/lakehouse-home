'use client';

import { useEffect, useMemo, useState } from 'react';
import { LakeSearchField } from '@/components/ui/LakeSearchField';
import { formatStoryMeta, mergeStoryCategories } from '@/lib/oc/storyEntries';
import type { StoryEntry } from '@/lib/types/character';

function tagClass(cat: string): string {
  const c = cat.trim().toUpperCase();
  if (c === '본편' || cat === '본편') return 'is-main';
  if (c === 'AU') return 'is-au';
  if (c === 'IF') return 'is-if';
  return 'is-etc';
}

type Props = {
  entries: StoryEntry[];
  categories?: string[];
  mode?: 'accordion' | 'list';
  onOpen: (entry: StoryEntry) => void;
  className?: string;
  /** 바뀌면 펼침/검색/필터 초기화 */
  resetKey?: string | number;
};

export function StoryEntryList({
  entries,
  categories,
  mode = 'accordion',
  onOpen,
  className = '',
  resetKey,
}: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (resetKey === undefined) return;
    setOpenId(null);
    setQuery('');
    setFilter('all');
  }, [resetKey]);

  const cats = useMemo(
    () => mergeStoryCategories(categories, entries),
    [categories, entries],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...entries]
      .sort((a, b) => a.order - b.order)
      .filter((e) => {
        if (filter !== 'all' && e.category !== filter) return false;
        if (!q) return true;
        const hay = `${e.title} ${e.category} ${e.chapters.map((c) => c.body).join(' ')}`
          .toLowerCase()
          .replace(/<[^>]+>/g, '');
        return hay.includes(q);
      });
  }, [entries, filter, query]);

  return (
    <div className={`lh-story-list ${className}`.trim()}>
      <div className="lh-story-list__tools">
        <LakeSearchField
          variant="line"
          wrapClassName="lh-story-list__search"
          placeholder="검색"
          value={query}
          onChange={setQuery}
          aria-label="서사 검색"
        />
        <div className="lh-story-list__filters" role="group" aria-label="분류 필터">
          <button
            type="button"
            className={`lh-story-list__filter${filter === 'all' ? ' is-active' : ''}`}
            onClick={() => setFilter('all')}
          >
            전체
          </button>
          {cats.map((c) => (
            <button
              key={c}
              type="button"
              className={`lh-story-list__filter${filter === c ? ' is-active' : ''}`}
              onClick={() => setFilter(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {!filtered.length ? (
        <p className="lh-story-list__empty">해당하는 글이 없습니다.</p>
      ) : mode === 'accordion' ? (
        <div className="lh-story-list__rows">
          {filtered.map((entry, i) => {
            const open = openId === entry.id;
            return (
              <div
                key={entry.id}
                className={`lh-story-row-wrap${open ? ' is-open' : ''}`}
                style={{ ['--row-i' as string]: i }}
              >
                <button
                  type="button"
                  className={`lh-story-row${open ? ' is-open' : ''}`}
                  onClick={() => setOpenId(open ? null : entry.id)}
                  aria-expanded={open}
                >
                  <span
                    className={`lh-story-tag ${tagClass(entry.category)}`}
                    data-cat={entry.category}
                  >
                    {entry.category || '기타'}
                  </span>
                  <span className="lh-story-row__main">
                    <span className="lh-story-row__title-line">
                      <span className="lh-story-row__title">
                        {entry.title.trim() || '(제목 없음)'}
                      </span>
                      <span className="lh-story-row__chev" aria-hidden>
                        ›
                      </span>
                    </span>
                  </span>
                </button>
                <div className={`lh-story-row__fold${open ? ' is-open' : ''}`}>
                  <div className="lh-story-row__fold-inner">
                    <div className="lh-story-row__detail">
                      <span className="lh-story-row__meta">{formatStoryMeta(entry)}</span>
                      <button
                        type="button"
                        className="lh-story-row__open"
                        onClick={() => onOpen(entry)}
                      >
                        READ
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="lh-story-list__rows">
          {filtered.map((entry, i) => (
            <button
              key={entry.id}
              type="button"
              className="lh-story-row"
              style={{ ['--row-i' as string]: i }}
              onClick={() => onOpen(entry)}
            >
              <span
                className={`lh-story-tag ${tagClass(entry.category)}`}
                data-cat={entry.category}
              >
                {entry.category || '기타'}
              </span>
              <span className="lh-story-row__main">
                <span className="lh-story-row__title-line">
                  <span className="lh-story-row__title">
                    {entry.title.trim() || '(제목 없음)'}
                  </span>
                  <span className="lh-story-row__chev" aria-hidden>
                    ›
                  </span>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
