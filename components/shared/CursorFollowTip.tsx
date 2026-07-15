'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';

type TipState = {
  text: string;
  x: number;
  y: number;
  visible: boolean;
};

type ZoneProps = {
  tip?: string;
  className?: string;
  children: ReactNode;
  as?: 'div' | 'section' | 'span' | 'header' | 'p';
};

/** 호버 영역 — tip이 있을 때만 커서 팔로우 TMI */
export function CursorTipZone({ tip, className = '', children, as = 'div' }: ZoneProps) {
  const text = tip?.trim() || '';
  const Tag = as;
  if (!text) {
    return <Tag className={className || undefined}>{children}</Tag>;
  }
  const emit = (e: MouseEvent, visible: boolean) => {
    e.stopPropagation();
    window.dispatchEvent(
      new CustomEvent('lh-cursor-tip', {
        detail: { text: visible ? text : '', x: e.clientX, y: e.clientY, visible },
      }),
    );
  };

  return (
    <Tag
      className={`lh-cursor-tip-zone ${className}`.trim()}
      data-tip={text}
      onMouseEnter={(e) => emit(e, true)}
      onMouseMove={(e) => emit(e, true)}
      onMouseLeave={(e) => emit(e, false)}
    >
      {children}
    </Tag>
  );
}

/** 페이지당 1개 — fixed 팔로우 레이블 */
export function CursorFollowTipHost() {
  const [tip, setTip] = useState<TipState>({ text: '', x: 0, y: 0, visible: false });
  const hideT = useRef(0);

  const onTip = useCallback((e: Event) => {
    const d = (e as CustomEvent<TipState>).detail;
    if (!d) return;
    window.clearTimeout(hideT.current);
    if (!d.visible) {
      setTip((prev) => ({ ...prev, visible: false }));
      hideT.current = window.setTimeout(() => {
        setTip({ text: '', x: 0, y: 0, visible: false });
      }, 160);
      return;
    }
    setTip({ text: d.text, x: d.x, y: d.y, visible: true });
  }, []);

  useEffect(() => {
    window.addEventListener('lh-cursor-tip', onTip);
    return () => {
      window.removeEventListener('lh-cursor-tip', onTip);
      window.clearTimeout(hideT.current);
    };
  }, [onTip]);

  if (!tip.text) return null;

  return (
    <span
      className={`lh-cursor-tip${tip.visible ? ' is-in' : ' is-out'}`}
      style={{ left: tip.x - 8, top: tip.y - 4 }}
      aria-hidden
    >
      {tip.text}
    </span>
  );
}
