'use client';

import {
  OC_CHAT_TIER_TOAST_FILL_DELAY_MS,
  OC_CHAT_TIER_TOAST_MS,
  type OcChatAffinityTierToastPayload,
} from '@/lib/oc/ocChatAffinityTierToastQueue';
import { useEffect, useRef, useState } from 'react';

type Props = {
  /** 큐 맨 앞 1건만 넘김 — 동시에 두 개 표시하지 않음 */
  payload: OcChatAffinityTierToastPayload | null;
  onDone: (id: string) => void;
};

const RING_R = 18;
const RING_C = 2 * Math.PI * RING_R;

export function OcChatAffinityTierToast({ payload, onDone }: Props) {
  const [fillReady, setFillReady] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const doneOnce = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!payload) return;
    doneOnce.current = false;
    setFillReady(false);
    setImgFailed(false);
    const fillT = window.setTimeout(
      () => setFillReady(true),
      OC_CHAT_TIER_TOAST_FILL_DELAY_MS,
    );
    const doneT = window.setTimeout(() => {
      if (doneOnce.current) return;
      doneOnce.current = true;
      onDoneRef.current(payload.id);
    }, OC_CHAT_TIER_TOAST_MS);
    return () => {
      window.clearTimeout(fillT);
      window.clearTimeout(doneT);
    };
  }, [payload]);

  if (!payload) return null;

  const total = Math.max(1, payload.totalTiers);
  const ringRatio = Math.min(1, (payload.tierIndex + 1) / total);
  const ringOffset = fillReady ? RING_C * (1 - ringRatio) : RING_C;
  const showImg = Boolean(payload.avatarUrl) && !imgFailed;

  return (
    <div
      key={payload.id}
      className="oc-chat-tier-toast is-show"
      role="status"
      aria-live="polite"
      aria-label={`${payload.lead} · ${payload.tierLabel}`}
    >
      <div className="oc-chat-tier-toast__card">
        <div className="oc-chat-tier-toast__ring-wrap" aria-hidden>
          <svg width="42" height="42" viewBox="0 0 42 42">
            <circle
              cx="21"
              cy="21"
              r={RING_R}
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="3"
            />
            <circle
              className={`oc-chat-tier-toast__ring${fillReady ? ' is-anim' : ''}`}
              cx="21"
              cy="21"
              r={RING_R}
              fill="none"
              stroke="#C9A876"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={ringOffset}
              transform="rotate(-90 21 21)"
            />
          </svg>
          <div className="oc-chat-tier-toast__avatar">
            {showImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={payload.avatarUrl}
                alt=""
                onError={() => setImgFailed(true)}
              />
            ) : (
              <span>{payload.initial}</span>
            )}
          </div>
        </div>
        <div className="oc-chat-tier-toast__text">
          <div className="oc-chat-tier-toast__lead">{payload.lead}</div>
          <div className="oc-chat-tier-toast__tier">{payload.tierLabel}</div>
          <div className="oc-chat-tier-toast__dots" aria-hidden>
            {Array.from({ length: total }, (_, i) => {
              const filledAlready = i < payload.tierIndex;
              const isNew = i === payload.tierIndex;
              return (
                <div
                  key={i}
                  className={`oc-chat-tier-toast__seg${filledAlready ? ' is-filled' : ''}`}
                >
                  <div
                    className={`oc-chat-tier-toast__seg-fill${
                      isNew && fillReady ? ' is-anim' : ''
                    }${filledAlready ? ' is-full' : ''}${
                      isNew && fillReady ? ' is-full' : ''
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
