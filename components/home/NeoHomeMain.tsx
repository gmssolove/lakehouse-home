'use client';

import { NeoBox } from '@/components/ui/NeoBox';
import { useSiteContent } from '@/lib/hooks/useSiteContent';

const BADGES = ['lakehouse', 'neocities', 'OC', 'TRPG', 'guestbook', '88×31'];

export function NeoHomeMain() {
  const { main } = useSiteContent();

  return (
    <div className="neo-home">
      <NeoBox title="welcome">
        <p className="neo-lead">
          {main.desc?.trim() ||
            'personal site — OC, TRPG logs, records, and whatever else fits in a little box on the internet.'}
        </p>
        <p className="neo-kicker">{main.eyebrow || 'menu details / site map on the left'}</p>
      </NeoBox>

      <NeoBox title="notice">
        <p className="neo-small">
          some pages need login or a password. images and audio are hosted off-site. best viewed on a desktop
          monitor from 2003 (or any screen, really).
        </p>
      </NeoBox>

      <NeoBox title="links & badges">
        <div className="neo-badges">
          {BADGES.map((label) => (
            <span key={label} className="neo-badge">
              {label}
            </span>
          ))}
        </div>
      </NeoBox>
    </div>
  );
}
