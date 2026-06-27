'use client';

import { ImageFrameView } from '@/components/ui/ImageFrameView';
import type { TrpgScenario } from '@/lib/types/site-content';
import { formatTrpgDateRange, normalizeTrpgScenario } from '@/lib/trpg/normalize';

function systemClass(system: string) {
  const s = system.toLowerCase();
  if (s.includes('coc') || s.includes('call of cthulhu') || s.includes('크툴루')) {
    return 'trpg-ticket__system--coc';
  }
  if (s.includes('insane')) {
    return 'trpg-ticket__system--insane';
  }
  return 'trpg-ticket__system--default';
}

function TrpgTicket({
  raw,
  onTicketClick,
}: {
  raw: TrpgScenario;
  onTicketClick: (item: TrpgScenario) => void;
}) {
  const item = normalizeTrpgScenario(raw);
  const dates = formatTrpgDateRange(item);
  const serial = item.id.replace(/\D/g, '').slice(-12).padStart(12, '0') || '000000000000';

  return (
    <article className="trpg-ticket">
      <button
        type="button"
        className="trpg-ticket__hit"
        aria-label={`${item.title} 아카이브`}
        onClick={() => onTicketClick(item)}
      >
        <div className="trpg-ticket__visual">
          {item.thumbnail ? (
            <ImageFrameView
              src={item.thumbnail}
              frame={item.thumbnailFrame}
              fit={item.thumbnailFit || 'cover'}
              pos={item.thumbnailPos || 'center center'}
              className="trpg-ticket__visual-frame"
              imgClassName="trpg-ticket__visual-img"
            />
          ) : (
            <div className="trpg-ticket__visual-fallback">{item.title}</div>
          )}
        </div>
        <div className="trpg-ticket__perforation" aria-hidden="true" />
        <div className="trpg-ticket__info">
          <div className="trpg-ticket__info-main">
            {item.author ? <p className="trpg-ticket__author">w. {item.author}</p> : null}
            <h3 className="trpg-ticket__title">{item.title}</h3>
            <div className="trpg-ticket__meta-block">
              {item.kp ? <p className="trpg-ticket__kp">KP {item.kp}</p> : null}
              {item.system ? (
                <span className={`trpg-ticket__system ${systemClass(item.system)}`}>{item.system}</span>
              ) : null}
              {dates ? <p className="trpg-ticket__dates">{dates}</p> : null}
              {item.players ? <p className="trpg-ticket__players">{item.players}</p> : null}
            </div>
          </div>
          <div className="trpg-ticket__footer">
            <div className="trpg-ticket__barcode" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <span className="trpg-ticket__serial">{serial}</span>
          </div>
          {item.cleared ? <span className="trpg-ticket__stamp">Cleared</span> : null}
        </div>
      </button>
    </article>
  );
}

type Props = {
  items: TrpgScenario[];
  empty: string;
  onTicketClick: (item: TrpgScenario) => void;
};

export function TrpgScenarioList({ items, empty, onTicketClick }: Props) {
  if (!items.length) {
    return <div className="page-coming">{empty}</div>;
  }

  return (
    <div className="trpg-ticket-list" id="trpg-cards">
      {items.map((item) => (
        <TrpgTicket key={item.id} raw={item} onTicketClick={onTicketClick} />
      ))}
    </div>
  );
}
