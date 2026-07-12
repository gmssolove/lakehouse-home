'use client';

import { useMemo, useState } from 'react';
import { ImageFrameView } from '@/components/ui/ImageFrameView';
import { useOcData } from '@/lib/hooks/useOcData';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import type { TrpgScenario } from '@/lib/types/site-content';
import {
  formatTrpgDateRange,
  normalizeTrpgScenario,
  scenarioMatchesTrpgCategory,
  trpgCardHoverPortrait,
  trpgCardHoverTitle,
  trpgCardPrimaryPcName,
  trpgSystemBadgeClass,
} from '@/lib/trpg/normalize';

function TrpgCard({
  raw,
  aspect,
  ocNameById,
  ocImgById,
  onTicketClick,
}: {
  raw: TrpgScenario;
  aspect: string;
  ocNameById: Map<string, string>;
  ocImgById: Map<string, { src: string; fit?: string; pos?: string }>;
  onTicketClick: (item: TrpgScenario) => void;
}) {
  const item = normalizeTrpgScenario(raw);
  const dates = formatTrpgDateRange(item);
  const hoverTitle = trpgCardHoverTitle(item);
  const pcName = trpgCardPrimaryPcName(item, ocNameById);
  const portrait = trpgCardHoverPortrait(item, ocImgById);
  const badge = item.system?.trim();

  return (
    <article className="trpg-card" style={{ aspectRatio: aspect }}>
      <button
        type="button"
        className="trpg-card__hit"
        aria-label={`${item.title} 아카이브`}
        onClick={() => onTicketClick(item)}
      >
        <div className="trpg-card__media">
          {item.thumbnail ? (
            <ImageFrameView
              src={item.thumbnail}
              frame={item.thumbnailFrame}
              fit={item.thumbnailFit || 'cover'}
              pos={item.thumbnailPos || 'center center'}
              className="trpg-card__media-frame"
              imgClassName="trpg-card__media-img"
            />
          ) : (
            <div className="trpg-card__media-fallback">{item.title}</div>
          )}
        </div>

        {(badge || item.cleared) ? (
          <div className="trpg-card__meta">
            {badge ? (
              <span className={`trpg-card__badge ${trpgSystemBadgeClass(badge)}`}>{badge}</span>
            ) : null}
            {item.cleared ? <span className="trpg-card__stamp">CLEARED</span> : null}
          </div>
        ) : null}

        <div className="trpg-card__hover" aria-hidden="true">
          <div className={`trpg-card__hover-body${portrait ? ' has-portrait' : ''}`}>
            <div className="trpg-card__hover-copy">
              <h3 className="trpg-card__hover-title">{hoverTitle}</h3>
              {pcName ? (
                <span className="trpg-card__hover-pc">
                  <em>PC</em>
                  <span>{pcName}</span>
                </span>
              ) : null}
              {dates ? <p className="trpg-card__hover-date">{dates}</p> : null}
            </div>
            {portrait ? (
              <div className="trpg-card__hover-portrait">
                <ImageFrameView
                  src={portrait.src}
                  frame={'frame' in portrait ? portrait.frame : undefined}
                  fit={portrait.fit}
                  pos={portrait.pos}
                  className="trpg-card__hover-portrait-frame"
                  imgClassName="trpg-card__hover-portrait-img"
                />
              </div>
            ) : null}
          </div>
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
  const { trpgSettings } = useSiteContent();
  const { characters } = useOcData();
  const [filter, setFilter] = useState('all');
  const categories = trpgSettings.categories;
  const aspect = trpgSettings.cardAspect || '16 / 10';

  const ocNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of characters) {
      map.set(String(c.id), c.name);
    }
    return map;
  }, [characters]);

  const ocImgById = useMemo(() => {
    const map = new Map<string, { src: string; fit?: string; pos?: string }>();
    for (const c of characters) {
      const src = (c.img || '').trim();
      if (!src) continue;
      map.set(String(c.id), {
        src,
        fit: c.imgFit || 'cover',
        pos: c.imgPos || 'center top',
      });
    }
    return map;
  }, [characters]);

  const filtered = useMemo(
    () =>
      items.filter((raw) => {
        const item = normalizeTrpgScenario(raw);
        return scenarioMatchesTrpgCategory(item, filter, categories);
      }),
    [items, filter, categories],
  );

  const tabs = useMemo(
    () => [{ id: 'all', label: 'ALL' }, ...categories.filter((c) => c.id !== 'all')],
    [categories],
  );

  if (!items.length) {
    return <div className="page-coming">{empty}</div>;
  }

  return (
    <div className="trpg-card-board">
      <div className="trpg-card-filters" role="tablist" aria-label="TRPG 시스템 필터">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={filter === tab.id}
            className={`trpg-card-filter${filter === tab.id ? ' is-active' : ''}`}
            onClick={() => setFilter(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="page-coming">— 이 카테고리에 시나리오가 없습니다 —</div>
      ) : (
        <div className="trpg-card-grid" id="trpg-cards">
          {filtered.map((item) => (
            <TrpgCard
              key={item.id}
              raw={item}
              aspect={aspect}
              ocNameById={ocNameById}
              ocImgById={ocImgById}
              onTicketClick={onTicketClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
