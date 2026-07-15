'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './vn-engine.module.css';

type Props = {
  /** 배경 키 (변경될 때만 크로스페이드) */
  background: string | null;
  url?: string;
};

type Layer = { key: string; url: string };

const CROSSFADE_MS = 850;

/**
 * 배경 레이어 — 키 변경 시 느린 크로스페이드 (~0.85s, ease-out-quart)
 */
export function BackgroundLayer({ background, url }: Props) {
  const [front, setFront] = useState<Layer | null>(null);
  const [back, setBack] = useState<Layer | null>(null);
  const [fading, setFading] = useState(false);
  const frontRef = useRef<Layer | null>(null);
  const first = useRef(true);

  useEffect(() => {
    frontRef.current = front;
  }, [front]);

  useEffect(() => {
    if (!background || !url) {
      const cur = frontRef.current;
      if (cur) {
        setBack(cur);
        setFront(null);
        frontRef.current = null;
        setFading(true);
        const t = window.setTimeout(() => {
          setBack(null);
          setFading(false);
        }, CROSSFADE_MS);
        return () => clearTimeout(t);
      }
      return;
    }

    const cur = frontRef.current;
    if (cur?.key === background && cur.url === url) return;

    if (first.current) {
      first.current = false;
      const layer = { key: background, url };
      setFront(layer);
      frontRef.current = layer;
      return;
    }

    setBack(cur);
    const layer = { key: background, url };
    setFront(layer);
    frontRef.current = layer;
    setFading(true);
    const t = window.setTimeout(() => {
      setBack(null);
      setFading(false);
    }, CROSSFADE_MS);
    return () => clearTimeout(t);
  }, [background, url]);

  return (
    <div className={styles.bgStack} aria-hidden>
      {back && (
        <div
          className={`${styles.bg} ${styles.bgLayer} ${fading ? styles.bgOut : ''}`}
          style={{ backgroundImage: `url("${back.url.replace(/"/g, '\\"')}")` }}
        />
      )}
      {front ? (
        <div
          className={`${styles.bg} ${styles.bgLayer} ${fading ? styles.bgIn : ''}`}
          style={{ backgroundImage: `url("${front.url.replace(/"/g, '\\"')}")` }}
        />
      ) : (
        <div className={`${styles.bgFallback} ${styles.bgLayer}`} />
      )}
    </div>
  );
}
