'use client';

import { useMemo } from 'react';
import { pairCardSub, pairCardTitle } from '@/lib/oc/pairCover';
import type { PairItem } from '@/lib/types/character';

function formatDday(iso?: string) {
  if (!iso?.trim()) return { label: '—', since: '날짜 미설정', days: null as number | null };
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return { label: '—', since: '날짜 미설정', days: null };
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - start.getTime()) / 86400000);
  return {
    label: `D${diff >= 0 ? '+' : ''}${diff}`,
    since: `Since ${iso}`,
    days: diff,
  };
}

type Props = {
  pair: PairItem;
};

export function PairArchiveDetail({ pair }: Props) {
  const title = pairCardTitle(pair);
  const sub = pairCardSub(pair);
  const dday = useMemo(() => formatDday(pair.dday), [pair.dday]);
  const chemistry = pair.chemistry?.length
    ? pair.chemistry
    : [
        { label: '긴장감', value: 50 },
        { label: '신뢰도', value: 50 },
        { label: '친밀도', value: 50 },
      ];
  const flatLore = pair.flatLore?.trim() || pair.story?.trim() || '';
  const flatTags = pair.flatLoreKeywords?.length ? pair.flatLoreKeywords : pair.keywords?.slice(0, 3);

  return (
    <div className="pair-archive-detail">
      <div className="pair-archive-detail__decor" aria-hidden="true">
        PAIR
      </div>
      <div className="pair-archive-detail__hero">
        <div className="pair-archive-detail__hero-bg" />
        <div className="pair-archive-detail__hero-grid" />
        <div className="pair-archive-detail__glow pair-archive-detail__glow--l" />
        <div className="pair-archive-detail__glow pair-archive-detail__glow--r" />

        <div className="pair-archive-detail__chars">
          {pair.chars.map((name, i) => {
            const img = pair.charImgs?.[i]?.trim();
            const en = pair.charSubs?.[i]?.trim();
            return (
              <div key={`${name}-${i}`} className={`pair-archive-detail__char${i === 0 ? ' is-a' : ' is-b'}`}>
                <div className="pair-archive-detail__char-img-wrap">
                  {img ? (
                    <img className="pair-archive-detail__char-img" src={img} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="pair-archive-detail__char-img">{name[0] || '?'}</div>
                  )}
                </div>
                <div className="pair-archive-detail__name-plate">
                  <div className="pair-archive-detail__name-ko">{name}</div>
                  {en ? <div className="pair-archive-detail__name-en">{en}</div> : null}
                </div>
              </div>
            );
          })}
          <div className="pair-archive-detail__vs" aria-hidden="true">
            ×
          </div>
        </div>

        <div className="pair-archive-detail__center">
          <div>
            <div className="pair-archive-detail__label">CHARACTER PAIR</div>
            <div className="pair-archive-detail__title">{title}</div>
            {sub ? <div className="pair-archive-detail__title-en">{sub}</div> : null}
            {(pair.keywords?.length ?? 0) > 0 ? (
              <div className="pair-archive-detail__tags">
                {pair.keywords!.map((k) => (
                  <span key={k} className="pair-archive-detail__tag">
                    {k}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="pair-archive-detail__dday">
            <div className="pair-archive-detail__dday-label">D-DAY</div>
            <div className="pair-archive-detail__dday-row">
              <span className="pair-archive-detail__dday-num">{dday.label}</span>
              {dday.days != null ? <span className="pair-archive-detail__dday-unit">일째</span> : null}
            </div>
            <div className="pair-archive-detail__dday-date">{dday.since}</div>
          </div>
        </div>
      </div>

      <div className="pair-archive-detail__body">
        <section className="pair-archive-detail__sec">
          <h3 className="pair-archive-detail__sec-t">관계 개요</h3>
          <p className="pair-archive-detail__copy">{pair.desc?.trim() || '—'}</p>
        </section>

        <section className="pair-archive-detail__sec">
          <h3 className="pair-archive-detail__sec-t">케미 지표</h3>
          {chemistry.map((row) => (
            <div key={row.label} className="pair-archive-detail__chem">
              <span className="pair-archive-detail__chem-lbl">{row.label}</span>
              <div className="pair-archive-detail__chem-track">
                <div className="pair-archive-detail__chem-fill" style={{ width: `${Math.min(100, Math.max(0, row.value))}%` }} />
              </div>
              <span className="pair-archive-detail__chem-val">{row.value}</span>
            </div>
          ))}
        </section>

        {flatLore ? (
          <section className="pair-archive-detail__sec pair-archive-detail__sec--wide">
            <h3 className="pair-archive-detail__sec-t">납작캐해</h3>
            {flatTags?.length ? (
              <span className="pair-archive-detail__npc-label">납판캐해</span>
            ) : null}
            {flatTags?.length ? (
              <div className="pair-archive-detail__flat-tags">
                {flatTags.map((t) => (
                  <span key={t} className="pair-archive-detail__flat-tag">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            <p className="pair-archive-detail__copy">{flatLore}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
