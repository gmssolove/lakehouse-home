'use client';

import { useEffect, useState } from 'react';
import { hostLabel, youtubeThumb } from '@/lib/scrap/detect';
import type { ScrapItem } from '@/lib/types/site-content';

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path fill="currentColor" d="M8 5.5v13l11-6.5L8 5.5Z" />
    </svg>
  );
}

function withAutoplay(html: string) {
  return html.replace(/\bsrc=(["'])([^"']+)\1/i, (_m, q: string, src: string) => {
    try {
      const u = new URL(src);
      u.searchParams.set('autoplay', '1');
      return `src=${q}${u.toString()}${q}`;
    } catch {
      const join = src.includes('?') ? '&' : '?';
      return `src=${q}${src}${join}autoplay=1${q}`;
    }
  });
}

function buildIframe(youtubeId: string) {
  const src = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`;
  return `<iframe src="${src}" title="YouTube" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="width:100%;aspect-ratio:16/9;border:0;display:block;"></iframe>`;
}

function looksLikeUploadDate(value: string | undefined) {
  return /^\d{2}\.\d{2}$/.test((value || '').trim());
}

type Props = {
  item: ScrapItem;
  /** Scrap 탭이 보일 때만 true — 숨기면 재생 중지 */
  active?: boolean;
};

/** 썸네일 + 재생버튼 + 우하단 재생시간만 */
export function YoutubeEmbedCard({ item, active = true }: Props) {
  const [playing, setPlaying] = useState(false);
  const [meta, setMeta] = useState({
    thumb: item.youtubeThumbUrl || (item.youtubeId ? youtubeThumb(item.youtubeId) : ''),
    embedHtml: item.youtubeEmbedHtml || '',
    duration: item.youtubeDuration || '',
    youtubeId: item.youtubeId || '',
    failed: false,
    loading: false,
  });

  useEffect(() => {
    setMeta({
      thumb: item.youtubeThumbUrl || (item.youtubeId ? youtubeThumb(item.youtubeId) : ''),
      embedHtml: item.youtubeEmbedHtml || '',
      duration: item.youtubeDuration || '',
      youtubeId: item.youtubeId || '',
      failed: false,
      loading: false,
    });
    setPlaying(false);
  }, [item.id, item.youtubeThumbUrl, item.youtubeEmbedHtml, item.youtubeId, item.youtubeDuration]);

  // 다른 메뉴로 나가면 iframe 제거 → 소리/재생 중단
  useEffect(() => {
    if (!active) setPlaying(false);
  }, [active]);

  useEffect(() => {
    return () => setPlaying(false);
  }, []);

  useEffect(() => {
    if (!item.sourceUrl) return;
    const uploadOk = looksLikeUploadDate(item.youtubeUploadDate);
    const hasCore = (item.youtubeThumbUrl || item.youtubeId) && item.youtubeEmbedHtml;
    const hasGoodMeta = !!item.youtubeDuration && uploadOk;
    if (hasCore && hasGoodMeta) return;

    let cancelled = false;
    setMeta((m) => ({ ...m, loading: true }));

    void (async () => {
      try {
        const res = await fetch(`/api/scrap-embed?url=${encodeURIComponent(item.sourceUrl!)}`);
        const data = (await res.json()) as {
          youtubeId?: string;
          youtubeThumbUrl?: string;
          youtubeEmbedHtml?: string;
          youtubeDuration?: string;
          fallback?: boolean;
        };
        if (cancelled) return;
        if (data.fallback && !data.youtubeId) {
          setMeta((m) => ({ ...m, failed: true, loading: false }));
          return;
        }
        setMeta({
          thumb:
            data.youtubeThumbUrl ||
            item.youtubeThumbUrl ||
            (data.youtubeId || item.youtubeId ? youtubeThumb(data.youtubeId || item.youtubeId!) : ''),
          embedHtml: data.youtubeEmbedHtml || item.youtubeEmbedHtml || '',
          duration: data.youtubeDuration || item.youtubeDuration || '',
          youtubeId: data.youtubeId || item.youtubeId || '',
          failed: false,
          loading: false,
        });
      } catch {
        if (!cancelled) setMeta((m) => ({ ...m, failed: true, loading: false }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    item.sourceUrl,
    item.youtubeThumbUrl,
    item.youtubeEmbedHtml,
    item.youtubeId,
    item.youtubeDuration,
    item.youtubeUploadDate,
  ]);

  if (meta.failed && !meta.thumb && !meta.youtubeId) {
    return (
      <a className="lh-scrap__fallback" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
        <span className="lh-scrap__fallback-label">원본 링크</span>
        <span className="lh-scrap__fallback-url">{hostLabel(item.sourceUrl || '')}</span>
      </a>
    );
  }

  const playerHtml =
    meta.embedHtml.trim()
      ? withAutoplay(meta.embedHtml)
      : meta.youtubeId
        ? buildIframe(meta.youtubeId)
        : '';

  return (
    <div className="lh-scrap__yt">
      {playing && playerHtml ? (
        <div className="lh-scrap__yt-player" dangerouslySetInnerHTML={{ __html: playerHtml }} />
      ) : (
        <button
          type="button"
          className="lh-scrap__yt-thumb"
          onClick={() => setPlaying(true)}
          aria-label="영상 재생"
        >
          {meta.thumb ? <img src={meta.thumb} alt="" /> : null}
          {meta.loading ? <span className="lh-scrap__yt-loading">…</span> : null}
          <span className="lh-scrap__yt-play">
            <IconPlay />
          </span>
          {meta.duration ? <span className="lh-scrap__yt-duration">{meta.duration}</span> : null}
        </button>
      )}
    </div>
  );
}
