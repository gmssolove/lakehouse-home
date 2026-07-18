'use client';

import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * 기괴 연출 — 랜덤 텍스트 효과.
 * - glyph(기호 잠식): 글자가 잠깐 이상한 기호(人☍的◇事 …)로 바뀌었다 복원.
 * - glitch(텍스트 글리치): 개별 요소에 순간 찢김/색어긋남 클래스를 입힘.
 * CSS로는 문자 삽입이 불가해 JS로 DOM 텍스트를 순간 치환한다. 항상 원본으로 복원하므로
 * React 가상 DOM과 최종 상태가 일치한다. 두 효과 모두 "모든 요소에 산발적·랜덤"으로 적용된다.
 */

const GLYPHS = [
  ...'人☍的◇事⸸卂⛧卍☓⧫Ψ҂ʬΩ๛乂彡鬼死怨呪蟲闇의＃！？◆◈▓░凶厄魂',
];

// 대상 — 정보 포함 대부분의 텍스트 요소(자식 없는 leaf만 실제 치환)
const SELECTOR = [
  // OC
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
  // VN
  '.lh-vn-speaker',
  '.lh-vn-text',
  '.lh-vn-location__text',
  // 페어 중앙
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
  // 페어 개별
  '.chara-name',
  '.chara-quote',
  '.chara-sub',
  '.chara-keyword-chip',
  '.chara-flatlore-text',
  '.chara-flatlore-label',
  '.pair-attr-value',
  '.pair-attr-label',
].join(', ');

function pickGlyph() {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

type Options = {
  glyph?: boolean;
  glitch?: boolean;
  intensity?: number;
};

export function useCreepyGlyphScramble(
  rootRef: RefObject<HTMLElement | null>,
  options: Options,
) {
  const { glyph = false, glitch = false, intensity = 0.4 } = options;
  useEffect(() => {
    if ((!glyph && !glitch) || typeof window === 'undefined') return;
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const i = Math.max(0.1, Math.min(1, intensity));
    let tickTimer = 0;
    const timers = new Set<number>();
    const busy = new WeakSet<HTMLElement>();

    function scramble(el: HTMLElement) {
      if (busy.has(el) || el.children.length > 0) return;
      const orig = el.textContent ?? '';
      const chars = [...orig];
      const letterIdx = chars
        .map((c, idx) => (c.trim() ? idx : -1))
        .filter((idx) => idx >= 0);
      if (letterIdx.length === 0 || chars.length > 140) return;

      busy.add(el);
      const swaps = Math.max(1, Math.round(letterIdx.length * (0.12 + i * 0.3)));

      const render = () => {
        const arr = [...chars];
        for (let s = 0; s < swaps; s++) {
          const idx = letterIdx[Math.floor(Math.random() * letterIdx.length)];
          arr[idx] = pickGlyph();
        }
        el.textContent = arr.join('');
      };

      const restore = () => {
        el.textContent = orig;
        busy.delete(el);
      };

      const flickers = 2 + Math.floor(Math.random() * 3);
      let step = 0;
      const run = () => {
        if (step >= flickers) {
          const t = window.setTimeout(restore, 40);
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
      // 순간 찢김/색어긋남 — CSS .lh-fx-tear 원샷 애니메이션
      el.classList.add('lh-fx-tear');
      const t = window.setTimeout(
        () => el.classList.remove('lh-fx-tear'),
        360 + Math.random() * 320,
      );
      timers.add(t);
    }

    function tick() {
      const els = Array.from(root.querySelectorAll<HTMLElement>(SELECTOR)).filter(
        (el) => el.offsetParent !== null && (el.textContent ?? '').trim(),
      );
      if (els.length) {
        // 한 번에 1~2개만 — 동시에 우르르 말고 산발적으로
        const count = 1 + Math.floor(Math.random() * (i > 0.6 ? 2 : 1));
        for (let c = 0; c < count; c++) {
          const el = els[Math.floor(Math.random() * els.length)];
          if (!el) continue;
          // 글리치는 자식이 있어도 가능, 기호 잠식은 leaf만
          if (glitch && Math.random() < 0.7) tear(el);
          if (glyph && el.children.length === 0) scramble(el);
        }
      }
      // 텀 (0.9s ~ 3.5s) — 강도 높을수록 조금 더 자주
      tickTimer = window.setTimeout(tick, 900 + Math.random() * (2600 - i * 1200));
    }

    tickTimer = window.setTimeout(tick, 1000);

    return () => {
      window.clearTimeout(tickTimer);
      timers.forEach((t) => window.clearTimeout(t));
      root.querySelectorAll('.lh-fx-tear').forEach((el) => el.classList.remove('lh-fx-tear'));
    };
  }, [glyph, glitch, intensity, rootRef]);
}
