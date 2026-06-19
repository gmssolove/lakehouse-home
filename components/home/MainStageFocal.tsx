'use client';

import { useBgm } from '@/lib/contexts/BgmContext';

const TICK_COUNT = 36;

/** 중앙 — 배경 동심원과呼応하는 링 컴포지션 */
export function MainStageFocal() {
  const { playing } = useBgm();

  return (
    <div className={`main-stage-focal${playing ? ' is-live' : ''}`} aria-hidden="true">
      <div className="main-stage-focal__halo" />

      <svg className="main-stage-focal__svg" viewBox="0 0 400 400">
        <circle cx="200" cy="200" r="188" fill="none" stroke="rgba(196,154,108,0.1)" strokeWidth="0.75" />
        <circle cx="200" cy="200" r="168" fill="none" stroke="rgba(196,154,108,0.07)" strokeWidth="0.5" strokeDasharray="3 5" />
        <circle cx="200" cy="200" r="148" fill="none" stroke="rgba(196,154,108,0.12)" strokeWidth="1" />

        {Array.from({ length: TICK_COUNT }).map((_, i) => {
          const a = (i / TICK_COUNT) * Math.PI * 2 - Math.PI / 2;
          const major = i % 6 === 0;
          const r0 = major ? 138 : 142;
          const r1 = 152;
          return (
            <line
              key={i}
              x1={200 + Math.cos(a) * r0}
              y1={200 + Math.sin(a) * r0}
              x2={200 + Math.cos(a) * r1}
              y2={200 + Math.sin(a) * r1}
              stroke={major ? 'rgba(196,154,108,0.28)' : 'rgba(196,154,108,0.1)'}
              strokeWidth={major ? 1 : 0.5}
            />
          );
        })}

        <g className="main-stage-focal__spin">
          <circle cx="200" cy="200" r="118" fill="none" stroke="rgba(196,154,108,0.16)" strokeWidth="0.75" />
          <circle cx="200" cy="200" r="98" fill="none" stroke="rgba(196,154,108,0.09)" strokeWidth="0.5" strokeDasharray="2 4" />
        </g>

        <circle cx="200" cy="200" r="72" fill="rgba(8,9,8,0.35)" stroke="rgba(196,154,108,0.2)" strokeWidth="1" />
        <circle cx="200" cy="200" r="48" fill="none" stroke="rgba(196,154,108,0.14)" strokeWidth="0.75" />
        <circle cx="200" cy="200" r="24" fill="none" stroke="rgba(215,169,130,0.22)" strokeWidth="0.75" />
        <circle cx="200" cy="200" r="4" fill="rgba(215,169,130,0.5)" />

        <line x1="200" y1="28" x2="200" y2="52" stroke="rgba(215,169,130,0.35)" strokeWidth="0.75" />
        <line x1="200" y1="348" x2="200" y2="372" stroke="rgba(196,154,108,0.12)" strokeWidth="0.5" />
        <line x1="28" y1="200" x2="52" y2="200" stroke="rgba(196,154,108,0.12)" strokeWidth="0.5" />
        <line x1="348" y1="200" x2="372" y2="200" stroke="rgba(196,154,108,0.12)" strokeWidth="0.5" />
      </svg>
    </div>
  );
}
