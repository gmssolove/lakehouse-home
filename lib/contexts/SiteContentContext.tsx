'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
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
import { normalizeTipToastSettings } from '@/lib/shared/tipToastQueue';
import {
  getSiteContentEager,
  subscribeSiteContentEager,
} from '@/lib/site/siteContentEager';
import { SITE_SECTION_DEFAULT_LIMIT } from '@/lib/site/siteSectionMeta';

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

function mergeTipToast(raw: unknown): SiteOcSettings['tipToastOc'] {
  return normalizeTipToastSettings(raw as Parameters<typeof normalizeTipToastSettings>[0]);
}

function mergeOcSettings(data: Partial<SiteOcSettings>): SiteOcSettings {
  const merged: SiteOcSettings = {
    ...DEFAULT_SITE_OC_SETTINGS,
    ...data,
    tipToastOc: mergeTipToast(data.tipToastOc ?? DEFAULT_SITE_OC_SETTINGS.tipToastOc),
    tipToastPair: mergeTipToast(data.tipToastPair ?? DEFAULT_SITE_OC_SETTINGS.tipToastPair),
  };
  if (merged.pvIntroDurationMs > 12000) {
    merged.pvIntroDurationMs = DEFAULT_SITE_OC_SETTINGS.pvIntroDurationMs;
  }
  return merged;
}

type HomeTab = string;

function readHomeTab(): HomeTab {
  if (typeof window === 'undefined') return 'main';
  return new URLSearchParams(window.location.search).get('p') || 'main';
}

function sectionCacheUrl(section: string, limit?: number): string {
  const q = limit != null ? `?limit=${limit}` : '';
  return `/api/site-section/${section}${q}`;
}

type NeedMap = {
  notices: boolean;
  diary: boolean;
  gallery: boolean;
  universe: boolean;
  trpg: boolean;
  guests: boolean;
  banners: boolean;
  scrap: boolean;
  timeline: boolean;
  quotes: boolean;
  reviews: boolean;
  music: boolean;
  charArchive: boolean;
};

function needsForRoute(pathname: string, homeTab: HomeTab, eager: boolean): NeedMap {
  if (eager) {
    return {
      notices: true,
      diary: true,
      gallery: true,
      universe: true,
      trpg: true,
      guests: true,
      banners: true,
      scrap: true,
      timeline: true,
      quotes: true,
      reviews: true,
      music: true,
      charArchive: true,
    };
  }

  const onHome = pathname === '/' || pathname === '';
  const onVerse = pathname === '/verse' || pathname.startsWith('/verse/');
  const onRecords = pathname === '/records' || pathname.startsWith('/records/');
  const onTrpg = pathname.startsWith('/trpg');
  const onOc = pathname === '/oc' || pathname.startsWith('/oc/');
  const onVn = pathname === '/vn' || pathname.startsWith('/vn/');
  const onPair = pathname === '/pair' || pathname.startsWith('/pair/');

  /* OC/VN/Pair — 설정·BGM만 (core는 항상). 목록 섹션 구독 안 함 */
  if (onOc || onVn || onPair) {
    return {
      notices: false,
      diary: false,
      gallery: false,
      universe: false,
      trpg: false,
      guests: false,
      banners: false,
      scrap: false,
      timeline: false,
      quotes: false,
      reviews: false,
      music: false,
      charArchive: false,
    };
  }

  const tab = onHome ? homeTab : onRecords ? pathname.split('/')[2] || 'diary' : '';

  return {
    notices: onHome && tab === 'notice',
    diary: (onHome && tab === 'diary') || onRecords,
    gallery: onHome && tab === 'gallery',
    universe: onVerse || (onHome && tab === 'universe'),
    trpg: onTrpg || (onHome && tab === 'trpg'),
    guests: onHome && tab === 'guest',
    banners: onHome && tab === 'banner',
    scrap: onHome && tab === 'scrap',
    timeline: onHome && tab === 'timeline',
    quotes: onHome && tab === 'quote',
    reviews: onHome && tab === 'review',
    music: onHome && tab === 'music',
    charArchive: onHome && tab === 'charArchive',
  };
}

