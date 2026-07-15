'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import {
  balanceDialogueText,
  contentWidthOf,
  fontFromElement,
} from '@/lib/shared/balanceDialogueText';

export type BalancedTextOptions = {
  /**
   * 너비 측정 박스. 기본은 `.lh-vn-box` → self.
   * TIP 등: `.lh-entry-splash__tip`
   */
  boxSelector?: string;
  /** 같은 줄의 라벨(TIP/TMI)만큼 가로를 빼서 본문 가용 폭 계산 */
  subtractSelector?: string;
};

/**
 * 컨테이너 너비에 맞게 띄어쓰기 줄바꿈을 균형 있게 넣은 대사 문자열을 돌려준다.
 * typewriter는 반환된 text 기준으로 slice 하면 된다.
 */
export function useBalancedDialogueText(
  sourceText: string,
  enabled = true,
  options?: BalancedTextOptions,
) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState(sourceText);
  const boxSelector = options?.boxSelector;
  const subtractSelector = options?.subtractSelector;

  useLayoutEffect(() => {
    if (!enabled) {
      setText(sourceText);
      return;
    }

    const el = ref.current;
    if (!el) {
      setText(sourceText);
      return;
    }

    const apply = () => {
      const box = boxSelector
        ? ((el.closest(boxSelector) as HTMLElement | null) ?? el)
        : ((el.closest('.lh-vn-box') as HTMLElement | null) ?? el);
      let maxW = contentWidthOf(box);
      if (subtractSelector) {
        const row = el.parentElement;
        const sub = (row?.querySelector(subtractSelector) as HTMLElement | null) ?? null;
        if (sub) {
          const sameRow =
            Math.abs(sub.getBoundingClientRect().top - el.getBoundingClientRect().top) < 10;
          if (sameRow) {
            maxW = Math.max(40, maxW - sub.offsetWidth - 10);
          }
        }
      }
      if (maxW < 40) {
        setText(sourceText);
        return;
      }
      const font = fontFromElement(el);
      setText(balanceDialogueText(sourceText, maxW, font));
    };

    apply();
    const observeTarget =
      (boxSelector && (el.closest(boxSelector) as HTMLElement | null)) || el;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    ro?.observe(observeTarget);
    window.addEventListener('resize', apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, [sourceText, enabled, boxSelector, subtractSelector]);

  return { ref, text };
}
