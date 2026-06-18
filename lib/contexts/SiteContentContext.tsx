'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  DEFAULT_SITE_BGM,
  DEFAULT_SITE_MAIN,
  DEFAULT_SITE_OC_SETTINGS,
  DEFAULT_SITE_UI_SETTINGS,
  DEFAULT_UNIVERSE,
  type BannerItem,
  type GalleryItem,
  type GuestEntry,
  type SiteBgm,
  type SiteMain,
  type SiteOcSettings,
  type SitePost,
  type SiteUiSettings,
  type UniverseCard,
} from '@/lib/types/site-content';
import { useFirebaseSection } from '@/lib/hooks/useFirebaseSection';

type SiteContentValue = {
  loaded: boolean;
  main: SiteMain;
  notices: SitePost[];
  diary: SitePost[];
  gallery: GalleryItem[];
  universe: UniverseCard[];
  trpg: SitePost[];
  guests: GuestEntry[];
  banners: BannerItem[];
  bgm: SiteBgm;
  ocSettings: SiteOcSettings;
  uiSettings: SiteUiSettings;
  saveMain: (next: SiteMain) => Promise<void>;
  saveNotices: (next: SitePost[]) => Promise<void>;
  saveDiary: (next: SitePost[]) => Promise<void>;
  saveGallery: (next: GalleryItem[]) => Promise<void>;
  saveUniverse: (next: UniverseCard[]) => Promise<void>;
  saveTrpg: (next: SitePost[]) => Promise<void>;
  saveGuests: (next: GuestEntry[]) => Promise<void>;
  saveBanners: (next: BannerItem[]) => Promise<void>;
  saveBgm: (next: SiteBgm) => Promise<void>;
  saveOcSettings: (next: SiteOcSettings) => Promise<void>;
  saveUiSettings: (next: SiteUiSettings) => Promise<void>;
};

const SiteContentContext = createContext<SiteContentValue | null>(null);

function mergeUiSettings(rawUi: Partial<SiteUiSettings>, legacy: Record<string, unknown>): SiteUiSettings {
  const merged: SiteUiSettings = { ...DEFAULT_SITE_UI_SETTINGS, ...rawUi };
  if (rawUi.clickSoundEnabled !== undefined) return merged;
  if (legacy.clickSoundEnabled === undefined) return merged;
  return {
    ...merged,
    clickSoundEnabled: !!legacy.clickSoundEnabled,
    clickSoundPreset:
      (legacy.clickSoundPreset as SiteUiSettings['clickSoundPreset']) || merged.clickSoundPreset,
    clickSoundCustom: (legacy.clickSoundCustom as string) || merged.clickSoundCustom,
    customCursorEnabled:
      legacy.customCursorEnabled !== undefined
        ? !!legacy.customCursorEnabled
        : merged.customCursorEnabled,
    clickRippleEnabled:
      legacy.clickRippleEnabled !== undefined ? !!legacy.clickRippleEnabled : merged.clickRippleEnabled,
  };
}

function mergeOcSettings(data: Partial<SiteOcSettings>): SiteOcSettings {
  const merged: SiteOcSettings = { ...DEFAULT_SITE_OC_SETTINGS, ...data };
  if (merged.pvIntroDurationMs > 12000) {
    merged.pvIntroDurationMs = DEFAULT_SITE_OC_SETTINGS.pvIntroDurationMs;
  }
  return merged;
}

export function SiteContentProvider({ children }: { children: ReactNode }) {
  const main = useFirebaseSection<SiteMain>('lhdata/site/main', DEFAULT_SITE_MAIN);
  const notices = useFirebaseSection<SitePost[]>('lhdata/site/notices', []);
  const diary = useFirebaseSection<SitePost[]>('lhdata/site/diary', []);
  const gallery = useFirebaseSection<GalleryItem[]>('lhdata/site/gallery', []);
  const universe = useFirebaseSection<UniverseCard[]>('lhdata/site/universe', DEFAULT_UNIVERSE);
  const trpg = useFirebaseSection<SitePost[]>('lhdata/site/trpg', []);
  const guests = useFirebaseSection<GuestEntry[]>('lhdata/site/guests', []);
  const banners = useFirebaseSection<BannerItem[]>('lhdata/site/banners', []);
  const bgm = useFirebaseSection<SiteBgm>('lhdata/site/bgm', DEFAULT_SITE_BGM);
  const ocSettings = useFirebaseSection<SiteOcSettings>('lhdata/site/oc_settings', DEFAULT_SITE_OC_SETTINGS);
  const uiSettings = useFirebaseSection<SiteUiSettings>('lhdata/site/ui_settings', DEFAULT_SITE_UI_SETTINGS);

  const loaded =
    main.loaded &&
    notices.loaded &&
    diary.loaded &&
    gallery.loaded &&
    universe.loaded &&
    trpg.loaded &&
    guests.loaded &&
    banners.loaded &&
    bgm.loaded &&
    ocSettings.loaded &&
    uiSettings.loaded;

  const value = useMemo<SiteContentValue>(
    () => ({
      loaded,
      main: main.data,
      notices: notices.data,
      diary: diary.data,
      gallery: gallery.data,
      universe: universe.data,
      trpg: trpg.data,
      guests: guests.data,
      banners: banners.data,
      bgm: bgm.data,
      ocSettings: mergeOcSettings(ocSettings.data),
      uiSettings: mergeUiSettings(uiSettings.data, ocSettings.data as Record<string, unknown>),
      saveMain: main.save,
      saveNotices: notices.save,
      saveDiary: diary.save,
      saveGallery: gallery.save,
      saveUniverse: universe.save,
      saveTrpg: trpg.save,
      saveGuests: guests.save,
      saveBanners: banners.save,
      saveBgm: bgm.save,
      saveOcSettings: ocSettings.save,
      saveUiSettings: uiSettings.save,
    }),
    [
      loaded,
      main.data,
      notices.data,
      diary.data,
      gallery.data,
      universe.data,
      trpg.data,
      guests.data,
      banners.data,
      bgm.data,
      ocSettings.data,
      uiSettings.data,
      main.save,
      notices.save,
      diary.save,
      gallery.save,
      universe.save,
      trpg.save,
      guests.save,
      banners.save,
      bgm.save,
      ocSettings.save,
      uiSettings.save,
    ],
  );

  return <SiteContentContext.Provider value={value}>{children}</SiteContentContext.Provider>;
}

export function useSiteContent() {
  const ctx = useContext(SiteContentContext);
  if (!ctx) {
    throw new Error('useSiteContent must be used within SiteContentProvider');
  }
  return ctx;
}
