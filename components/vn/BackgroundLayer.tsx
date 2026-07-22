'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './vn-engine.module.css';

type Props = {
  background: string | null;
  url?: string;
};

type Layer = {
  id: number;
  key: string;
  /** null → 검정/폴백 */
  url: string | null;
  phase: 'in' | 'out' | 'idle';
};

const CROSSFADE_MS = 1600;

function resolveKey(background: string | null, url?: string) {
  if (background === 'black') return 'black';
  if (background && url) return `${background}::${url}`;
  return null;
}

function preloadBg(url: string | null): Promise<void> {
  if (!url || typeof window === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    const done = () => resolve();
    img.onload = done;
    img.onerror = done;
    img.src = url;
    if (typeof img.decode === 'function') {
      void img.decode().then(done).catch(done);
    }
  });
}

/**
 * 배경 크로스페이드 — 이미지 디코드 후 in/out, 끊김 최소화.
 */
export function BackgroundLayer({ background, url }: Props) {
  const [layers, setLayers] = useState<Layer[]>([]);
  const idRef = useRef(0);
  const curKey = useRef<string | null>(null);
  const pruneRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const genRef = useRef(0);

  useEffect(() => {
    const nextKey = resolveKey(background, url);
    if (nextKey === curKey.current) return;

    const gen = ++genRef.current;
    if (pruneRef.current) {
      clearTimeout(pruneRef.current);
      pruneRef.current = null;
    }

    let cancelled = false;

    const run = async () => {
      const nextUrl = nextKey === 'black' || !nextKey ? null : url || null;
      if (nextUrl) await preloadBg(nextUrl);
      if (cancelled || gen !== genRef.current) return;

      curKey.current = nextKey;

      if (!nextKey) {
        setLayers((prev) =>
          prev.map((l) => (l.phase === 'out' ? l : { ...l, phase: 'out' as const })),
        );
        pruneRef.current = setTimeout(() => {
          if (gen !== genRef.current) return;
          setLayers([]);
          pruneRef.current = null;
        }, CROSSFADE_MS);
        return;
      }

      idRef.current += 1;
      const incomingId = idRef.current;
      const incoming: Layer = {
        id: incomingId,
        key: nextKey,
        url: nextUrl,
        phase: 'in',
      };

      setLayers((prev) => {
        const back = prev
          .filter((l) => l.phase !== 'out')
          .slice(-1)
          .map((l) => ({ ...l, phase: 'out' as const }));
        return [...back, incoming];
      });

      pruneRef.current = setTimeout(() => {
        if (gen !== genRef.current) return;
        setLayers((prev) =>
          prev
            .filter((l) => l.id === incomingId)
            .map((l) => ({ ...l, phase: 'idle' as const })),
        );
        pruneRef.current = null;
      }, CROSSFADE_MS);
    };

    void run();

    return () => {
      cancelled = true;
      if (pruneRef.current) {
        clearTimeout(pruneRef.current);
        pruneRef.current = null;
      }
    };
  }, [background, url]);

  /* Strict Mode 등에서 out 레이어가 남으면 정리 */
  useEffect(() => {
    if (layers.length <= 1) return;
    if (!layers.some((l) => l.phase === 'out')) return;
    const keepId = layers[layers.length - 1]?.id;
    if (keepId == null) return;
    const t = window.setTimeout(() => {
      setLayers((prev) => {
        if (prev.length <= 1) return prev;
        return prev
          .filter((l) => l.id === keepId)
          .map((l) => ({ ...l, phase: 'idle' as const }));
      });
    }, CROSSFADE_MS);
    return () => clearTimeout(t);
  }, [layers]);

  return (
    <div className={styles.bgStack} aria-hidden>
      {layers.length === 0 ? (
        <div className={`${styles.bgFallback} ${styles.bgLayer}`} />
      ) : (
        layers.map((layer) => {
          const isBlack = layer.url == null;
          const phaseClass =
            layer.phase === 'in'
              ? styles.bgIn
              : layer.phase === 'out'
                ? styles.bgOut
                : styles.bgIdle;
          return (
            <div
              key={layer.id}
              className={`${isBlack ? styles.bgFallback : styles.bg} ${styles.bgLayer} ${phaseClass}`}
              style={
                layer.url
                  ? { backgroundImage: `url("${layer.url.replace(/"/g, '\\"')}")` }
                  : undefined
              }
            />
          );
        })
      )}
    </div>
  );
}
