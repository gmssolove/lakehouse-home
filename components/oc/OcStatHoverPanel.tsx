'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatRadarChart } from '@/components/shared/StatRadarChart';
import { resolveStatRadar } from '@/lib/oc/statPanel';
import type { OcStatBar, OcStatPanel } from '@/lib/types/character';

type Props = {
  panel?: OcStatPanel | null;
  /** panel.color 없을 때 fallback (퍼스널 컬러) */
  accent?: string;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function BarList({ bars, accent }: { bars: OcStatBar[]; accent: string }) {
  if (!bars.length) return null;
  return (
    <ul className="oc-stat-hover__bars">
      {bars.map((b, i) => {
        const max = Math.max(1, Number(b.max) || 100);
        const val = clamp(Number(b.value) || 0, 0, max);
        const pct = (val / max) * 100;
        return (
          <li key={`${b.label}-${i}`} className="oc-stat-hover__bar">
            <div className="oc-stat-hover__bar-head">
              <span className="oc-stat-hover__bar-label">{b.label}</span>
              <span className="oc-stat-hover__bar-value">
                {val} / {max}
              </span>
            </div>
            <div className="oc-stat-hover__bar-track">
              <span
                className="oc-stat-hover__bar-fill"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${accent}, color-mix(in srgb, ${accent} 55%, #f0cfad))`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 트리거 바 호버로 열림 / 패널 박스 밖이면 닫힘.
 * 닫혀 있을 때는 작은 트리거만 DOM hit — 캐릭터·괴롭히기·대사를 가리지 않음.
 */
export function OcStatHoverPanel({ panel, accent = '#d7a982' }: Props) {
  const radar = resolveStatRadar(panel);
  const bars = (panel?.bars || []).filter((b) => b.label?.trim());
  const color = panel?.color?.trim() || accent;
  const glow = Math.max(0, Math.min(100, typeof panel?.glow === 'number' ? panel.glow : 40));
  const bgColor = panel?.bgColor?.trim() || '';

  const [open, setOpen] = useState(false);
  const [canHover, setCanHover] = useState(true);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelBoxRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const openRef = useRef(false);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const syncBodyClass = useCallback((next: boolean) => {
    const body = panelBoxRef.current?.closest('.oc-detail-body')
      ?? triggerRef.current?.closest('.oc-detail-body')
      ?? document.querySelector('#detail-screen .oc-detail-body');
    body?.classList.toggle('has-stat-panel-open', next);
  }, []);

  const closePanel = useCallback(() => {
    clearCloseTimer();
    openRef.current = false;
    syncBodyClass(false);
    setOpen(false);
  }, [clearCloseTimer, syncBodyClass]);

  const openPanel = useCallback(() => {
    clearCloseTimer();
    openRef.current = true;
    syncBodyClass(true);
    setOpen(true);
  }, [clearCloseTimer, syncBodyClass]);

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const apply = () => setCanHover(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    openRef.current = open;
    syncBodyClass(open);
  }, [open, syncBodyClass]);

  useEffect(() => {
    if (!open || !canHover) return;

    const pointIn = (el: Element | null, x: number, y: number) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!openRef.current) return;
      const inside =
        pointIn(panelBoxRef.current, e.clientX, e.clientY) ||
        pointIn(triggerRef.current, e.clientX, e.clientY);
      if (inside) {
        clearCloseTimer();
        return;
      }
      if (closeTimerRef.current != null) return;
      closeTimerRef.current = setTimeout(() => {
        closePanel();
        closeTimerRef.current = null;
      }, 80);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, [open, canHover, clearCloseTimer, closePanel]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closePanel]);

  useEffect(
    () => () => {
      clearCloseTimer();
      document.querySelector('#detail-screen .oc-detail-body')?.classList.remove('has-stat-panel-open');
    },
    [clearCloseTimer],
  );

  const style = {
    ['--oc-stat-color' as string]: color,
    ['--oc-stat-glow' as string]: glow,
    ...(bgColor
      ? { ['--oc-stat-bg' as string]: bgColor }
      : {}),
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`oc-stat-hover__trigger${open ? ' is-open' : ''}`}
        style={style}
        aria-label={open ? '스탯 닫기' : '스탯 열기'}
        aria-expanded={open}
        onPointerEnter={() => {
          if (canHover) openPanel();
        }}
        onClick={() => {
          if (canHover) {
            if (open) closePanel();
            return;
          }
          if (open) closePanel();
          else openPanel();
        }}
      >
        <span className="oc-stat-hover__trigger-bar" aria-hidden />
      </button>

      {/* 항상 마운트 — 열릴 때 translateX 슬라이드 애니 유지. hit는 패널만 */}
      <div
        className={`oc-stat-hover__layer${open ? ' is-open' : ''}${canHover ? ' is-hoverable' : ' is-touch'}`}
        style={style}
        aria-hidden={!open}
      >
        <aside
          ref={panelBoxRef}
          className="oc-stat-hover__panel"
          aria-label="캐릭터 스탯"
          onPointerEnter={() => {
            if (canHover && open) clearCloseTimer();
          }}
        >
          <header className="oc-stat-hover__head">
            <span className="oc-stat-hover__en">STATUS</span>
            <span className="oc-stat-hover__ko">스탯</span>
          </header>
          <StatRadarChart axes={radar} accent={color} label="스탯 레이더" />
          <BarList bars={bars} accent={color} />
        </aside>
      </div>
    </>
  );
}
