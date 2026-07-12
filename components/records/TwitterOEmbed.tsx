'use client';

import { useEffect, useRef, useState } from 'react';
import { hostLabel } from '@/lib/scrap/detect';
import { forceTweetDarkTheme } from '@/lib/scrap/youtube';

declare global {
  interface Window {
    twttr?: {
      _e?: Array<(t: NonNullable<Window['twttr']>) => void>;
      ready: (f: (t: NonNullable<Window['twttr']>) => void) => void;
      widgets?: {
        load: (el?: HTMLElement | null | Document) => Promise<unknown>;
      };
    };
  }
}

/** Official Twitter widgets.js bootstrap + ready queue */
function ensureTwitterWidgets(): NonNullable<Window['twttr']> {
  if (typeof window === 'undefined') {
    return {
      ready: () => undefined,
      _e: [],
    };
  }

  type Twttr = NonNullable<Window['twttr']>;

  if (window.twttr?.widgets) return window.twttr;

  const existing = window.twttr;
  const t: Twttr = existing || {
    _e: [],
    ready(f) {
      this._e = this._e || [];
      this._e.push(f);
    },
  };
  if (!existing) window.twttr = t;

  if (!document.getElementById('twitter-wjs')) {
    const js = document.createElement('script');
    js.id = 'twitter-wjs';
    js.async = true;
    js.charset = 'utf-8';
    js.src = 'https://platform.twitter.com/widgets.js';
    const fjs = document.getElementsByTagName('script')[0];
    fjs?.parentNode?.insertBefore(js, fjs);
  }

  return t;
}

function runWhenTwitterReady(cb: () => void) {
  const twttr = ensureTwitterWidgets();
  if (twttr.widgets) {
    cb();
    return;
  }
  twttr.ready(() => {
    cb();
  });
}

/** Keep Next Script stub for ScrapTab mount — real load is via ensureTwitterWidgets */
export function TwitterWidgetsScript() {
  useEffect(() => {
    ensureTwitterWidgets();
  }, []);
  return null;
}

type Props = {
  sourceUrl: string;
  embedHtml?: string;
};

/**
 * Mount oEmbed blockquote once via DOM, then widgets.load().
 * Avoids React dangerouslySetInnerHTML wiping converted iframes on re-render.
 */
export function TwitterOEmbed({ sourceUrl, embedHtml }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mountedHtmlRef = useRef<string>('');
  const [html, setHtml] = useState(embedHtml?.trim() || '');
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(!embedHtml?.trim());

  useEffect(() => {
    if (embedHtml?.trim()) {
      setHtml(forceTweetDarkTheme(embedHtml.trim()));
      setFailed(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFailed(false);

    void (async () => {
      try {
        const res = await fetch(`/api/scrap-embed?url=${encodeURIComponent(sourceUrl)}`);
        const data = (await res.json()) as { embedHtml?: string; fallback?: boolean };
        if (cancelled) return;
        if (data.embedHtml?.trim()) {
          setHtml(forceTweetDarkTheme(data.embedHtml.trim()));
          setFailed(false);
        } else {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sourceUrl, embedHtml]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !html) return;

    const alreadyWidget = !!el.querySelector('iframe');
    if (!alreadyWidget || mountedHtmlRef.current !== html) {
      el.innerHTML = html;
      mountedHtmlRef.current = html;
    }

    runWhenTwitterReady(() => {
      if (window.twttr?.widgets) {
        void window.twttr.widgets.load(el);
      } else if (window.twttr?.widgets === undefined && window.twttr) {
        // widgets may attach after ready fires — small retry
        window.setTimeout(() => {
          void window.twttr?.widgets?.load(el);
        }, 200);
      }
    });
  }, [html]);

  if (failed || (!loading && !html)) {
    return (
      <a className="lh-scrap__fallback" href={sourceUrl} target="_blank" rel="noopener noreferrer">
        <span className="lh-scrap__fallback-label">원본 링크</span>
        <span className="lh-scrap__fallback-url">{hostLabel(sourceUrl)}</span>
        <span className="lh-scrap__fallback-full">{sourceUrl}</span>
      </a>
    );
  }

  if (loading && !html) {
    return <div className="lh-scrap__oembed-loading">트윗 불러오는 중…</div>;
  }

  return <div ref={hostRef} className="lh-scrap__oembed" />;
}
