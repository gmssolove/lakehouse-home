'use client';

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import {
  preloadHandNoteImage,
  preloadHandNoteImages,
  takeHandNoteSfx,
  warmHandNoteSfx,
} from '@/lib/oc/handNotePreload';
import { playSafe } from '@/lib/vn/safeAudio';

const NotePaperUncrumple = dynamic(() => import('./NotePaperUncrumple'), {
  ssr: false,
}) as ComponentType<{
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  sceneHeight?: number;
  imageFit?: string;
  autoUncrumple?: boolean;
  draggable?: boolean;
  shadow?: boolean;
  roughness?: number;
  paperTexture?: number;
  lightIntensity?: number;
  detail?: number;
  onError?: () => void;
}>;

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

const CLOSE_MS = 420;

function parseNoteAspect(aspect: string | null) {
  const parts = (aspect || '').split('/').map((s) => Number(String(s).trim()));
  const w = Number.isFinite(parts[0]) && parts[0] > 0 ? parts[0] : 0;
  const h = Number.isFinite(parts[1]) && parts[1] > 0 ? parts[1] : 0;
  if (!w || !h) return null;
  /* 모션 추가 전 .pair-note-unfold 과 동일: 너비 520, 높이 최대 78vh/720 */
  const maxW =
    typeof window === 'undefined' ? 520 : Math.min(520, Math.round(window.innerWidth * 0.9));
  const maxH =
    typeof window === 'undefined' ? 720 : Math.min(720, Math.round(window.innerHeight * 0.78));
  let width = maxW;
  let height = Math.max(1, Math.round((width * h) / w));
  if (height > maxH) {
    height = maxH;
    width = Math.max(1, Math.round((height * w) / h));
  }
  return { width, height, sceneHeight: height };
}

/** 펼침 애니와 맞추기 — fold 시작(0.04s) 후 첫 단이 어느 정도 열린 시점 */
const SFX_DELAY_MS = 120;

/**
 * 4단 접힌 쪽지 펼침.
 * 이미지 로드·decode·비율을 확보한 뒤에만 펼침 — 로딩 중 뚝/비율 점프 방지.
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
  const [crumpleFailed, setCrumpleFailed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const closeTimer = useRef(0);
  const sfxRef = useRef<HTMLAudioElement | null>(null);
  const sfxTimer = useRef(0);
  const sfxPlayedRef = useRef(false);
  /** state보다 먼저 막아 더블클릭·버블링으로 닫기음이 끊기지 않게 */
  const leavingRef = useRef(false);

  const src = urls[index] || urls[0] || '';
  const urlsKey = urls.join('\0');

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
      const el = takeHandNoteSfx(trimmed);
      if (!el) return;
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
      setCrumpleFailed(false);
      setAspect(null);
      setLeaving(false);
      leavingRef.current = false;
      sfxPlayedRef.current = false;
      window.clearTimeout(closeTimer.current);
      /* 닫기음은 requestClose에서 ref를 떼 두고 재생 유지 — 여기선 펼침음만 정리 */
      stopSfx();
      return;
    }

    let cancelled = false;
    setLeaving(false);
    leavingRef.current = false;
    setCrumpleFailed(false);
    setReady(false);
    setAspect(null);

    /* 이웃 장도 미리 받아 페이지 넘김 뚝 완화 */
    preloadHandNoteImages(urlsKey.split('\0'));

    void (async () => {
      const dim = await preloadHandNoteImage(src);
      if (cancelled) return;
      if (!dim) {
        setReady(false);
        return;
      }
      setAspect(`${dim.width} / ${dim.height}`);
      setAnimKey((k) => k + 1);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, src, stopSfx, urlsKey]);

  /* 펼침음 — 이미지 ready를 기다리지 않음(첫 로딩 때 효과음만 늦어지던 원인) */
  useEffect(() => {
    if (!open || leaving) return;
    const url = (sfxUrl || '').trim();
    if (!url || sfxPlayedRef.current) return;
    sfxPlayedRef.current = true;
    warmHandNoteSfx([url, closeSfxUrl]);
    window.clearTimeout(sfxTimer.current);
    sfxTimer.current = window.setTimeout(() => {
      if (!open || leavingRef.current) return;
      playSfx(url);
    }, SFX_DELAY_MS);
    return () => window.clearTimeout(sfxTimer.current);
  }, [closeSfxUrl, leaving, open, playSfx, sfxUrl]);

  useEffect(
    () => () => {
      window.clearTimeout(closeTimer.current);
      stopSfx();
    },
    [stopSfx],
  );

  const playCloseSfx = useCallback(() => {
    window.clearTimeout(sfxTimer.current);
    if (sfxRef.current) {
      sfxRef.current.pause();
      sfxRef.current = null;
    }
    const closeUrl = (closeSfxUrl || '').trim();
    if (!closeUrl) return;
    try {
      const el = takeHandNoteSfx(closeUrl);
      if (el) {
        el.volume = 0.62;
        playSafe(el, 'sfx', closeUrl);
      }
    } catch {
      /* ignore */
    }
  }, [closeSfxUrl]);

  const requestClose = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    playCloseSfx();
    window.clearTimeout(closeTimer.current);
    setLeaving(true);
    closeTimer.current = window.setTimeout(() => onClose(), CLOSE_MS);
  }, [onClose, playCloseSfx]);

  /* 쪽지가 열려 있으면 Escape는 쪽지만 닫고, 뒤 상세는 유지 */
  useEffect(() => {
    if (!open || leaving) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      requestClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [leaving, open, requestClose]);

  if (!open) return null;

  const paper = parseNoteAspect(aspect);
  const useCrumple = ready && !!paper && !crumpleFailed;

  const overlay = (
    <div
      className={`pair-note-flap-lb${leaving ? ' is-leaving' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} 손글씨 쪽지`}
      onClick={requestClose}
    >
      <div className="pair-note-flap-lb__stage" onClick={(e) => e.stopPropagation()}>
        <div className="pair-note-flap-lb__row">
          <button
            type="button"
            className="pair-note-flap-lb__close"
            onClick={(e) => {
              e.stopPropagation();
              requestClose();
            }}
            aria-label="닫기"
          >
            ✕
          </button>
          <div
            className="pair-note-paper"
            style={
              paper ? { width: paper.width, height: paper.height } : undefined
            }
          >
            {useCrumple ? (
              <NotePaperUncrumple
                key={`${animKey}-${src}`}
                src={src}
                alt=""
                width={paper?.width}
                height={paper?.height}
                sceneHeight={paper?.sceneHeight}
                imageFit="contain"
                autoUncrumple
                draggable={false}
                shadow={false}
                roughness={1}
                paperTexture={0}
                lightIntensity={0.4}
                detail={72}
                onError={() => setCrumpleFailed(true)}
              />
            ) : ready && paper ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="lh-note-flat"
                src={src}
                alt=""
                referrerPolicy="no-referrer"
                draggable={false}
              />
            ) : (
              <div className="pair-note-unfold-skeleton" aria-hidden />
            )}
          </div>
        </div>

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
