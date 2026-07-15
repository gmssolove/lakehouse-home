'use client';

import { useEffect } from 'react';
import { isTauriApp } from '@/lib/vn/isTauriApp';

/** Tauri 창에서 F11로 풀스크린 토글 */
export function VnTauriHotkeys() {
  useEffect(() => {
    if (!isTauriApp()) return;

    async function onKey(e: KeyboardEvent) {
      if (e.key !== 'F11') return;
      e.preventDefault();
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        const full = await win.isFullscreen();
        await win.setFullscreen(!full);
      } catch {
        /* ignore */
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return null;
}
