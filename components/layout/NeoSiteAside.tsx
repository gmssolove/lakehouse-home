'use client';

import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { useBgm } from '@/lib/contexts/BgmContext';
import { formatBgmTime } from '@/lib/bgm/formatTime';

export function NeoSiteAside() {
  const { notices } = useSiteContent();
  const { playing, title, artist, currentTime, duration } = useBgm();
  const updates = [...notices].slice(0, 4);

  return (
    <aside className="neo-aside" aria-label="사이드 위젯">
      <NeoWidget title="visitors">
        <div className="neo-counter" aria-hidden="true">
          {String(12804 + notices.length).padStart(6, '0')}
        </div>
      </NeoWidget>

      <NeoWidget title="now playing">
        <div className="neo-nowplaying">
          <strong>{title || '—'}</strong>
          {artist ? <span>{artist}</span> : null}
          <div className="neo-nowplaying__bar">
            <span style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }} />
          </div>
          <em>
            {playing ? '▶' : '■'} {formatBgmTime(currentTime)} / {formatBgmTime(duration)}
          </em>
        </div>
      </NeoWidget>

      <NeoWidget title="updates">
        {updates.length ? (
          <ul className="neo-updates">
            {updates.map((n) => (
              <li key={n.id}>
                <time>{n.date}</time>
                <span>{n.title}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="neo-muted">— no updates —</p>
        )}
      </NeoWidget>

      <NeoWidget title="webring" dark>
        <p className="neo-muted">← prev · lakehouse · next →</p>
      </NeoWidget>
    </aside>
  );
}

function NeoWidget({ title, children, dark }: { title: string; children: React.ReactNode; dark?: boolean }) {
  return (
    <section className={`neo-widget${dark ? ' neo-widget--dark' : ''}`}>
      <h3 className="neo-widget__title">{title}</h3>
      <div className="neo-widget__body">{children}</div>
    </section>
  );
}
