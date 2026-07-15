'use client';

import { useCallback, useEffect, useState } from 'react';
import { onValue, ref, set } from 'firebase/database';
import { db } from '@/lib/firebase/client';
import { prepareCharactersForSave } from '@/lib/oc/prepareCharacterSave';
import { stripEmptyThemeFields } from '@/lib/oc/characterTheme';
import { mergeCategoryList, normalizeCategory } from '@/lib/oc/categories';
import { hydrateOcStories } from '@/lib/oc/storyEntries';
import { stripUndefinedDeep } from '@/lib/firebase/sanitize';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_OC,
  type OcCharacter,
} from '@/lib/types/character';

function normalizeCharacter(c: OcCharacter): OcCharacter {
  return hydrateOcStories({
    ...c,
    category: normalizeCategory(c.category || ''),
  });
}

function normalizeCharacters(list: OcCharacter[]): OcCharacter[] {
  return list.map(normalizeCharacter);
}

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

export function useOcData() {
  const [characters, setCharacters] = useState<OcCharacter[]>(DEFAULT_OC);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setCharacters(normalizeCharacters(readLocal('oc_characters', DEFAULT_OC)));
    setCategories(mergeCategoryList(readLocal('oc_categories', DEFAULT_CATEGORIES)));
    setLoaded(true);

    const unsubs = [
      onValue(ref(db, 'lhdata/oc_characters'), (snap) => {
        if (!snap.exists()) return;
        const val = normalizeCharacters(snap.val() as OcCharacter[]);
        localStorage.setItem('oc_characters', JSON.stringify(val));
        setCharacters(val);
      }),
      onValue(ref(db, 'lhdata/oc_categories'), (snap) => {
        if (!snap.exists()) return;
        const val = mergeCategoryList(snap.val() as string[]);
        localStorage.setItem('oc_categories', JSON.stringify(val));
        setCategories(val);
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, []);

  const saveCharacters = useCallback(async (next: OcCharacter[]) => {
    const cleaned = normalizeCharacters(next).map(stripEmptyThemeFields);
    const prepared = stripUndefinedDeep(await prepareCharactersForSave(cleaned));
    localStorage.setItem('oc_characters', JSON.stringify(prepared));
    setCharacters(prepared);
    await set(ref(db, 'lhdata/oc_characters'), prepared);
    return prepared as OcCharacter[];
  }, []);

  const saveCategories = useCallback(async (next: string[]) => {
    const merged = mergeCategoryList(next);
    localStorage.setItem('oc_categories', JSON.stringify(merged));
    setCategories(merged);
    await set(ref(db, 'lhdata/oc_categories'), merged);
  }, []);

  return { characters, categories, loaded, saveCharacters, saveCategories };
}
