'use client';

import { useEffect, useRef, useState } from 'react';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { playClickSound } from '@/lib/sounds/clickSound';
import { CURSOR_PRESETS } from '@/lib/ui/cursorPresets';

type Ripple = { id: number; x: number; y: number };

export function SiteEffects() {
  const { uiSettings, main } = useSiteContent();
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const idRef = useRef(0);
  const settingsRef = useRef(uiSettings);
  settingsRef.current = uiSettings;

  /* 파비콘 — Admin main.favicon 우선. Next metadata(/favicon.svg)가 다시 끼어들면 제거 */
  useEffect(() => {
    const raw = main?.favicon?.trim();
    const href = raw || '/favicon.svg';
    const head = document.head;
    let applying = false;

    const withCacheBust = (url: string) => {
      if (url.startsWith('data:')) return url;
      try {
        const u = new URL(url, window.location.origin);
        u.searchParams.set('v', String(url.length));
        if (/^https?:\/\//i.test(url.trim())) return u.toString();
        return `${u.pathname}${u.search}`;
      } catch {
        return url;
      }
    };

    const iconType = (url: string) => {
      if (/^data:image\/svg/i.test(url) || /\.svg(\?|$)/i.test(url)) return 'image/svg+xml';
      if (/^data:image\/png/i.test(url) || /\.png(\?|$)/i.test(url)) return 'image/png';
      if (/^data:image\/jpe?g/i.test(url) || /\.jpe?g(\?|$)/i.test(url)) return 'image/jpeg';
      if (/^data:image\/x-icon/i.test(url) || /\.ico(\?|$)/i.test(url)) return 'image/x-icon';
      return '';
    };

    const apply = () => {
      if (applying) return;
      applying = true;
      try {
        const finalHref = withCacheBust(href);
        head
          .querySelectorAll<HTMLLinkElement>(
            'link[rel="icon"], link[rel="shortcut icon"], link[rel~="icon"]',
          )
          .forEach((el) => {
            if (el.dataset.lakeFavicon === '1') return;
            el.remove();
          });

        let link = head.querySelector<HTMLLinkElement>('link[data-lake-favicon="1"]');
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          link.dataset.lakeFavicon = '1';
          head.appendChild(link);
        }
        const type = iconType(href);
        if (type) link.type = type;
        else link.removeAttribute('type');
        if (link.getAttribute('href') !== finalHref) {
          link.setAttribute('href', finalHref);
        }
      } finally {
        applying = false;
      }
    };

    apply();
    const mo = new MutationObserver(apply);
    mo.observe(head, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [main?.favicon]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('lake-custom-cursor', !!uiSettings.customCursorEnabled);

    if (!uiSettings.customCursorEnabled) {
      root.style.removeProperty('--lake-cursor');
      root.style.removeProperty('--lake-cursor-pointer');
      return;
    }

    if (uiSettings.cursorPreset === 'custom' && uiSettings.cursorCustom) {
      const url = `url("${uiSettings.cursorCustom}") 8 8, auto`;
      root.style.setProperty('--lake-cursor', url);
      root.style.setProperty('--lake-cursor-pointer', url);
      return;
    }

    const preset = CURSOR_PRESETS.find((p) => p.id === uiSettings.cursorPreset) ?? CURSOR_PRESETS[0];
    root.style.setProperty('--lake-cursor', preset.css);
    root.style.setProperty('--lake-cursor-pointer', preset.cssPointer);
  }, [
    uiSettings.customCursorEnabled,
    uiSettings.cursorPreset,
    uiSettings.cursorCustom,
  ]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;

      // 클리커 키캡은 자체 사운드가 있어 커서 클릭음이 겹치지 않게 건너뜀
      if (!t?.closest('.lh-clicker')) {
        playClickSound(settingsRef.current);
      }

      if (!settingsRef.current.clickRippleEnabled) return;
      const id = ++idRef.current;
      setRipples((prev) => [...prev.slice(-8), { id, x: e.clientX, y: e.clientY }]);
      window.setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, 620);
    }

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  if (!uiSettings.clickRippleEnabled) return null;

  return (
    <div className="lake-click-fx" aria-hidden="true">
      {ripples.map((r) => (
        <span key={r.id} className="lake-click-ripple" style={{ left: r.x, top: r.y }} />
      ))}
    </div>
  );
}
