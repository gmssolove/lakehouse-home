'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  DEFAULT_REVIEW_CATEGORIES,
  DEFAULT_SITE_ACCESS_SETTINGS,
  DEFAULT_SITE_BGM,
  DEFAULT_SITE_MAIN,
  DEFAULT_SITE_OC_SETTINGS,
  DEFAULT_SITE_UI_SETTINGS,
  DEFAULT_UNIVERSE,
  type BannerItem,
  type CharArchiveItem,
  type GalleryItem,
  type GuestEntry,
  type MusicPlaylist,
  type MusicTrack,
  type QuoteItem,
  type ReviewCategory,
  type ReviewItem,
  type ScrapItem,
  type SiteAccessSettings,
  type SiteBgm,
  type SiteGuestSettings,
  type SiteMain,
  type SiteOcSettings,
  type SitePost,
  type SiteUiSettings,
  type ScrapCategory,
  type TimelinePost,
  type ClickerButton,
  DEFAULT_SCRAP_CATEGORIES,
  DEFAULT_SITE_GUEST_SETTINGS,
  type TrpgListSettings,
  type TrpgScenario,
  type UniverseCard,
  DEFAULT_TRPG_LIST_SETTINGS,
} from '@/lib/types/site-content';
import { useFirebaseSection } from '@/lib/hooks/useFirebaseSection';
import { normalizeMusicPlaylists, normalizeMusicTracks } from '@/lib/music/normalize';

function mergeTrpgListSettings(raw: Partial<TrpgListSettings> | null | undefined): TrpgListSettings {
  const categories = Array.isArray(raw?.categories)
    ? raw!.categories
        .map((c) => ({
          id: String(c?.id || '').trim(),
          label: String(c?.label || '').trim(),
        }))
        .filter((c) => c.id && c.label)
    : DEFAULT_TRPG_LIST_SETTINGS.categories;
  let cardAspect = String(raw?.cardAspect || '').trim() || DEFAULT_TRPG_LIST_SETTINGS.cardAspect;
  /* Migrate early portrait / 16:9 defaults → 16:10 */
  if (
    cardAspect === '3 / 4' ||
    cardAspect === '3/4' ||
    cardAspect === '16 / 9' ||
    cardAspect === '16/9'
  ) {
    cardAspect = DEFAULT_TRPG_LIST_SETTINGS.cardAspect;
  }
  return {
    categories: categories.length ? categories : DEFAULT_TRPG_LIST_SETTINGS.categories,
    cardAspect,
  };
}

type SiteContentValue = {
  loaded: boolean;
  main: SiteMain;
  notices: SitePost[];
  diary: SitePost[];
  gallery: GalleryItem[];
  universe: UniverseCard[];
  trpg: TrpgScenario[];
  trpgSettings: TrpgListSettings;
  guests: GuestEntry[];
  banners: BannerItem[];
  bgm: SiteBgm;
  ocSettings: SiteOcSettings;
  uiSettings: SiteUiSettings;
  accessSettings: SiteAccessSettings;
  scrap: ScrapItem[];
  scrapCategories: ScrapCategory[];
  timeline: TimelinePost[];
  quotes: QuoteItem[];
  guestSettings: SiteGuestSettings;
  reviewCategories: ReviewCategory[];
  reviews: ReviewItem[];
  musicTracks: MusicTrack[];
  musicPlaylists: MusicPlaylist[];
  charArchive: CharArchiveItem[];
  saveMain: (next: SiteMain) => Promise<void>;
  saveNotices: (next: SitePost[]) => Promise<void>;
  saveDiary: (next: SitePost[]) => Promise<void>;
  saveGallery: (next: GalleryItem[]) => Promise<void>;
  saveUniverse: (next: UniverseCard[]) => Promise<void>;
  saveTrpg: (next: TrpgScenario[]) => Promise<void>;
  saveTrpgSettings: (next: TrpgListSettings) => Promise<void>;
  saveGuests: (next: GuestEntry[]) => Promise<void>;
  saveBanners: (next: BannerItem[]) => Promise<void>;
  saveBgm: (next: SiteBgm) => Promise<void>;
  saveOcSettings: (next: SiteOcSettings) => Promise<void>;
  saveUiSettings: (next: SiteUiSettings) => Promise<void>;
  saveAccessSettings: (next: SiteAccessSettings) => Promise<void>;
  saveScrap: (next: ScrapItem[]) => Promise<void>;
  saveScrapCategories: (next: ScrapCategory[]) => Promise<void>;
  saveTimeline: (next: TimelinePost[]) => Promise<void>;
  saveQuotes: (next: QuoteItem[]) => Promise<void>;
  saveGuestSettings: (next: SiteGuestSettings) => Promise<void>;
  saveReviewCategories: (next: ReviewCategory[]) => Promise<void>;
  saveReviews: (next: ReviewItem[]) => Promise<void>;
  saveMusicTracks: (next: MusicTrack[]) => Promise<void>;
  saveMusicPlaylists: (next: MusicPlaylist[]) => Promise<void>;
  saveCharArchive: (next: CharArchiveItem[]) => Promise<void>;
};

