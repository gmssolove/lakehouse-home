'use client';

import { useEffect, useRef } from 'react';

type Props = {
  urls?: string[] | null;
  className?: string;
};

let widgetsLoading: Promise<void> | null = null;

function loadTwitterWidgets(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.twttr?.widgets) return Promise.resolve();
  if (widgetsLoading) return widgetsLoading;
  widgetsLoading = new Promise((resolve) => {
    const existing = document.querySelector('script[src*="platform.twitter.com/widgets.js"]');
    if (existing) {
      if (window.twttr?.widgets) resolve();
      else existing.addEventListener('load', () => resolve());
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://platform.twitter.com/widgets.js';
    s.async = true;
    s.charset = 'utf-8';
    s.onload = () => resolve();
    document.body.appendChild(s);
  });
  return widgetsLoading;
}

export function StoryTweetEmbeds({ urls, className = '' }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const list = (urls ?? []).map((u) => u.trim()).filter(Boolean);

  useEffect(() => {
    if (!list.length || !wrapRef.current) return;
    let cancelled = false;
    void loadTwitterWidgets().then(() => {
      if (cancelled || !wrapRef.current) return;
      window.twttr?.widgets?.load(wrapRef.current);
    });
    return () => {
      cancelled = true;
    };
  }, [list.join('|')]);

  if (!list.length) return null;

  return (
    <div ref={wrapRef} className={`lh-story-tweets${className ? ` ${className}` : ''}`}>
      {list.map((url) => (
        <blockquote key={url} className="twitter-tweet" data-theme="dark" data-dnt="true">
          <a href={url}>{url}</a>
        </blockquote>
      ))}
    </div>
  );
}
