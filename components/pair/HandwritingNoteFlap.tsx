'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { playSafe } from '@/lib/vn/safeAudio';

type Props = {
  open: boolean;
  urls: string[];
  title: string;
  /** 펼침 시 재생할 효과음 URL */
  sfxUrl?: string;
  /** 닫을 때 재생할 효과음 URL */
  closeSfxUrl?: string;
  onClose: () => void;
};

const FOLDS = 4;
const CLOSE_MS = 420;
/** 펼침 애니와 맞추기 — fold 시작(0.04s) 후 첫 단이 어느 정도 열린 시점 */
const SFX_DELAY_MS = 120;

/**
 * 4단 접힌 쪽지 펼침.
 * 비율은 미리 측정한 뒤 마운트 → 열릴 때 리사이즈로 애니가 씹히지 않음.
 */
export function HandwritingNoteFlap({
  open,
  urls,
  title,
  sfxUrl,
  closeSfxUrl,
  onClose,
}: Props) {
  const [index, setIndex] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const [aspect, setAspect] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const closeTimer = useRef(0);
  const sfxRef = useRef<HTMLAudioElement | null>(null);
  const sfxTimer = useRef(0);
  const sfxPlayedRef = useRef(false);

  const src = urls[index] || urls[0] || '';

  const stopSfx = useCallback(() => {
    window.clearTimeout(sfxTimer.current);
    if (sfxRef.current) {
      sfxRef.current.pause();
      sfxRef.current = null;
    }
  }, []);

  const playSfx = useCallback((url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    try {
      if (sfxRef.current) {
        sfxRef.current.pause();
        sfxRef.current = null;
      }
      const el = new Audio(trimmed);
      el.volume = 0.62;
      sfxRef.current = el;
      playSafe(el, 'sfx', trimmed);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setIndex(0);
      setReady(false);
      setAspect(null);
      setLeaving(false);
      sfxPlayedRef.current = false;
      window.clearTimeout(closeTimer.current);
      stopSfx();
      return;
    }
    let cancelled = false;
    setReady(false);
    setLeaving(false);
    const img = new window.Image();
    img.decoding = 'async';
    img.onload = () => {
      if (cancelled) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w > 0 && h > 0) setAspect(`${w} / ${h}`);
      else setAspect('3 / 4');
      setAnimKey((k) => k + 1);
      setReady(true);
    };
    img.onerror = () => {
      if (cancelled) return;
      setAspect('3 / 4');
      setAnimKey((k) => k + 1);
      setReady(true);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [open, src, stopSfx]);

  /* 펼침 애니와 타이밍 맞춤 — ready 직후가 아니라 살짝 딜레이 */
  useEffect(() => {
    if (!open || !ready || leaving) return;
    const url = (sfxUrl || '').trim();
    if (!url || sfxPlayedRef.current) return;
    sfxPlayedRef.current = true;
    window.clearTimeout(sfxTimer.current);
    sfxTimer.current = window.setTimeout(() => {
      if (!open) return;
      playSfx(url);
    }, SFX_DELAY_MS);
    return () => window.clearTimeout(sfxTimer.current);
  }, [leaving, open, playSfx, ready, sfxUrl]);

  useEffect(
    () => () => {
      window.clearTimeout(closeTimer.current);
      stopSfx();
    },
    [stopSfx],
  );

  const requestClose = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    stopSfx();
    playSfx(closeSfxUrl || '');
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      onClose();
    }, CLOSE_MS);
  }, [closeSfxUrl, leaving, onClose, playSfx, stopSfx]);

  if (!open) return null;

  const overlay = (
    <div
      className={`pair-note-flap-lb${leaving ? ' is-leaving' : ''}${ready ? ' is-ready' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} 손글씨 쪽지`}
      onClick={requestClose}
    >
      <button
        type="button"
        className="pair-note-flap-lb__close"
        onClick={requestClose}
        aria-label="닫기"
      >
        ✕
      </button>

      <div className="pair-note-flap-lb__stage" onClick={(e) => e.stopPropagation()}>
        {ready && aspect ? (
          <div
            className="pair-note-unfold"
            key={`${animKey}-${src}`}
            style={{ aspectRatio: aspect }}
          >
            {Array.from({ length: FOLDS }, (_, i) => (
              <div
                key={i}
                className="pair-note-unfold__fold"
                style={{ ['--fold' as string]: i }}
              >
                <div className="pair-note-unfold__face">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    referrerPolicy="no-referrer"
                    draggable={false}
                    style={{
                      height: `${FOLDS * 100}%`,
                      top: `${-i * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="pair-note-unfold-skeleton" aria-hidden />
        )}

        {ready && urls.length > 1 ? (
          <div className="pair-note-unfold__pager">
            <button
              type="button"
              disabled={index <= 0 || leaving}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              aria-label="이전"
            >
              ‹
            </button>
            <span>
              {index + 1} / {urls.length}
            </span>
            <button
              type="button"
              disabled={index >= urls.length - 1 || leaving}
              onClick={() => setIndex((i) => Math.min(urls.length - 1, i + 1))}
              aria-label="다음"
            >
              ›
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return overlay;
  return createPortal(overlay, document.body);
}
