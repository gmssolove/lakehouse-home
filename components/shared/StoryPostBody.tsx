'use client';

import { useCallback, useEffect, useState } from 'react';
import { OcRichText } from '@/lib/oc/richText';
import { StoryTweetEmbeds } from '@/components/shared/StoryTweetEmbeds';
import type { StoryEntry, StoryViewMode } from '@/lib/types/character';

function looksLikeHtml(s: string) {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

type Props = {
  entry: StoryEntry;
  chapterIndex?: number;
  /** 미리보기용 compact */
  preview?: boolean;
  className?: string;
};

export function resolveStoryViewMode(entry: StoryEntry): StoryViewMode {
  return entry.viewMode === 'scroll' || entry.viewMode === 'comic' ? entry.viewMode : 'text';
}

export function StoryPostBody({ entry, chapterIndex = 0, preview, className = '' }: Props) {
  const mode = resolveStoryViewMode(entry);
  const images = (entry.images || []).filter(Boolean);
  const chapter = entry.chapters?.[chapterIndex];
  const body = chapter?.body || '';
  const [page, setPage] = useState(0);
  const [fs, setFs] = useState(false);

  useEffect(() => {
    setPage(0);
  }, [entry.id]);

  const toggleFs = useCallback(() => {
    setFs((v) => !v);
  }, []);

  useEffect(() => {
    if (!fs) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFs(false);
      if (e.key === 'ArrowRight') setPage((p) => Math.min(images.length - 1, p + 1));
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fs, images.length]);

  if (mode === 'scroll') {
    return (
      <div className={`lh-story-scroll${preview ? ' is-preview' : ''} ${className}`.trim()}>
        {images.length ? (
          images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`${src}-${i}`} src={src} alt="" className="lh-story-scroll__img" />
          ))
        ) : (
          <p className="lh-story-scroll__empty">등록된 이미지가 없습니다.</p>
        )}
      </div>
    );
  }

  if (mode === 'comic') {
    const cur = images[page];
    const shell = (
      <div
        className={`lh-story-comic${fs ? ' is-fs' : ''}${preview ? ' is-preview' : ''} ${className}`.trim()}
      >
        <div className="lh-story-comic__toolbar">
          <span className="lh-story-comic__page">
            {images.length ? `${page + 1} / ${images.length}` : '0 / 0'}
          </span>
          {!preview ? (
            <button type="button" className="lh-story-comic__fs" onClick={toggleFs}>
              {fs ? '축소' : '최대화'}
            </button>
          ) : null}
        </div>
        <div className="lh-story-comic__stage">
          {cur ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cur} alt="" className="lh-story-comic__img" />
          ) : (
            <p className="lh-story-comic__empty">등록된 이미지가 없습니다.</p>
          )}
        </div>
        <div className="lh-story-comic__nav">
          <button
            type="button"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ← 이전
          </button>
          <button
            type="button"
            disabled={page >= images.length - 1}
            onClick={() => setPage((p) => Math.min(images.length - 1, p + 1))}
          >
            다음 →
          </button>
        </div>
      </div>
    );
    return shell;
  }

  /* text — 본문은 리더 공통 `.lh-story-reader__body` 스타일 */
  return (
    <div className={`lh-story-novel${preview ? ' is-preview' : ''} ${className}`.trim()}>
      {entry.subtitle?.trim() ? (
        <p className="lh-story-novel__subtitle">{entry.subtitle.trim()}</p>
      ) : null}
      {body ? (
        looksLikeHtml(body) ? (
          <div
            className="lh-story-reader__body"
            dangerouslySetInnerHTML={{ __html: body }}
          />
        ) : (
          <OcRichText text={body} className="lh-story-reader__body" />
        )
      ) : (
        <p className="lh-story-novel__empty">본문이 비어 있습니다.</p>
      )}
      <StoryTweetEmbeds urls={entry.tweetEmbeds || []} />
    </div>
  );
}
