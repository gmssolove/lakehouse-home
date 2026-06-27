'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { WiredWindow } from '@/components/ui/WiredWindow';
import { useBgm } from '@/lib/contexts/BgmContext';
import { formatBgmTime } from '@/lib/bgm/formatTime';
import { useSiteContent } from '@/lib/hooks/useSiteContent';

const BOOT_LINES = [
  'PROTOCOL: LAIN_NET / NODE 0x7F',
  'HANDSHAKE... OK',
  'NAV_BRIDGE: lakehouse.local',
  'MEM: 640K / AUDIO: STREAM',
  'WIRED LINK — STABLE',
];

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function WiredDesktop() {
  const { main } = useSiteContent();
  const { playing, title, artist, currentTime, duration } = useBgm();
  const now = useClock();
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const logLines = useMemo(() => {
    const stamp = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    return [...BOOT_LINES, `[${stamp}] LISTENING — ${playing ? 'ACTIVE' : 'IDLE'}`];
  }, [now, playing]);

  const heading = `${main.heading || 'lake'}${main.headingAccent || 'house'}`;

  return (
    <div className="lh-wired-desktop">
      <div className="lh-wired-desktop__scan" aria-hidden="true" />
      <div className="lh-wired-desktop__noise" aria-hidden="true" />

      <WiredWindow title="CONNECT.EXE" className="lh-wired-desktop__connect">
        <p className="lh-wired-kicker">{main.eyebrow || 'WIRED / MENU DETAILS'}</p>
        <h1 className="lh-wired-heading">
          {main.heading || 'lake'}
          <em>{main.headingAccent || 'house'}</em>
        </h1>
        <p className="lh-wired-latin">{main.latin || 'a lake in the mountains'}</p>
        {main.desc ? <p className="lh-wired-desc">{main.desc}</p> : null}
        <div className="lh-wired-tagrow">
          <span className="lh-wired-tag">NODE:{heading.toUpperCase()}</span>
          <span className="lh-wired-tag is-live">{playing ? '● AUDIO ON' : '○ STANDBY'}</span>
        </div>
      </WiredWindow>

      <WiredWindow title="AUDIO.SYS" className="lh-wired-desktop__audio">
        <div className="lh-wired-audio__meta">
          <strong>{title || 'BGM'}</strong>
          {artist ? <span>{artist}</span> : null}
        </div>
        <div className={`lh-wired-viz${playing ? ' is-live' : ''}`} aria-hidden="true">
          {Array.from({ length: 24 }, (_, i) => (
            <span key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
        <div className="lh-wired-audio__bar" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="lh-wired-audio__times">
          <span>{formatBgmTime(currentTime)}</span>
          <span>{formatBgmTime(duration)}</span>
        </div>
        <p className="lh-wired-audio__hint">▶ 하단 BGM 플레이어에서 조작</p>
      </WiredWindow>

      <WiredWindow title="SYSTEM.LOG" className="lh-wired-desktop__log">
        <ul className="lh-wired-log">
          {logLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </WiredWindow>

      <WiredWindow title="CHRONO" className="lh-wired-desktop__clock">
        <div className="lh-wired-clock__time">
          {pad(now.getHours())}
          <span className="lh-wired-clock__blink">:</span>
          {pad(now.getMinutes())}
          <span className="lh-wired-clock__blink">:</span>
          {pad(now.getSeconds())}
        </div>
        <div className="lh-wired-clock__date">
          {now.getFullYear()}.{pad(now.getMonth() + 1)}.{pad(now.getDate())}
        </div>
        <div className="lh-wired-status">
          <span>WIRED</span>
          <span className="is-ok">LINKED</span>
        </div>
      </WiredWindow>
    </div>
  );
}
