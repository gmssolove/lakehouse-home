'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { onValue, ref, set } from 'firebase/database';
import { db } from '@/lib/firebase/client';
import { stripUndefinedDeep } from '@/lib/firebase/sanitize';

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

function sameSnapshot<T>(a: T, b: T): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return a === b;
  }
}

export function useFirebaseSection<T>(path: string, defaultValue: T) {
  const storageKey = path.replace(/\//g, '_');
  const [data, setData] = useState<T>(defaultValue);
  const [loaded, setLoaded] = useState(false);
  const defaultRef = useRef(defaultValue);
  defaultRef.current = defaultValue;

  useEffect(() => {
    const cached = readLocal(storageKey, defaultRef.current);
    setData((prev) => (sameSnapshot(prev, cached) ? prev : cached));
    setLoaded(true);

    let unsub: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      unsub = onValue(ref(db, path), (snap) => {
        if (!snap.exists()) return;
        const val = snap.val() as T;
        try {
          localStorage.setItem(storageKey, JSON.stringify(val));
        } catch {
          /* quota / private mode */
        }
        setData((prev) => (sameSnapshot(prev, val) ? prev : val));
      });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      unsub?.();
    };
  }, [path, storageKey]);

  const save = useCallback(
    async (next: T) => {
      const clean = stripUndefinedDeep(next);
      localStorage.setItem(storageKey, JSON.stringify(clean));
      setData(clean);
      await set(ref(db, path), clean);
    },
    [path, storageKey],
  );

  return { data, loaded, save, setData };
}
