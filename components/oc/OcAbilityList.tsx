'use client';

import { useState } from 'react';
import { OcRichText } from '@/lib/oc/richText';
import type { OcAbility } from '@/lib/types/character';

/**
 * 신비 연출 능력 목록.
 * - 능력명: 금빛 그라데이션 + 약한 글로우
 * - 상세(발동 조건 등): 클릭 시 안개 걷히듯 리빌 (blur → 선명)
 */
export function OcAbilityList({ abilities }: { abilities: OcAbility[] }) {
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="oc-ability-list">
      {abilities.map((ab) => {
        const name = ab.name?.trim();
        if (!name) return null;
        const detail = ab.detail?.trim();
        const hasDetail = !!detail;
        const isOpen = !!openIds[ab.id];
        return (
          <div
            key={ab.id}
            className={`oc-ability${isOpen ? ' is-open' : ''}${hasDetail ? ' has-detail' : ''}`}
          >
            <button
              type="button"
              className="oc-ability__name"
              onClick={hasDetail ? () => toggle(ab.id) : undefined}
              aria-expanded={hasDetail ? isOpen : undefined}
              disabled={!hasDetail}
            >
              <span className="oc-ability__glyph" aria-hidden>
                ✦
              </span>
              <span className="oc-ability__name-text">{name}</span>
              {hasDetail ? (
                <span className="oc-ability__chev" aria-hidden>
                  ▾
                </span>
              ) : null}
            </button>
            {hasDetail ? (
              <div className="oc-ability__detail">
                <div className="oc-ability__detail-inner">
                  <OcRichText text={detail} className="oc-ability__detail-text" />
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
