'use client';

import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * 기괴 연출 — 랜덤 텍스트 효과.
 * - glyph(기호 잠식): 글자가 잠깐 이상한 기호로 바뀌었다 복원.
 * - glitch(텍스트 글리치): 개별 요소에 순간 찢김 클래스.
 * cleanup 시 진행 중 치환도 반드시 원문으로 되돌린다.
 */

const GLYPHS = [
  ...'人☍的◇事⸸卂⛧卍☓⧫Ψ҂ʬΩ๛乂彡鬼死怨呪蟲闇의＃！？◆◈▓░凶厄魂',
];

const SELECTOR = [
  '.oc-identity-name',
  '.oc-identity-sub',
  '.oc-attr-value',
  '.oc-attr-label',
  '.oc-attr-head-en',
  '.oc-attr-head-ko',
  '.oc-keyword-chip',
  '.oc-acc-head',
  '.oc-left-acc-label',
  '.oc-left-content-title',
  '.oc-left-content-body p',
  '.oc-left-content-body li',
  '.oc-rich-text',
  '.oc-quote-line',
  '.lh-vn-speaker',
  '.lh-vn-text',
  '.lh-vn-location__text',
  '.pair-name',
  '.pair-sub',
  '.pair-plate__title',
  '.pair-plate__hero',
  '.pair-plate__sub',
  '.pair-plate__catchphrase',
  '.pair-plate__relation-badge',
  '.pair-plate__tag',
  '.pair-plate__dday-label',
  '.pair-plate__dday-since',
  '.pair-plate__bgm-text',
  '.pair-calls__who',
  '.pair-calls__what',
  '.pair-calls__cap',
  '.chara-name',
  '.chara-quote',
  '.chara-sub',
  '.chara-keyword-chip',
  '.chara-flatlore-text',
  '.chara-flatlore-label',
  '.pair-attr-value',
  '.pair-attr-label',
].join(', ');

const ORIG_ATTR = 'data-lh-glyph-orig';

function pickGlyph() {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!;
}

type Options = {
  glyph?: boolean;
  glitch?: boolean;
  intensity?: number;
  active?: boolean;
};

export function useCreepyGlyphScramble(
  rootRef: RefObject<HTMLElement | null>,
  options: Options,
) {
  const { glyph = false, glitch = false, intensity = 0.4, active = true } = options;
  useEffect(() => {
    if ((!glyph && !glitch) || !active || typeof window === 'undefined') return;
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const i = Math.max(0.1, Math.min(1, intensity));
    let tickTimer = 0;
    const timers = new Set<number>();
    const busy = new WeakSet<HTMLElement>();
    /** 진행 중 치환 — cleanup에서 원문 복원 */
    const pending = new Map<HTMLElement, string>();

    const restoreEl = (el: HTMLElement) => {
      const orig = pending.get(el) ?? el.getAttribute(ORIG_ATTR);
      if (orig != null) {
        if (el.isConnected) el.textContent = orig;
        el.removeAttribute(ORIG_ATTR);
      }
      pending.delete(el);
      busy.delete(el);
    };

    const restoreAll = () => {
      for (const el of Array.from(pending.keys())) restoreEl(el);
      root.querySelectorAll<HTMLElement>(`[${ORIG_ATTR}]`).forEach((el) => {
        const orig = el.getAttribute(ORIG_ATTR);
        if (orig != null && el.isConnected) el.textContent = orig;
        el.removeAttribute(ORIG_ATTR);
      });
    };

    function scramble(el: HTMLElement) {
      if (busy.has(el) || el.children.length > 0) return;
      const orig = el.getAttribute(ORIG_ATTR) || el.textContent || '';
      const chars = [...orig];
      const letterIdx = chars
        .map((c, idx) => (c.trim() ? idx : -1))
        .filter((idx) => idx >= 0);
      if (letterIdx.length === 0 || chars.length > 140) return;

      busy.add(el);
      pending.set(el, orig);
      el.setAttribute(ORIG_ATTR, orig);
      const swaps = Math.max(1, Math.round(letterIdx.length * (0.12 + i * 0.3)));

      const render = () => {
        if (!pending.has(el)) return;
        const arr = [...chars];
        for (let s = 0; s < swaps; s++) {
          const idx = letterIdx[Math.floor(Math.random() * letterIdx.length)]!;
          arr[idx] = pickGlyph();
        }
        el.textContent = arr.join('');
      };

      const flickers = 2 + Math.floor(Math.random() * 3);
      let step = 0;
      const run = () => {
        if (!pending.has(el)) return;
        if (step >= flickers) {
          const t = window.setTimeout(() => restoreEl(el), 40);
          timers.add(t);
          return;
        }
        render();
        step += 1;
        const t = window.setTimeout(run, 55 + Math.random() * 70);
        timers.add(t);
      };
      run();
    }

    function tear(el: HTMLElement) {
      el.classList.add('lh-fx-tear');
      const t = window.setTimeout(
        () => el.classList.remove('lh-fx-tear'),
        360 + Math.random() * 320,
      );
      timers.add(t);
    }

    function tick() {
      const scope = rootRef.current;
      if (!scope) return;
      const els = Array.from(scope.querySelectorAll<HTMLElement>(SELECTOR)).filter(
        (el) =>
          el.offsetParent !== null &&
          (el.textContent ?? '').trim() &&
          !pending.has(el) &&
          !el.hasAttribute(ORIG_ATTR),
      );
      if (els.length) {
        const count = 1 + Math.floor(Math.random() * (i > 0.6 ? 2 : 1));
        for (let c = 0; c < count; c++) {
          const el = els[Math.floor(Math.random() * els.length)];
          if (!el) continue;
          if (glitch && Math.random() < 0.7) tear(el);
          if (glyph && el.children.length === 0) scramble(el);
        }
      }
      tickTimer = window.setTimeout(tick, 900 + Math.random() * (2600 - i * 1200));
    }

    tickTimer = window.setTimeout(tick, 1000);

    const onVis = () => {
      if (document.visibilityState === 'hidden') restoreAll();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.clearTimeout(tickTimer);
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
      restoreAll();
      rootRef.current
        ?.querySelectorAll('.lh-fx-tear')
        .forEach((el) => el.classList.remove('lh-fx-tear'));
    };
  }, [glyph, glitch, intensity, rootRef, active]);
}