const SiteContentContext = createContext<SiteContentValue | null>(null);

function migrateClickerButtons(rawUi: Partial<SiteUiSettings>): SiteUiSettings['clickerButtons'] {
  if (Array.isArray(rawUi.clickerButtons) && rawUi.clickerButtons.length) {
    return rawUi.clickerButtons.map((b, i) => {
      const legacy = b as ClickerButton & { imgX?: number; imgY?: number; imgZoom?: number };
      let imgFrame = legacy.imgFrame;
      if (!imgFrame && (legacy.imgX != null || legacy.imgY != null || legacy.imgZoom != null)) {
        imgFrame = {
          scale: Math.min(3, Math.max(0.55, Number(legacy.imgZoom) || 1)),
          x: ((Number(legacy.imgX) || 50) - 50) * 0.6,
          y: ((Number(legacy.imgY) || 20) - 50) * 0.6,
        };
      }
      return {
        id: b.id || `ck-${i + 1}`,
        key: (b.key || 'z').slice(0, 1).toLowerCase() || 'z',
        label: b.label,
        img: b.img,
        sound: b.sound,
        imgFrame,
        cutout: Boolean(b.cutout),
      };
    });
  }
  const legacy = rawUi.clickerKeys;
  if (legacy) {
    return (['z', 'x', 'c', 'v'] as const).map((k) => ({
      id: `ck-${k}`,
      key: k,
      label: legacy[k]?.label,
      img: legacy[k]?.img,
      sound: legacy[k]?.sound,
    }));
  }
  return DEFAULT_SITE_UI_SETTINGS.clickerButtons.map((b) => ({ ...b }));
}

