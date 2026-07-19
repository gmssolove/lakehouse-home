'use client';

import { useEffect, useMemo, useState } from 'react';
import { LakeSearchField } from '@/components/ui/LakeSearchField';
import { ImageFrameView } from '@/components/ui/ImageFrameView';
import { formatStoryMeta, mergeStoryCategories, storySecretItemId, storyCategoryTagStyle } from '@/lib/oc/storyEntries';
import { isLakeItemUnlocked, resolveScopePassword } from '@/lib/lake/accessGate';
import { SecretLockIcon } from '@/components/ui/SecretLockBadge';
import type { SiteAccessSettings } from '@/lib/types/secret-content';
import type { StoryEntry } from '@/lib/types/character';

const DEFAULT_PAGE_SIZE = 12;

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
  categoryColors?: Record<string, string>;
  mode?: 'accordion' | 'list';
  onOpen: (entry: StoryEntry) => void;
  className?: string;
  /** 바뀌면 펼침/검색/필터 초기화 */
  resetKey?: string | number;
  /** 페어 로그용 — 비밀글 잠금 키 */
  pairId?: string;
  accessSettings?: Partial<SiteAccessSettings>;
  isAdmin?: boolean;
  onEditEntry?: (entry: StoryEntry) => void;
  onDeleteEntry?: (entry: StoryEntry) => void;
  onUnlockEntry?: (entry: StoryEntry) => void;
  /** 정렬 라벨 */
  sortRegLabel?: string;
  sortNewLabel?: string;
  /** 목록 상단 제목 (예: 로그 목록) */
  heading?: string;
  /** 총 N개 문구 단위 (기본: 포스트) */
  totalUnit?: string;
  /** 삭제 전 confirm (기본 true). 편집 탭으로만 보낼 때는 false */
  confirmDelete?: boolean;
  /** 페이지당 개수 (갤러리형). 0이면 전체 */
  pageSize?: number;
};