export function SiteContentProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '/';
  const [eager, setEager] = useState(getSiteContentEager);
  const [homeTab, setHomeTab] = useState<HomeTab>('main');

  useEffect(() => subscribeSiteContentEager(setEager), []);

  useEffect(() => {
    const sync = () => setHomeTab(readHomeTab());
    sync();
    window.addEventListener('popstate', sync);
    /* HomePageClient가 history.replaceState로 ?p= 바꿀 때 */
    const prev = history.replaceState.bind(history);
    history.replaceState = function (...args) {
      prev(...args);
      sync();
    };
    const prevPush = history.pushState.bind(history);
    history.pushState = function (...args) {
      prevPush(...args);
      sync();
    };
    return () => {
      window.removeEventListener('popstate', sync);
      history.replaceState = prev;
      history.pushState = prevPush;
    };
  }, [pathname]);

  const need = needsForRoute(pathname, homeTab, eager);
  const lim = eager ? undefined : SITE_SECTION_DEFAULT_LIMIT;
  const timeoutMs = 5000;
  /* 어드민(eager)은 slim 캐시 하이드레이트 건너뛰고 전체 RTDB 구독 */
  const cacheFor = (section: string, limit?: number) =>
    eager ? null : sectionCacheUrl(section, limit);

  /* 항상: 셸·접근·BGM·UX */
  const main = useFirebaseSection<SiteMain>('lhdata/site/main', DEFAULT_SITE_MAIN, {
    timeoutMs,
    cacheUrl: cacheFor('main'),
  });
  const bgm = useFirebaseSection<SiteBgm>('lhdata/site/bgm', DEFAULT_SITE_BGM, {
    timeoutMs,
    cacheUrl: cacheFor('bgm'),
  });
  const ocSettings = useFirebaseSection<SiteOcSettings>('lhdata/site/oc_settings', DEFAULT_SITE_OC_SETTINGS, {
    timeoutMs,
    cacheUrl: cacheFor('oc_settings'),
  });
  const uiSettings = useFirebaseSection<SiteUiSettings>('lhdata/site/ui_settings', DEFAULT_SITE_UI_SETTINGS, {
    timeoutMs,
    cacheUrl: cacheFor('ui_settings'),
  });
  const accessSettings = useFirebaseSection<SiteAccessSettings>(
    'lhdata/site/access_settings',
    DEFAULT_SITE_ACCESS_SETTINGS,
    { timeoutMs, cacheUrl: cacheFor('access_settings') },
  );
  const guestSettings = useFirebaseSection<SiteGuestSettings>(
    'lhdata/site/guest_settings',
    DEFAULT_SITE_GUEST_SETTINGS,
    { timeoutMs, cacheUrl: cacheFor('guest_settings') },
  );

  const notices = useFirebaseSection<SitePost[]>('lhdata/site/notices', [], {
    enabled: need.notices,
    limitToLast: lim?.notices,
    timeoutMs,
    cacheUrl: need.notices ? cacheFor('notices', lim?.notices) : null,
  });
  const diary = useFirebaseSection<SitePost[]>('lhdata/site/diary', [], {
    enabled: need.diary,
    limitToLast: lim?.diary,
    timeoutMs,
    cacheUrl: need.diary ? cacheFor('diary', lim?.diary) : null,
  });
  const gallery = useFirebaseSection<GalleryItem[]>('lhdata/site/gallery', [], {
    enabled: need.gallery,
    limitToLast: lim?.gallery,
    timeoutMs,
    cacheUrl: need.gallery ? cacheFor('gallery', lim?.gallery) : null,
  });
  const universe = useFirebaseSection<UniverseCard[]>('lhdata/site/universe', DEFAULT_UNIVERSE, {
    enabled: need.universe,
    limitToLast: lim?.universe,
    timeoutMs,
    cacheUrl: need.universe ? cacheFor('universe', lim?.universe) : null,
  });
  const trpg = useFirebaseSection<TrpgScenario[]>('lhdata/site/trpg', [], {
    enabled: need.trpg,
    limitToLast: lim?.trpg,
    timeoutMs,
    cacheUrl: need.trpg ? cacheFor('trpg', lim?.trpg) : null,
  });
  const trpgSettings = useFirebaseSection<TrpgListSettings>(
    'lhdata/site/trpg_settings',
    DEFAULT_TRPG_LIST_SETTINGS,
    {
      enabled: need.trpg,
      timeoutMs,
      cacheUrl: need.trpg ? cacheFor('trpg_settings') : null,
    },
  );
  const guests = useFirebaseSection<GuestEntry[]>('lhdata/site/guests', [], {
    enabled: need.guests,
    timeoutMs,
    cacheUrl: need.guests ? cacheFor('guests') : null,
  });
  const banners = useFirebaseSection<BannerItem[]>('lhdata/site/banners', [], {
    enabled: need.banners,
    limitToLast: lim?.banners,
    timeoutMs,
    cacheUrl: need.banners ? cacheFor('banners', lim?.banners) : null,
  });
  const scrap = useFirebaseSection<ScrapItem[]>('lhdata/site/scrap', [], {
    enabled: need.scrap,
    limitToLast: lim?.scrap,
    timeoutMs,
    cacheUrl: need.scrap ? cacheFor('scrap', lim?.scrap) : null,
  });
  const scrapCategories = useFirebaseSection<ScrapCategory[]>(
    'lhdata/site/scrap_categories',
    DEFAULT_SCRAP_CATEGORIES,
    {
      enabled: need.scrap,
      timeoutMs,
      cacheUrl: need.scrap ? cacheFor('scrap_categories') : null,
    },
  );
  const timeline = useFirebaseSection<TimelinePost[]>('lhdata/site/timeline', [], {
    enabled: need.timeline,
    limitToLast: lim?.timeline,
    timeoutMs,
    cacheUrl: need.timeline ? cacheFor('timeline', lim?.timeline) : null,
  });
  const quotes = useFirebaseSection<QuoteItem[]>('lhdata/site/quotes', [], {
    enabled: need.quotes,
    limitToLast: lim?.quotes,
    timeoutMs,
    cacheUrl: need.quotes ? cacheFor('quotes', lim?.quotes) : null,
  });
  const reviewCategories = useFirebaseSection<ReviewCategory[]>(
    'lhdata/site/review_categories',
    DEFAULT_REVIEW_CATEGORIES,
    {
      enabled: need.reviews,
      timeoutMs,
      cacheUrl: need.reviews ? cacheFor('review_categories') : null,
    },
  );
  const reviews = useFirebaseSection<ReviewItem[]>('lhdata/site/reviews', [], {
    enabled: need.reviews,
    limitToLast: lim?.reviews,
    timeoutMs,
    cacheUrl: need.reviews ? cacheFor('reviews', lim?.reviews) : null,
  });
  const musicTracks = useFirebaseSection<MusicTrack[]>('lhdata/site/music_tracks', [], {
    enabled: need.music,
    limitToLast: lim?.music_tracks,
    timeoutMs,
    cacheUrl: need.music ? cacheFor('music_tracks', lim?.music_tracks) : null,
  });
  const musicPlaylists = useFirebaseSection<MusicPlaylist[]>('lhdata/site/music_playlists', [], {
    enabled: need.music,
    timeoutMs,
    cacheUrl: need.music ? cacheFor('music_playlists') : null,
  });
  const charArchive = useFirebaseSection<CharArchiveItem[]>('lhdata/site/char_archive', [], {
    enabled: need.charArchive,
    limitToLast: lim?.char_archive,
    timeoutMs,
    cacheUrl: need.charArchive ? cacheFor('char_archive', lim?.char_archive) : null,
  });

  /* 비활성 섹션은 local fallback만으로도 loaded=true — 셸 렌더 차단 금지 */
  const loaded =
    main.loaded &&
    bgm.loaded &&
    ocSettings.loaded &&
    uiSettings.loaded &&
    accessSettings.loaded;

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
