'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { takeNextTipToastItem } from '@/lib/shared/tipToastQueue';
import type { SiteTipToastItem, SiteTipToastSettings } from '@/lib/types/site-content';

const SHOW_DELAY_TIP_MS = 1600;
const SHOW_DELAY_TMI_MS = 2100;
const AUTO_HIDE_MS = 11000;
const OUT_MS = 420;

type CardState = {
  item: SiteTipToastItem;
  phase: 'in' | 'out';
};

type Props = {
  active: boolean;
  settings: SiteTipToastSettings;
  storageKey: string;
};

/**
 * OC/페어 목록 진입 시 TIP 카드 + TMI 카드를 각각 하나씩 코너에 표시.
 * 세션 큐는 kind별 셔플·소진.
 */
export function PageTipToast({ active, settings, storageKey }: Props) {
  const [tipCard, setTipCard] = useState<CardState | null>(null);
  const [tmiCard, setTmiCard] = useState<CardState | null>(null);
  const visitRef = useRef(0);
  const itemsKey = settings.items.map((it) => `${it.id}:${it.kind}:${it.text}`).join('|');

  useEffect(() => {
    const timers: number[] = [];
    const clearCards = () => {
      setTipCard(null);
      setTmiCard(null);
    };

    if (!active || !settings.enabled || !settings.items.length) {
      clearCards();
      return;
    }

    visitRef.current += 1;
    const visit = visitRef.current;
    clearCards();

    const schedule = (
      kind: 'tip' | 'tmi',
      delay: number,
      setCard: (v: CardState | null) => void,
    ) => {
      timers.push(
        window.setTimeout(() => {
          if (visitRef.current !== visit) return;
          const item = takeNextTipToastItem(storageKey, settings.items, kind);
          if (!item) return;
          setCard({ item, phase: 'in' });
          timers.push(
            window.setTimeout(() => {
              if (visitRef.current !== visit) return;
              setCard({ item, phase: 'out' });
              timers.push(
                window.setTimeout(() => {
                  if (visitRef.current !== visit) return;
                  setCard(null);
                }, OUT_MS),
              );
            }, AUTO_HIDE_MS),
          );
        }, delay),
      );
    };

    schedule('tip', SHOW_DELAY_TIP_MS, setTipCard);
    schedule('tmi', SHOW_DELAY_TMI_MS, setTmiCard);

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [active, settings.enabled, itemsKey, settings.items, storageKey]);

  const dismiss = (kind: 'tip' | 'tmi') => {
    const setCard = kind === 'tip' ? setTipCard : setTmiCard;
    setCard((prev) => (prev ? { ...prev, phase: 'out' } : null));
    window.setTimeout(() => setCard(null), OUT_MS);
  };

  if (!tipCard && !tmiCard) return null;

  return (
    <div className="lh-page-tip-toast-stack" aria-live="polite">
      {tipCard ? (
        <TipToastCard card={tipCard} onDismiss={() => dismiss('tip')} />
      ) : null}
      {tmiCard ? (
        <TipToastCard card={tmiCard} onDismiss={() => dismiss('tmi')} />
      ) : null}
    </div>
  );
}

function TipToastCard({
  card,
  onDismiss,
}: {
  card: CardState;
  onDismiss: () => void;
}) {
  const labelId = useId();
  const label = card.item.kind === 'tip' ? 'TIP' : 'TMI';

  return (
    <aside
      className={`lh-page-tip-toast lh-page-tip-toast--${card.phase}`}
      role="status"
      aria-labelledby={labelId}
    >
      <span className="lh-page-tip-toast__dot" aria-hidden />
      <div className="lh-page-tip-toast__body">
        <div className="lh-page-tip-toast__head">
          <span className="lh-page-tip-toast__lbl" id={labelId}>
            {label}
          </span>
          <button
            type="button"
            className="lh-page-tip-toast__close"
            onClick={onDismiss}
            aria-label="알림 닫기"
          >
            ×
          </button>
        </div>
        <p className="lh-page-tip-toast__text">{card.item.text}</p>
      </div>
    </aside>
  );
}