export function StoryEntryList({
  entries,
  categories,
  categoryColors,
  mode = 'accordion',
  onOpen,
  className = '',
  resetKey,
  pairId,
  accessSettings,
  isAdmin,
  onEditEntry,
  onDeleteEntry,
  onUnlockEntry,
  sortRegLabel = '등록순',
  sortNewLabel = '최신순',
  heading,
  totalUnit = '포스트',
  confirmDelete = true,
  pageSize = DEFAULT_PAGE_SIZE,
}: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [sort, setSort] = useState<'reg' | 'new'>('reg');
  const [unlockTick, setUnlockTick] = useState(0);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (resetKey === undefined) return;
    setOpenId(null);
    setQuery('');
    setFilter('all');
    setSort('reg');
    setPage(0);
  }, [resetKey]);

  useEffect(() => {
    setPage(0);
  }, [query, filter, sort]);

  const cats = useMemo(
    () => mergeStoryCategories(categories, entries),
    [categories, entries],
  );

  const numberById = useMemo(() => {
    const map = new Map<string, number>();
    [...entries]
      .sort((a, b) => a.order - b.order)
      .forEach((e, i) => map.set(e.id, i + 1));
    return map;
  }, [entries]);

  const isLocked = (entry: StoryEntry) => {
    if (isAdmin) return false;
    if (entry.visibility !== 'secret') return false;
    if (!pairId) return true;
    const pw =
      entry.secretPassword?.trim() ||
      resolveScopePassword('pair', accessSettings);
    return !isLakeItemUnlocked('pair', storySecretItemId(pairId, entry.id), pw);
  };

  const filtered = useMemo(() => {
    void unlockTick;
    const q = query.trim().toLowerCase();
    return [...entries]
      .sort((a, b) => (sort === 'new' ? b.order - a.order : a.order - b.order))
      .filter((e) => {
        if (filter !== 'all' && e.category !== filter) return false;
        if (!q) return true;
        const meta = `${e.title} ${e.subtitle || ''} ${e.category} ${e.author || ''}`.toLowerCase();
        if (meta.includes(q)) return true;
        /* 본문은 1챕터·2KB만 — 전 로그 HTML join 시 메인스레드 스톨 */
        const body = (e.chapters[0]?.body || '')
          .replace(/<[^>]+>/g, ' ')
          .slice(0, 2000)
          .toLowerCase();
        return body.includes(q);
      });
  }, [entries, filter, query, sort, unlockTick]);

  const size = pageSize > 0 ? pageSize : filtered.length || 1;
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const safePage = Math.min(page, pages - 1);
  const paged = useMemo(() => {
    if (pageSize <= 0) return filtered;
    const start = safePage * size;
    return filtered.slice(start, start + size);
  }, [filtered, pageSize, safePage, size]);

  useEffect(() => {
    if (page > pages - 1) setPage(Math.max(0, pages - 1));
  }, [page, pages]);

  const fmtNum = (id: string) => String(numberById.get(id) ?? 0).padStart(3, '0');

  const handleOpen = (entry: StoryEntry) => {
    if (isLocked(entry)) {
      onUnlockEntry?.(entry);
      setUnlockTick((n) => n + 1);
      return;
    }
    onOpen(entry);
  };

  const renderThumb = (entry: StoryEntry) => {
    const src = entry.thumbnail?.trim();
    if (!src) return null;
    return (
      <span className="lh-story-row__thumb">
        {entry.thumbnailFrame ? (
          <ImageFrameView
            src={src}
            frame={entry.thumbnailFrame}
            fit="cover"
            className="lh-story-row__thumb-frame"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" />
        )}
      </span>
    );
  };

  const isSecret = (entry: StoryEntry) => entry.visibility === 'secret';

  const renderBadges = (entry: StoryEntry) => (
    <>
      {entry.adult ? <span className="lh-story-badge lh-story-badge--adult">19</span> : null}
    </>
  );

  const renderTitle = (entry: StoryEntry) => entry.title.trim() || '(제목 없음)';

  const renderSecretLock = (entry: StoryEntry) =>
    isSecret(entry) ? (
      <span className="lh-story-row__lock" aria-label="비밀글" title="비밀글">
        <SecretLockIcon className="lh-story-row__lock-icon" />
      </span>
    ) : null;

  const renderMetaLine = (entry: StoryEntry) => {
    const parts = [
      entry.author?.trim(),
      entry.date?.trim(),
      entry.subtitle?.trim() || formatStoryMeta(entry),
    ].filter(Boolean);
    if (!parts.length) return null;
    return <span className="lh-story-row__meta-line">{parts.join(' · ')}</span>;
  };

  const renderAdmin = (entry: StoryEntry) =>
    isAdmin && (onEditEntry || onDeleteEntry) ? (
      <span className="lh-story-row__admin">
        {onEditEntry ? (
          <button type="button" className="lh-story-row__admin-btn" onClick={() => onEditEntry(entry)}>
            수정
          </button>
        ) : null}
        {onDeleteEntry ? (
          <button
            type="button"
            className="lh-story-row__admin-btn is-danger"
            onClick={() => {
              if (
                confirmDelete &&
                !window.confirm(`「${entry.title || '제목 없음'}」을(를) 삭제할까요?`)
              ) {
                return;
              }
              onDeleteEntry(entry);
            }}
          >
            삭제
          </button>
        ) : null}
      </span>
    ) : null;

  return (
    <div className={`lh-story-list ${className}`.trim()}>
      <div className="lh-story-list__tools">
        {heading ? (
          <div className="lh-story-list__head">
            <span className="lh-story-list__heading">{heading}</span>
            <span className="lh-story-list__total">
              총 {filtered.length}개의 {totalUnit}
            </span>
          </div>
        ) : null}
        <div className="lh-story-list__search-row">
          <LakeSearchField
            variant="line"
            wrapClassName="lh-story-list__search"
            placeholder="검색"
            value={query}
            onChange={setQuery}
            aria-label="서사 검색"
          />
          {heading ? (
            <div className="lh-story-list__head-sorts">
              <button
                type="button"
                className={`lh-story-list__sort-link${sort === 'reg' ? ' is-active' : ''}`}
                onClick={() => setSort('reg')}
              >
                {sortRegLabel}
              </button>
              <span className="lh-story-list__sort-sep" aria-hidden>
                ·
              </span>
              <button
                type="button"
                className={`lh-story-list__sort-link${sort === 'new' ? ' is-active' : ''}`}
                onClick={() => setSort('new')}
              >
                {sortNewLabel}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="lh-story-list__sort"
              onClick={() => setSort((s) => (s === 'reg' ? 'new' : 'reg'))}
              aria-label={sort === 'reg' ? `${sortRegLabel} (클릭 시 ${sortNewLabel})` : `${sortNewLabel} (클릭 시 ${sortRegLabel})`}
              title={sort === 'reg' ? `${sortRegLabel} — 클릭하면 ${sortNewLabel}` : `${sortNewLabel} — 클릭하면 ${sortRegLabel}`}
            >
              {sort === 'reg' ? sortRegLabel : sortNewLabel}
            </button>
          )}
        </div>
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
          {paged.map((entry, i) => {
            const open = openId === entry.id;
            const locked = isLocked(entry);
            return (
              <div
                key={entry.id}
                className={`lh-story-row-wrap${open ? ' is-open' : ''}${locked ? ' is-locked' : ''}`}
                style={{ ['--row-i' as string]: i }}
              >
                <button
                  type="button"
                  className={`lh-story-row${open ? ' is-open' : ''}${entry.thumbnail?.trim() ? '' : ' is-no-thumb'}`}
                  onClick={() => {
                    if (locked) {
                      handleOpen(entry);
                      return;
                    }
                    setOpenId(open ? null : entry.id);
                  }}
                  aria-expanded={open}
                >
                  {renderThumb(entry)}
                  <span className="lh-story-row__num" aria-hidden>
                    {fmtNum(entry.id)}.
                  </span>
                  <span
                    className={`lh-story-tag ${tagClass(entry.category)}`}
                    data-cat={entry.category}
                    style={storyCategoryTagStyle(entry.category, categoryColors)}
                  >
                    {entry.category || '기타'}
                  </span>
                  <span className="lh-story-row__main">
                    <span className="lh-story-row__title-line">
                      {renderSecretLock(entry)}
                      <span className="lh-story-row__title">{renderTitle(entry)}</span>
                      {renderBadges(entry)}
                      {!locked ? (
                        <span className="lh-story-row__chev" aria-hidden>
                          {open ? '▾' : '▸'}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
                {renderAdmin(entry)}
                {!locked ? (
                  <div className={`lh-story-row__fold${open ? ' is-open' : ''}`}>
                    <div className="lh-story-row__fold-inner">
                      <div className="lh-story-row__detail">
                        <span className="lh-story-row__meta">
                          {(() => {
                            const left = [
                              entry.author?.trim()
                                ? entry.author.trim().startsWith('©')
                                  ? entry.author.trim()
                                  : `© ${entry.author.trim()}`
                                : '',
                              formatStoryMeta(entry),
                            ]
                              .filter(Boolean)
                              .join(' · ');
                            const date = entry.date?.trim();
                            if (!date) return left;
                            return left ? `${left} 〡 ${date}` : `〡 ${date}`;
                          })()}
                        </span>
                        <button
                          type="button"
                          className="lh-story-row__open"
                          onClick={() => handleOpen(entry)}
                        >
                          READ
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="lh-story-list__rows">
          {paged.map((entry, i) => {
            const locked = isLocked(entry);
            return (
              <div
                key={entry.id}
                className={`lh-story-row-wrap is-flat${locked ? ' is-locked' : ''}`}
                style={{ ['--row-i' as string]: i }}
              >
                <button
                  type="button"
                  className={`lh-story-row is-flat${locked ? ' is-locked' : ''}${entry.thumbnail?.trim() ? '' : ' is-no-thumb'}`}
                  onClick={() => handleOpen(entry)}
                >
                  {renderThumb(entry)}
                  <span className="lh-story-row__num" aria-hidden>
                    {fmtNum(entry.id)}.
                  </span>
                  <span className="lh-story-row__main">
                    <span className="lh-story-row__title-wrap">
                      {renderSecretLock(entry)}
                      <span className="lh-story-row__title">{renderTitle(entry)}</span>
                      {renderBadges(entry)}
                    </span>
                    {locked ? null : renderMetaLine(entry)}
                  </span>
                </button>
                {renderAdmin(entry)}
              </div>
            );
          })}
        </div>
      )}

      {filtered.length && pages > 1 ? (
        <div className="lh-story-pager" role="navigation" aria-label="로그 목록 페이지">
          <button
            type="button"
            className="lh-story-pager__nav"
            disabled={safePage <= 0}
            onClick={() => {
              setOpenId(null);
              setPage((p) => Math.max(0, p - 1));
            }}
            aria-label="이전"
          >
            ‹
          </button>
          {Array.from({ length: pages }).map((_, i) => (
            <button
              key={i}
              type="button"
              className={`lh-story-pager__dot${i === safePage ? ' is-active' : ''}`}
              onClick={() => {
                setOpenId(null);
                setPage(i);
              }}
              aria-label={`${i + 1}페이지`}
              aria-current={i === safePage ? 'page' : undefined}
            >
              {i + 1}
            </button>
          ))}
          <button
            type="button"
            className="lh-story-pager__nav"
            disabled={safePage >= pages - 1}
            onClick={() => {
              setOpenId(null);
              setPage((p) => Math.min(pages - 1, p + 1));
            }}
            aria-label="다음"
          >
            ›
          </button>
        </div>
      ) : null}
    </div>
  );
}
