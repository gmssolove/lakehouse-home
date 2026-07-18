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

  /* 파비콘 실시간 반영 — main.favicon 이 있으면 <link rel="icon"> 교체 */
  useEffect(() => {
    const href = main?.favicon?.trim();
    if (!href) return;
    const head = document.head;
    const links = Array.from(
      head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="shortcut icon"]'),
    );
    let link = links[0];
    // 중복 아이콘 링크 정리 (첫 번째만 유지)
    links.slice(1).forEach((l) => l.remove());
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      head.appendChild(link);
    }
    link.href = href;
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
