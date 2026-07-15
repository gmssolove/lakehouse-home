'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import {
  balanceDialogueText,
  contentWidthOf,
  fontFromElement,
} from '@/lib/shared/balanceDialogueText';

/**
 * 컨테이너 너비에 맞게 띄어쓰기 줄바꿈을 균형 있게 넣은 대사 문자열을 돌려준다.
 * typewriter는 반환된 text 기준으로 slice 하면 된다.
 */
export function useBalancedDialogueText(sourceText: string, enabled = true) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState(sourceText);

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
      const box = (el.closest('.lh-vn-box') as HTMLElement | null) ?? el;
      const maxW = contentWidthOf(box);
      if (maxW < 40) {
        setText(sourceText);
        return;
      }
      const font = fontFromElement(el);
      setText(balanceDialogueText(sourceText, maxW, font));
    };

    apply();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [sourceText, enabled]);

  return { ref, text };
}
