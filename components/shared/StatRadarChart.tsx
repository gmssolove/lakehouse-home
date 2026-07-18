'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { radarAxisCode } from '@/lib/oc/statPanel';
import { resolvePairUiAccentColor } from '@/lib/pair/personalNameGlow';
import type { OcStatRadarAxis } from '@/lib/types/character';
import '@/styles/shared/stat-radar.css';

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export type StatRadarAxis = OcStatRadarAxis & { hint?: string };

type Props = {
  axes: StatRadarAxis[];
  accent?: string;
  className?: string;
  label?: string;
  size?: number;
  radius?: number;
  /** 페어 케미 등 — 화려한 연출 */
  ornate?: boolean;
};

type TipState = {
  text: string;
  compact: boolean;
  x: number;
  y: number;
  below: boolean;
};

/** OC 스탯 / 페어 케미 공용 레이더 */
export function StatRadarChart({
  axes,
  accent = '#d7a982',
  className,
  label = '레이더 차트',
  size = 220,
  radius = 78,
  ornate = false,
}: Props) {
  const gid = useId().replace(/:/g, '');
  const uiAccent = useMemo(() => resolvePairUiAccentColor(accent), [accent]);
  const cx = size / 2;
  const cy = size / 2;
  const r = radius;
  const levels = 4;
  const n = axes.length;
  const [tip, setTip] = useState<TipState | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const pointsAt = useCallback(
    (scale: number) => {
      if (n < 3) return '';
      return axes
        .map((_, i) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
          const x = cx + Math.cos(a) * r * scale;
          const y = cy + Math.sin(a) * r * scale;
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(' ');
    },
    [axes, cx, cy, n, r],
  );

  const valuePoly = useMemo(() => {
    if (n < 3) return '';
    return axes
      .map((ax, i) => {
        const t = clamp(Number(ax.value) || 0, 0, 100) / 100;
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const x = cx + Math.cos(a) * r * t;
        const y = cy + Math.sin(a) * r * t;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [axes, cx, cy, n, r]);

  const polyLen = useMemo(() => {
    if (n < 3) return 600;
    return Math.round(2 * Math.PI * r * 1.15);
  }, [n, r]);

  /* 축 라벨은 육각형보다 바깥 — viewBox 여백을 넉넉히 */
  const labelPad = Math.max(32, Math.round((size / 2 - r) * 0.72));

  const labels = useMemo(() => {
    if (n < 3) return [];
    return axes.map((ax, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const lx = cx + Math.cos(a) * (r + labelPad);
      const ly = cy + Math.sin(a) * (r + labelPad);
      const code = radarAxisCode(ax.axis) || (ax.axis || '').trim().slice(0, 4);
      return {
        code,
        full: (ax.axis || '').trim() || code,
        hint: ax.hint?.trim() || '',
        x: lx,
        y: ly,
        value: clamp(Number(ax.value) || 0, 0, 100),
      };
    });
  }, [axes, cx, cy, n, r, labelPad]);

  const placeTip = useCallback((text: string, compact: boolean, clientX: number, clientY: number) => {
    const below = clientY < 88;
    setTip({ text, compact, x: clientX, y: clientY, below });
  }, []);

  if (n < 3) {
    return <p className="oc-stat-hover__empty">레이더는 축 3개 이상일 때 표시됩니다.</p>;
  }

  const tipNode =
    tip && portalReady
      ? createPortal(
          <div
            className={[
              'stat-radar__tip',
              tip.compact ? 'is-compact' : '',
              tip.below ? 'is-below' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{
              left: tip.x,
              top: tip.y,
              ['--radar-accent' as string]: uiAccent,
            }}
            role="tooltip"
          >
            {tip.text.split('\n').map((line, i) => (
              <span key={i} className={i === 0 ? 'stat-radar__tip-head' : 'stat-radar__tip-body'}>
                {line}
              </span>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className={['stat-radar', ornate ? 'stat-radar--ornate' : '', className]
        .filter(Boolean)
        .join(' ')}
      style={{ ['--radar-accent' as string]: uiAccent }}
    >
      {ornate ? (
        <>
          <span className="stat-radar__sparkle" aria-hidden />
          <span className="stat-radar__ring" aria-hidden />
        </>
      ) : null}

      <svg
        className="oc-stat-hover__radar stat-radar__svg"
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={label}
      >
        <defs>
          <linearGradient id={`stat-radar-fill-${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={uiAccent} stopOpacity="0.55" />
            <stop offset="100%" stopColor={uiAccent} stopOpacity="0.14" />
          </linearGradient>
          <filter id={`stat-radar-glow-${gid}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id={`stat-radar-core-${gid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={uiAccent} stopOpacity="0.35" />
            <stop offset="70%" stopColor={uiAccent} stopOpacity="0.06" />
            <stop offset="100%" stopColor={uiAccent} stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle
          className="stat-radar__core"
          cx={cx}
          cy={cy}
          r={r * 0.92}
          fill={`url(#stat-radar-core-${gid})`}
        />

        {Array.from({ length: levels }, (_, i) => {
          const s = (i + 1) / levels;
          return (
            <polygon
              key={i}
              className="stat-radar__grid"
              points={pointsAt(s)}
              fill="none"
              stroke="rgba(240,207,173,0.28)"
              strokeWidth={1}
              style={{ animationDelay: `${i * 0.08}s` }}
            />
          );
        })}
        {axes.map((_, i) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          return (
            <line
              key={i}
              className="stat-radar__spoke"
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="rgba(240,207,173,0.22)"
              strokeWidth={1}
              style={{ animationDelay: `${0.12 + i * 0.05}s` }}
            />
          );
        })}
        <polygon
          className="stat-radar__fill"
          points={valuePoly}
          fill={`url(#stat-radar-fill-${gid})`}
          stroke={uiAccent}
          strokeWidth={1.35}
          filter={`url(#stat-radar-glow-${gid})`}
          style={{
            ['--radar-dash' as string]: String(polyLen),
          }}
        />
        {labels.map((lb, i) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
          const t = lb.value / 100;
          const dx = cx + Math.cos(a) * r * t;
          const dy = cy + Math.sin(a) * r * t;
          return (
            <circle
              key={`dot-${i}`}
              className="stat-radar__dot"
              cx={dx}
              cy={dy}
              r={2.35}
              fill={uiAccent}
              style={{ animationDelay: `${0.45 + i * 0.06}s` }}
            />
          );
        })}
      </svg>

      <div className="stat-radar__labels" aria-hidden={false}>
        {labels.map((lb, i) => {
          const left = (lb.x / size) * 100;
          const top = (lb.y / size) * 100;
          const compact = !lb.hint;
          const tipText = compact ? `${lb.full} · ${lb.value}` : `${lb.full} · ${lb.value}\n${lb.hint}`;
          return (
            <button
              key={`${lb.code}-${i}`}
              type="button"
              className="stat-radar__axis-btn"
              style={{ left: `${left}%`, top: `${top}%` }}
              aria-label={tipText.replace(/\n/g, ', ')}
              onMouseEnter={(e) => placeTip(tipText, compact, e.clientX, e.clientY)}
              onMouseMove={(e) => placeTip(tipText, compact, e.clientX, e.clientY)}
              onMouseLeave={() => setTip(null)}
              onFocus={(e) => {
                const br = e.currentTarget.getBoundingClientRect();
                placeTip(tipText, compact, br.left + br.width / 2, br.top);
              }}
              onBlur={() => setTip(null)}
            >
              <span className="stat-radar__axis-code">{lb.code}</span>
            </button>
          );
        })}
      </div>

      {tipNode}
    </div>
  );
}
