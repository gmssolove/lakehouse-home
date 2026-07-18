'use client';

import type { PairStorySeries } from '@/lib/types/character';

type Props = {
  series?: PairStorySeries | null;
  postCount: number;
  /** 페어 이름 폴백 */
  fallbackTitle?: string;
  /** 메타 한 줄에 붙일 부가 라벨 (작가명 등) */
  metaLabel?: string;
  className?: string;
};

export function PairStorySeriesHero({
  series,
  postCount,
  fallbackTitle = 'Story Log',
  metaLabel,
  className = '',
}: Props) {
  const title = series?.title?.trim() || fallbackTitle;
  const quote = series?.quote?.trim();
  const intro = series?.intro?.trim();
  const tags = (series?.hashtags || []).map((t) => t.trim()).filter(Boolean);
  const img = series?.image?.trim();
  const hasText = !!(title || quote || intro || tags.length);
  const genre = tags[0]?.replace(/^#/, '');

  return (
    <header
      className={`pair-story-hero${img ? ' has-media' : ' is-text-only'} ${className}`.trim()}
    >
      {img ? (
        <div className="pair-story-hero__media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img}
            alt=""
            style={{
              objectFit: (series?.imageFit as 'cover' | 'contain' | undefined) || 'cover',
              objectPosition: series?.imagePos || '50% 50%',
            }}
          />
        </div>
      ) : null}

      <div className="pair-story-hero__body">
        {hasText ? (
          <>
            <h2 className="pair-story-hero__title">{title}</h2>
            <div className="pair-story-hero__meta">
              {metaLabel ? <span>{metaLabel}</span> : null}
              <span>총 {postCount}편</span>
              {genre ? <span className="pair-story-hero__genre">{genre}</span> : null}
            </div>
            {quote ? (
              <blockquote className="pair-story-hero__quote">
                “{quote.replace(/^["“]|["”]$/g, '')}”
              </blockquote>
            ) : null}
            {intro ? <p className="pair-story-hero__intro">{intro}</p> : null}
            {tags.length ? (
              <ul className="pair-story-hero__tags">
                {tags.map((t) => (
                  <li key={t}>{t.startsWith('#') ? t : `#${t}`}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <>
            <h2 className="pair-story-hero__title">{fallbackTitle}</h2>
            <div className="pair-story-hero__meta">
              <span>총 {postCount}편</span>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