function mergeUiSettings(rawUi: Partial<SiteUiSettings>, legacy: Record<string, unknown>): SiteUiSettings {
  const merged: SiteUiSettings = { ...DEFAULT_SITE_UI_SETTINGS, ...rawUi };
  merged.clickerDefaultVolume = Math.min(
    1,
    Math.max(0, Number(merged.clickerDefaultVolume) || DEFAULT_SITE_UI_SETTINGS.clickerDefaultVolume),
  );
  if (typeof merged.clickerHint !== 'string') {
    merged.clickerHint = DEFAULT_SITE_UI_SETTINGS.clickerHint;
  }
  if (typeof merged.clickerTitle !== 'string') {
    merged.clickerTitle = DEFAULT_SITE_UI_SETTINGS.clickerTitle;
  }
  if (!merged.clickerSoundPreset) {
    merged.clickerSoundPreset = DEFAULT_SITE_UI_SETTINGS.clickerSoundPreset;
  }
  if (typeof merged.clickerSoundCustom !== 'string') {
    merged.clickerSoundCustom = '';
  }
  merged.clickerButtons = migrateClickerButtons(rawUi);
  delete merged.clickerKeys;
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
  const trpg = useFirebaseSection<TrpgScenario[]>('lhdata/site/trpg', []);
  const trpgSettings = useFirebaseSection<TrpgListSettings>(
    'lhdata/site/trpg_settings',
    DEFAULT_TRPG_LIST_SETTINGS,
  );
  const guests = useFirebaseSection<GuestEntry[]>('lhdata/site/guests', []);
  const banners = useFirebaseSection<BannerItem[]>('lhdata/site/banners', []);
  const bgm = useFirebaseSection<SiteBgm>('lhdata/site/bgm', DEFAULT_SITE_BGM);
  const ocSettings = useFirebaseSection<SiteOcSettings>('lhdata/site/oc_settings', DEFAULT_SITE_OC_SETTINGS);
  const uiSettings = useFirebaseSection<SiteUiSettings>('lhdata/site/ui_settings', DEFAULT_SITE_UI_SETTINGS);
  const accessSettings = useFirebaseSection<SiteAccessSettings>(
    'lhdata/site/access_settings',
    DEFAULT_SITE_ACCESS_SETTINGS,
  );
  const scrap = useFirebaseSection<ScrapItem[]>('lhdata/site/scrap', []);
  const scrapCategories = useFirebaseSection<ScrapCategory[]>('lhdata/site/scrap_categories', DEFAULT_SCRAP_CATEGORIES);
  const timeline = useFirebaseSection<TimelinePost[]>('lhdata/site/timeline', []);
  const quotes = useFirebaseSection<QuoteItem[]>('lhdata/site/quotes', []);
  const guestSettings = useFirebaseSection<SiteGuestSettings>('lhdata/site/guest_settings', DEFAULT_SITE_GUEST_SETTINGS);
  const reviewCategories = useFirebaseSection<ReviewCategory[]>(
    'lhdata/site/review_categories',
    DEFAULT_REVIEW_CATEGORIES,
  );
  const reviews = useFirebaseSection<ReviewItem[]>('lhdata/site/reviews', []);
  const musicTracks = useFirebaseSection<MusicTrack[]>('lhdata/site/music_tracks', []);
  const musicPlaylists = useFirebaseSection<MusicPlaylist[]>('lhdata/site/music_playlists', []);
  const charArchive = useFirebaseSection<CharArchiveItem[]>('lhdata/site/char_archive', []);

  const loaded =
    main.loaded &&
    notices.loaded &&
    diary.loaded &&
    gallery.loaded &&
    universe.loaded &&
    trpg.loaded &&
    trpgSettings.loaded &&
    guests.loaded &&
    banners.loaded &&
    bgm.loaded &&
    ocSettings.loaded &&
    uiSettings.loaded &&
    accessSettings.loaded &&
    scrap.loaded &&
    scrapCategories.loaded &&
    timeline.loaded &&
    quotes.loaded &&
    guestSettings.loaded &&
    reviewCategories.loaded &&
    reviews.loaded &&
    musicTracks.loaded &&
    musicPlaylists.loaded &&
    charArchive.loaded;

  const value = useMemo<SiteContentValue>(
    () => ({
      loaded,
      main: main.data,
      notices: notices.data,
      diary: diary.data,
      gallery: gallery.data,
      universe: universe.data,
      trpg: trpg.data,
      trpgSettings: mergeTrpgListSettings(trpgSettings.data),
      guests: guests.data,
      banners: banners.data,
      bgm: bgm.data,
      ocSettings: mergeOcSettings(ocSettings.data),
      uiSettings: mergeUiSettings(uiSettings.data, ocSettings.data as Record<string, unknown>),
      accessSettings: { ...DEFAULT_SITE_ACCESS_SETTINGS, ...accessSettings.data },
      scrap: scrap.data,
      scrapCategories: scrapCategories.data.length ? scrapCategories.data : DEFAULT_SCRAP_CATEGORIES,
      timeline: timeline.data,
      quotes: quotes.data,
      guestSettings: { ...DEFAULT_SITE_GUEST_SETTINGS, ...guestSettings.data },
      reviewCategories: reviewCategories.data.length ? reviewCategories.data : DEFAULT_REVIEW_CATEGORIES,
      reviews: reviews.data,
      musicTracks: normalizeMusicTracks(musicTracks.data),
      musicPlaylists: normalizeMusicPlaylists(musicPlaylists.data),
      charArchive: charArchive.data,
      saveMain: main.save,
      saveNotices: notices.save,
      saveDiary: diary.save,
      saveGallery: gallery.save,
      saveUniverse: universe.save,
      saveTrpg: trpg.save,
      saveTrpgSettings: trpgSettings.save,
      saveGuests: guests.save,
      saveBanners: banners.save,
      saveBgm: bgm.save,
      saveOcSettings: ocSettings.save,
      saveUiSettings: uiSettings.save,
      saveAccessSettings: accessSettings.save,
      saveScrap: scrap.save,
      saveScrapCategories: scrapCategories.save,
      saveTimeline: timeline.save,
      saveQuotes: quotes.save,
      saveGuestSettings: guestSettings.save,
      saveReviewCategories: reviewCategories.save,
      saveReviews: reviews.save,
      saveMusicTracks: musicTracks.save,
      saveMusicPlaylists: musicPlaylists.save,
      saveCharArchive: charArchive.save,
    }),
    [
      loaded,
      main.data,
      notices.data,
      diary.data,
      gallery.data,
      universe.data,
      trpg.data,
      trpgSettings.data,
      guests.data,
      banners.data,
      bgm.data,
      ocSettings.data,
      uiSettings.data,
      accessSettings.data,
      scrap.data,
      scrapCategories.data,
      timeline.data,
      quotes.data,
      guestSettings.data,
      reviewCategories.data,
      reviews.data,
      musicTracks.data,
      musicPlaylists.data,
      charArchive.data,
      main.save,
      notices.save,
      diary.save,
      gallery.save,
      universe.save,
      trpg.save,
      trpgSettings.save,
      guests.save,
      banners.save,
      bgm.save,
      ocSettings.save,
      uiSettings.save,
      accessSettings.save,
      scrap.save,
      scrapCategories.save,
      timeline.save,
      quotes.save,
      guestSettings.save,
      reviewCategories.save,
      reviews.save,
      musicTracks.save,
      musicPlaylists.save,
      charArchive.save,
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
